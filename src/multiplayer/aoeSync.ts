import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanal, desconectarCanal, useStatusMesa } from '../lib/statusMesa';
import { useAoeStore, type AoeVivo } from '../state/aoeStore';
import { criarDebouncePorChave } from './debounce';
import { executarComRetentativa, retomarPendenciasPersistidas } from './filaPendencias';
import { ehAoeVivo } from './validarPayload';

/** Mesmo valor de `reguasSync.ts` — é feedback ao vivo de um desenho em andamento. */
const ATRASO_PUSH_MS = 80;

const CHAVE_DEBOUNCE = 'aoe';

/**
 * Sincroniza a área de efeito do mestre via Supabase Realtime **broadcast**, mesmo padrão de
 * `reguasSync.ts` (efêmero, não vale tabela/RLS/limpeza de linha órfã pra um dado que some
 * quando o mestre limpa a ferramenta).
 *
 * Assimétrico de propósito: só `AoEOverlay.tsx` (GM-only, nunca entra no bundle do jogador)
 * chama `useAoeStore.getState().definirTemplate`. O jogador usa `somenteLeitura` para
 * receber sem criar a metade que publica ou reproduzir pendências do mestre.
 * `AoEViewOverlay.tsx` (compartilhado) só lê `useAoeStore` pra desenhar.
 *
 * `private: true` (migração 0025) — canal privado do Realtime Authorization: SEND passa a
 * exigir a policy `is_gm()` em `realtime.messages`, então mesmo achando a anon key (pública por
 * design) ninguém publica um template de AoE falso sem estar de fato vinculado como mestre.
 * Antes disso o canal era broadcast público — a UI (`AoEOverlay.tsx` GM-only) era o único
 * limite, não o servidor.
 */
export function iniciarSyncAoE({ somenteLeitura = false }: { somenteLeitura?: boolean } = {}): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  let aplicandoRemoto = false;

  const canal: RealtimeChannel = cliente
    .channel('aoe', { config: { broadcast: { self: false, ack: false }, private: true } })
    .on('broadcast', { event: 'aoe-template' }, ({ payload }) => {
      const template = (payload as { template?: unknown }).template;
      if (!ehAoeVivo(template)) {
        console.warn('[aoeSync] payload de aoe-template com shape invalido, descartado', payload);
        return;
      }
      aplicandoRemoto = true;
      try {
        useAoeStore.getState().definirTemplate(template);
      } finally {
        aplicandoRemoto = false;
      }
    })
    .on('broadcast', { event: 'aoe-fim' }, () => {
      aplicandoRemoto = true;
      try {
        useAoeStore.getState().definirTemplate(null);
      } finally {
        aplicandoRemoto = false;
      }
    })
    .subscribe(assinarStatusCanal('aoe'));

  // O jogador pode compartilhar origem/identidade com o GM e ler seus metadados de fila.
  // Receber não autoriza reenviar uma limpeza ou publicar uma mudança local desse bundle.
  if (somenteLeitura) return () => {
    desconectarCanal('aoe');
    cliente.removeChannel(canal);
  };

  const enviarAgora = (_chave: string, template: AoeVivo) => {
    // Esc/conclusão podem restaurar ou finalizar a área antes do debounce antigo disparar.
    // Só o rascunho que ainda está ativo e atual pode publicar uma atualização de arrasto.
    if (!template.ativa || useAoeStore.getState().template !== template) return;
    void canal.send({ type: 'broadcast', event: 'aoe-template', payload: { template } });
  };
  const agendarEnvio = criarDebouncePorChave<AoeVivo>(ATRASO_PUSH_MS, enviarAgora);

  // Mesmo remédio de `reguasSync.ts`: `canal.send` com `ack:false` não devolve erro
  // observável — o gatilho de "falhou" é `online === false` no momento do envio. Só o envio
  // GARANTIDO de fim de desenho entra na fila; o template arrastado ao vivo (`agendarEnvio`)
  // atrasado por reconexão é ruído, não dado a preservar.
  const enviarFinalComRetentativa = () => {
    executarComRetentativa('aoe', CHAVE_DEBOUNCE, () => {
      if (!useStatusMesa.getState().online) return Promise.resolve({ error: 'offline' });
      const atual = useAoeStore.getState().template;
      if (atual && !atual.ativa) void canal.send({ type: 'broadcast', event: 'aoe-template', payload: { template: atual } });
      else if (!atual) void canal.send({ type: 'broadcast', event: 'aoe-fim', payload: {} });
      return Promise.resolve({ error: null });
    });
  };

  let templateAnterior = useAoeStore.getState().template;
  const unsubscribeLocal = useAoeStore.subscribe((state) => {
    if (aplicandoRemoto || state.template === templateAnterior) return;
    templateAnterior = state.template;

    if (!state.template) {
      // Cancelamento também é estado final: precisa chegar ao jogador após uma queda.
      enviarFinalComRetentativa();
      return;
    }
    // ainda arrastando: junta a rajada de pointermove numa escrita só. Soltou o ponteiro
    // (ativa:false): envio garantido na hora.
    if (state.template.ativa) agendarEnvio(CHAVE_DEBOUNCE, state.template);
    else enviarFinalComRetentativa();
  });

  // Recupera o estado final ATUAL, inclusive null (limpeza); rascunho ativo não é replay.
  if (retomarPendenciasPersistidas('aoe').length > 0) {
    enviarFinalComRetentativa();
  }

  return () => {
    unsubscribeLocal();
    desconectarCanal('aoe');
    cliente.removeChannel(canal);
  };
}
