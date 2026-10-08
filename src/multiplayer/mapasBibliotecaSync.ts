import type { MapaBiblioteca } from '../state/types';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanalComRefetch, desconectarCanal } from '../lib/statusMesa';
import { useStore } from '../state/store';
import { criarDebouncePorChave } from './debounce';
import { ehErroPermissaoNegada, executarComRetentativa, marcarEmVoo, resolverPendencia, retomarPendenciasPersistidas } from './filaPendencias';
import { ehDataUrl } from './imagemPendente';
import { computarDiffMapas } from './mapasBibliotecaDiff';
import { eraRemocaoExplicita } from './remocaoExplicita';

const PREFIXO_DELETE = 'delete:';

/** Mesmo padrão de `resolverReplayFaixa` em `midiaFaixasSync.ts`. */
export function resolverReplayMapa(chave: string, mapas: MapaBiblioteca[]): MapaBiblioteca | 'apagar' | null {
  if (chave.startsWith(PREFIXO_DELETE)) return 'apagar';
  return mapas.find((m) => m.id === chave) ?? null;
}

/** Grid/FoW mudam em rajada durante arrasto/pintura (mesmo motivo do debounce que
 *  `mapaPublicoSync.ts`/`fowSync.ts` tinham cada um — agora unificados nesta lista) — sem
 *  isso, cada micro-ajuste reenviava a linha inteira pro Postgres/Realtime a cada pointermove. */
const ATRASO_PUSH_MS = 500;

export interface LinhaMapa {
  id: string;
  nome: string;
  imagem_path: string;
  imagem_url: string;
  grade: MapaBiblioteca['grade'];
  fow: MapaBiblioteca['fow'];
  ordem: number;
  criado_em: string;
}

export const paraLinha = (m: MapaBiblioteca): LinhaMapa => ({
  id: m.id,
  nome: m.nome,
  imagem_path: m.imagemPath,
  imagem_url: m.imagemUrl,
  grade: m.grade,
  fow: m.fow,
  ordem: m.ordem,
  criado_em: m.criadoEm,
});

export const paraMapa = (r: LinhaMapa): MapaBiblioteca => ({
  id: r.id,
  nome: r.nome,
  imagemPath: r.imagem_path,
  imagemUrl: r.imagem_url,
  grade: r.grade,
  fow: r.fow,
  ordem: r.ordem,
  criadoEm: r.criado_em,
});

/** Ids com upsert local agendado (debounce ainda não disparou) ou em voo — mesmo papel de
 *  `pendencias` em `tokensSync.ts`. Um refetch de reconexão nunca pisa num item marcado aqui. */
const pendencias = new Set<string>();
// O ponteiro ativo espera esta confirmação: o FK não aceita um mapa ainda em upload/debounce.
const ouvintesConfirmacao = new Set<(id: string) => void>();
export const mapaAguardandoEnvio = (id: string): boolean => pendencias.has(id);
export function aoConfirmarMapa(ouvinte: (id: string) => void): () => void {
  ouvintesConfirmacao.add(ouvinte);
  return () => { ouvintesConfirmacao.delete(ouvinte); };
}
function confirmarMapa(id: string): void {
  pendencias.delete(id);
  for (const ouvinte of ouvintesConfirmacao) ouvinte(id);
}

/** Ids que sofreram DELETE remoto enquanto um upsert local pra eles ainda estava em voo — sem
 *  isso, o upsert (agendado ANTES do DELETE chegar) ressuscitava a linha no servidor logo depois
 *  de apagada (ex.: duas sessões de mestre, uma apaga o mapa enquanto a outra ainda tem um
 *  arrasto de grid pendente pra ele). Resolvido quando esse upsert em voo finalmente conclui. */
const exclusoesDuranteEnvio = new Set<string>();

/**
 * Sincroniza `mapa.biblioteca` — a lista de mapas que o mestre subiu (aba Mapa). Mesmo padrão
 * de `midiaFaixasSync.ts`/`tokensSync.ts`: tabela sem dono, sync por diff, GM push + pull,
 * jogador só lê (RLS `is_gm()` no insert/update/delete garante isso no servidor). Qual item
 * está ATIVO fica fora daqui — isso é `mapaAtivoSync.ts` (singleton, mesmo papel de
 * `midia_estado.faixa_atual_id`).
 */
export function iniciarSyncMapasBiblioteca({ somenteLeitura = false }: { somenteLeitura?: boolean } = {}): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  let aplicandoRemoto = false;
  let mapasAnteriores = useStore.getState().mapa.biblioteca;

  /** Busca inicial E refetch de reconexão (canal caiu e voltou — o Realtime não reenvia o
   *  evento perdido durante a queda) — merge preservando qualquer item com push em voo
   *  (`pendencias`), mesmo formato de `refetchTokens` em `tokensSync.ts`, em vez de substituir
   *  a lista inteira (que pisaria numa edição de grid/FoW ainda não confirmada). */
  const refetchMapas = () =>
    cliente
      .from('mapas_biblioteca')
      .select('*')
      .order('ordem', { ascending: true })
      .then(({ data, error }) => {
        if (error || !data) return;
        aplicandoRemoto = true;
        try {
          const remotos = (data as LinhaMapa[]).map(paraMapa);
          const remotosPorId = new Map(remotos.map((m) => [m.id, m]));
          useStore.setState((s) => {
            const biblioteca: MapaBiblioteca[] = [];
            for (const local of s.mapa.biblioteca) {
              // dataURL local (nunca chegou a subir, ou upload em voo) não existe no servidor —
              // um refetch sem essa exceção apagava o item da tela até o upload confirmar.
              if (!somenteLeitura && (pendencias.has(local.id) || ehDataUrl(local.imagemUrl))) {
                biblioteca.push(local);
                continue;
              }
              const remoto = remotosPorId.get(local.id);
              if (remoto) biblioteca.push(remoto);
            }
            for (const remoto of remotos) {
              if (!s.mapa.biblioteca.some((m) => m.id === remoto.id)) biblioteca.push(remoto);
            }
            return { mapa: { ...s.mapa, biblioteca } };
          });
        } finally {
          mapasAnteriores = useStore.getState().mapa.biblioteca;
          aplicandoRemoto = false;
        }
      });
  void refetchMapas();

  const agendarUpsert = criarDebouncePorChave<MapaBiblioteca>(ATRASO_PUSH_MS, (_id, mapa) => {
    executarComRetentativa('mapas-biblioteca-sync', mapa.id, () =>
      Promise.resolve(
        cliente.from('mapas_biblioteca').upsert(paraLinha(useStore.getState().mapa.biblioteca.find((m) => m.id === mapa.id) ?? mapa)),
      ).then((resultado) => {
        // negação de RLS não vai passar a funcionar com retry (ver `ehErroPermissaoNegada`) —
        // sem soltar aqui, o id ficava preso em `pendencias` pra sempre, fora de refetch e de
        // updates remotos (mesmo cuidado de `tokensSync.ts`).
        if (!resultado?.error || ehErroPermissaoNegada(resultado.error)) pendencias.delete(_id);
        if (!resultado?.error && exclusoesDuranteEnvio.delete(_id)) {
          // apagado remotamente enquanto este upsert estava em voo — desfaz a ressurreição
          // que o upsert acabou de causar, tanto local quanto no servidor.
          useStore.setState((s) => ({ mapa: { ...s.mapa, biblioteca: s.mapa.biblioteca.filter((m) => m.id !== _id) } }));
          void cliente.from('mapas_biblioteca').delete().eq('id', _id);
        } else if (!resultado?.error) {
          confirmarMapa(_id);
        }
        return resultado;
      }),
    );
  });

  // Hidratação de outra instância também muda referências de grade/FoW. O jogador nunca
  // publica biblioteca, nem quando isso parecer uma alteração local ao diff.
  const unsubscribeLocal = somenteLeitura ? () => {} : useStore.subscribe((state, prevState) => {
    if (aplicandoRemoto || state.mapa.biblioteca === prevState.mapa.biblioteca) return;

    const { upserts, removidos } = computarDiffMapas(mapasAnteriores, state.mapa.biblioteca);
    mapasAnteriores = state.mapa.biblioteca;

    for (const mapa of upserts) {
      // imagem ainda em dataURL (upload pro Storage em voo, ou sem Supabase configurado) nunca
      // vai pro Postgres/Realtime — mesmo cuidado de `imagemPendente.ts`. Fica só local até
      // `atualizarImagemMapaBiblioteca` trocar pela URL do Storage; essa troca dispara este
      // mesmo `subscribe` de novo e sincroniza pra valer.
      if (ehDataUrl(mapa.imagemUrl)) continue;
      pendencias.add(mapa.id);
      // marca ANTES de agendar — sem isso, a janela do próprio debounce fica sem rede de
      // segurança nenhuma (ver `marcarEmVoo` em filaPendencias.ts).
      marcarEmVoo('mapas-biblioteca-sync', mapa.id);
      agendarUpsert(mapa.id, mapa);
    }
    // só apaga no servidor se o botão "excluir" marcou o id de propósito — remocaoExplicita.ts.
    for (const id of removidos) {
      if (!eraRemocaoExplicita(id)) continue;
      executarComRetentativa('mapas-biblioteca-sync', `${PREFIXO_DELETE}${id}`, () => cliente.from('mapas_biblioteca').delete().eq('id', id));
    }
  });

  // reenvia o que ficou pendente de uma sessão anterior — relê a store ATUAL.
  for (const chave of somenteLeitura ? [] : retomarPendenciasPersistidas('mapas-biblioteca-sync')) {
    const replay = resolverReplayMapa(chave, useStore.getState().mapa.biblioteca);
    if (replay === 'apagar') {
      const id = chave.slice(PREFIXO_DELETE.length);
      executarComRetentativa('mapas-biblioteca-sync', chave, () => cliente.from('mapas_biblioteca').delete().eq('id', id));
    } else if (replay) {
      if (ehDataUrl(replay.imagemUrl)) continue;
      pendencias.add(replay.id);
      executarComRetentativa('mapas-biblioteca-sync', chave, () =>
        Promise.resolve(cliente.from('mapas_biblioteca').upsert(paraLinha(replay))).then((resultado) => {
          if (!resultado?.error) confirmarMapa(replay.id);
          return resultado;
        }),
      );
    } else {
      resolverPendencia('mapas-biblioteca-sync', chave);
    }
  }

  const canal = cliente
    .channel('mapas-biblioteca-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mapas_biblioteca' }, (payload) => {
      aplicandoRemoto = true;
      try {
        const s = useStore.getState();
        if (payload.eventType === 'DELETE') {
          const idRemovido = (payload.old as { id: string }).id;
          if (!somenteLeitura && pendencias.has(idRemovido)) {
            exclusoesDuranteEnvio.add(idRemovido);
            return;
          }
          useStore.setState({ mapa: { ...s.mapa, biblioteca: s.mapa.biblioteca.filter((m) => m.id !== idRemovido) } });
        } else {
          const mapa = paraMapa(payload.new as LinhaMapa);
          if (!somenteLeitura && pendencias.has(mapa.id)) return;
          const existe = s.mapa.biblioteca.some((m) => m.id === mapa.id);
          const biblioteca = existe
            ? s.mapa.biblioteca.map((m) => (m.id === mapa.id ? mapa : m))
            : [...s.mapa.biblioteca, mapa];
          useStore.setState({ mapa: { ...s.mapa, biblioteca } });
        }
      } finally {
        mapasAnteriores = useStore.getState().mapa.biblioteca;
        aplicandoRemoto = false;
      }
    })
    .subscribe(assinarStatusCanalComRefetch('mapas-biblioteca-sync', refetchMapas));

  return () => {
    unsubscribeLocal();
    desconectarCanal('mapas-biblioteca-sync');
    cliente.removeChannel(canal);
  };
}
