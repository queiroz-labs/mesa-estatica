import type { SomSoundpad } from '../state/types';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanalComRefetch, desconectarCanal } from '../lib/statusMesa';
import { useStore } from '../state/store';
import { criarDebouncePorChave } from './debounce';
import { executarComRetentativa, marcarEmVoo, resolverPendencia, retomarPendenciasPersistidas } from './filaPendencias';
import { eraRemocaoExplicita } from './remocaoExplicita';

const PREFIXO_DELETE = 'delete:';
const CHAVE_ESTADO = 'estado';

/** Diff por SLOT (não por id) — mesmo motivo de `computarDiffSons`: substituir o som de um
 *  botão troca o id, mas o slot continua sendo a chave estável pra decidir o que reenviar. */
export function resolverReplaySom(chave: string, sons: SomSoundpad[]): SomSoundpad | 'apagar' | null {
  if (chave.startsWith(PREFIXO_DELETE)) return 'apagar';
  return sons.find((s) => String(s.slot) === chave) ?? null;
}

const ATRASO_PUSH_MS = 500;

export interface LinhaSom {
  id: string;
  slot: number;
  nome: string;
  storage_path: string;
  url: string;
}

export const paraLinha = (s: SomSoundpad): LinhaSom => ({
  id: s.id,
  slot: s.slot,
  nome: s.nome,
  storage_path: s.path,
  url: s.url,
});

export const paraSom = (r: LinhaSom): SomSoundpad => ({
  id: r.id,
  slot: r.slot,
  nome: r.nome,
  path: r.storage_path,
  url: r.url,
});

export interface LinhaEstadoSoundpad {
  id: string;
  volume: number;
  disparo_slot: number | null;
  disparo_em: string | null;
  disparo_tipo: 'tocar' | 'parar';
}

/**
 * Diff por SLOT, não por id — substituir o som de um botão gera um id novo, e tratar isso
 * como "removeu um, criou outro" faria o delete do antigo correr contra o insert do novo
 * (`slot` é `unique` no banco). Por slot, substituir vira um upsert só.
 */
export function computarDiffSons(
  anterior: SomSoundpad[],
  atual: SomSoundpad[],
): { upserts: SomSoundpad[]; removidos: SomSoundpad[] } {
  const porSlotAnterior = new Map(anterior.map((s) => [s.slot, s]));
  const upserts = atual.filter((s) => {
    const antes = porSlotAnterior.get(s.slot);
    return !antes || antes.nome !== s.nome || antes.path !== s.path || antes.url !== s.url;
  });
  const slotsAtuais = new Set(atual.map((s) => s.slot));
  const removidos = anterior.filter((s) => !slotsAtuais.has(s.slot));
  return { upserts, removidos };
}

/**
 * Sincroniza o soundpad — os 6 slots de efeito e o volume próprio deles, mais o disparo.
 * Mesmo padrão da mídia: GM push+pull, jogador só lê. Canal separado do `midia_estado` de
 * propósito (ver comentário na migração 0020): disparar efeito ali mexeria no relógio da
 * música e faria a faixa saltar pra todo mundo.
 */
export function iniciarSyncSoundpad(): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  let aplicandoRemoto = false;
  let sonsAnteriores = useStore.getState().soundpad.sons;
  const pendencias = new Set<string>();
  // Mesmo problema do `pendencias` de sons, pro disparo: sem isso, o eco do próprio upsert
  // volta pelo Realtime e reaplica `ultimoDisparo`, tocando o efeito de novo. Comparar o
  // carimbo `em` pra reconhecer o próprio eco é frágil (Postgres reformata o timestamptz na
  // volta), então aqui a gente ignora por flag: enquanto um upsert de disparo nosso está no ar,
  // qualquer eco que chegar nesse meio tempo é presumido como o nosso mesmo, não um disparo novo.
  let disparoEmVoo = false;

  const aplicar = (fn: (s: ReturnType<typeof useStore.getState>) => void) => {
    aplicandoRemoto = true;
    try {
      fn(useStore.getState());
    } finally {
      sonsAnteriores = useStore.getState().soundpad.sons;
      aplicandoRemoto = false;
    }
  };

  /** Busca inicial E refetch de reconexão (canal caiu e voltou — o Realtime não reenvia o
   *  evento perdido durante a queda). Merge por slot preservando o que tem push em voo
   *  (`pendencias`), em vez de substituir a lista, senão a rebusca apaga da tela um som
   *  recém-trocado que ainda não confirmou. */
  const refetchSoundpad = () =>
    Promise.all([
      cliente.from('soundpad_sons').select('*'),
      cliente.from('soundpad_estado').select('*').eq('id', 'soundpad').maybeSingle(),
    ]).then(([sonsRes, estadoRes]) => {
      if (sonsRes.data) {
        const remotos = (sonsRes.data as LinhaSom[]).map(paraSom);
        const remotosPorSlot = new Map(remotos.map((som) => [som.slot, som]));
        aplicar(() =>
          useStore.setState((s) => {
            const sons: SomSoundpad[] = [];
            for (const local of s.soundpad.sons) {
              if (pendencias.has(String(local.slot))) {
                sons.push(local);
                continue;
              }
              const remoto = remotosPorSlot.get(local.slot);
              if (remoto) sons.push(remoto);
            }
            for (const remoto of remotos) {
              if (!s.soundpad.sons.some((x) => x.slot === remoto.slot)) sons.push(remoto);
            }
            return { soundpad: { ...s.soundpad, sons } };
          }),
        );
      }
      const linha = estadoRes.data as LinhaEstadoSoundpad | null;
      if (linha) {
        aplicandoRemoto = true;
        try {
          // `ultimoDisparo` NÃO entra aqui — carimbo antigo dispararia o efeito no boot de
          // quem acabou de entrar na sessão, e numa reconexão soltaria um som na mesa no meio
          // da cena. Só o volume volta do servidor.
          useStore.setState((s) => ({ soundpad: { ...s.soundpad, volume: linha.volume } }));
        } finally {
          aplicandoRemoto = false;
        }
      }
    });

  void refetchSoundpad();

  const agendarUpsert = criarDebouncePorChave<SomSoundpad>(ATRASO_PUSH_MS, (_chave, som) => {
    pendencias.delete(_chave);
    executarComRetentativa('soundpad-sync', String(som.slot), () =>
      cliente
        .from('soundpad_sons')
        .upsert(paraLinha(useStore.getState().soundpad.sons.find((s) => s.slot === som.slot) ?? som), { onConflict: 'slot' }),
    );
  });

  const unsubscribeLocal = useStore.subscribe((state, prevState) => {
    if (aplicandoRemoto) return;

    if (state.soundpad.sons !== prevState.soundpad.sons) {
      const { upserts, removidos } = computarDiffSons(sonsAnteriores, state.soundpad.sons);
      sonsAnteriores = state.soundpad.sons;
      for (const som of upserts) {
        pendencias.add(String(som.slot));
        // marca ANTES de agendar — sem isso, a janela do próprio debounce fica sem rede de
        // segurança nenhuma (ver `marcarEmVoo` em filaPendencias.ts).
        marcarEmVoo('soundpad-sync', String(som.slot));
        agendarUpsert(String(som.slot), som);
      }
      for (const som of removidos) {
        // mesma trava de `fichasSync`: só apaga se o × da UI marcou de propósito, nunca por
        // inferência de diff (uma aba de mestre desatualizada apagaria o slot de todos).
        if (!eraRemocaoExplicita(som.id)) continue;
        executarComRetentativa('soundpad-sync', `${PREFIXO_DELETE}${som.slot}`, () =>
          cliente.from('soundpad_sons').delete().eq('slot', som.slot),
        );
      }
    }

    const volumeMudou = state.soundpad.volume !== prevState.soundpad.volume;
    const disparoMudou = state.soundpad.ultimoDisparo !== prevState.soundpad.ultimoDisparo;
    if (volumeMudou || disparoMudou) {
      if (disparoMudou) disparoEmVoo = true;
      executarComRetentativa('soundpad-sync', CHAVE_ESTADO, () => {
        const atual = useStore.getState().soundpad;
        return cliente.from('soundpad_estado').upsert({
          id: 'soundpad',
          volume: atual.volume,
          disparo_slot: atual.ultimoDisparo?.slot ?? null,
          disparo_em: atual.ultimoDisparo?.em ?? null,
          disparo_tipo: atual.ultimoDisparo?.tipo ?? 'tocar',
        });
      });
    }
  });

  // reenvia o que ficou pendente de uma sessão anterior — relê a store ATUAL.
  for (const chave of retomarPendenciasPersistidas('soundpad-sync')) {
    if (chave === CHAVE_ESTADO) {
      executarComRetentativa('soundpad-sync', CHAVE_ESTADO, () => {
        const atual = useStore.getState().soundpad;
        return cliente.from('soundpad_estado').upsert({
          id: 'soundpad',
          volume: atual.volume,
          disparo_slot: atual.ultimoDisparo?.slot ?? null,
          disparo_em: atual.ultimoDisparo?.em ?? null,
          disparo_tipo: atual.ultimoDisparo?.tipo ?? 'tocar',
        });
      });
      continue;
    }
    const replay = resolverReplaySom(chave, useStore.getState().soundpad.sons);
    if (replay === 'apagar') {
      const slot = Number(chave.slice(PREFIXO_DELETE.length));
      executarComRetentativa('soundpad-sync', chave, () => cliente.from('soundpad_sons').delete().eq('slot', slot));
    } else if (replay) {
      executarComRetentativa('soundpad-sync', chave, () => cliente.from('soundpad_sons').upsert(paraLinha(replay), { onConflict: 'slot' }));
    } else {
      resolverPendencia('soundpad-sync', chave);
    }
  }

  const canal = cliente
    .channel('soundpad-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'soundpad_sons' }, (payload) => {
      aplicar(() => {
        const s = useStore.getState();
        if (payload.eventType === 'DELETE') {
          const slotRemovido = (payload.old as { slot: number }).slot;
          if (pendencias.has(String(slotRemovido))) return;
          useStore.setState({
            soundpad: { ...s.soundpad, sons: s.soundpad.sons.filter((x) => x.slot !== slotRemovido) },
          });
        } else {
          const som = paraSom(payload.new as LinhaSom);
          if (pendencias.has(String(som.slot))) return;
          useStore.setState({
            soundpad: { ...s.soundpad, sons: [...s.soundpad.sons.filter((x) => x.slot !== som.slot), som] },
          });
        }
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'soundpad_estado' }, (payload) => {
      const linha = payload.new as LinhaEstadoSoundpad | null;
      if (!linha) return;
      // Eco do nosso próprio upsert de disparo: já tocou localmente na hora do clique,
      // reaplicar `ultimoDisparo` aqui só repetiria o efeito.
      const eraNossoProprioEco = disparoEmVoo;
      disparoEmVoo = false;
      aplicandoRemoto = true;
      try {
        useStore.setState((s) => ({
          soundpad: {
            ...s.soundpad,
            volume: linha.volume,
            ultimoDisparo: eraNossoProprioEco
              ? s.soundpad.ultimoDisparo
              : linha.disparo_slot !== null && linha.disparo_em
                ? { slot: linha.disparo_slot, em: linha.disparo_em, tipo: linha.disparo_tipo ?? 'tocar' }
                : s.soundpad.ultimoDisparo,
          },
        }));
      } finally {
        aplicandoRemoto = false;
      }
    })
    .subscribe(assinarStatusCanalComRefetch('soundpad-sync', refetchSoundpad));

  return () => {
    unsubscribeLocal();
    desconectarCanal('soundpad-sync');
    cliente.removeChannel(canal);
  };
}
