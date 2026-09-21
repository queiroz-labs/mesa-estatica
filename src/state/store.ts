import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { decrementarDuracoesCombate } from '../rules/combate';
import { calcularPvMaximo, calcularSanidadeMaxima, cruzouLinhaDescendo, metade, perdeuCincoOuMaisDeUmaVez } from '../rules/derivados';
import { rolarDadoComForcados, rolarDadosComForcados } from '../dice/registroForcados';
import { formatarLogRolagem } from '../dice/useDiceBox';
import { caixasIntersectam, subtrairCaixa } from '../features/mapa/fowGeometria';
import { calcularExpiraSurto, indiceSurtoPendente, resolverSurto } from '../rules/surto';
import { inserirNaIniciativa, ordenarIniciativa } from '../rules/teste';
import { marcarLocalErro, marcarLocalOk } from '../lib/statusMesa';
import { validarTiposEstado } from './validarImportacao';
import { QUANTIDADE_SLOTS_SOUNDPAD } from './soundpad';
import {
  COR_NPC_PADRAO,
  criarEstadoInicial,
  criarEstadoMidia,
  criarEstadoSoundpad,
  criarFichaVazia,
  criarFoWVazio,
  criarGradeInicial,
  criarMapaBiblioteca,
  criarNpcVazio,
  criarPistaVazia,
  criarSessaoPrivada,
  criarSessaoPublica,
  criarTabelasSeed,
  SCHEMA_VERSION,
} from './factories';
import type {
  EntradaIniciativa,
  EntradaLog,
  EntradaRoll,
  EntradaTabela,
  EstadoFoW,
  EstadoGlobal,
  EstadoMapa,
  EstadoMidia,
  FaixaMidia,
  Ficha,
  GradeMapa,
  MapaBiblioteca,
  Npc,
  Pista,
  RegiaoFoW,
  SessaoPrivada,
  SessaoPublica,
  SurtoAtivo,
  TabelaAleatoria,
  TipoLog,
  TokenMapa,
  ZonaFoW,
} from './types';

const ATRIBUTOS_ZERO: Record<'vigor' | 'agilidade' | 'intelecto' | 'percepcao' | 'presenca' | 'vontade', number> = {
  vigor: 0,
  agilidade: 0,
  intelecto: 0,
  percepcao: 0,
  presenca: 0,
  vontade: 0,
};

/** tipos de log que representam uma rolagem de dado — conta pra `estatisticas.rolagens`. */
const TIPOS_ROLAGEM: TipoLog[] = ['teste', 'rolagem-livre', 'surto', 'iniciativa'];

/** Merge num item específico da biblioteca de mapas — no-op (devolve `mapa` intacto) se `id`
 *  não existir mais (item removido enquanto uma edição estava em voo). */
function patchMapa(mapa: EstadoMapa, id: string, atualizar: (m: MapaBiblioteca) => MapaBiblioteca): { mapa: EstadoMapa } {
  return { mapa: { ...mapa, biblioteca: mapa.biblioteca.map((m) => (m.id === id ? atualizar(m) : m)) } };
}

/** Todas as ações de grid/FoW mexem no MAPA ATIVO, nunca num singleton solto — no-op sem mapa
 *  selecionado (`mapaAtivoId === null`). */
function patchMapaAtivo(mapa: EstadoMapa, atualizar: (m: MapaBiblioteca) => MapaBiblioteca): { mapa: EstadoMapa } {
  if (!mapa.mapaAtivoId) return { mapa };
  return patchMapa(mapa, mapa.mapaAtivoId, atualizar);
}

function patchFowAtivo(mapa: EstadoMapa, atualizar: (fow: EstadoFoW) => EstadoFoW): { mapa: EstadoMapa } {
  return patchMapaAtivo(mapa, (m) => ({ ...m, fow: atualizar(m.fow) }));
}

/** Normaliza `mapa` de um JSON importado (`importarJSON` abaixo) — aceita o formato atual
 *  (`biblioteca`/`mapaAtivoId`) e o legado pré-biblioteca (`imagemDataUrl`/`grade`/`fow` direto
 *  em `mapa`, virando um item só), mesmo espírito de outros fallbacks de import já existentes
 *  neste arquivo (ex.: `zonaAtual ?? proximoIdZona`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizarMapaBiblioteca(m: any, ordemPadrao: number): MapaBiblioteca {
  return {
    id: typeof m?.id === 'string' ? m.id : crypto.randomUUID(),
    nome: typeof m?.nome === 'string' ? m.nome : '',
    imagemPath: typeof m?.imagemPath === 'string' ? m.imagemPath : '',
    imagemUrl: typeof m?.imagemUrl === 'string' ? m.imagemUrl : '',
    grade: { ...criarGradeInicial(), ...m?.grade },
    fow: m?.fow
      ? {
          vistas: Array.isArray(m.fow.vistas) ? m.fow.vistas : [],
          visiveisAgora: Array.isArray(m.fow.visiveisAgora) ? m.fow.visiveisAgora : [],
          zonaAtual: m.fow.zonaAtual ?? m.fow.proximoIdZona ?? null,
          ativa: m.fow.ativa ?? false,
        }
      : criarFoWVazio(),
    ordem: typeof m?.ordem === 'number' ? m.ordem : ordemPadrao,
    criadoEm: typeof m?.criadoEm === 'string' ? m.criadoEm : new Date().toISOString(),
  };
}

function normalizarMapa(d: unknown): EstadoMapa {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bruto = (d ?? {}) as any;
  const tokens: TokenMapa[] = (Array.isArray(bruto.tokens) ? bruto.tokens : []).map((t: Partial<TokenMapa>) => ({
    id: t.id ?? crypto.randomUUID(),
    participanteId: t.participanteId ?? '',
    tipo: t.tipo ?? 'pc',
    x: typeof t.x === 'number' ? t.x : 0.5,
    y: typeof t.y === 'number' ? t.y : 0.5,
  }));

  if (Array.isArray(bruto.biblioteca)) {
    const biblioteca = bruto.biblioteca.map(normalizarMapaBiblioteca);
    const mapaAtivoId = biblioteca.some((m: MapaBiblioteca) => m.id === bruto.mapaAtivoId) ? bruto.mapaAtivoId : null;
    return { biblioteca, mapaAtivoId, tokens };
  }

  // formato legado (pré-biblioteca, v33 e antes): imagemDataUrl/grade/fow direto em `mapa`.
  if (bruto.imagemDataUrl) {
    const item = normalizarMapaBiblioteca({ nome: 'mapa importado', imagemUrl: bruto.imagemDataUrl, grade: bruto.grade, fow: bruto.fow }, 0);
    return { biblioteca: [item], mapaAtivoId: item.id, tokens };
  }

  return { biblioteca: [], mapaAtivoId: null, tokens };
}

export interface AlertaSanidade {
  cruzouLinhaSanidade: boolean;
  surtoDisparado: boolean;
}

/** Estado efêmero de UI — não faz parte de `EstadoGlobal` (não entra no export/import). */
interface EstadoEfemero {
  /** timestamp do último burst do sistema de ruído — dispara em qualquer queda de Sanidade e ao
   *  rolar na tabela de Surto; RuidoOverlay observa isso pro burst de 1,5s (arte.md). */
  ultimoBurstRuidoEm: number | null;
}

interface Acoes {
  adicionarFicha: () => string;
  atualizarFicha: (id: string, patch: Partial<Ficha>) => void;
  removerFicha: (id: string) => void;
  definirFichaAtiva: (id: string | null) => void;

  /** Clampa em [-máximo, máximo] (PV negativo até -máximo é permitido — regra de Morte, ver
   *  `estaMorto` em rules/combate.ts), loga o delta no log da sessão. */
  ajustarPvAtual: (id: string, novoValor: number) => void;
  /** Igual ao PV, mas também detecta cruzamento da linha (→ Trauma) e perda ≥5 de uma vez (→ Surto). */
  ajustarSanidadeAtual: (id: string, novoValor: number) => AlertaSanidade;
  /** Resolve a escolha pendente de um personagem (dois d20 diferentes) com o lado que o mestre escolheu. */
  resolverEscolhaSurtoPendente: (fichaId: string, lado: 'A' | 'B') => void;
  /** Remove um Surto específico (pendente ou já escolhido) de `surtosAtivos` — sem checagem de
   *  "só mestre" aqui dentro (mesmo modelo do resto do store); quem restringe é a UI que chama
   *  (`AtributosDerivadosSection.tsx`, botão só aparece com `souMestre`). */
  removerSurtoAtivo: (fichaId: string, surtoId: string) => void;
  ajustarDeterminacao: (id: string, novoValor: number) => void;
  ajustarDinheiro: (id: string, tipo: 'real' | 'ponto', novoValor: number) => void;
  /** Câmbio entre R$/P$ (regras.md "grana e equipamento") — P$→R$ com cambista desconta 30%;
   *  R$→P$ é 1:1 mas exige justificar origem (mestre decide, a UI só avisa). Debita no máximo o
   *  saldo disponível na moeda de origem. Loga uma única entrada 'dinheiro' com as duas pernas. */
  converterDinheiro: (id: string, direcao: 'realParaPonto' | 'pontoParaReal', valor: number) => void;

  adicionarNpc: () => string;
  atualizarNpc: (id: string, patch: Partial<Npc>) => void;
  removerNpc: (id: string) => void;
  duplicarNpc: (id: string) => void;

  adicionarPista: () => string;
  atualizarPista: (id: string, patch: Partial<Pista>) => void;
  removerPista: (id: string) => void;

  // ===== Tabelas Aleatórias (ROADMAP F6) =====
  /** Cria tabela vazia (1d20, 1 entrada 1-20), retorna id. */
  adicionarTabela: () => string;
  atualizarTabela: (id: string, patch: Partial<Pick<TabelaAleatoria, 'nome' | 'lados'>>) => void;
  removerTabela: (id: string) => void;
  adicionarEntradaTabela: (tabelaId: string) => string;
  atualizarEntradaTabela: (tabelaId: string, entradaId: string, patch: Partial<Omit<EntradaTabela, 'id'>>) => void;
  removerEntradaTabela: (tabelaId: string, entradaId: string) => void;
  /** Re-adiciona tabelas seed que foram deletadas (por nome — não duplica as que já existem). */
  restaurarTabelasPadrao: () => string[];

  /** Rola d20+Agilidade pra cada ficha e cada NPC, ordena e substitui a tabela de iniciativa. */
  rolarIniciativaTodos: () => void;
  /** Rola iniciativa apenas para os IDs de participante selecionados (PC ou NPC). */
  rolarIniciativa: (participanteIds: string[]) => void;
  /** Rola iniciativa em grupo pra NPCs parecidos — 1 d20 + a MAIOR Agilidade entre eles, todos
   *  recebem o mesmo `valor` (ficam adjacentes no sort de `ordenarIniciativa`). Atalho de mesa
   *  pro mestre não rolar a mesma coisa 5x pra guardas idênticos — a regra ainda é "d20+Agilidade,
   *  uma vez" por entidade, isso só compartilha o resultado. Só NPCs (`npcs`), nunca fichas. */
  rolarIniciativaGrupo: (participanteIds: string[]) => void;
  /** Rerrola só UM combatente já na lista (d20+Agilidade, mesma regra) e reinsere na posição
   *  ordenada — `turnoAtualId` não precisa de ajuste algum: é o id da entrada, não sua posição.
   *  Reordena por `valor` (perde o desempate por Agilidade da rolagem original, que não fica
   *  guardado por entrada — aceitável pra um rerrol pontual). */
  rerolarIniciativaDe: (participanteId: string) => void;
  removerDaIniciativa: (id: string) => void;
  limparIniciativa: () => void;
  /** Reordena a lista de iniciativa (drag-and-drop) — `turnoAtualId` não precisa de ajuste,
   *  pelo mesmo motivo de `rerolarIniciativaDe`. */
  reordenarIniciativa: (de: number, para: number) => void;

  /** Rola iniciativa se ainda não houver, e liga o modo combate na 1ª entrada da ordem. */
  iniciarModoCombate: () => void;
  /** Passa pro próximo em `iniciativa`; dá a volta soma 1 em `rodada`. */
  avancarTurno: () => void;
  /** Volta pro turno anterior; dá a volta subtrai 1 em `rodada`. Não desfaz a duração de
   *  condição decrementada pelo `avancarTurno` correspondente — reverte só posição/rodada. */
  voltarTurno: () => void;
  /** Só para de checar a trava — não zera `iniciativa`/`rodada` (mesa-estatica-multiplayer-completo.md Parte I §6.3); limpa `condicoesCombate`. */
  encerrarModoCombate: () => void;
  /** Liga/desliga uma condição de combate (`CONDICOES_COMBATE`) num combatente. */
  alternarCondicaoCombate: (participanteId: string, condicaoId: string) => void;
  /** Duração em rodadas de uma condição JÁ ativa — `null`/`0` volta a manual/persistente (sem
   *  prazo). Decrementa sozinha no fim do turno do afetado (`avancarTurno`). */
  definirDuracaoCondicao: (participanteId: string, condicaoId: string, rodadas: number | null) => void;

  // ===== Biblioteca de mapas =====
  /** Cria um item novo na biblioteca (grid/FoW no default) — `ordem` = maior atual + 1.
   *  Retorna o id gerado. Não muda `mapaAtivoId` sozinho. */
  adicionarMapaBiblioteca: (nome: string, path: string, url: string) => string;
  /** Remove da lista; se era o ativo, `mapaAtivoId` vira `null`. */
  removerMapaBiblioteca: (id: string) => void;
  renomearMapaBiblioteca: (id: string, nome: string) => void;
  /** Re-upload/substituição da imagem de um item já existente — mesmo padrão de pintura
   *  otimista do upload original (dataURL local até o Storage resolver). */
  atualizarImagemMapaBiblioteca: (id: string, path: string, url: string) => void;
  selecionarMapaAtivo: (id: string | null) => void;
  atualizarGrade: (patch: Partial<GradeMapa>) => void;
  /** Ignora se o participante já tem token no mapa (evita duplicar ao clicar 2x). */
  adicionarTokenMapa: (participanteId: string, tipo: 'pc' | 'npc') => void;
  moverTokenMapa: (id: string, x: number, y: number) => void;
  removerTokenMapa: (id: string) => void;

  // ===== Fog of war (ROADMAP F1) — sempre do MAPA ATIVO; no-op sem mapa ativo =====
  /** Revela região (entra em `vistas` ∪ `visiveisAgora`). Se `cobrirLuz`-only, retira de
   *  `visiveisAgora` mantendo `vistas` (memória corrompida persiste). */
  adicionarRegiaoFoW: (regiao: Omit<RegiaoFoW, 'id'>) => string | undefined;
  removerRegiaoFoW: (id: string) => void;
  /** Move região de `visiveisAgora` pra "fora da luz" — mantém em `vistas`. No-op se não estava visível. */
  cobrirLuzFoW: (id: string) => void;
  /** Apaga a luz só na área dada, recortando as regiões visíveis que ela toca. */
  cobrirAreaFoW: (area: Pick<RegiaoFoW, 'x' | 'y' | 'w' | 'h'>) => void;
  /** Devolve a área dada pro "nunca visto" — soma da memória (`vistas`) E da luz atual
   *  (`visiveisAgora`) juntas, recortando cada região que ela toca. Diferente do `×`
   *  (`limparFoW`), que zera o mapa inteiro — isto é cirúrgico, só a área desenhada. */
  esquecerAreaFoW: (area: Pick<RegiaoFoW, 'x' | 'y' | 'w' | 'h'>) => void;
  limparFoW: () => void;
  /** Atmosfera da cena inteira (`null` = P&B puro) — tinge o chiado "nunca visto" onde quer que
   *  ele apareça, não só a próxima região traçada. */
  definirZonaFoW: (zona: ZonaFoW | null) => void;
  /** Liga/desliga a renderização do FoW pro mapa atual — nunca apaga `vistas`/`visiveisAgora`. */
  definirFoWAtivo: (ativa: boolean) => void;

  /** Ordem = maior ordem atual + 1. Retorna o id gerado. */
  adicionarFaixaMidia: (nome: string, path: string, url: string) => string;
  removerFaixaMidia: (id: string) => void;
  /** Troca `ordem` com o vizinho imediato na lista ordenada; no-op nas bordas. */
  moverFaixaMidia: (id: string, direcao: 'cima' | 'baixo') => void;
  /** Patch genérico de playback — sempre recarimba `atualizadoEm`, que `MidiaPlayerGM`
   *  usa como gatilho pra resincronizar o `<audio>` (`audio.currentTime = posicaoSegundos`).
   *  Por isso NÃO inclui `volume` nem `modoLoop` aqui: mexer só nesses recarimbaria
   *  `atualizadoEm` e faria a faixa saltar de volta pra `posicaoSegundos` (que fica parado
   *  desde o último seek/troca de faixa) — som "reiniciando" ao trocar o modo de loop ou
   *  ajustar o volume. Os dois têm ação própria (`definirVolumeMidia`/`definirModoLoopMidia`)
   *  que não recarimba nada. */
  atualizarEstadoMidia: (patch: Partial<Pick<EstadoMidia, 'faixaAtualId' | 'tocando' | 'posicaoSegundos'>>) => void;
  definirVolumeMidia: (volume: number) => void;
  definirModoLoopMidia: (modoLoop: EstadoMidia['modoLoop']) => void;
  definirTagFaixaMidia: (id: string, tag: string) => void;

  /** Grava o som no slot (0–11), sobrescrevendo o que estiver lá — é o "substituir" da UI. */
  definirSomSoundpad: (slot: number, nome: string, path: string, url: string) => string;
  removerSomSoundpad: (slot: number) => void;
  definirVolumeSoundpad: (volume: number) => void;
  /** Carimba o disparo; GM e jogadores tocam o efeito e nunca repetem o mesmo carimbo. */
  dispararSoundpad: (slot: number) => void;
  /** Contraparte de `dispararSoundpad` — pede pra cada cliente interromper a própria instância
   *  do efeito daquele slot (se estiver tocando aí). Mesmo mecanismo de evento carimbado. */
  pararSoundpad: (slot: number) => void;

  registrarLog: (tipo: TipoLog, texto: string, personagemId?: string | null, visibilidade?: 'publica' | 'privada') => void;
  limparLog: () => void;
  /** Alterna a visibilidade de uma entrada de `log` já existente, nos dois sentidos — vale
   *  pra qualquer `tipo`, inclusive as que nasceram públicas (sem `visibilidade` setada). */
  definirVisibilidadeLog: (id: string, visibilidade: 'publica' | 'privada') => void;

  registrarRoll: (entrada: Omit<EntradaRoll, 'id' | 'timestamp'>) => void;
  /** Alterna a visibilidade de um roll já existente, nos dois sentidos (substitui o antigo
   *  `revelarRoll`, que só ia privada→pública). */
  definirVisibilidadeRoll: (id: string, visibilidade: 'publica' | 'privada') => void;

  atualizarSessaoPublica: (patch: Partial<SessaoPublica>) => void;
  atualizarSessaoPrivada: (patch: Partial<SessaoPrivada>) => void;
  /** incrementa o contador de cena (usado pelo Surto — ver mesa-estatica-multiplayer-completo.md Parte II §2). */
  avancarCena: () => void;

  adicionarEvento: (texto: string) => void;
  alternarEvento: (id: string) => void;
  removerEvento: (id: string) => void;

  adicionarLembrete: (texto: string) => void;
  removerLembrete: (id: string) => void;

  /** Clampa em >= 0. Sem gatilho automático — não há regra de morte em regras.md. */
  ajustarMortes: (delta: number) => void;
  iniciarSessaoTimer: () => void;
  encerrarSessaoTimer: () => void;

  atualizarConfig: (patch: Partial<EstadoGlobal['config']>) => void;

  /** Dispara o burst de 1,5s do sistema de ruído (arte.md) — queda de Sanidade e rolagem de Surto. */
  dispararBurstRuido: () => void;

  exportarJSON: () => string;
  importarJSON: (json: string) => void;
  resetarEstado: () => void;
}

type Store = EstadoGlobal & Acoes & EstadoEfemero;

/** Sem-op — usado no bundle do jogador (ver `ehBundleJogador` abaixo). `localStorage`
 *  nunca é a origem no cliente do jogador (mesa-estatica-multiplayer-completo.md Parte IV
 *  §4): sem isso, o `useStore` compartilhado (reusado por `FichaEditor`/`*View` nos dois
 *  bundles) rehidrataria do MESMO localStorage do `GmApp` sempre que os dois rodarem na
 *  mesma origem — inofensivo em dispositivos separados, mas ainda assim persistiria estado
 *  do jogador em disco, contra o que a Parte IV pede. */
const semPersistencia: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** `jogador.html`/`entries/jogador.tsx` (ver vite.config.ts) — checado por pathname porque
 *  a decisão precisa existir antes de qualquer import estático rodar (ordem de avaliação de
 *  módulos ES não garante que um "flag" setado em código no topo de jogador.tsx rode antes
 *  das dependências transitivas de PlayerApp, que incluem este arquivo). */
const ehBundleJogador = typeof window !== 'undefined' && window.location.pathname.includes('jogador.html');

/** `localStorage.setItem` do estado inteiro rodava em CADA `set()` — uma tecla digitada
 *  numa ficha, um `pointermove` arrastando um token no mapa, cada um serializando e gravando
 *  a mesa inteira em disco. Debounça só a ESCRITA (a atualização local do Zustand continua
 *  instantânea — teclar/arrastar não fica menos responsivo); grava a última versão até
 *  `ATRASO_STORAGE_MS` depois da última mudança. `pagehide`/`visibilitychange` forçam a
 *  gravação pendente antes de fechar a aba — sem isso, a última tecla digitada bem antes de
 *  fechar podia nunca chegar no disco. */
const ATRASO_STORAGE_MS = 400;

/** `setItem`/`getItem`/`removeItem` de um `Storage` real podem lançar — quota estourada
 *  (mapa/mídia grandes empurram a mesa pra perto do limite do localStorage) ou o navegador
 *  em modo privado (Safari históricamente lança em qualquer acesso). Sem isso, a exceção
 *  subia não capturada de dentro do `setTimeout`/`pagehide` e a mesa parava de salvar em
 *  silêncio — o mestre só descobria ao recarregar e achar tudo do jeito antigo.
 *  `marcarLocalOk`/`marcarLocalErro` (lib/statusMesa.ts) alimentam o indicador no header. */
export function criarStorageComDebounce(bruto: Storage): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendente: { chave: string; valor: string } | null = null;

  const gravarAgora = () => {
    if (!pendente) return;
    try {
      bruto.setItem(pendente.chave, pendente.valor);
      marcarLocalOk();
    } catch (erro) {
      console.error('[store] gravação local falhou — exporte um backup agora', erro);
      marcarLocalErro();
    } finally {
      pendente = null;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', gravarAgora);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') gravarAgora();
    });
  }

  return {
    getItem: (chave) => {
      try {
        return bruto.getItem(chave);
      } catch (erro) {
        console.error('[store] leitura local falhou', erro);
        marcarLocalErro();
        return null;
      }
    },
    removeItem: (chave) => {
      try {
        bruto.removeItem(chave);
      } catch (erro) {
        console.error('[store] remoção local falhou', erro);
      }
    },
    setItem: (chave, valor) => {
      pendente = { chave, valor };
      if (timer) clearTimeout(timer);
      timer = setTimeout(gravarAgora, ATRASO_STORAGE_MS);
    },
  };
}

/** Migração de schema versionado (persist) — função nomeada e exportada só pra dar pra
 *  testar direto (store.test.ts), sem montar o zustand/persist inteiro nem mockar
 *  localStorage. */
export function migrate(persistedState: unknown, versaoAnterior: number): Store {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const estado = persistedState as any;
  // v1 → v2: mapa não tinha `grade` (grid customizável da aba Mapa).
  if (versaoAnterior < 2 && estado.mapa && !estado.mapa.grade) {
    estado.mapa = { ...estado.mapa, grade: criarGradeInicial() };
  }
  // v2 → v3: `sessao` (único objeto) vira `sessaoPublica`/`sessaoPrivada` separados
  // (mesa-estatica-multiplayer-completo.md Parte III §0 — prepara pro Supabase futuro).
  if (versaoAnterior < 3 && estado.sessao) {
    const antiga = estado.sessao;
    estado.sessaoPublica = {
      ...criarSessaoPublica(),
      nomeDaMesa: antiga.nomeDaMesa,
      numeroSessao: antiga.numeroSessao,
      clima: antiga.clima,
      hora: antiga.hora,
      cenaAtual: antiga.cenaAtual,
    };
    estado.sessaoPrivada = criarSessaoPrivada();
    delete estado.sessao;
  }
  // v3 → v4: cor de NPC editável, marcador de Surto até fim de cena, modo combate por
  // turnos (mesa-estatica-multiplayer-completo.md Parte II §1-4).
  if (versaoAnterior < 4) {
    if (estado.npcs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estado.npcs = estado.npcs.map((n: any) => ({ corVisual: COR_NPC_PADRAO, ...n }));
    }
    if (estado.fichas) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estado.fichas = estado.fichas.map((f: any) => ({ surtoAtivo: null, ...f }));
    }
    if (estado.sessaoPublica) {
      estado.sessaoPublica = {
        modoCombate: false,
        indiceAtualTurno: 0,
        rodada: 1,
        ...estado.sessaoPublica,
      };
    }
  }
  // v4 → v5: qual entrada da Tabela de Surto está em vigor (correcoes-parte2.md item 11).
  if (versaoAnterior < 5 && estado.fichas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.fichas = estado.fichas.map((f: any) => ({ surtoEscolha: null, ...f }));
  }
  // v5 → v6: DT da cena sai dos roladores (visíveis na tela compartilhada) e vira campo
  // privado em "cena atual" — só o mestre define/vê.
  if (versaoAnterior < 6) {
    estado.sessaoPrivada = { dificuldadeCena: 'media', dificuldadeCenaCustom: 15, ...(estado.sessaoPrivada ?? {}) };
  }
  // v6 → v7: condições de combate por combatente (Parte II §4).
  if (versaoAnterior < 7) {
    estado.sessaoPublica = { condicoesCombate: {}, ...(estado.sessaoPublica ?? {}) };
  }
  // v7 → v8: selecionadosIniciativa na sessaoPrivada; reforça condicoesCombate.
  if (versaoAnterior < 8) {
    estado.sessaoPrivada = { selecionadosIniciativa: [], ...(estado.sessaoPrivada ?? {}) };
    estado.sessaoPublica = { condicoesCombate: {}, ...(estado.sessaoPublica ?? {}) };
  }
  // v8 → v9: visivel, notasMestre, categoria, acoes em Npc
  if (versaoAnterior < 9 && estado.npcs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.npcs = estado.npcs.map((n: any) => ({
      ...n,
      visivel: false,
      notasMestre: '',
      categoria: '',
      acoes: [],
    }));
  }
  // v9 → v10: rolls_log
  if (versaoAnterior < 10) {
    estado.rollsLog = [];
  }
  // v10 → v11: surto vira array surtosAtivos em cada ficha
  if (versaoAnterior < 11 && estado.fichas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.fichas = estado.fichas.map((f: any) => {
      const { surtoAtivo, surtoEscolha, ...resto } = f;
      const surtosAtivos: SurtoAtivo[] = [];
      if (surtoAtivo != null) {
        // `modo` não existia nessa versão — valor arbitrário, sem efeito real: a migração
        // v29→v30 zera `surtosAtivos` de novo pra qualquer estado que passe por aqui.
        surtosAtivos.push({
          id: crypto.randomUUID(),
          expiraEm: surtoAtivo,
          escolha: surtoEscolha ?? null,
          modo: 'cena',
        });
      }
      return { ...resto, surtosAtivos };
    });
  }
  // v11 → v12: garante surtosAtivos em toda ficha
  if (versaoAnterior < 12 && estado.fichas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.fichas = estado.fichas.map((f: any) => ({ surtosAtivos: [], ...f }));
  }
  // v13 → v14: aba Mídia — jukebox sincronizado (faixas + estado de playback).
  if (versaoAnterior < 14) {
    estado.midia = criarEstadoMidia();
  }
  // v14 → v15: Ameaça/Ruído Narrativo espelhados em sessaoPublica (visual pro jogador,
  // nunca o número — ver AlertaOverlayJogador.tsx).
  if (versaoAnterior < 15) {
    estado.sessaoPublica = { ameaca: 0, ruidoNarrativo: 0, ...(estado.sessaoPublica ?? {}) };
  }
  // v15 → v16: volume da música sincronizado (só o GM ajusta).
  if (versaoAnterior < 16) {
    estado.midia = { volume: 0.8, ...(estado.midia ?? {}) };
  }
  // v17 → v18: kitInvestigacao em cada ficha (corrige spread que sobrescrevia com undefined)
  if (versaoAnterior < 18 && estado.fichas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.fichas = (estado.fichas as any[]).map((f: any) => ({ ...f, kitInvestigacao: f.kitInvestigacao ?? [] }));
  }
  // v18 → v19: observacaoCombate em cada ficha
  if (versaoAnterior < 19 && estado.fichas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.fichas = (estado.fichas as any[]).map((f: any) => ({ ...f, observacaoCombate: f.observacaoCombate ?? '' }));
  }
  // v19 → v20: escala/unidade na grade do mapa (régua de medição).
  if (versaoAnterior < 20 && estado.mapa?.grade) {
    estado.mapa.grade = { escala: 1.5, unidade: 'm', ...estado.mapa.grade };
  }
  // v20 → v21: duração opcional por condição de combate.
  if (versaoAnterior < 21 && estado.sessaoPublica) {
    estado.sessaoPublica = { condicaoDuracao: {}, ...estado.sessaoPublica };
  }
  // v21 → v22: foto de perfil do PC (upload) e silhueta pré-instalada de NPC (Avatar.tsx).
  if (versaoAnterior < 22) {
    if (estado.fichas) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estado.fichas = estado.fichas.map((f: any) => ({ foto: null, ...f }));
    }
    if (estado.npcs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estado.npcs = estado.npcs.map((n: any) => ({ silhueta: null, ...n }));
    }
  }
  // v22 → v23: foto de perfil real do NPC (upload do mestre, precedência sobre silhueta).
  if (versaoAnterior < 23 && estado.npcs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.npcs = estado.npcs.map((n: any) => ({ foto: null, ...n }));
  }
  // v23 → v24: quadro de pistas/evidências (aba dedicada, fora da ficha).
  if (versaoAnterior < 24) {
    estado.pistas = estado.pistas ?? [];
  }
  // v24 → v25: soundpad (6 slots de efeito sonoro, volume próprio separado da música).
  if (versaoAnterior < 25) {
    estado.soundpad = { ...criarEstadoSoundpad(), ...(estado.soundpad ?? {}) };
  }
  // v25 → v26: fog of war no mapa (máscara de revelação controlada pelo mestre, persiste entre
  // sessões; `fowSync.ts` sincroniza via tabela `fow_estado`). Injeta `fow` vazio em `mapa`
  // pré-FoW — export/import JSON já cobre o campo de graça (pertence a `mapa`). Preserva
  // `fow` já existente (não reescreve quem já migrou antes).
  if (versaoAnterior < 26 && estado.mapa && !estado.mapa.fow) {
    estado.mapa.fow = criarFoWVazio();
  }
  // v26 → v27: liga/desliga de FoW por mapa (`ativa`) — antes o mapa "tinha fog" sempre que
  // `vistas` não estava vazio, sem jeito de desligar a camada sem perder o que já foi revelado.
  // Mesas já em v26 (fow existente, sem `ativa`) nascem desligadas — não força fog em mapa que
  // não usava a ferramenta.
  if (versaoAnterior < 27 && estado.mapa?.fow && estado.mapa.fow.ativa === undefined) {
    estado.mapa.fow.ativa = false;
  }
  // v27 → v28: zona vira atributo da CENA (`zonaAtual`), não mais por região — o tint só fazia
  // efeito quando TODAS as regiões reveladas coincidiam na mesma zona, então na prática já era
  // um controle único; isso só torna o modelo honesto com o comportamento real. Renomeia
  // `proximoIdZona` → `zonaAtual` (a coluna do banco, `proximo_id_zona`, não muda — só o nome
  // local) e derruba o `zona` morto de cada região já revelada.
  if (versaoAnterior < 28 && estado.mapa?.fow) {
    const fow = estado.mapa.fow;
    if ('proximoIdZona' in fow) {
      fow.zonaAtual = fow.proximoIdZona ?? null;
      delete fow.proximoIdZona;
    } else if (fow.zonaAtual === undefined) {
      fow.zonaAtual = null;
    }
    for (const lista of [fow.vistas, fow.visiveisAgora]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (Array.isArray(lista)) for (const r of lista as any[]) delete r.zona;
    }
  }
  // v28 → v29: tabelas aleatórias editáveis pelo GM (ROADMAP F6). Injeta as 3 tabelas default
  // (encontros de rua, ruídos noturnos, gancho de surto) com seed temático de São Paulo
  // distópica — o GM pode editar, adicionar ou remover a partir daí. `tabelas` é GM-only, não
  // sincroniza via Supabase (fica no localStorage + export JSON). Preserva tabelas já
  // existentes (não reescreve quem já migrou antes).
  if (versaoAnterior < 29 && !estado.tabelas) {
    estado.tabelas = criarTabelasSeed();
  }
  // v29 → v30: SurtoAtivo ganha `modo` ('cena'|'combate') — expiraEm era ambíguo sem isso
  // (bug: Surto sumia ao encerrar combate e reaparecia ao iniciar um novo). Dado salvo antes
  // do fix não tem como saber o relógio certo, zera em vez de adivinhar errado.
  if (versaoAnterior < 30 && estado.fichas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.fichas = (estado.fichas as any[]).map((f: any) => ({ ...f, surtosAtivos: [] }));
  }
  // v30 → v31: periciaAtaqueId em ArmaFicha (rolagem de ataque direto da linha, na ficha).
  // Só toca fichas que já têm `armas` de verdade — não fabrica o array pra quem nunca teve.
  if (versaoAnterior < 31 && estado.fichas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.fichas = (estado.fichas as any[]).map((f: any) => {
      if (!Array.isArray(f.armas)) return f;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const armas = f.armas.map((a: any) => ({ periciaAtaqueId: null, ...a }));
      return { ...f, armas };
    });
  }
  // v31 → v32: sessaoPublica.indiceAtualTurno (índice de array) vira turnoAtualId (id da
  // entrada de iniciativa) — a RLS da tabela `iniciativa` no Supabase passa a poder omitir
  // linhas de NPC oculto pro jogador, e um índice numérico desalinha entre o array cheio do
  // mestre e o array filtrado do jogador. Um id de entrada não desalinha nunca: ou a entrada
  // está lá, ou não está.
  if (versaoAnterior < 32 && estado.sessaoPublica && 'indiceAtualTurno' in estado.sessaoPublica) {
    const indice = estado.sessaoPublica.indiceAtualTurno;
    const iniciativa = Array.isArray(estado.iniciativa) ? estado.iniciativa : [];
    const { indiceAtualTurno: _descartado, ...resto } = estado.sessaoPublica;
    estado.sessaoPublica = { ...resto, turnoAtualId: iniciativa[indice]?.id ?? null };
  }
  // v32 → v33: antecedenteId ganha o sentinel 'custom' (Antecedente por texto livre, fora dos
  // 8 presets) — antecedenteCustom guarda esse texto.
  if (versaoAnterior < 33 && estado.fichas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estado.fichas = (estado.fichas as any[]).map((f: any) => ({ antecedenteCustom: '', ...f }));
  }
  // v33 → v34: mapa único vira biblioteca de mapas (mestre escolhe qual está ativo a qualquer
  // momento) — grid/FoW passam a ser lembrados POR MAPA, não mais num objeto único (decisão do
  // usuário). O mapa em uso vira o primeiro item da biblioteca, já ativo — não perde a
  // calibração de quem já jogava. Sem imagem carregada ainda, biblioteca nasce vazia.
  if (versaoAnterior < 34 && estado.mapa && !estado.mapa.biblioteca) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const antigo = estado.mapa as any;
    // qualquer rastro de mapa anterior (imagem, grid customizado ou FoW já revelado) vira um
    // item — não só quando há imagem, senão grid/FoW configurados sem imagem carregada ainda
    // (estado transitório, mas real) se perderiam na migração.
    if (antigo.imagemDataUrl || antigo.grade || antigo.fow) {
      const item = {
        id: crypto.randomUUID(),
        nome: 'mapa importado',
        imagemPath: '',
        imagemUrl: antigo.imagemDataUrl ?? '',
        grade: antigo.grade ?? criarGradeInicial(),
        fow: antigo.fow ?? criarFoWVazio(),
        ordem: 0,
        criadoEm: new Date().toISOString(),
      };
      estado.mapa = { biblioteca: [item], mapaAtivoId: item.id, tokens: antigo.tokens ?? [] };
    } else {
      estado.mapa = { biblioteca: [], mapaAtivoId: null, tokens: antigo.tokens ?? [] };
    }
  }
  return estado as Store;
}

/** Encaixa entradas novas na iniciativa (por valor). `turnoAtualId` não precisa de reancoragem
 *  aqui — é o id de uma entrada já existente, inserir combatentes novos em qualquer posição do
 *  array nunca muda o id de quem já estava na vez. */
function comIniciativaInserida(s: Store, entradas: EntradaIniciativa[]): Pick<Store, 'iniciativa'> {
  return { iniciativa: inserirNaIniciativa(s.iniciativa, entradas) };
}

/** Limpa entradas de iniciativa (e condições associadas) de um participante que deixou de
 *  existir — ficha ou NPC apagado enquanto ainda estava na ordem de turno. Sem isso, o
 *  combatente vira um "fantasma": some de Personagens/NPCs mas continua na Iniciativa com
 *  PV/Defesa em branco pra sempre (pvDoCombatente/defesaDoCombatente não acham mais o dono).
 *  Mesma lógica de reancoragem de `turnoAtualId` e limpeza de condições de `removerDaIniciativa`,
 *  generalizada pro caso de várias entradas com o mesmo participanteId. */
function comParticipanteRemovidoDaIniciativa(s: Store, participanteId: string): Pick<Store, 'iniciativa' | 'sessaoPublica'> {
  if (!s.iniciativa.some((e) => e.participanteId === participanteId)) {
    return { iniciativa: s.iniciativa, sessaoPublica: s.sessaoPublica };
  }

  const idxTurnoAtual = s.iniciativa.findIndex((e) => e.id === s.sessaoPublica.turnoAtualId);
  const turnoAtualEraDoParticipante = s.iniciativa[idxTurnoAtual]?.participanteId === participanteId;
  const iniciativa = s.iniciativa.filter((e) => e.participanteId !== participanteId);

  const turnoAtualId = !turnoAtualEraDoParticipante
    ? s.sessaoPublica.turnoAtualId
    : (iniciativa[Math.min(idxTurnoAtual, iniciativa.length - 1)]?.id ?? null);

  let condicoesCombate = s.sessaoPublica.condicoesCombate ?? {};
  let condicaoDuracao = s.sessaoPublica.condicaoDuracao;
  if (condicoesCombate[participanteId]) {
    condicoesCombate = { ...condicoesCombate };
    delete condicoesCombate[participanteId];
  }
  if (condicaoDuracao?.[participanteId]) {
    condicaoDuracao = { ...condicaoDuracao };
    delete condicaoDuracao[participanteId];
  }

  return { iniciativa, sessaoPublica: { ...s.sessaoPublica, turnoAtualId, condicoesCombate, condicaoDuracao } };
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...criarEstadoInicial(),
      ultimoBurstRuidoEm: null,

      adicionarFicha: () => {
        const ficha = criarFichaVazia(get().fichas.length);
        set((s) => ({ fichas: [...s.fichas, ficha], fichaAtivaId: s.fichaAtivaId ?? ficha.id }));
        return ficha.id;
      },
      atualizarFicha: (id, patch) =>
        set((s) => ({
          fichas: s.fichas.map((f) => {
            if (f.id !== id) return f;
            const atualizada = { ...f, ...patch };
            if (patch.atributos?.vontade !== undefined) {
              const novaMax = calcularSanidadeMaxima(atualizada.atributos.vontade);
              atualizada.sanidadeAtual =
                atualizada.atributos.vontade > f.atributos.vontade
                  ? novaMax
                  : Math.min(atualizada.sanidadeAtual, novaMax);
            }
            if (patch.atributos?.vigor !== undefined) {
              const novoPvMax = calcularPvMaximo(s.config.basePV, atualizada.atributos.vigor);
              atualizada.pvAtual =
                atualizada.atributos.vigor > f.atributos.vigor
                  ? novoPvMax
                  : Math.min(atualizada.pvAtual, novoPvMax);
            }
            return atualizada;
          }),
        })),
      removerFicha: (id) =>
        set((s) => {
          const fichas = s.fichas.filter((f) => f.id !== id);
          // reaponta pra primeira ficha restante em vez de deixar null — sem isso, telas que
          // leem fichaAtivaId direto do store (QuickRollOverlay, DestaqueSuperior,
          // MeuStatusSection, RuidoOverlay) ficam "cegas" até o mestre clicar manualmente na
          // ficha que já aparece selecionada em FichasTab.tsx (que só disfarça com um fallback local).
          return {
            fichas,
            fichaAtivaId: s.fichaAtivaId === id ? (fichas[0]?.id ?? null) : s.fichaAtivaId,
            ...comParticipanteRemovidoDaIniciativa(s, id),
          };
        }),
      definirFichaAtiva: (id) => set({ fichaAtivaId: id }),

      ajustarPvAtual: (id, novoValor) => {
        const ficha = get().fichas.find((f) => f.id === id);
        if (!ficha) return;
        const pvMaximo = calcularPvMaximo(get().config.basePV, ficha.atributos.vigor);
        const valor = Math.max(-pvMaximo, Math.min(novoValor, pvMaximo));
        const delta = valor - ficha.pvAtual;
        if (delta === 0) return;
        set((s) => ({ fichas: s.fichas.map((f) => (f.id === id ? { ...f, pvAtual: valor } : f)) }));
        // Só a variação, nunca o total (atual/máximo) — outro jogador vendo o log não pode saber
        // quanto de PV alguém tem, só que perdeu/ganhou algo. O total continua visível pra quem
        // já tem acesso a ele por outro caminho: o próprio dono da ficha (Atributos) e o mestre
        // (Status do Grupo/aba Personagens).
        get().registrarLog(
          delta > 0 ? 'cura' : 'dano',
          `${ficha.nome || 'Personagem'}: PV ${delta > 0 ? '+' : ''}${delta}`,
          id,
        );
      },

      ajustarSanidadeAtual: (id, novoValor) => {
        const ficha = get().fichas.find((f) => f.id === id);
        if (!ficha) return { cruzouLinhaSanidade: false, surtoDisparado: false };
        const sanidadeMaxima = calcularSanidadeMaxima(ficha.atributos.vontade);
        const valor = Math.max(0, Math.min(novoValor, sanidadeMaxima));
        const anterior = ficha.sanidadeAtual;
        const delta = valor - anterior;
        if (delta === 0) return { cruzouLinhaSanidade: false, surtoDisparado: false };
        const linha = metade(sanidadeMaxima);
        const alerta: AlertaSanidade = {
          cruzouLinhaSanidade: cruzouLinhaDescendo(anterior, valor, linha),
          surtoDisparado: perdeuCincoOuMaisDeUmaVez(anterior, valor),
        };

        let logSurtoImediato: string | null = null;
        if (alerta.surtoDisparado) {
          // 2d20 numa consumida só, como o RoladorSurto da bandeja faz — enfileirar "13, 3"
          // amarrado a surto cai aqui igual, mesmo o surto tendo sido disparado automaticamente
          // pela perda de 5+ Sanidade em vez de clicado à mão.
          const [d20A, d20B] = rolarDadosComForcados(2, 20, id, 'surto');
          const resultado = resolverSurto(d20A, d20B);
          if (resultado.mesmoNumero) {
            logSurtoImediato = formatarLogRolagem({
              quem: ficha.nome || 'Personagem',
              tipo: 'Surto',
              grupos: [{ notacao: '2d20', resultados: [d20A, d20B] }],
              total: d20A,
              sufixo: `· o destino insiste: ${resultado.entradaA.nome} — ${resultado.entradaA.descricao}`,
            });
            set((s) => ({
              fichas: s.fichas.map((f) =>
                f.id === id
                  ? {
                      ...f,
                      sanidadeAtual: valor,
                      surtosAtivos: [
                        ...(f.surtosAtivos ?? []),
                        {
                          id: crypto.randomUUID(),
                          expiraEm: calcularExpiraSurto(s.sessaoPublica),
                          escolha: resultado.entradaA.nome,
                          modo: s.sessaoPublica.modoCombate ? 'combate' : 'cena',
                        },
                      ],
                    }
                  : f,
              ),
            }));
          } else {
            set((s) => ({
              fichas: s.fichas.map((f) =>
                f.id === id
                  ? {
                      ...f,
                      sanidadeAtual: valor,
                      surtosAtivos: [
                        ...(f.surtosAtivos ?? []),
                        {
                          id: crypto.randomUUID(),
                          expiraEm: calcularExpiraSurto(s.sessaoPublica),
                          escolha: null,
                          modo: s.sessaoPublica.modoCombate ? 'combate' : 'cena',
                        },
                      ],
                      surtoPendente: { nomeFicha: ficha.nome || 'Personagem', entradaA: resultado.entradaA, entradaB: resultado.entradaB },
                    }
                  : f,
              ),
            }));
          }
        } else {
          set((s) => ({
            fichas: s.fichas.map((f) => (f.id === id ? { ...f, sanidadeAtual: valor } : f)),
          }));
        }
        // Mesmo motivo do PV acima — só a variação, nunca o total.
        get().registrarLog(
          'sanidade',
          `${ficha.nome || 'Personagem'}: Sanidade ${delta > 0 ? '+' : ''}${delta}`,
          id,
        );
        if (logSurtoImediato) get().registrarLog('surto', logSurtoImediato, id);
        if (delta < 0) get().dispararBurstRuido();
        if (alerta.surtoDisparado) {
          set((s) => ({
            sessaoPrivada: {
              ...s.sessaoPrivada,
              estatisticas: { ...s.sessaoPrivada.estatisticas, surtos: s.sessaoPrivada.estatisticas.surtos + 1 },
            },
          }));
        }
        return alerta;
      },

      resolverEscolhaSurtoPendente: (fichaId, lado) => {
        const pendente = get().fichas.find((f) => f.id === fichaId)?.surtoPendente;
        if (!pendente) return;
        const entrada = lado === 'A' ? pendente.entradaA : pendente.entradaB;
        set((s) => ({
          fichas: s.fichas.map((f) => {
            if (f.id !== fichaId) return f;
            const arr = f.surtosAtivos ?? [];
            const idx = indiceSurtoPendente(arr);
            const surtosAtivos = idx === -1 ? arr : arr.map((s2, i) => (i === idx ? { ...s2, escolha: entrada.nome } : s2));
            return { ...f, surtosAtivos, surtoPendente: undefined };
          }),
        }));
        get().registrarLog(
          'surto',
          `${pendente.nomeFicha} · Surto · escolhido: ${entrada.nome} — ${entrada.descricao}`,
          fichaId,
        );
      },

      removerSurtoAtivo: (fichaId, surtoId) => {
        const ficha = get().fichas.find((f) => f.id === fichaId);
        if (!ficha) return;
        const alvo = (ficha.surtosAtivos ?? []).find((s) => s.id === surtoId);
        if (!alvo) return;
        set((s) => ({
          fichas: s.fichas.map((f) =>
            f.id === fichaId
              ? {
                  ...f,
                  surtosAtivos: (f.surtosAtivos ?? []).filter((sur) => sur.id !== surtoId),
                  // ainda pendente de escolha — some junto, senão a UI ficaria oferecendo
                  // "escolher este" pra um Surto que não existe mais.
                  surtoPendente: alvo.escolha === null ? undefined : f.surtoPendente,
                }
              : f,
          ),
        }));
        get().registrarLog(
          'surto',
          `${ficha.nome || 'Personagem'} · Surto removido manualmente${alvo.escolha ? ` (${alvo.escolha})` : ' (ainda pendente de escolha)'}`,
          fichaId,
        );
      },

      ajustarDeterminacao: (id, novoValor) => {
        const ficha = get().fichas.find((f) => f.id === id);
        if (!ficha) return;
        const valor = Math.max(0, Math.min(novoValor, 2));
        if (valor === ficha.determinacao) return;
        set((s) => ({ fichas: s.fichas.map((f) => (f.id === id ? { ...f, determinacao: valor } : f)) }));
        get().registrarLog('determinacao', `${ficha.nome || 'Personagem'}: Determinação → ${valor}`, id);
      },

      ajustarDinheiro: (id, tipo, novoValor) => {
        const ficha = get().fichas.find((f) => f.id === id);
        if (!ficha) return;
        const campo = tipo === 'real' ? 'dinheiroReal' : 'dinheiroPonto';
        const anterior = ficha[campo];
        const valor = Math.max(0, novoValor);
        const delta = valor - anterior;
        if (delta === 0) return;
        set((s) => ({ fichas: s.fichas.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)) }));
        const simbolo = tipo === 'real' ? 'R$' : 'P$';
        get().registrarLog(
          'dinheiro',
          `${ficha.nome || 'Personagem'}: ${simbolo} ${delta > 0 ? '+' : ''}${delta} (${anterior} → ${valor})`,
          id,
        );
      },

      converterDinheiro: (id, direcao, valorBruto) => {
        const ficha = get().fichas.find((f) => f.id === id);
        if (!ficha) return;
        const nome = ficha.nome || 'Personagem';

        if (direcao === 'pontoParaReal') {
          const debitado = Math.min(Math.max(0, Math.floor(valorBruto)), ficha.dinheiroPonto);
          if (debitado === 0) return;
          const creditado = Math.max(1, Math.round(debitado * 0.7));
          const novoPonto = ficha.dinheiroPonto - debitado;
          const novoReal = ficha.dinheiroReal + creditado;
          set((s) => ({
            fichas: s.fichas.map((f) => (f.id === id ? { ...f, dinheiroPonto: novoPonto, dinheiroReal: novoReal } : f)),
          }));
          get().registrarLog(
            'dinheiro',
            `${nome}: câmbio P$→R$ ${debitado} (P$ ${ficha.dinheiroPonto} → ${novoPonto}, R$ ${ficha.dinheiroReal} → ${novoReal}) — taxa do sigilo, 30%`,
            id,
          );
        } else {
          const debitado = Math.min(Math.max(0, Math.floor(valorBruto)), ficha.dinheiroReal);
          if (debitado === 0) return;
          const novoReal = ficha.dinheiroReal - debitado;
          const novoPonto = ficha.dinheiroPonto + debitado;
          set((s) => ({
            fichas: s.fichas.map((f) => (f.id === id ? { ...f, dinheiroReal: novoReal, dinheiroPonto: novoPonto } : f)),
          }));
          get().registrarLog(
            'dinheiro',
            `${nome}: câmbio R$→P$ ${debitado} (R$ ${ficha.dinheiroReal} → ${novoReal}, P$ ${ficha.dinheiroPonto} → ${novoPonto}) — origem a justificar`,
            id,
          );
        }
      },

      adicionarNpc: () => {
        const npc = criarNpcVazio();
        set((s) => ({ npcs: [...s.npcs, npc] }));
        return npc.id;
      },
      atualizarNpc: (id, patch) =>
        set((s) => ({ npcs: s.npcs.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
      removerNpc: (id) =>
        set((s) => ({ npcs: s.npcs.filter((n) => n.id !== id), ...comParticipanteRemovidoDaIniciativa(s, id) })),
      duplicarNpc: (id) =>
        set((s) => {
          const original = s.npcs.find((n) => n.id === id);
          if (!original) return s;
          const copia = { ...criarNpcVazio(), ...original, id: crypto.randomUUID(), acoes: (original.acoes ?? []).map((a) => ({ ...a, id: crypto.randomUUID() })) };
          const match = copia.nome.match(/^(.+?)(\s+(\d+))?$/);
          if (match) {
            const base = match[1];
            const num = match[3] ? parseInt(match[3], 10) + 1 : 2;
            copia.nome = `${base} ${num}`;
          }
          return { npcs: [...s.npcs, copia] };
        }),

      adicionarPista: () => {
        const pista = criarPistaVazia();
        set((s) => ({ pistas: [...s.pistas, pista] }));
        return pista.id;
      },
      atualizarPista: (id, patch) =>
        set((s) => ({ pistas: s.pistas.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removerPista: (id) => set((s) => ({ pistas: s.pistas.filter((p) => p.id !== id) })),

      // ===== Tabelas Aleatórias (ROADMAP F6) =====
      adicionarTabela: () => {
        const id = crypto.randomUUID();
        set((s) => ({
          tabelas: [
            ...s.tabelas,
            { id, nome: 'nova tabela', lados: 20, entradas: [{ id: crypto.randomUUID(), min: 1, max: 20, texto: '' }] },
          ],
        }));
        return id;
      },
      atualizarTabela: (id, patch) =>
        set((s) => ({ tabelas: s.tabelas.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removerTabela: (id) => set((s) => ({ tabelas: s.tabelas.filter((t) => t.id !== id) })),
      adicionarEntradaTabela: (tabelaId) => {
        const entradaId = crypto.randomUUID();
        set((s) => ({
          tabelas: s.tabelas.map((t) =>
            t.id === tabelaId
              ? { ...t, entradas: [...t.entradas, { id: entradaId, min: 1, max: 1, texto: '' }] }
              : t,
          ),
        }));
        return entradaId;
      },
      atualizarEntradaTabela: (tabelaId, entradaId, patch) =>
        set((s) => ({
          tabelas: s.tabelas.map((t) =>
            t.id === tabelaId
              ? { ...t, entradas: t.entradas.map((e) => (e.id === entradaId ? { ...e, ...patch } : e)) }
              : t,
          ),
        })),
      removerEntradaTabela: (tabelaId, entradaId) =>
        set((s) => ({
          tabelas: s.tabelas.map((t) =>
            t.id === tabelaId ? { ...t, entradas: t.entradas.filter((e) => e.id !== entradaId) } : t,
          ),
        })),
      /** Re-adiciona as tabelas seed que foram deletadas, por nome — não duplica as que já
       *  existem. Retorna os nomes das tabelas que foram restauradas (vazio = nada faltava). */
      restaurarTabelasPadrao: () => {
        const atuais = get().tabelas;
        const seed = criarTabelasSeed();
        const nomesExistentes = new Set(atuais.map((t) => t.nome));
        const faltando = seed.filter((s) => !nomesExistentes.has(s.nome));
        if (faltando.length === 0) return [];
        set((s) => ({ tabelas: [...s.tabelas, ...faltando] }));
        return faltando.map((t) => t.nome);
      },

      rolarIniciativaTodos: () => {
        const { fichas, npcs } = get();
        const participantes = [
          ...fichas.map((f) => ({
            id: f.id,
            tipo: 'pc' as const,
            nome: f.nome || 'sem nome',
            d20: rolarDadoComForcados(20, f.id, 'iniciativa'),
            agilidade: f.atributos.agilidade,
          })),
          ...npcs.map((n) => ({
            id: n.id,
            tipo: 'npc' as const,
            nome: n.nome || 'sem nome',
            d20: rolarDadoComForcados(20, n.id, 'iniciativa'),
            agilidade: n.agilidade,
          })),
        ];
        if (participantes.length === 0) return;
        const ordenados = ordenarIniciativa(participantes);
        const entradas: EntradaIniciativa[] = ordenados.map((p) => ({
          id: crypto.randomUUID(),
          participanteId: p.id,
          tipo: p.tipo,
          nome: p.nome,
          valor: p.d20 + p.agilidade,
          d20: p.d20,
          agilidade: p.agilidade,
        }));
        set({ iniciativa: entradas });
        entradas.forEach((e) => {
          get().registrarLog(
            'iniciativa',
            formatarLogRolagem({ quem: e.nome, tipo: 'Iniciativa', grupos: [{ notacao: '1d20', resultados: [e.d20 ?? 0] }], bonus: e.agilidade, total: e.valor }),
            e.participanteId,
          );
        });
      },
      rolarIniciativa: (participanteIds) => {
        const { fichas, npcs } = get();
        const candidatos = [
          ...fichas.map((f) => ({ id: f.id, tipo: 'pc' as const, nome: f.nome || 'sem nome', agilidade: f.atributos.agilidade })),
          ...npcs.map((n) => ({ id: n.id, tipo: 'npc' as const, nome: n.nome || 'sem nome', agilidade: n.agilidade })),
        ].filter((p) => participanteIds.includes(p.id));
        if (candidatos.length === 0) return;
        // rola só de quem entra na iniciativa. Antes o d20 saía pra TODA ficha/NPC da mesa e a
        // lista era filtrada depois — inofensivo com Math.random, mas agora consumiria valores
        // forçados de quem nem estava rolando.
        const filtrados = candidatos.map((p) => ({ ...p, d20: rolarDadoComForcados(20, p.id, 'iniciativa') }));
        const ordenados = ordenarIniciativa(filtrados);
        const entradas: EntradaIniciativa[] = ordenados.map((p) => ({
          id: crypto.randomUUID(),
          participanteId: p.id,
          tipo: p.tipo,
          nome: p.nome,
          valor: p.d20 + p.agilidade,
          d20: p.d20,
          agilidade: p.agilidade,
        }));
        set((s) => comIniciativaInserida(s, entradas));
        entradas.forEach((e) => {
          get().registrarLog(
            'iniciativa',
            formatarLogRolagem({ quem: e.nome, tipo: 'Iniciativa', grupos: [{ notacao: '1d20', resultados: [e.d20 ?? 0] }], bonus: e.agilidade, total: e.valor }),
            e.participanteId,
          );
        });
      },
      rolarIniciativaGrupo: (participanteIds) => {
        const { npcs } = get();
        const grupo = npcs.filter((n) => participanteIds.includes(n.id));
        if (grupo.length === 0) return;
        // alvo null: é um d20 do GRUPO, não de um NPC específico — pra forçar, o mestre
        // enfileira com alvo "qualquer" + tipo "iniciativa".
        const d20 = rolarDadoComForcados(20, null, 'iniciativa');
        const maiorAgilidade = Math.max(...grupo.map((n) => n.agilidade));
        const valor = d20 + maiorAgilidade;
        const entradas: EntradaIniciativa[] = grupo.map((n) => ({
          id: crypto.randomUUID(),
          participanteId: n.id,
          tipo: 'npc' as const,
          nome: n.nome || 'sem nome',
          valor,
          d20,
          agilidade: maiorAgilidade,
        }));
        set((s) => comIniciativaInserida(s, entradas));
        // mesmo d20 pra todos — é literalmente o dado rolado pro grupo inteiro, não um bug.
        entradas.forEach((e) => {
          get().registrarLog(
            'iniciativa',
            formatarLogRolagem({ quem: e.nome, tipo: 'Iniciativa', grupos: [{ notacao: '1d20', resultados: [d20] }], bonus: maiorAgilidade, total: valor }),
            e.participanteId,
          );
        });
      },
      rerolarIniciativaDe: (participanteId) => {
        const s = get();
        const entrada = s.iniciativa.find((e) => e.participanteId === participanteId);
        if (!entrada) return;
        const ficha = s.fichas.find((f) => f.id === participanteId);
        const npc = s.npcs.find((n) => n.id === participanteId);
        const agilidade = ficha?.atributos.agilidade ?? npc?.agilidade ?? 0;
        const d20 = rolarDadoComForcados(20, participanteId, 'iniciativa');
        const novoValor = d20 + agilidade;
        const reordenada = s.iniciativa
          .map((e) => (e.participanteId === participanteId ? { ...e, valor: novoValor, d20, agilidade } : e))
          .sort((a, b) => b.valor - a.valor);
        set({ iniciativa: reordenada });
        get().registrarLog(
          'iniciativa',
          formatarLogRolagem({ quem: entrada.nome, tipo: 'Iniciativa', grupos: [{ notacao: '1d20', resultados: [d20] }], bonus: agilidade, total: novoValor }),
          participanteId,
        );
      },
      removerDaIniciativa: (id) =>
        set((s) => {
          const removido = s.iniciativa.find((e) => e.id === id);
          const idxRemovido = s.iniciativa.findIndex((e) => e.id === id);
          const iniciativa = s.iniciativa.filter((e) => e.id !== id);

          // se o removido não era quem estava na vez, `turnoAtualId` já é o id certo — não
          // precisa procurar nada. Se era, a próxima entrada assume o mesmo slot, clampado pro
          // fim da lista se ele era o último.
          const turnoAtualId =
            s.sessaoPublica.turnoAtualId !== id
              ? s.sessaoPublica.turnoAtualId
              : iniciativa[Math.min(idxRemovido, iniciativa.length - 1)]?.id ?? null;

          // condicoesCombate/condicaoDuracao são indexados por participanteId, não pelo id da
          // entrada de iniciativa — só limpa se não sobrar nenhuma outra entrada com esse
          // participanteId (evita ressurgir "atordoado" etc. se ele voltar pra luta depois).
          const aindaPresente = removido && iniciativa.some((e) => e.participanteId === removido.participanteId);
          let condicoesCombate = s.sessaoPublica.condicoesCombate ?? {};
          let condicaoDuracao = s.sessaoPublica.condicaoDuracao;
          if (removido && !aindaPresente) {
            if (condicoesCombate[removido.participanteId]) {
              condicoesCombate = { ...condicoesCombate };
              delete condicoesCombate[removido.participanteId];
            }
            if (condicaoDuracao?.[removido.participanteId]) {
              condicaoDuracao = { ...condicaoDuracao };
              delete condicaoDuracao[removido.participanteId];
            }
          }

          return {
            iniciativa,
            sessaoPublica: { ...s.sessaoPublica, turnoAtualId, condicoesCombate, condicaoDuracao },
          };
        }),
      limparIniciativa: () => set({ iniciativa: [] }),
      reordenarIniciativa: (de, para) =>
        set((s) => {
          if (de === para) return s;
          const ordem = [...s.iniciativa];
          const [movido] = ordem.splice(de, 1);
          ordem.splice(para, 0, movido);
          return { iniciativa: ordem };
        }),

      iniciarModoCombate: () => {
        if (get().iniciativa.length === 0) get().rolarIniciativaTodos();
        if (get().iniciativa.length === 0) return; // ninguém pra lutar — não liga o modo.
        set((s) => ({
          sessaoPublica: { ...s.sessaoPublica, modoCombate: true, turnoAtualId: s.iniciativa[0]?.id ?? null, rodada: 1 },
        }));
      },
      avancarTurno: () =>
        set((s) => {
          const total = s.iniciativa.length;
          if (total === 0) return s;
          const indiceAtual = s.iniciativa.findIndex((e) => e.id === s.sessaoPublica.turnoAtualId);
          const participanteAtual = indiceAtual >= 0 ? s.iniciativa[indiceAtual].participanteId : undefined;
          const proximo = indiceAtual >= 0 ? (indiceAtual + 1) % total : 0;
          const rodada = proximo === 0 ? s.sessaoPublica.rodada + 1 : s.sessaoPublica.rodada;
          // decrementa a duração das condições de quem TERMINOU o turno agora — chega a 0,
          // some sozinha (decrementarDuracoesCombate em rules/combate.ts).
          const { condicoesCombate, condicaoDuracao } = participanteAtual
            ? decrementarDuracoesCombate(s.sessaoPublica.condicoesCombate, s.sessaoPublica.condicaoDuracao ?? {}, participanteAtual)
            : { condicoesCombate: s.sessaoPublica.condicoesCombate, condicaoDuracao: s.sessaoPublica.condicaoDuracao };
          return { sessaoPublica: { ...s.sessaoPublica, turnoAtualId: s.iniciativa[proximo].id, rodada, condicoesCombate, condicaoDuracao } };
        }),
      voltarTurno: () =>
        set((s) => {
          const total = s.iniciativa.length;
          if (total === 0) return s;
          const indiceAtual = s.iniciativa.findIndex((e) => e.id === s.sessaoPublica.turnoAtualId);
          const anterior = indiceAtual > 0 ? indiceAtual - 1 : total - 1;
          // reverte só posição/rodada — não desfaz `decrementarDuracoesCombate` do avanço
          // anterior (duração já expirada não volta), aceito de propósito: o caso de uso real é
          // "cliquei próximo por engano", não um undo fiel de todo o estado de combate.
          const rodada = indiceAtual === 0 ? Math.max(1, s.sessaoPublica.rodada - 1) : s.sessaoPublica.rodada;
          return { sessaoPublica: { ...s.sessaoPublica, turnoAtualId: s.iniciativa[anterior].id, rodada } };
        }),
      encerrarModoCombate: () =>
        set((s) => ({
          sessaoPublica: { ...s.sessaoPublica, modoCombate: false, condicoesCombate: {}, condicaoDuracao: {} },
          // Surto criado em combate (modo: 'combate') mede a duração em rodadas — fora de
          // combate esse relógio deixa de existir, então poda essas entradas aqui. Um Surto
          // criado fora de combate (modo: 'cena') não depende de rodada, sobrevive normal.
          fichas: s.fichas.map((f) => ({
            ...f,
            surtosAtivos: (f.surtosAtivos ?? []).filter((surto) => surto.modo !== 'combate'),
          })),
        })),
      alternarCondicaoCombate: (participanteId, condicaoId) =>
        set((s) => {
          const condicoesMap = { ...(s.sessaoPublica.condicoesCombate ?? {}) };
          const atuais = condicoesMap[participanteId] ?? [];
          const desligando = atuais.includes(condicaoId);
          const proximas = desligando ? atuais.filter((c) => c !== condicaoId) : [...atuais, condicaoId];
          if (proximas.length === 0) delete condicoesMap[participanteId];
          else condicoesMap[participanteId] = proximas;

          // desligou manualmente — a duração associada (se houver) fica órfã, limpa junto.
          let condicaoDuracao = s.sessaoPublica.condicaoDuracao ?? {};
          if (desligando && condicaoDuracao[participanteId]?.[condicaoId] !== undefined) {
            const doParticipante = { ...condicaoDuracao[participanteId] };
            delete doParticipante[condicaoId];
            condicaoDuracao = { ...condicaoDuracao };
            if (Object.keys(doParticipante).length === 0) delete condicaoDuracao[participanteId];
            else condicaoDuracao[participanteId] = doParticipante;
          }

          return { sessaoPublica: { ...s.sessaoPublica, condicoesCombate: condicoesMap, condicaoDuracao } };
        }),
      definirDuracaoCondicao: (participanteId, condicaoId, rodadas) =>
        set((s) => {
          const mapa = { ...(s.sessaoPublica.condicaoDuracao ?? {}) };
          const doParticipante = { ...(mapa[participanteId] ?? {}) };
          if (rodadas === null || rodadas <= 0) delete doParticipante[condicaoId];
          else doParticipante[condicaoId] = rodadas;
          if (Object.keys(doParticipante).length === 0) delete mapa[participanteId];
          else mapa[participanteId] = doParticipante;
          return { sessaoPublica: { ...s.sessaoPublica, condicaoDuracao: mapa } };
        }),

      adicionarMapaBiblioteca: (nome, path, url) => {
        const id = crypto.randomUUID();
        set((s) => {
          const ordem = s.mapa.biblioteca.reduce((max, m) => Math.max(max, m.ordem), -1) + 1;
          const item: MapaBiblioteca = { ...criarMapaBiblioteca(nome, path, url, ordem), id };
          return { mapa: { ...s.mapa, biblioteca: [...s.mapa.biblioteca, item] } };
        });
        return id;
      },
      removerMapaBiblioteca: (id) =>
        set((s) => ({
          mapa: {
            ...s.mapa,
            biblioteca: s.mapa.biblioteca.filter((m) => m.id !== id),
            mapaAtivoId: s.mapa.mapaAtivoId === id ? null : s.mapa.mapaAtivoId,
          },
        })),
      renomearMapaBiblioteca: (id, nome) => set((s) => patchMapa(s.mapa, id, (m) => ({ ...m, nome }))),
      atualizarImagemMapaBiblioteca: (id, path, url) =>
        set((s) => patchMapa(s.mapa, id, (m) => ({ ...m, imagemPath: path, imagemUrl: url }))),
      selecionarMapaAtivo: (id) => set((s) => ({ mapa: { ...s.mapa, mapaAtivoId: id } })),
      atualizarGrade: (patch) =>
        set((s) => patchMapaAtivo(s.mapa, (m) => ({ ...m, grade: { ...m.grade, ...patch } }))),
      adicionarTokenMapa: (participanteId, tipo) =>
        set((s) => {
          if (s.mapa.tokens.some((t) => t.participanteId === participanteId)) return s;
          const token: TokenMapa = { id: crypto.randomUUID(), participanteId, tipo, x: 0.5, y: 0.5 };
          return { mapa: { ...s.mapa, tokens: [...s.mapa.tokens, token] } };
        }),
      moverTokenMapa: (id, x, y) =>
        set((s) => ({
          mapa: {
            ...s.mapa,
            tokens: s.mapa.tokens.map((t) =>
              t.id === id ? { ...t, x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) } : t,
            ),
          },
        })),
      removerTokenMapa: (id) =>
        set((s) => ({ mapa: { ...s.mapa, tokens: s.mapa.tokens.filter((t) => t.id !== id) } })),

      // ===== Fog of war (ROADMAP F1) — sempre do mapa ATIVO (patchFowAtivo é no-op sem um) =====
      adicionarRegiaoFoW: (regiao) => {
        const id = crypto.randomUUID();
        set((s) =>
          patchFowAtivo(s.mapa, (fow) => ({
            ...fow,
            vistas: [...fow.vistas, { ...regiao, id }],
            visiveisAgora: [...fow.visiveisAgora, { ...regiao, id }],
          })),
        );
        return id;
      },
      removerRegiaoFoW: (id) =>
        set((s) =>
          patchFowAtivo(s.mapa, (fow) => ({
            ...fow,
            vistas: fow.vistas.filter((r) => r.id !== id),
            visiveisAgora: fow.visiveisAgora.filter((r) => r.id !== id),
          })),
        ),
      cobrirLuzFoW: (id) =>
        set((s) => patchFowAtivo(s.mapa, (fow) => ({ ...fow, visiveisAgora: fow.visiveisAgora.filter((r) => r.id !== id) }))),
      /** Apaga a luz EXATAMENTE na área desenhada: cada região iluminada que o retângulo toca é
       *  recortada (`subtrairCaixa`), sobrando as bordas que ficaram de fora. O pedaço coberto
       *  continua em `vistas`, então vira memória — não volta a ser chiado de nunca-visto.
       *
       *  Antes isto removia a região INTEIRA por interseção: cobrir um cantinho apagava o cômodo
       *  todo, e cobrir onde não havia luz não fazia nada. */
      cobrirAreaFoW: (area) =>
        set((s) =>
          patchFowAtivo(s.mapa, (fow) => {
            const atuais = fow.visiveisAgora;
            if (atuais.length === 0) return fow;
            const restantes = atuais.flatMap((r) =>
              caixasIntersectam(r, area)
                ? subtrairCaixa(r, area).map((c) => ({ ...r, ...c, id: crypto.randomUUID() }))
                : [r],
            );
            if (restantes.length === atuais.length && restantes.every((r, i) => r === atuais[i])) return fow;
            return { ...fow, visiveisAgora: restantes };
          }),
        ),
      /** "Esquecer": devolve a área desenhada pro nunca-visto, recortando (`subtrairCaixa`) TANTO
       *  `vistas` quanto `visiveisAgora` — ao contrário de `cobrirAreaFoW`, que só apaga a luz e
       *  mantém a memória, isto some com a visita inteira naquele pedaço. Único jeito de reverter
       *  uma área específica sem usar o `×` (que zera o mapa todo). */
      esquecerAreaFoW: (area) =>
        set((s) =>
          patchFowAtivo(s.mapa, (fow) => {
            const cortar = (lista: RegiaoFoW[]) =>
              lista.flatMap((r) =>
                caixasIntersectam(r, area)
                  ? subtrairCaixa(r, area).map((c) => ({ ...r, ...c, id: crypto.randomUUID() }))
                  : [r],
              );
            const vistas = cortar(fow.vistas);
            const visiveisAgora = cortar(fow.visiveisAgora);
            const vistasMudou = vistas.length !== fow.vistas.length || vistas.some((r, i) => r !== fow.vistas[i]);
            const visiveisMudou =
              visiveisAgora.length !== fow.visiveisAgora.length || visiveisAgora.some((r, i) => r !== fow.visiveisAgora[i]);
            if (!vistasMudou && !visiveisMudou) return fow;
            return { ...fow, vistas, visiveisAgora };
          }),
        ),
      limparFoW: () => set((s) => patchFowAtivo(s.mapa, () => criarFoWVazio())),
      definirZonaFoW: (zona) => set((s) => patchFowAtivo(s.mapa, (fow) => ({ ...fow, zonaAtual: zona }))),
      definirFoWAtivo: (ativa) => set((s) => patchFowAtivo(s.mapa, (fow) => ({ ...fow, ativa }))),

      adicionarFaixaMidia: (nome, path, url) => {
        const id = crypto.randomUUID();
        set((s) => {
          const maxOrdem = s.midia.faixas.reduce((m, f) => Math.max(m, f.ordem), -1);
          const faixa: FaixaMidia = { id, nome, path, url, ordem: maxOrdem + 1, criadoEm: new Date().toISOString() };
          return { midia: { ...s.midia, faixas: [...s.midia.faixas, faixa] } };
        });
        return id;
      },
      removerFaixaMidia: (id) =>
        set((s) => ({
          midia: {
            ...s.midia,
            faixas: s.midia.faixas.filter((f) => f.id !== id),
            faixaAtualId: s.midia.faixaAtualId === id ? null : s.midia.faixaAtualId,
            tocando: s.midia.faixaAtualId === id ? false : s.midia.tocando,
          },
        })),
      moverFaixaMidia: (id, direcao) =>
        set((s) => {
          const ordenadas = [...s.midia.faixas].sort((a, b) => a.ordem - b.ordem);
          const idx = ordenadas.findIndex((f) => f.id === id);
          const alvo = direcao === 'cima' ? idx - 1 : idx + 1;
          if (idx === -1 || alvo < 0 || alvo >= ordenadas.length) return s;
          const [a, b] = [ordenadas[idx], ordenadas[alvo]];
          const faixas = s.midia.faixas.map((f) =>
            f.id === a.id ? { ...f, ordem: b.ordem } : f.id === b.id ? { ...f, ordem: a.ordem } : f,
          );
          return { midia: { ...s.midia, faixas } };
        }),
      definirTagFaixaMidia: (id, tag) =>
        set((s) => ({
          midia: { ...s.midia, faixas: s.midia.faixas.map((f) => (f.id === id ? { ...f, tag } : f)) },
        })),
      atualizarEstadoMidia: (patch) =>
        set((s) => ({ midia: { ...s.midia, ...patch, atualizadoEm: new Date().toISOString() } })),
      definirVolumeMidia: (volume) =>
        set((s) => ({ midia: { ...s.midia, volume: Math.max(0, Math.min(1, volume)) } })),
      definirModoLoopMidia: (modoLoop) => set((s) => ({ midia: { ...s.midia, modoLoop } })),

      // Um slot por vez: definir sobrescreve o som que estiver naquela posição (é o
      // "substituir" da UI — não existe caminho separado pra trocar).
      definirSomSoundpad: (slot, nome, path, url) => {
        const id = crypto.randomUUID();
        set((s) => ({
          soundpad: {
            ...s.soundpad,
            sons: [...s.soundpad.sons.filter((x) => x.slot !== slot), { id, slot, nome, path, url }],
          },
        }));
        return id;
      },
      removerSomSoundpad: (slot) =>
        set((s) => ({ soundpad: { ...s.soundpad, sons: s.soundpad.sons.filter((x) => x.slot !== slot) } })),
      definirVolumeSoundpad: (volume) =>
        set((s) => ({ soundpad: { ...s.soundpad, volume: Math.max(0, Math.min(1, volume)) } })),
      dispararSoundpad: (slot) => {
        const atual = get().soundpad.ultimoDisparo;
        if (atual && atual.slot === slot && atual.tipo === 'tocar') {
          const diff = Date.now() - new Date(atual.em).getTime();
          if (diff < 200) return;
        }
        const em = new Date().toISOString();
        set((s) => ({
          soundpad: { ...s.soundpad, ultimoDisparo: { slot, em, tipo: 'tocar' } },
        }));
      },
      pararSoundpad: (slot) => {
        const em = new Date().toISOString();
        set((s) => ({
          soundpad: { ...s.soundpad, ultimoDisparo: { slot, em, tipo: 'parar' } },
        }));
      },

      registrarLog: (tipo, texto, personagemId = null, visibilidade) => {
        const sessaoPublica = get().sessaoPublica;
        const entrada: EntradaLog = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          tipo,
          personagemId,
          texto,
          ...(visibilidade ? { visibilidade } : {}),
          // rodada em que a entrada aconteceu, só durante combate — pro filtro "por rodada" do
          // CombatLogView.tsx; carimbado aqui, sem tocar nenhum dos call sites de registrarLog.
          ...(sessaoPublica.modoCombate ? { rodada: sessaoPublica.rodada } : {}),
        };
        set((s) => ({ log: [entrada, ...s.log] }));
        if (TIPOS_ROLAGEM.includes(tipo)) {
          set((s) => ({
            sessaoPrivada: {
              ...s.sessaoPrivada,
              estatisticas: { ...s.sessaoPrivada.estatisticas, rolagens: s.sessaoPrivada.estatisticas.rolagens + 1 },
            },
          }));
        }
      },
      limparLog: () =>
        set((s) => ({
          log: [],
          sessaoPrivada: {
            ...s.sessaoPrivada,
            estatisticas: { ...s.sessaoPrivada.estatisticas, rolagens: 0 },
          },
        })),
      definirVisibilidadeLog: (id, visibilidade) =>
        set((s) => ({
          log: s.log.map((e) => (e.id === id ? { ...e, visibilidade } : e)),
        })),

      registrarRoll: (entrada) => {
        const roll: EntradaRoll = {
          ...entrada,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ rollsLog: [roll, ...(s.rollsLog ?? [])] }));
      },
      definirVisibilidadeRoll: (id, visibilidade) =>
        set((s) => ({
          rollsLog: (s.rollsLog ?? []).map((r) => (r.id === id ? { ...r, visibilidade } : r)),
        })),

      atualizarSessaoPublica: (patch) => set((s) => ({ sessaoPublica: { ...s.sessaoPublica, ...patch } })),
      // Ameaça/Ruído Narrativo espelham em sessaoPublica no mesmo set() — visual pro jogador
      // (AlertaOverlayJogador.tsx), nunca o número. Tensão nunca aparece no patch daqui porque
      // não existe em SessaoPublica — o espelhamento é naturalmente pulado. Referência de
      // sessaoPublica só muda quando um dos dois campos está no patch (evita push desnecessário
      // em sessaoPublicaSync.ts, que compara por referência).
      atualizarSessaoPrivada: (patch) =>
        set((s) => ({
          sessaoPrivada: { ...s.sessaoPrivada, ...patch },
          sessaoPublica:
            patch.ameaca !== undefined || patch.ruidoNarrativo !== undefined
              ? {
                  ...s.sessaoPublica,
                  ...(patch.ameaca !== undefined ? { ameaca: patch.ameaca } : {}),
                  ...(patch.ruidoNarrativo !== undefined ? { ruidoNarrativo: patch.ruidoNarrativo } : {}),
                }
              : s.sessaoPublica,
        })),
      avancarCena: () =>
        set((s) => ({
          sessaoPublica: { ...s.sessaoPublica, contadorCena: s.sessaoPublica.contadorCena + 1 },
          // fim de cena é fronteira absoluta pro Surto (regras.md: "duração até o fim da
          // cena") — zera pra toda ficha, não só filtra por número (rules/surto.ts).
          fichas: s.fichas.map((f) => ({ ...f, surtosAtivos: [] })),
        })),

      adicionarEvento: (texto) =>
        set((s) => ({
          sessaoPrivada: {
            ...s.sessaoPrivada,
            eventos: [...s.sessaoPrivada.eventos, { id: crypto.randomUUID(), texto, feito: false }],
          },
        })),
      alternarEvento: (id) =>
        set((s) => ({
          sessaoPrivada: {
            ...s.sessaoPrivada,
            eventos: s.sessaoPrivada.eventos.map((e) => (e.id === id ? { ...e, feito: !e.feito } : e)),
          },
        })),
      removerEvento: (id) =>
        set((s) => ({
          sessaoPrivada: { ...s.sessaoPrivada, eventos: s.sessaoPrivada.eventos.filter((e) => e.id !== id) },
        })),

      adicionarLembrete: (texto) =>
        set((s) => ({
          sessaoPrivada: {
            ...s.sessaoPrivada,
            lembretes: [...s.sessaoPrivada.lembretes, { id: crypto.randomUUID(), texto }],
          },
        })),
      removerLembrete: (id) =>
        set((s) => ({
          sessaoPrivada: { ...s.sessaoPrivada, lembretes: s.sessaoPrivada.lembretes.filter((l) => l.id !== id) },
        })),

      ajustarMortes: (delta) =>
        set((s) => ({
          sessaoPrivada: {
            ...s.sessaoPrivada,
            estatisticas: {
              ...s.sessaoPrivada.estatisticas,
              mortes: Math.max(0, s.sessaoPrivada.estatisticas.mortes + delta),
            },
          },
        })),
      iniciarSessaoTimer: () =>
        set((s) =>
          s.sessaoPrivada.estatisticas.iniciadaEm
            ? s
            : {
                sessaoPrivada: {
                  ...s.sessaoPrivada,
                  estatisticas: { ...s.sessaoPrivada.estatisticas, iniciadaEm: new Date().toISOString() },
                },
              },
        ),
      encerrarSessaoTimer: () =>
        set((s) => ({
          sessaoPrivada: { ...s.sessaoPrivada, estatisticas: { ...s.sessaoPrivada.estatisticas, iniciadaEm: null } },
        })),

      atualizarConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

      dispararBurstRuido: () => set({ ultimoBurstRuidoEm: Date.now() }),

      exportarJSON: () => {
        const { fichas, fichaAtivaId, npcs, pistas, iniciativa, mapa, midia, soundpad, log, rollsLog, tabelas, config, sessaoPublica, sessaoPrivada, schemaVersion } =
          get();
        return JSON.stringify(
          { schemaVersion, sessaoPublica, sessaoPrivada, fichas, fichaAtivaId, npcs, pistas, iniciativa, mapa, midia, soundpad, log, rollsLog, tabelas, config },
          null,
          2,
        );
      },
      importarJSON: (json) => {
        let dados: EstadoGlobal;
        try {
          dados = JSON.parse(json) as EstadoGlobal;
        } catch {
          throw new Error('JSON inválido');
        }
        if (!dados || typeof dados !== 'object') throw new Error('JSON não é um objeto');
        // validação estrutural mínima
        const chavesObrigatorias = ['fichas', 'npcs', 'mapa', 'iniciativa', 'log', 'config'] as const;
        for (const k of chavesObrigatorias) if (!(k in dados)) throw new Error(`Campo obrigatório ausente: ${k}`);
        // tipo dos campos aninhados — presença sozinha não impede um `traumas: "oops"` de
        // passar batido e só quebrar depois, no render de uma ficha (validarImportacao.ts)
        const problemasDeTipo = validarTiposEstado(dados as unknown as Record<string, unknown>);
        if (problemasDeTipo.length > 0) throw new Error(`formato inválido:\n- ${problemasDeTipo.join('\n- ')}`);
        const base = criarEstadoInicial();
        const normalizar = (d: Partial<EstadoGlobal>): EstadoGlobal => ({
          schemaVersion: d.schemaVersion ?? 0,
          sessaoPublica: {
            ...base.sessaoPublica,
            ...d.sessaoPublica,
            condicoesCombate: d.sessaoPublica?.condicoesCombate ?? {},
            condicaoDuracao: d.sessaoPublica?.condicaoDuracao ?? {},
          },
          sessaoPrivada: { ...base.sessaoPrivada, ...d.sessaoPrivada, estatisticas: { ...base.sessaoPrivada.estatisticas, ...d.sessaoPrivada?.estatisticas }, eventos: d.sessaoPrivada?.eventos ?? [], lembretes: d.sessaoPrivada?.lembretes ?? [], selecionadosIniciativa: d.sessaoPrivada?.selecionadosIniciativa ?? [] },
          fichas: (d.fichas ?? []).map((f) => ({
            ...base.fichas[0] ?? criarFichaVazia(),
            ...f,
            surtosAtivos: f.surtosAtivos ?? [],
            atributos: { ...ATRIBUTOS_ZERO, ...f.atributos },
            pericias: f.pericias ?? {},
            traumas: f.traumas ?? [],
            armas: (f.armas ?? []).map((a) => ({ ...a, periciaAtaqueId: a.periciaAtaqueId ?? null })),
            kitInvestigacao: f.kitInvestigacao ?? [],
            reguladores: f.reguladores ?? [],
            vinculos: f.vinculos ?? [],
            anotacoes: f.anotacoes ?? '',
            observacaoCombate: f.observacaoCombate ?? '',
            kitAntecedente: f.kitAntecedente ?? '',
            contatoOuRecurso: f.contatoOuRecurso ?? '',
            outrosItens: f.outrosItens ?? '',
            acessos: f.acessos ?? 0,
            anestesiaAte: f.anestesiaAte ?? null,
            dinheiroReal: f.dinheiroReal ?? 0,
            dinheiroPonto: f.dinheiroPonto ?? 0,
            equipamentoModificadorDefesa: f.equipamentoModificadorDefesa ?? 0,
            equipamentoProtecaoNome: f.equipamentoProtecaoNome ?? null,
            determinacao: f.determinacao ?? 1,
            pvAtual: f.pvAtual ?? 20,
            sanidadeAtual: f.sanidadeAtual ?? 10,
          })),
          fichaAtivaId: d.fichaAtivaId ?? null,
          npcs: (d.npcs ?? []).map((n) => ({
            ...base.npcs[0] ?? criarNpcVazio(),
            ...n,
            acoes: n.acoes ?? [],
            visivel: n.visivel ?? false,
            notasMestre: n.notasMestre ?? '',
            categoria: n.categoria ?? '',
          })),
          iniciativa: d.iniciativa ?? [],
          pistas: d.pistas ?? [],
          mapa: normalizarMapa(d.mapa),
          midia: {
            faixas: (d.midia?.faixas ?? []).map((f) => ({
              id: f.id ?? crypto.randomUUID(),
              nome: f.nome ?? '',
              path: f.path ?? '',
              url: f.url ?? '',
              ordem: typeof f.ordem === 'number' ? f.ordem : 0,
              criadoEm: f.criadoEm ?? new Date().toISOString(),
              tag: f.tag,
            })),
            faixaAtualId: d.midia?.faixaAtualId ?? null,
            // nunca importa playback em curso — evita reviver "tocando: true" pra todo
            // mundo se o GM importar um JSON antigo em cima de uma sessão ao vivo.
            tocando: false,
            posicaoSegundos: 0,
            atualizadoEm: new Date(0).toISOString(),
            modoLoop: d.midia?.modoLoop ?? 'nenhum',
            volume: typeof d.midia?.volume === 'number' ? d.midia.volume : 0.8,
          },
          soundpad: {
            sons: (d.soundpad?.sons ?? [])
              .filter((x) => Number.isInteger(x?.slot) && x.slot >= 0 && x.slot < QUANTIDADE_SLOTS_SOUNDPAD)
              .map((x) => ({
                id: x.id ?? crypto.randomUUID(),
                slot: x.slot,
                nome: x.nome ?? '',
                path: x.path ?? '',
                url: x.url ?? '',
              })),
            volume: typeof d.soundpad?.volume === 'number' ? d.soundpad.volume : 0.8,
            // mesma razão de `tocando: false` acima — importar não dispara efeito em ninguém.
            ultimoDisparo: null,
          },
          log: d.log ?? [],
          rollsLog: d.rollsLog ?? [],
          tabelas: Array.isArray(d.tabelas) ? d.tabelas : base.tabelas,
          config: { ...base.config, ...d.config },
        });
        const estadoNormalizado = normalizar(dados);
        set({
          ...base,
          ...estadoNormalizado,
          schemaVersion: SCHEMA_VERSION,
        });
      },
      resetarEstado: () => set(criarEstadoInicial()),
    }),
    {
      name: 'estatica-mesa',
      storage: createJSONStorage(() => (ehBundleJogador ? semPersistencia : criarStorageComDebounce(localStorage))),
      version: SCHEMA_VERSION,
      partialize: (state) => {
        // ultimoBurstRuidoEm é efêmero (dispara a animação de ruído forte por 1,5s) — persistir
        // deixava o burst antigo reidratar e disparar de novo em todo refresh da página.
        const { ultimoBurstRuidoEm: _ultimoBurstRuidoEm, ...resto } = state;
        return resto;
      },
      migrate,
    },
  ),
);
