import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanal, desconectarCanal, useStatusMesa } from '../lib/statusMesa';
import { useReguasStore, type ReguaViva } from '../state/reguasStore';
import { criarThrottlePorChave } from './debounce';
import { executarComRetentativa, retomarPendenciasPersistidas } from './filaPendencias';
import { ehReguaViva } from './validarPayload';

/** Intervalo entre pontos de um movimento contínuo. O primeiro é enviado imediatamente;
 *  os seguintes levam sempre a posição mais recente, sem esperar o cursor parar. */
const INTERVALO_PUSH_MS = 80;

/**
 * Sincroniza a régua de medição via Supabase Realtime **broadcast**, não tabela — a régua vive
 * poucos segundos (some sozinha, ver ReguaOverlay.tsx), então persistir em banco seria
 * migração/RLS/limpeza de linha órfã pra um dado que ninguém quer de volta depois. Broadcast
 * entrega o mesmo alcance (todo cliente conectado) sem nenhuma dessas peças.
 *
 * Mesmo princípio de fonte-local-otimista dos outros syncs (`tokensSync.ts`): `useReguasStore`
 * já é a fonte pro `ReguaOverlay` local; isso só ecoa as mudanças de quem mede pros outros
 * clientes, e aplica o que os outros medem localmente. Sem `VITE_SUPABASE_URL`/`ANON_KEY`,
 * `iniciarSyncReguas()` é no-op — a régua funciona 100% local (GM-solo offline).
 *
 * `private: true` (migração 0025) — canal privado do Realtime Authorization: SEND/RECEIVE
 * passam a exigir sessão autenticada (`realtime.messages`), não só a anon key pública. Régua é
 * simétrica (mestre E jogador medem — `MapaJogadorView.tsx` também monta `ReguaOverlay`), então
 * a policy de envio não checa `is_gm()`, só autenticação.
 */
export function iniciarSyncReguas(): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  let aplicandoRemoto = false;

  const canal: RealtimeChannel = cliente
    .channel('reguas', { config: { broadcast: { self: false, ack: false }, private: true } })
    .on('broadcast', { event: 'regua' }, ({ payload }) => {
      const regua = (payload as { regua?: unknown }).regua;
      if (!ehReguaViva(regua)) {
        console.warn('[reguasSync] payload de regua com shape invalido, descartado', payload);
        return;
      }
      aplicandoRemoto = true;
      try {
        // atualizadaEm sempre o relógio LOCAL de quem recebe, nunca o de quem mediu — relógios
        // de máquinas diferentes não batem (ver ReguaOverlay.tsx, base do fade).
        useReguasStore.getState().upsertRegua({ ...regua, atualizadaEm: Date.now() });
      } finally {
        aplicandoRemoto = false;
      }
    })
    .on('broadcast', { event: 'regua-fim' }, ({ payload }) => {
      const id = (payload as { id?: unknown }).id;
      if (typeof id !== 'string') {
        console.warn('[reguasSync] payload de regua-fim com shape invalido, descartado', payload);
        return;
      }
      aplicandoRemoto = true;
      try {
        useReguasStore.getState().removerRegua(id);
      } finally {
        aplicandoRemoto = false;
      }
    })
    .subscribe(assinarStatusCanal('reguas'));

  canalAtivo = canal;

  let encerrado = false;
  const enviarAgora = (id: string) => {
    // O tick pode chegar depois de pointerup/Esc: reler evita ressuscitar uma
    // medição ativa antiga depois que o fim já foi entregue aos outros clientes.
    const regua = useReguasStore.getState().reguas[id];
    if (!encerrado && regua?.ativa) void canal.send({ type: 'broadcast', event: 'regua', payload: { regua } });
  };
  const agendarEnvio = criarThrottlePorChave<ReguaViva>(INTERVALO_PUSH_MS, enviarAgora);

  // `canal.send` com `ack:false` não devolve erro observável — o gatilho de "falhou" aqui é
  // `online === false` no momento do envio, não a resposta do `send`. Só o envio GARANTIDO de
  // fim de medição entra na fila: uma posição ao vivo (`agendarEnvio`, acima) atrasada por
  // reconexão é ruído de alguns segundos atrás, não dado a preservar.
  const enviarFinalComRetentativa = (id: string) => {
    executarComRetentativa('reguas', id, () => {
      if (!useStatusMesa.getState().online) return Promise.resolve({ error: 'offline' });
      // relê a store: se a régua já não existe mais, ou voltou a ficar ativa (nova medição
      // começou), não há o que reenviar — sucesso trivial, não é falha.
      const atual = useReguasStore.getState().reguas[id];
      if (atual && !atual.ativa) void canal.send({ type: 'broadcast', event: 'regua', payload: { regua: atual } });
      return Promise.resolve({ error: null });
    });
  };

  let reguasAnteriores = useReguasStore.getState().reguas;
  const unsubscribeLocal = useReguasStore.subscribe((state) => {
    if (state.reguas === reguasAnteriores) return;
    const anteriores = reguasAnteriores;
    reguasAnteriores = state.reguas;
    if (aplicandoRemoto) return;

    for (const [id, regua] of Object.entries(state.reguas)) {
      if (anteriores[id] === regua) continue;
      // ainda sendo arrastada: junta a rajada de pointermove numa escrita só (mesmo remédio de
      // tokensSync.ts). Finalizada (pointerup, ativa:false): envio garantido, fora do throttle
      // — sem isso, a última posição pode ficar pendurada se o throttle nunca disparar.
      if (regua.ativa) agendarEnvio(id, regua);
      else enviarFinalComRetentativa(id);
    }
  });

  // reenvia réguas finalizadas que ficaram pendentes de uma sessão anterior — só se ainda
  // existirem localmente e continuarem `ativa: false` (senão a chave é só resolvida, sem
  // reenviar nada).
  for (const id of retomarPendenciasPersistidas('reguas')) {
    enviarFinalComRetentativa(id);
  }

  return () => {
    encerrado = true;
    unsubscribeLocal();
    desconectarCanal('reguas');
    cliente.removeChannel(canal);
    if (canalAtivo === canal) canalAtivo = null;
  };
}

/** Canal ativo da sincronização em curso (se houver) — permite notificar um cancelamento
 *  explícito (Esc, `useRegua.ts`) sem precisar encadear callback através de props em todo
 *  componente que usa a régua. `null` sem Supabase configurado ou fora do boot: no-op. */
let canalAtivo: RealtimeChannel | null = null;

/** Remoção imediata em todo mundo — diferente do fim normal (pointerup), que só marca
 *  `ativa: false` e deixa o fade natural cuidar do resto em cada cliente, sem broadcast nenhum. */
export function notificarCancelamentoRegua(id: string): void {
  if (!canalAtivo) return;
  void canalAtivo.send({ type: 'broadcast', event: 'regua-fim', payload: { id } });
}
