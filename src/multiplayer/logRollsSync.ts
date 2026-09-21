import type { EntradaLog, EntradaRoll, TipoLog } from '../state/types';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanalComRefetch, desconectarCanal } from '../lib/statusMesa';
import { useStore } from '../state/store';
import { executarComRetentativa, resolverPendencia, retomarPendenciasPersistidas } from './filaPendencias';

const PREFIXO_LOG = 'log:';
const PREFIXO_LOG_VISIBILIDADE = 'log-visibilidade:';
const PREFIXO_ROLL_INSERT = 'roll-insert:';
const PREFIXO_ROLL_VISIBILIDADE = 'roll-visibilidade:';
const CHAVE_LOG_CLEAR = 'log-clear';

interface LinhaLog {
  id: string;
  tipo: string;
  personagem_id: string | null;
  texto: string;
  criado_em: string;
  visibilidade: 'publica' | 'privada';
  rodada: number | null;
}

interface LinhaRoll {
  id: string;
  origem: string;
  personagem_id: string | null;
  formula: string;
  total: number;
  bruto: number;
  visibilidade: 'publica' | 'privada';
  criado_em: string;
}

const paraLinhaLog = (e: EntradaLog): LinhaLog => ({
  id: e.id,
  tipo: e.tipo,
  personagem_id: e.personagemId,
  texto: e.texto,
  criado_em: e.timestamp,
  visibilidade: e.visibilidade ?? 'publica',
  rodada: e.rodada ?? null,
});

const paraEntradaLog = (r: LinhaLog): EntradaLog => ({
  id: r.id,
  timestamp: r.criado_em,
  tipo: r.tipo as TipoLog,
  personagemId: r.personagem_id,
  texto: r.texto,
  visibilidade: r.visibilidade,
  rodada: r.rodada ?? undefined,
});

const paraLinhaRoll = (e: EntradaRoll): LinhaRoll => ({
  id: e.id,
  origem: e.origem,
  personagem_id: e.personagemId,
  formula: e.formula,
  total: e.total,
  bruto: e.bruto,
  visibilidade: e.visibilidade,
  criado_em: e.timestamp,
});

const paraEntradaRoll = (r: LinhaRoll): EntradaRoll => ({
  id: r.id,
  timestamp: r.criado_em,
  origem: r.origem,
  personagemId: r.personagem_id,
  formula: r.formula,
  total: r.total,
  bruto: r.bruto,
  visibilidade: r.visibilidade,
});

/**
 * Sincroniza `log`/`rollsLog` — único módulo de sync verdadeiramente SIMÉTRICO do projeto
 * (mesmo padrão de `tokensSync.ts`, não os módulos GM-only-push como `fichasSync.ts`):
 * tanto o mestre quanto qualquer jogador chamam `registrarLog`/`registrarRoll` no mesmo
 * store compartilhado, então os dois lados precisam empurrar E puxar. Sem debounce —
 * entrada de log/rolagem é evento discreto (uma rolagem = uma escrita), não rajada como
 * digitar/arrastar.
 *
 * `log_publico`/`rolls_publicas` são tabelas NOVAS, de propósito separadas de `rolls_log`
 * (migração 0005, que pertence ao sistema de rolagem forçada — Fase C/D, sem coluna de
 * visibilidade, sem RLS por dono). Ver 0009_log_rolls_publicos.sql.
 */
export function iniciarSyncLogRolls(): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  let aplicandoRemoto = false;
  let logAnterior = useStore.getState().log;
  let rollsAnterior = useStore.getState().rollsLog;

  // busca inicial — mais novo primeiro, pra já bater com a ordem local (registrarLog/
  // registrarRoll fazem prepend). `aplicandoRemoto` evita ecoar de volta pro servidor.
  // `limit` evita rebaixar a campanha inteira a cada nova conexão (reload do GM, jogador
  // entrando no meio da sessão) — histórico sem teto era puro egress sem ganho, a UI só
  // mostra o log recente mesmo.
  const LIMITE_HISTORICO_INICIAL = 200;
  Promise.all([
    cliente.from('log_publico').select('*').order('criado_em', { ascending: false }).limit(LIMITE_HISTORICO_INICIAL),
    cliente.from('rolls_publicas').select('*').order('criado_em', { ascending: false }).limit(LIMITE_HISTORICO_INICIAL),
  ]).then(([logRes, rollsRes]) => {
    if (!logRes.data && !rollsRes.data) return;
    aplicandoRemoto = true;
    try {
      useStore.setState((s) => ({
        log: logRes.data ? (logRes.data as LinhaLog[]).map(paraEntradaLog) : s.log,
        rollsLog: rollsRes.data ? (rollsRes.data as LinhaRoll[]).map(paraEntradaRoll) : s.rollsLog,
      }));
    } finally {
      logAnterior = useStore.getState().log;
      rollsAnterior = useStore.getState().rollsLog;
      aplicandoRemoto = false;
    }
  });

  const unsubscribeLocal = useStore.subscribe((state, prevState) => {
    if (aplicandoRemoto) return;

    if (state.log !== prevState.log) {
      if (state.log.length === 0 && logAnterior.length > 0) {
        // limparLog — apaga tudo no servidor também (delete sem filtro exige uma condição
        // sempre-verdadeira no PostgREST).
        executarComRetentativa('log-rolls-sync', CHAVE_LOG_CLEAR, () => cliente.from('log_publico').delete().not('id', 'is', null));
      } else {
        const anterioresPorId = new Map(logAnterior.map((e) => [e.id, e]));
        for (const entrada of state.log) {
          const anterior = anterioresPorId.get(entrada.id);
          if (!anterior) {
            executarComRetentativa('log-rolls-sync', `${PREFIXO_LOG}${entrada.id}`, () => cliente.from('log_publico').insert(paraLinhaLog(entrada)));
          } else if ((anterior.visibilidade ?? 'publica') !== (entrada.visibilidade ?? 'publica')) {
            executarComRetentativa('log-rolls-sync', `${PREFIXO_LOG_VISIBILIDADE}${entrada.id}`, () =>
              cliente
                .from('log_publico')
                .update({ visibilidade: useStore.getState().log.find((e) => e.id === entrada.id)?.visibilidade ?? 'publica' })
                .eq('id', entrada.id),
            );
          }
        }
      }
      logAnterior = state.log;
    }

    if (state.rollsLog !== prevState.rollsLog) {
      const anterioresPorId = new Map(rollsAnterior.map((r) => [r.id, r]));
      for (const roll of state.rollsLog) {
        const anterior = anterioresPorId.get(roll.id);
        if (!anterior) {
          executarComRetentativa('log-rolls-sync', `${PREFIXO_ROLL_INSERT}${roll.id}`, () => cliente.from('rolls_publicas').insert(paraLinhaRoll(roll)));
        } else if (anterior.visibilidade !== roll.visibilidade) {
          executarComRetentativa('log-rolls-sync', `${PREFIXO_ROLL_VISIBILIDADE}${roll.id}`, () =>
            cliente
              .from('rolls_publicas')
              .update({ visibilidade: useStore.getState().rollsLog.find((r) => r.id === roll.id)?.visibilidade ?? roll.visibilidade })
              .eq('id', roll.id),
          );
        }
      }
      rollsAnterior = state.rollsLog;
    }
  });

  // reenvia o que ficou pendente de uma sessão anterior. `log`/`rollsLog` são efetivamente
  // append-only (uma entrada não é editada depois de criada, salvo a visibilidade de rolls) —
  // então "reler a store" aqui significa achar a entrada pelo id, não recalcular um diff.
  for (const chave of retomarPendenciasPersistidas('log-rolls-sync')) {
    if (chave === CHAVE_LOG_CLEAR) {
      executarComRetentativa('log-rolls-sync', CHAVE_LOG_CLEAR, () => cliente.from('log_publico').delete().not('id', 'is', null));
    } else if (chave.startsWith(PREFIXO_LOG)) {
      const id = chave.slice(PREFIXO_LOG.length);
      const entrada = useStore.getState().log.find((e) => e.id === id);
      if (entrada) executarComRetentativa('log-rolls-sync', chave, () => cliente.from('log_publico').insert(paraLinhaLog(entrada)));
      else resolverPendencia('log-rolls-sync', chave);
    } else if (chave.startsWith(PREFIXO_LOG_VISIBILIDADE)) {
      const id = chave.slice(PREFIXO_LOG_VISIBILIDADE.length);
      const entrada = useStore.getState().log.find((e) => e.id === id);
      if (entrada) {
        executarComRetentativa('log-rolls-sync', chave, () =>
          cliente.from('log_publico').update({ visibilidade: entrada.visibilidade ?? 'publica' }).eq('id', id),
        );
      } else {
        resolverPendencia('log-rolls-sync', chave);
      }
    } else if (chave.startsWith(PREFIXO_ROLL_INSERT)) {
      const id = chave.slice(PREFIXO_ROLL_INSERT.length);
      const roll = useStore.getState().rollsLog.find((r) => r.id === id);
      if (roll) executarComRetentativa('log-rolls-sync', chave, () => cliente.from('rolls_publicas').insert(paraLinhaRoll(roll)));
      else resolverPendencia('log-rolls-sync', chave);
    } else if (chave.startsWith(PREFIXO_ROLL_VISIBILIDADE)) {
      const id = chave.slice(PREFIXO_ROLL_VISIBILIDADE.length);
      const roll = useStore.getState().rollsLog.find((r) => r.id === id);
      if (roll) {
        executarComRetentativa('log-rolls-sync', chave, () =>
          cliente.from('rolls_publicas').update({ visibilidade: roll.visibilidade }).eq('id', id),
        );
      } else {
        resolverPendencia('log-rolls-sync', chave);
      }
    } else {
      resolverPendencia('log-rolls-sync', chave);
    }
  }

  /**
   * Refetch de reconexão — só dispara quando o canal SAI de erro e VOLTA a `SUBSCRIBED`; o
   * primeiro `SUBSCRIBED` já é coberto pela busca inicial acima.
   *
   * Deliberadamente diferente daquela busca: aqui é MERGE por id, não substituição.
   * `log`/`rollsLog` são append-only e podem ter entrada criada localmente durante a queda que
   * ainda não subiu — trocar a lista inteira pela do servidor apagaria essa entrada da tela.
   * Casar por id é também o que impede a rebusca de duplicar o que já está na lista. O que veio
   * de fora e a gente perdeu entra na frente (é o mais recente); o que já existe é substituído
   * no lugar, pra pegar mudança de `visibilidade`.
   */
  const refetchLog = () =>
    cliente
      .from('log_publico')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(LIMITE_HISTORICO_INICIAL)
      .then(({ data, error }) => {
        if (error || !data) return;
        aplicandoRemoto = true;
        try {
          const remotos = (data as LinhaLog[]).map(paraEntradaLog);
          const remotosPorId = new Map(remotos.map((e) => [e.id, e]));
          useStore.setState((s) => {
            const conhecidos = new Set(s.log.map((e) => e.id));
            const novos = remotos.filter((e) => !conhecidos.has(e.id));
            const atualizados = s.log.map((local) => remotosPorId.get(local.id) ?? local);
            return { log: [...novos, ...atualizados] };
          });
        } finally {
          logAnterior = useStore.getState().log;
          aplicandoRemoto = false;
        }
      });

  /** Igual a `refetchLog`, pro canal irmão. Ver o comentário lá. */
  const refetchRolls = () =>
    cliente
      .from('rolls_publicas')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(LIMITE_HISTORICO_INICIAL)
      .then(({ data, error }) => {
        if (error || !data) return;
        aplicandoRemoto = true;
        try {
          const remotos = (data as LinhaRoll[]).map(paraEntradaRoll);
          const remotosPorId = new Map(remotos.map((r) => [r.id, r]));
          useStore.setState((s) => {
            const conhecidos = new Set(s.rollsLog.map((r) => r.id));
            const novos = remotos.filter((r) => !conhecidos.has(r.id));
            const atualizados = s.rollsLog.map((local) => remotosPorId.get(local.id) ?? local);
            return { rollsLog: [...novos, ...atualizados] };
          });
        } finally {
          rollsAnterior = useStore.getState().rollsLog;
          aplicandoRemoto = false;
        }
      });

  const canalLog = cliente
    .channel('log-publico-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'log_publico' }, (payload) => {
      aplicandoRemoto = true;
      try {
        const s = useStore.getState();
        if (payload.eventType === 'DELETE') {
          const idRemovido = (payload.old as { id: string }).id;
          useStore.setState({ log: s.log.filter((e) => e.id !== idRemovido) });
        } else {
          const entrada = paraEntradaLog(payload.new as LinhaLog);
          const existe = s.log.some((e) => e.id === entrada.id);
          const log = existe ? s.log.map((e) => (e.id === entrada.id ? entrada : e)) : [entrada, ...s.log];
          useStore.setState({ log });
        }
      } finally {
        logAnterior = useStore.getState().log;
        aplicandoRemoto = false;
      }
    })
    .subscribe(assinarStatusCanalComRefetch('log-publico-sync', refetchLog));

  const canalRolls = cliente
    .channel('rolls-publicas-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rolls_publicas' }, (payload) => {
      aplicandoRemoto = true;
      try {
        const s = useStore.getState();
        if (payload.eventType === 'DELETE') {
          const idRemovido = (payload.old as { id: string }).id;
          useStore.setState({ rollsLog: s.rollsLog.filter((r) => r.id !== idRemovido) });
        } else {
          const roll = paraEntradaRoll(payload.new as LinhaRoll);
          const existe = s.rollsLog.some((r) => r.id === roll.id);
          const rollsLog = existe ? s.rollsLog.map((r) => (r.id === roll.id ? roll : r)) : [roll, ...s.rollsLog];
          useStore.setState({ rollsLog });
        }
      } finally {
        rollsAnterior = useStore.getState().rollsLog;
        aplicandoRemoto = false;
      }
    })
    .subscribe(assinarStatusCanalComRefetch('rolls-publicas-sync', refetchRolls));

  return () => {
    unsubscribeLocal();
    desconectarCanal('log-publico-sync');
    desconectarCanal('rolls-publicas-sync');
    cliente.removeChannel(canalLog);
    cliente.removeChannel(canalRolls);
  };
}
