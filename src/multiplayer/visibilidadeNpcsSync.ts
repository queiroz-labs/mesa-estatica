import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanal, desconectarCanal } from '../lib/statusMesa';
import { executarComRetentativa, retomarPendenciasPersistidas } from './filaPendencias';

const NOME_CANAL = 'npcs-visibilidade';
const EVENTO = 'invalidar';
const CHAVE = 'visibilidade';
type Ouvir = () => void | PromiseLike<unknown>;
const ouvintes = new Set<Ouvir>();
let referencias = 0;
let canal: RealtimeChannel | null = null;

function invalidar(): void {
  for (const ouvir of ouvintes) {
    try {
      void Promise.resolve(ouvir()).catch((erro) => console.error('[visibilidadeNpcsSync] rebusca falhou', erro));
    } catch (erro) {
      console.error('[visibilidadeNpcsSync] rebusca falhou', erro);
    }
  }
}

/** Um canal por página atende NPCs e iniciativa. O aviso público não contém dados: cada
 *  jogador reconsulta o banco com a própria RLS. A assinatura inicial e a reconexão também
 *  invalidam, cobrindo um aviso perdido entre a primeira consulta e a entrada no canal. */
function adquirirCanal(ouvir?: Ouvir): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};
  if (ouvir) ouvintes.add(ouvir);
  referencias++;
  if (!canal) {
    const novo = cliente.channel(NOME_CANAL, { config: { broadcast: { ack: true, self: false } } })
      .on('broadcast', { event: EVENTO }, () => { if (canal === novo) invalidar(); });
    canal = novo;
    const atualizarStatus = assinarStatusCanal(NOME_CANAL);
    novo.subscribe((status) => {
      if (canal !== novo) return;
      atualizarStatus(status);
      if (status === 'SUBSCRIBED') invalidar();
    });
  }
  let removido = false;
  return () => {
    if (removido) return;
    removido = true;
    if (ouvir) ouvintes.delete(ouvir);
    referencias--;
    if (referencias > 0 || !canal) return;
    const anterior = canal;
    canal = null;
    desconectarCanal(NOME_CANAL);
    void cliente.removeChannel(anterior);
  };
}

export const observarVisibilidadeNpcs = (ouvir: Ouvir): (() => void) => adquirirCanal(ouvir);

/** Só o mestre chama após confirmar a escrita pública do NPC. ACK verdadeiro e fila
 *  persistida mantêm o aviso como pendente se falhar, mesmo que o banco já tenha salvo. */
export function notificarVisibilidadeNpcs(): void {
  executarComRetentativa(NOME_CANAL, CHAVE, async () => {
    if (!canal) return { error: 'canal de visibilidade indisponível' };
    const resultado = await canal.send({ type: 'broadcast', event: EVENTO, payload: {} }, { timeout: 5000 });
    return { error: resultado === 'ok' ? null : resultado };
  });
}

export function iniciarNotificacoesVisibilidadeNpcs(): () => void {
  const parar = adquirirCanal();
  if (retomarPendenciasPersistidas(NOME_CANAL).length > 0) notificarVisibilidadeNpcs();
  return parar;
}
