import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanalComRefetch, desconectarCanal } from '../lib/statusMesa';
import { useStore } from '../state/store';
import { executarComRetentativa, marcarEmVoo, retomarPendenciasPersistidas } from './filaPendencias';
import { aoConfirmarMapa, mapaAguardandoEnvio } from './mapasBibliotecaSync';
import { ehDataUrl } from './imagemPendente';

type Cliente = NonNullable<typeof supabase>;

const ID_MAPA = 'mapa';

interface Linha {
  id: string;
  mapa_ativo_id: string | null;
}

/**
 * Sincroniza só "qual mapa da biblioteca está ativo agora" — a linha singleton `mapa_publico`
 * (mesmo padrão de `midia_estado.faixa_atual_id`). O conteúdo de cada mapa (imagem/grid/FoW)
 * é `mapasBibliotecaSync.ts`, tabela própria. Só o GM escreve (RLS
 * `mapa_publico_update_gm`/`insert_gm`); o jogador só lê.
 */
export function iniciarSyncMapaAtivo(): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  let aplicandoRemotoContagem = 0;
  // true entre a troca local agendar o push e ele confirmar — mesmo papel de `pendente` em
  // `sessaoPublicaSync.ts`/`mapaPublicoSync.ts` original: sem isso, o eco Realtime da PRIMEIRA
  // troca podia chegar depois de uma segunda troca (ainda não pushada) e reverter a tela.
  let pendente = false;

  const aplicarLinha = (linha: Linha) => {
    if (pendente) return;
    aplicandoRemotoContagem++;
    try {
      useStore.setState((s) => ({ mapa: { ...s.mapa, mapaAtivoId: linha.mapa_ativo_id } }));
    } finally {
      aplicandoRemotoContagem--;
    }
  };

  const push = () => {
    const id = useStore.getState().mapa.mapaAtivoId;
    return cliente
      .from('mapa_publico')
      .upsert({ id: ID_MAPA, mapa_ativo_id: id })
      .then((resultado) => {
        if (id !== useStore.getState().mapa.mapaAtivoId) return resultado;
        pendente = !!resultado?.error;
        // outra sessão de mestre (ou reconexão) pode ter escrito por cima enquanto este push
        // estava em voo — `aplicarLinha` só ignorava o PRÓPRIO eco, sem isso a troca alheia
        // ficava perdida até o próximo evento chegar por acaso. Last-write-wins de propósito
        // (mesa-estatica-multiplayer-completo.md §8): relê o servidor pra corrigir.
        if (!resultado?.error) void refetchMapaAtivo();
        return resultado;
      });
  };

  const enviarQuandoPronto = () => {
    const { mapaAtivoId, biblioteca } = useStore.getState().mapa;
    const mapa = biblioteca.find((m) => m.id === mapaAtivoId);
    if (mapa && (ehDataUrl(mapa.imagemUrl) || mapaAguardandoEnvio(mapa.id))) return;
    executarComRetentativa('mapa-ativo-sync', ID_MAPA, push);
  };
  const pararConfirmacao = aoConfirmarMapa((id) => {
    if (pendente && useStore.getState().mapa.mapaAtivoId === id) enviarQuandoPronto();
  });

  const unsubscribeLocal = useStore.subscribe((state, prevState) => {
    if (aplicandoRemotoContagem > 0) return;
    if (state.mapa.mapaAtivoId === prevState.mapa.mapaAtivoId) return;
    pendente = true;
    marcarEmVoo('mapa-ativo-sync', ID_MAPA);
    enviarQuandoPronto();
  });

  // reenvia se ficou pendente de uma sessão anterior — singleton, chave sempre ID_MAPA.
  if (retomarPendenciasPersistidas('mapa-ativo-sync').length > 0) {
    pendente = true;
    enviarQuandoPronto();
  }

  // busca inicial E refetch de reconexão — sem linha ainda é no-op.
  const refetchMapaAtivo = () =>
    cliente
      .from('mapa_publico')
      .select('id, mapa_ativo_id')
      .eq('id', ID_MAPA)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        aplicarLinha(data as Linha);
      });
  void refetchMapaAtivo();

  const canal: ReturnType<Cliente['channel']> = cliente
    .channel('mapa-ativo-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mapa_publico' }, (payload) => {
      const linha = payload.new as Linha | null;
      if (!linha) return;
      aplicarLinha(linha);
    })
    .subscribe(assinarStatusCanalComRefetch('mapa-ativo-sync', refetchMapaAtivo));

  return () => {
    unsubscribeLocal();
    pararConfirmacao();
    desconectarCanal('mapa-ativo-sync');
    cliente.removeChannel(canal);
  };
}
