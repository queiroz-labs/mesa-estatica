import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanalComRefetch, desconectarCanal } from '../lib/statusMesa';
import { useStore } from '../state/store';
import { normalizarAmbiencia } from '../state/ambiencia';
import type { EstadoMidia, ModoLoopMidia } from '../state/types';
import { criarDebouncePorChave } from './debounce';
import { executarComRetentativa, marcarEmVoo, retomarPendenciasPersistidas } from './filaPendencias';

type Cliente = NonNullable<typeof supabase>;

const ID_MIDIA = 'midia';

/** Mesmo valor de `tokensSync.ts` — junta o burst de arrastar a barra de seek numa escrita
 *  só; em cliques discretos (play/pause/próxima/loop) não faz diferença perceptível. */
const ATRASO_PUSH_MS = 150;

export interface Linha {
  id: string;
  faixa_atual_id: string | null;
  tocando: boolean;
  posicao_segundos: number;
  modo_loop: ModoLoopMidia;
  atualizado_em: string;
  volume: number;
  ambiencia?: unknown;
}

export type PatchEstadoMidia = Pick<EstadoMidia, 'faixaAtualId' | 'tocando' | 'posicaoSegundos' | 'modoLoop' | 'atualizadoEm' | 'volume'>;

export const paraLinha = (m: PatchEstadoMidia): Omit<Linha, 'id'> => ({
  faixa_atual_id: m.faixaAtualId,
  tocando: m.tocando,
  posicao_segundos: m.posicaoSegundos,
  modo_loop: m.modoLoop,
  atualizado_em: m.atualizadoEm,
  volume: m.volume,
});

export const paraEstadoMidia = (r: Linha): PatchEstadoMidia => ({
  faixaAtualId: r.faixa_atual_id,
  tocando: r.tocando,
  posicaoSegundos: r.posicao_segundos,
  modoLoop: r.modo_loop,
  atualizadoEm: r.atualizado_em,
  volume: r.volume,
});

let aplicandoRemotoContagem = 0;

/** `MidiaPlayerGM.tsx` usa isso pra decidir: uma mudança em `s.midia` veio de uma ação
 *  local (resincroniza o `<audio>` na hora, sem limiar de desvio) ou de um eco remoto
 *  (aplica `precisaResincronizar` antes de re-sincronizar, ver `posicaoMidia.ts`). */
export function estaAplicandoRemotoMidia(): boolean {
  return aplicandoRemotoContagem > 0;
}

/**
 * Sincroniza o estado de playback do jukebox (`midia_estado`, linha singleton) — mesmo
 * padrão de `mapaPublicoSync.ts`, com debounce no push (arrastar a barra de seek é rajada
 * de eventos, igual arrastar um token no mapa).
 */
export function iniciarSyncMidiaEstado(): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  // true entre uma edição local agendar o push (debounce) e ele confirmar — mesmo guard de
  // `mapaPublicoSync.ts`/`fowSync.ts`: sem isso, o eco de um play/pause/seek anterior chegando
  // dentro da janela de debounce de um clique seguinte (troca de faixa, ajuste de volume)
  // reverte esse clique mais novo pro estado antigo.
  let pendente = false;
  let revisaoLocal = 0;
  let filaPush: Promise<{ error: unknown }> = Promise.resolve({ error: null });

  const push = () => {
    // Serializa escritas: uma requisição lenta anterior nunca termina no servidor depois
    // de um pause/volume mais novo. Cada vez que chega à vez, relê o estado mais recente.
    const proximo = filaPush.catch(() => ({ error: null })).then(() => {
      const revisao = revisaoLocal;
      const { faixaAtualId, tocando, posicaoSegundos, modoLoop, atualizadoEm, volume } = useStore.getState().midia;
      return cliente
        .from('midia_estado')
        .upsert({ id: ID_MIDIA, ...paraLinha({ faixaAtualId, tocando, posicaoSegundos, modoLoop, atualizadoEm, volume }), ambiencia: useStore.getState().ambiencia })
        .then((resultado) => {
          // A resposta de uma escrita anterior não libera o eco sobre uma edição mais nova.
          if (!resultado.error && revisao === revisaoLocal) pendente = false;
          return resultado;
        });
    });
    filaPush = proximo;
    return proximo;
  };

  const agendarPush = criarDebouncePorChave<PatchEstadoMidia>(ATRASO_PUSH_MS, () => {
    executarComRetentativa('midia-estado-sync', ID_MIDIA, push);
  });

  const unsubscribeLocal = useStore.subscribe((state, prevState) => {
    if (aplicandoRemotoContagem > 0) return;
    const { faixaAtualId, tocando, posicaoSegundos, modoLoop, atualizadoEm, volume } = state.midia;
    const anterior = prevState.midia;
    // inclui atualizadoEm na comparação: no restart do loop individual (MidiaPlayerGM.tsx,
    // aoTerminar) faixaAtualId/tocando/posicaoSegundos voltam pro MESMO valor de antes de
    // terminar — sem checar atualizadoEm (recarimbado em toda atualizarEstadoMidia) esse
    // restart não parecia mudança nenhuma e o push nunca saía, deixando os jogadores sem o
    // sinal de reinício (achado 31/08).
    if (
      faixaAtualId === anterior.faixaAtualId &&
      tocando === anterior.tocando &&
      posicaoSegundos === anterior.posicaoSegundos &&
      modoLoop === anterior.modoLoop &&
      volume === anterior.volume &&
      atualizadoEm === anterior.atualizadoEm &&
      state.ambiencia === prevState.ambiencia
    ) {
      return;
    }
    // marca ANTES de agendar — sem isso, a janela do próprio debounce fica sem rede de
    // segurança nenhuma (ver `marcarEmVoo` em filaPendencias.ts).
    pendente = true;
    revisaoLocal++;
    marcarEmVoo('midia-estado-sync', ID_MIDIA);
    agendarPush(ID_MIDIA, { faixaAtualId, tocando, posicaoSegundos, modoLoop, atualizadoEm, volume });
  });

  // reenvia se ficou pendente de uma sessão anterior — singleton, chave sempre ID_MIDIA.
  if (retomarPendenciasPersistidas('midia-estado-sync').length > 0) {
    pendente = true;
    executarComRetentativa('midia-estado-sync', ID_MIDIA, push);
  }

  const aplicarLinha = (linha: Linha) => {
    if (pendente) return;
    aplicandoRemotoContagem++;
    try {
      useStore.setState((s) => ({ midia: { ...s.midia, ...paraEstadoMidia(linha) }, ambiencia: normalizarAmbiencia(linha.ambiencia) }));
    } finally {
      aplicandoRemotoContagem--;
    }
  };

  /** Busca inicial E refetch de reconexão — recupera o estado ao vivo se o GM recarregar a
   *  página no meio de uma faixa, e também depois de uma queda de canal (o Realtime não
   *  reenvia o evento perdido durante a queda). `aplicarLinha` já ignora quando existe push
   *  local pendente, então a rebusca não pisa num play/pause ainda não confirmado. */
  const refetchEstado = () =>
    cliente
      .from('midia_estado')
      .select('*')
      .eq('id', ID_MIDIA)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        aplicarLinha(data as Linha);
      });

  void refetchEstado();

  const canal: ReturnType<Cliente['channel']> = cliente
    .channel('midia-estado-sync')
    // usa o payload que o próprio evento já traz — evita reconsultar a cada mudança, mesmo
    // padrão de `mapaPublicoSync.ts`.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'midia_estado' }, (payload) => {
      const linha = payload.new as Linha | null;
      if (!linha) return;
      aplicarLinha(linha);
    })
    .subscribe(assinarStatusCanalComRefetch('midia-estado-sync', refetchEstado));

  return () => {
    unsubscribeLocal();
    desconectarCanal('midia-estado-sync');
    cliente.removeChannel(canal);
  };
}
