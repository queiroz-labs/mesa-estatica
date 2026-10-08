import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanal, desconectarCanal } from '../lib/statusMesa';
import { useRolagemAoVivoStore, type RolagemAoVivo } from '../state/rolagemAoVivoStore';
import { ehInicioRolagemAoVivo, ehRolagemAoVivo } from './validarPayload';

/**
 * Sincroniza rolagens ao vivo via Supabase Realtime **broadcast**, mesmo padrão de
 * `pingSync.ts`: efêmero (não vale tabela/RLS pra um dado que já foi pro log em texto),
 * simétrico na autorização (qualquer autenticado publica e recebe — sem `is_gm()`), sem
 * debounce (uma rolagem = um evento discreto, não rajada).
 *
 * Jogadores publicam início no clique e resultado após a física, com o mesmo ID. Ataques,
 * dano e perícias públicas do mestre também podem publicar resultados pelos helpers de regra.
 * Rolagens privadas não publicam atividade nem resultado. Eventos recebidos atualizam os
 * snapshots locais antes do próximo render para não serem retransmitidos como um novo evento.
 *
 * `private: true` (mesmo padrão pós-migração 0025/0029) — canal privado do Realtime
 * Authorization, autorizado pela migração 0030.
 */
export function iniciarSyncRolagemAoVivo(): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  let aplicandoRemoto = false;

  const canal: RealtimeChannel = cliente
    .channel('dados', { config: { broadcast: { self: false, ack: false }, private: true } })
    .on('broadcast', { event: 'rolagem-inicio' }, ({ payload }) => {
      const inicio = (payload as { inicio?: unknown } | null)?.inicio;
      if (!ehInicioRolagemAoVivo(inicio)) return;
      aplicandoRemoto = true;
      try {
        const { id, origem, cor, tipo } = inicio;
        useRolagemAoVivoStore.getState().definirInicio({ id, origem, cor, tipo });
      } finally {
        aplicandoRemoto = false;
      }
    })
    .on('broadcast', { event: 'rolagem' }, ({ payload }) => {
      const rolagem = (payload as { rolagem?: unknown }).rolagem;
      if (!ehRolagemAoVivo(rolagem)) {
        console.warn('[rolagemAoVivoSync] payload de rolagem com shape invalido, descartado', payload);
        return;
      }
      aplicandoRemoto = true;
      try {
        useRolagemAoVivoStore.getState().definirAtual(rolagem);
      } finally {
        aplicandoRemoto = false;
      }
    })
    .subscribe(assinarStatusCanal('dados'));

  let anterior = useRolagemAoVivoStore.getState().atual;
  let inicioAnterior = useRolagemAoVivoStore.getState().iniciando;
  const unsubscribeLocal = useRolagemAoVivoStore.subscribe((state) => {
    const mudouResultado = state.atual !== anterior;
    const mudouInicio = state.iniciando !== inicioAnterior;
    anterior = state.atual;
    inicioAnterior = state.iniciando;
    if (aplicandoRemoto) return;
    if (mudouInicio && state.iniciando) {
      const { id, origem, cor, tipo } = state.iniciando;
      void canal.send({ type: 'broadcast', event: 'rolagem-inicio', payload: { inicio: { id, origem, cor, tipo } } });
    }
    if (mudouResultado && state.atual) {
      const rolagem: RolagemAoVivo = state.atual;
      void canal.send({ type: 'broadcast', event: 'rolagem', payload: { rolagem } });
    }
  });

  return () => {
    unsubscribeLocal();
    desconectarCanal('dados');
    cliente.removeChannel(canal);
  };
}
