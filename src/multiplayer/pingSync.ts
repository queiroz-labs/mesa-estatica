import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanal, desconectarCanal } from '../lib/statusMesa';
import { usePingsStore } from '../state/pingsStore';
import { ehPingVivo } from './validarPayload';

/**
 * Sincroniza pings via Supabase Realtime **broadcast**, mesmo padrão de `reguasSync.ts` — um
 * ping some sozinho em ~1.4s (ver `PingOverlay.tsx`), então persistir em banco seria
 * migração/RLS/limpeza de linha órfã pra um dado que ninguém quer de volta depois.
 *
 * Mais simples que régua: um ping nasce já pronto (sem fase "ativa" nem cancelamento), então
 * não precisa de debounce nem de evento `-fim` — um disparo único por clique, entregue na hora.
 *
 * `private: true` (mesmo padrão pós-migração 0025) — canal privado do Realtime Authorization:
 * SEND/RECEIVE exigem sessão autenticada. Ping é simétrico (mestre E jogador pingam —
 * `MapaJogadorView.tsx` e `MapaTab.tsx` chamam o mesmo `useRegua.ts`), então a policy de envio
 * não checa `is_gm()`, só autenticação.
 */
export function iniciarSyncPing(): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  let aplicandoRemoto = false;

  const canal: RealtimeChannel = cliente
    .channel('ping', { config: { broadcast: { self: false, ack: false }, private: true } })
    .on('broadcast', { event: 'ping' }, ({ payload }) => {
      const ping = (payload as { ping?: unknown }).ping;
      if (!ehPingVivo(ping)) {
        console.warn('[pingSync] payload de ping com shape invalido, descartado', payload);
        return;
      }
      aplicandoRemoto = true;
      try {
        // criadoEm sempre o relógio LOCAL de quem recebe, nunca o de quem pingou — relógios de
        // máquinas diferentes não batem (mesmo cuidado de reguasSync.ts).
        usePingsStore.getState().adicionarPing({ ...ping, criadoEm: Date.now() });
      } finally {
        aplicandoRemoto = false;
      }
    })
    .subscribe(assinarStatusCanal('ping'));

  // Push local → remoto: só reage a pings NOVOS (nunca removidos/editados — um ping é imutável
  // do nascimento até expirar), então basta olhar quais ids apareceram desde o diff anterior.
  let idsAnteriores = new Set(Object.keys(usePingsStore.getState().pings));
  const unsubscribeLocal = usePingsStore.subscribe((state) => {
    const idsAtuais = new Set(Object.keys(state.pings));
    const anteriores = idsAnteriores;
    idsAnteriores = idsAtuais;
    if (aplicandoRemoto) return;
    for (const id of idsAtuais) {
      if (anteriores.has(id)) continue;
      void canal.send({ type: 'broadcast', event: 'ping', payload: { ping: state.pings[id] } });
    }
  });

  return () => {
    unsubscribeLocal();
    desconectarCanal('ping');
    cliente.removeChannel(canal);
  };
}
