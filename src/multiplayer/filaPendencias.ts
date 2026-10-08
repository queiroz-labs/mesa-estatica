import { create } from 'zustand';
import { marcarErroRuntime, statusSincronizacao, useStatusMesa } from '../lib/statusMesa';

/**
 * Fila genérica de "isso não confirmou push, reenviar quando a conexão voltar" — não sabe
 * nada sobre tokens/FoW/réguas, só sabe módulo+chave+callback. Cada módulo de sync troca o
 * `.then(({error}) => console.error(...))` que só loga a falha hoje por uma chamada que
 * registra a pendência aqui; o reenvio relê o estado ATUAL da store no momento em que roda
 * (nunca um payload fechado sobre uma variável antiga) — as regras de sync já são
 * last-write-wins (mesa-estatica-multiplayer-completo.md §8), então reenviar o valor mais
 * recente é sempre correto, não precisa de histórico de operações.
 *
 * Persistimos só METADADOS (`{modulo, chave}`), não o payload: o Zustand `persist` da mesa já
 * grava o estado mais recente a cada mudança local, então depois de um reload a store já tem
 * a edição que falhou em sincronizar — a fila só precisa lembrar QUAL chave ficou pendente,
 * quem decide o que reenviar é o próprio módulo (via `retomarPendenciasPersistidas`).
 */

export interface PendenciaItem {
  modulo: string;
  chave: string;
}

const CHAVE_STORAGE = 'estatica-pendencias-v1';
const ATRASO_PERSISTENCIA_MS = 200;

const idDe = (modulo: string, chave: string): string => `${modulo}:${chave}`;

/** Lê os metadados persistidos de um `Storage` — função pura, testável sem `localStorage`
 *  de verdade (mesmo padrão de `criarStorageComDebounce` em `state/store.ts`). JSON
 *  corrompido/formato inesperado vira fila vazia, nunca lança. */
export function lerPendenciasPersistidas(bruto: Pick<Storage, 'getItem'>): PendenciaItem[] {
  try {
    const cru = bruto.getItem(CHAVE_STORAGE);
    if (!cru) return [];
    const parsed: unknown = JSON.parse(cru);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is PendenciaItem =>
        typeof x === 'object' && x !== null && typeof (x as PendenciaItem).modulo === 'string' && typeof (x as PendenciaItem).chave === 'string',
    );
  } catch {
    return [];
  }
}

/** Grava os metadados num `Storage` — engole falha (quota/indisponível) porque isso é só
 *  metadado de retry: perder a fila persistida no pior caso custa uma pendência que só é
 *  redescoberta no próximo push local, não perda de dado real (a store principal com os
 *  dados tem seu próprio tratamento em `criarStorageComDebounce`). */
export function gravarPendencias(bruto: Pick<Storage, 'setItem'>, itens: PendenciaItem[]): void {
  try {
    bruto.setItem(CHAVE_STORAGE, JSON.stringify(itens));
  } catch (erro) {
    console.error('[filaPendencias] gravação de metadados falhou', erro);
  }
}

/** Reavaliado a cada chamada (não congelado numa constante de módulo) — só pra permitir
 *  `vi.stubGlobal('localStorage', ...)` nos testes deste arquivo; em produção `localStorage`
 *  nunca muda durante a vida da página, então isso não tem efeito nenhum além de testabilidade. */
function obterStorage(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

interface FilaPendenciasState {
  itens: PendenciaItem[];
}

export const usePendenciasStore = create<FilaPendenciasState>(() => {
  const storage = obterStorage();
  return { itens: storage ? lerPendenciasPersistidas(storage) : [] };
});

let timerPersistencia: ReturnType<typeof setTimeout> | null = null;

function persistirComAtraso(): void {
  const storage = obterStorage();
  if (!storage) return;
  if (timerPersistencia) clearTimeout(timerPersistencia);
  timerPersistencia = setTimeout(() => {
    timerPersistencia = null;
    gravarPendencias(storage, usePendenciasStore.getState().itens);
  }, ATRASO_PERSISTENCIA_MS);
}

if (typeof window !== 'undefined') {
  const flush = () => {
    if (timerPersistencia) clearTimeout(timerPersistencia);
    timerPersistencia = null;
    const storage = obterStorage();
    if (storage) gravarPendencias(storage, usePendenciasStore.getState().itens);
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** Callbacks de retry em memória — nunca persistidos (não sobrevivem a reload por natureza;
 *  quem reidrata é `retomarPendenciasPersistidas`, chamado no boot de cada módulo). */
const callbacksPendentes = new Map<string, () => void | Promise<void>>();

export function registrarPendencia(modulo: string, chave: string, tentarNovamente: () => void | Promise<void>): void {
  const id = idDe(modulo, chave);
  callbacksPendentes.set(id, tentarNovamente);
  const jaListado = usePendenciasStore.getState().itens.some((it) => idDe(it.modulo, it.chave) === id);
  if (!jaListado) {
    usePendenciasStore.setState((s) => ({ itens: [...s.itens, { modulo, chave }] }));
  }
  persistirComAtraso();
}

export function resolverPendencia(modulo: string, chave: string): void {
  const id = idDe(modulo, chave);
  callbacksPendentes.delete(id);
  const estava = usePendenciasStore.getState().itens.some((it) => idDe(it.modulo, it.chave) === id);
  if (!estava) return;
  usePendenciasStore.setState((s) => ({ itens: s.itens.filter((it) => idDe(it.modulo, it.chave) !== id) }));
  persistirComAtraso();
}

/**
 * Registro "silencioso" de escrita em voo — grava e apaga direto no `localStorage`, sem passar
 * pelo `usePendenciasStore` (que alimenta o "⏳ N pendente" do `StatusIndicador.tsx`, reservado
 * pra falha CONFIRMADA aguardando reconexão). Marcar toda escrita normal ali piscaria esse aviso
 * a cada tecla digitada, mesmo em pushes que resolvem em milissegundos — leitura errada pro
 * mestre no meio de uma sessão ao vivo.
 *
 * Único propósito: sobreviver a um fechamento abrupto da aba/servidor bem no meio da chamada de
 * rede — sem isso, o único registro da intenção vivia solto numa Promise em memória, e um
 * fechamento nesse meio-tempo perdia a escrita sem deixar rastro nenhum pro próximo boot
 * reenviar (achado ao vivo em 23/08: apagar um NPC, ou criar uma ficha e recarregar logo em
 * seguida, podia fazer o dado "voltar" — a marca de remoção explícita e o push agendado são só
 * memória, `filaPendencias.ts` só grava metadado quando uma tentativa JÁ FALHOU).
 */
const CHAVE_EM_VOO = 'estatica-em-voo-v1';

function lerEmVoo(): Set<string> {
  const storage = obterStorage();
  if (!storage) return new Set();
  try {
    const cru = storage.getItem(CHAVE_EM_VOO);
    if (!cru) return new Set();
    const parsed: unknown = JSON.parse(cru);
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function gravarEmVoo(itens: Set<string>): void {
  const storage = obterStorage();
  if (!storage) return;
  try {
    storage.setItem(CHAVE_EM_VOO, JSON.stringify([...itens]));
  } catch {
    // melhor esforço — perder este metadado no pior caso volta ao comportamento de antes desta
    // correção (janela sem rede de segurança), não a um estado pior.
  }
}

/** Exportada pra cada `iniciarSyncX()` poder marcar "em voo" já no momento em que agenda um
 *  push debounçado (`agendarPush`/`agendarUpsert`), não só quando `executarComRetentativa`
 *  finalmente dispara a chamada de rede — sem isso, a janela do próprio timer de debounce
 *  (~500ms entre a edição e o disparo) continua sem rede de segurança nenhuma. Idempotente e
 *  segura de chamar de novo no momento em que o push dispara de fato (mesma chave). */
export function marcarEmVoo(modulo: string, chave: string): void {
  const itens = lerEmVoo();
  const id = idDe(modulo, chave);
  if (itens.has(id)) return;
  itens.add(id);
  gravarEmVoo(itens);
}

function desmarcarEmVoo(modulo: string, chave: string): void {
  const itens = lerEmVoo();
  if (!itens.delete(idDe(modulo, chave))) return;
  gravarEmVoo(itens);
}

/** Código Postgres de RLS negando a operação (`insufficient_privilege` — a policy rodou e
 *  disse "não"). Diferente de qualquer outra falha que passa por aqui (rede caiu, timeout,
 *  Realtime reconectando): reenviar o MESMO payload nunca vai passar a funcionar sozinho —
 *  a permissão não vai aparecer com um retry. Achado ao vivo (29/08): jogador move o próprio
 *  token, `tokens_update_dono_ou_gm` (migração 0021) nega porque `characters_privado.auth_uid`
 *  já não bate mais com `auth.uid()` desta sessão — normalmente porque o MESMO link de jogador
 *  foi aberto em outro aparelho/navegador depois (a Edge Function `vincular-jogador` reatribui
 *  o vínculo de propósito, "revincula sem drama" — ver seu comentário). Sem essa distinção, a
 *  escrita entrava pra fila de "aguardando reconexão" pra sempre, tentando de novo a cada
 *  `online`/reconexão de canal, sempre falhando do mesmo jeito, e o indicador (`⏳ N pendente`)
 *  sugeria "é só rede" — o jogador nunca descobria que precisava recarregar a página pra
 *  revincular. */
export function ehErroPermissaoNegada(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && (erro as { code?: unknown }).code === '42501';
}

function tratarErroPermanente(modulo: string, erro: unknown): void {
  console.error(`[filaPendencias] ${modulo} negado por permissão (RLS) — retry não resolve`, erro);
  marcarErroRuntime(
    `sem permissão pra salvar (${modulo}) — o vínculo desta sessão com o personagem pode ter sido substituído ` +
      '(o mesmo link foi aberto em outro aparelho/navegador?). Recarregue a página pra revincular.',
  );
}

/**
 * Wrapper de conveniência pro padrão universal dos módulos de sync: `cliente.from(...).upsert
 * /delete(...).then(({error}) => ...)`. Sucesso resolve a pendência; erro transitório (rede,
 * canal caindo) registra com um callback que re-executa a mesma `executar` — quem chama decide
 * o que `executar` lê da store no momento em que roda de novo. Negação de permissão (RLS,
 * `ehErroPermissaoNegada`) é tratada à parte: nunca entra na fila de retry (ver comentário lá
 * em cima) e acende o aviso visível (`⚠ erro inesperado`) na hora, em vez do `⏳ pendente`
 * silencioso/enganoso.
 *
 * Marca "em voo" (silencioso) ANTES de chamar `executar` e desmarca assim que ela resolve —
 * ver `CHAVE_EM_VOO` acima. Falha confirmada some daqui e entra na fila visível de retry.
 */
export function executarComRetentativa(
  modulo: string,
  chave: string,
  executar: () => PromiseLike<{ error: unknown } | null | undefined>,
  opcoes: { aguardandoConfirmacao?: () => boolean } = {},
): void {
  const tentar = (): void => {
    marcarEmVoo(modulo, chave);
    Promise.resolve(executar())
      .then((resultado) => {
        // Um envio antigo pode confirmar enquanto uma versão mais nova ainda aguarda
        // throttle/rede. Não apaga a proteção de reload nem o retry dessa versão nova.
        const aguardandoConfirmacao = opcoes.aguardandoConfirmacao?.() ?? false;
        if (!aguardandoConfirmacao) desmarcarEmVoo(modulo, chave);
        if (resultado && resultado.error) {
          if (ehErroPermissaoNegada(resultado.error)) {
            tratarErroPermanente(modulo, resultado.error);
            resolverPendencia(modulo, chave);
            return;
          }
          console.error(`[filaPendencias] ${modulo}:${chave} falhou, aguardando reconexão`, resultado.error);
          registrarPendencia(modulo, chave, tentar);
        } else if (!aguardandoConfirmacao) {
          resolverPendencia(modulo, chave);
        }
      })
      .catch((erro: unknown) => {
        desmarcarEmVoo(modulo, chave);
        if (ehErroPermissaoNegada(erro)) {
          tratarErroPermanente(modulo, erro);
          resolverPendencia(modulo, chave);
          return;
        }
        console.error(`[filaPendencias] ${modulo}:${chave} falhou, aguardando reconexão`, erro);
        registrarPendencia(modulo, chave, tentar);
      });
  };
  tentar();
}

/** Leitura pura das chaves pendentes de um módulo (não remove nada) — cada `iniciarSyncX()`
 *  chama isso no boot pra saber o que reenviar; quem decide COMO reenviar (upsert vs delete,
 *  reler a store atual) é o próprio módulo. União da fila visível (falha confirmada) com o
 *  registro silencioso "em voo" (achado ao vivo em 23/08, ver `CHAVE_EM_VOO`) — reenviar uma
 *  chave que na verdade já tinha completado é sempre seguro (upsert/delete idempotentes, "não
 *  existe mais localmente" já é tratado por cada `resolverReplayX`). */
export function retomarPendenciasPersistidas(modulo: string): string[] {
  const prefixo = `${modulo}:`;
  const daFilaVisivel = usePendenciasStore
    .getState()
    .itens.filter((it) => it.modulo === modulo)
    .map((it) => it.chave);
  const emVoo = [...lerEmVoo()].filter((id) => id.startsWith(prefixo)).map((id) => id.slice(prefixo.length));
  return [...new Set([...daFilaVisivel, ...emVoo])];
}

export function usePendenciasCount(): number {
  return usePendenciasStore((s) => s.itens.length);
}

export function usePendenciasDetalhe(): PendenciaItem[] {
  return usePendenciasStore((s) => s.itens);
}

/** Dispara todos os callbacks de retry registrados agora — chaves só com metadado persistido
 *  (nenhum módulo ainda relêu/registrou um callback de verdade nesta sessão) são ignoradas
 *  até o módulo correspondente montar e chamar `retomarPendenciasPersistidas`. */
export function tentarTodasPendencias(): void {
  for (const tentar of [...callbacksPendentes.values()]) void tentar();
}

/**
 * Chamar uma vez no boot de cada bundle (`entries/mestre.tsx`/`jogador.tsx`), ao lado de
 * `instalarHandlerGlobalDeErro()`. Dois gatilhos de reenvio automático: o evento `online` do
 * browser, e a transição de `statusSincronizacao` de `'erro'` pra `'conectado'` (qualquer
 * canal reconectando — aproximação aceitável, mesmo espírito agregado do `StatusIndicador`).
 */
export function instalarRetentativaAutomatica(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('online', tentarTodasPendencias);
  }

  let statusAnterior = statusSincronizacao(useStatusMesa.getState());
  useStatusMesa.subscribe((s) => {
    const atual = statusSincronizacao(s);
    if (statusAnterior === 'erro' && atual === 'conectado') tentarTodasPendencias();
    statusAnterior = atual;
  });
}
