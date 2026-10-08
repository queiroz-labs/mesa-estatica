import type { Atributo, GrauPericia } from '../rules/data/pericias';
import type { BasePV, NivelDificuldade } from '../rules/data/dificuldades';
import type { EntradaSurto } from '../rules/data/surto';

export interface Vinculo {
  id: string;
  quemOuOque: string;
  frase: string;
}

export interface TraumaFicha {
  id: string;
  nome: string;
  gatilho: string;
  resposta: string;
  virouCicatriz: boolean;
  cicatrizUsadaNestaSessao: boolean;
}

export interface EscolhaSurtoPendente {
  nomeFicha: string;
  entradaA: EntradaSurto;
  entradaB: EntradaSurto;
}

export interface SurtoAtivo {
  id: string;
  expiraEm: number;
  escolha: string | null;
  /** Em que "relógio" `expiraEm` foi medido no momento da criação — 'combate' compara com
   *  `rodada`, 'cena' compara com `contadorCena` (rules/surto.ts). Sem isso, uma checagem feita
   *  depois que o modo mudou reinterpretava o número errado (Surto sumia ao encerrar combate e
   *  reaparecia ao iniciar um novo). */
  modo: 'cena' | 'combate';
}

export interface KitInvestigacaoItem {
  id: string;
  nome: string;
  nota: string;
}

export interface ArmaFicha {
  id: string;
  nome: string;
  bonusAtaque: string;
  dano: string;
  alcance: string;
  nota: string;
  /** id de `DefinicaoPericia` que governa o ataque desta arma (rolagem direta na ficha) —
   *  null = arma antiga/sem perícia escolhida ainda, botão de atacar fica desabilitado. */
  periciaAtaqueId: string | null;
}

export type TipoRegulador = 'generico' | 'pleno' | 'ajuste';

export interface DoseRegulador {
  id: string;
  data: string; // ISO
  sessao: number;
  tipo: TipoRegulador;
}

export interface Ficha {
  id: string;
  corVisual: string;
  /** data URL (JPEG, ~256px) do upload de foto — null = fallback iniciais+cor (Avatar.tsx). */
  foto: string | null;

  // identidade
  nome: string;
  jogador: string;
  antecedenteId: string | null;
  /** texto livre usado quando antecedenteId === 'custom' (antecedente fora dos 8 presets). */
  antecedenteCustom: string;
  motivo: string;
  perguntaQueTeDefine: string;
  respostaPergunta: string;
  gancho: string;

  vinculos: Vinculo[]; // máx 3

  atributos: Record<Atributo, number>; // 0-5

  // derivados — pv/sanidade "atual" é a fonte da verdade; "máximo" é sempre calculado
  pvAtual: number;
  sanidadeAtual: number;
  equipamentoModificadorDefesa: number;
  equipamentoProtecaoNome: string | null;

  determinacao: number; // 0-2

  pericias: Record<string, GrauPericia>; // chave = DefinicaoPericia.id

  /** ids de DefinicaoPericia fixados como atalho no Rolador de teste — campo aditivo opcional
   *  (mesmo padrão de EntradaLog.visibilidade), ausente = nenhuma favorita, sem migração. */
  periciasFavoritas?: string[];

  traumas: TraumaFicha[]; // máx 3

  kitAntecedente: string;
  contatoOuRecurso: string;
  outrosItens: string;

  armas: ArmaFicha[];
  kitInvestigacao: KitInvestigacaoItem[];

  reguladores: DoseRegulador[];
  acessos: number; // telemetria acumulada — o mestre "gasta na pior hora"
  anestesiaAte: string | null; // ISO timestamp, null = sem anestesia ativa

  dinheiroReal: number;
  dinheiroPonto: number;

  anotacoes: string;
  observacaoCombate: string;

  surtosAtivos: SurtoAtivo[];

  /** Escolha de Surto em aberto (dois d20 diferentes, aguardando qual entrada vigora) — mora na
   *  ficha (não num map à parte no store) de propósito: assim ela sincroniza por
   *  `characters_privado` igual o resto da ficha, e o mestre vê as duas opções na aba
   *  Personagens de QUALQUER personagem, não só no navegador de quem rolou (achado 29/08 — o
   *  campo antigo, `escolhasSurtoPendentes` no store, nunca saía do navegador que rolou).
   *  Campo aditivo opcional (mesmo padrão de `periciasFavoritas`) — ausente = nada pendente,
   *  sem migração. */
  surtoPendente?: EscolhaSurtoPendente;
}

export interface NpcAcao {
  id: string;
  nome: string;
  bonus: number;
  dano: string;
}

export interface Npc {
  id: string;
  nome: string;
  corVisual: string;
  /** slug de uma silhueta pré-instalada (src/assets/silhuetas/silhuetas.tsx) — null = fallback iniciais+cor. */
  silhueta: string | null;
  /** data URL (JPEG, ~256px) do upload de foto real pelo mestre — precedência sobre `silhueta`; null = cai pra silhueta ou iniciais (Avatar.tsx). */
  foto: string | null;
  pvAtual: number;
  pvMaximo: number;
  defesa: number;
  agilidade: number;
  notas: string;
  visivel: boolean;
  notasMestre: string;
  categoria: string;
  acoes: NpcAcao[];
}

export interface EntradaIniciativa {
  id: string;
  participanteId: string; // Ficha.id ou Npc.id
  tipo: 'pc' | 'npc';
  nome: string;
  valor: number;
  d20?: number;
  agilidade?: number;
}

export interface TokenMapa {
  id: string;
  participanteId: string;
  tipo: 'pc' | 'npc';
  x: number; // 0-1 normalizado
  y: number; // 0-1 normalizado
}

export type TipoLog =
  | 'teste'
  | 'sanidade'
  | 'surto'
  | 'trauma'
  | 'dano'
  | 'cura'
  | 'dinheiro'
  | 'determinacao'
  | 'anotacao'
  | 'rolagem-livre'
  | 'iniciativa';

export interface EntradaLog {
  id: string;
  timestamp: string;
  tipo: TipoLog;
  personagemId: string | null;
  texto: string;
  /** Só setado quando a rolagem associada é privada (mesma semântica de `EntradaRoll.visibilidade`)
   *  — ausente/undefined trata como pública. Sem migração de schema: campo aditivo opcional. */
  visibilidade?: 'publica' | 'privada';
  /** Rodada em que a entrada foi registrada, só quando `modoCombate` estava ligado no momento
   *  (`registrarLog` carimba sozinho). Ausente = fora de combate. Campo aditivo opcional, mesmo
   *  espírito de `visibilidade`. */
  rodada?: number;
}

export interface EntradaRoll {
  id: string;
  timestamp: string;
  origem: string;
  personagemId: string | null;
  formula: string;
  total: number;
  bruto: number;
  visibilidade: 'publica' | 'privada';
}

export interface Progresso {
  atual: number;
  total: number;
}

export interface SessaoPublica {
  nomeDaMesa: string;
  numeroSessao: number;
  clima: string;
  hora: string;
  /** "o que os jogadores veem" (mesa-estatica-multiplayer-completo.md Parte III §2) — já existia. */
  cenaAtual: string;
  caso: string;
  localAtual: string;
  objetivo: string;
  progresso: Progresso;
  atmosfera: string;
  /** contador de cena pro Surto (mesa-estatica-multiplayer-completo.md Parte II §2) — não é `cenaAtual`. */
  contadorCena: number;

  /** Modo combate por turnos (Parte II §4). A ordem em si continua em `EstadoGlobal.iniciativa`
   *  (já existia) — aqui só o estado de "de quem é a vez". */
  modoCombate: boolean;
  /** id da `EntradaIniciativa` cuja vez é agora — null fora de combate/lista vazia. Por id, não
   *  por índice de array: a lista de iniciativa que o JOGADOR recebe pode ter menos entradas que
   *  a do mestre (RLS oculta linhas de NPC com `visivel: false`), e um índice numérico desalinha
   *  entre os dois lados assim que os tamanhos divergem. Um id nunca desalinha — ou a entrada tá
   *  lá, ou não tá. */
  turnoAtualId: string | null;
  rodada: number;
  /** Condições de combate por combatente (participanteId → ids de `CONDICOES_COMBATE`). Lembrete
   *  visual pro mestre, não modificador automático (Parte II §4). Limpo ao encerrar o combate. */
  condicoesCombate: Record<string, string[]>;
  /** Duração opcional (em rodadas) por condição ativa — participanteId → condicaoId →
   *  rodadasRestantes. Ausência de entrada = condição manual/persistente (comportamento
   *  original, sem prazo). Decrementa no fim do turno do AFETADO (não de quem aplicou);
   *  chega a 0 → remove a condição sozinha. Limpo ao encerrar o combate, junto de
   *  `condicoesCombate`. */
  condicaoDuracao: Record<string, Record<string, number>>;

  /** Cópia de `sessaoPrivada.ameaca`/`.ruidoNarrativo` (espelhada em `atualizarSessaoPrivada`) —
   *  `sessaoPrivada` continua a fonte de edição do GM. Nunca renderizado como número/gauge pro
   *  jogador (`AlertaOverlayJogador.tsx`), só como efeito visual — mesma régua de `tierDeGauge`
   *  já usada em `AlertaOverlay.tsx`. `tensao` fica de fora de propósito, nunca sobe daqui. */
  ameaca: number;
  ruidoNarrativo: number;
}

export interface EventoSessao {
  id: string;
  texto: string;
  feito: boolean;
}

export type StatusPista = 'nao-descoberta' | 'descoberta' | 'compartilhada';

/** Quadro de pistas/evidências — painel visual do mestre, fora da ficha de personagem. */
export interface Pista {
  id: string;
  texto: string;
  /** NPC, local ou caso relacionado — texto livre. */
  ligadoA: string;
  status: StatusPista;
  criadoEm: string; // ISO
  /** Timestamp de quando foi postada no log público via "revelar no log" — ausente = nunca
   *  revelada dessa forma (mestre pode ter contado por fora). Campo aditivo opcional, mesmo
   *  espírito de `EntradaLog.visibilidade`/`rodada`. */
  reveladoEm?: string;
}

export interface Lembrete {
  id: string;
  texto: string;
}

export interface EstatisticasSessao {
  rolagens: number;
  surtos: number;
  /** sem gatilho automático (não há regra de morte em regras.md) — ajustado manualmente. */
  mortes: number;
  /** ISO; null = timer da sessão parado. */
  iniciadaEm: string | null;
}

export interface SessaoPrivada {
  oQueRealmenteAcontece: string;
  proximoEvento: string;
  lembretes: Lembrete[];
  eventos: EventoSessao[];
  tensao: number; // 0-100
  ruidoNarrativo: number; // 0-100
  ameaca: number; // 0-100
  estatisticas: EstatisticasSessao;
  /** DT da cena atual — só o mestre define/vê (nunca aparece nos roladores nem no log). */
  dificuldadeCena: NivelDificuldade;
  dificuldadeCenaCustom: number;
  /** IDs de participante selecionados pra iniciativa (persiste entre sessões). */
  selecionadosIniciativa: string[];
  /** participanteId → contadorCena em que Primeiros Socorros (recuperar PV) foi usado nele —
   *  1×/pessoa/cena mesmo em falha (regras.md). Ausente = ainda não usado nesta cena. Campo
   *  aditivo opcional (mesmo padrão de `Ficha.periciasFavoritas`), sem migração. */
  primeirosSocorrosCena?: Record<string, number>;
}

export interface EstadoConfig {
  basePV: BasePV;
}

export type UnidadeMedida = 'm' | 'km';

export interface GradeMapa {
  ativa: boolean;
  // % da IMAGEM renderizada (object-fit: contain), não de .mapa-area — container varia por
  // dispositivo (mestre tem .mapa-toolbar acima, jogador não), imagem é o que é compartilhado
  // de verdade entre os dois. Canto superior esquerdo.
  x: number;
  y: number; // %
  largura: number; // %
  altura: number; // %
  colunas: number; // nº de células na horizontal, >=1
  linhas: number; // nº de células na vertical, >=1
  escala: number; // unidades por célula (régua) — ex: 1.5
  unidade: UnidadeMedida;
}

/** Um mapa da biblioteca — imagem própria + grid/FoW calibrados pra ELA (decisão do usuário:
 *  trocar de mapa ativo e voltar restaura grid/FoW exatamente como ficaram, em vez de um
 *  estado único recalibrado toda vez). Sincroniza via `mapasBibliotecaSync.ts` (migração
 *  0039), mesmo padrão de lista de `FaixaMidia`/`midia_faixas`. */
export interface MapaBiblioteca {
  id: string;
  nome: string;
  /** path no bucket Storage 'midia' (pasta 'mapas') — só o suficiente pra dar delete no
   *  Storage ao remover o item. String vazia em dois casos: upload ainda em voo/sem Supabase
   *  configurado (ver `imagemUrl`), ou item legado (mapa migrado da era anterior à biblioteca,
   *  sem path conhecido — nunca dá pra excluir o arquivo desse item específico). */
  imagemPath: string;
  /** URL pública já resolvida, OU uma `data:` URI local (pintura otimista — `ehDataUrl()`)
   *  enquanto o upload pro Storage não confirma, ou sem Supabase configurado (modo 100%
   *  local). `mapasBibliotecaSync.ts` nunca sincroniza o item enquanto for dataURL. */
  imagemUrl: string;
  grade: GradeMapa;
  fow: EstadoFoW;
  ordem: number;
  criadoEm: string; // ISO
}

export interface EstadoMapa {
  biblioteca: MapaBiblioteca[];
  /** id do item de `biblioteca` em cena agora — `null` = nenhum mapa selecionado. */
  mapaAtivoId: string | null;
  /** Tokens são globais, sem vínculo com o mapa ativo (decisão do usuário) — trocar de mapa
   *  não mexe nas posições. */
  tokens: TokenMapa[];
}

/** Variante por zona do chiado do FoW (arte.md: --real=rua/analógico, --rede=corporativo).
 *  `null` = P&B puro canal-sem-sinal (default). */
export type ZonaFoW = 'rua' | 'corporativo';

/** Região retangular (v1) — 0-1 normalizado à IMAGEM (mesmo espaço de TokenMapa.x/y, invariante
 *  #3 do ROADMAP). `forma` faz parte do tipo já em v1 pra v2 (polígonos) migrar sem shape break
 *  (acrescentar `'poly'` + `pontos?: Ponto[]` numa futura SCHEMA_VERSION).
 *
 *  Sem `zona` (removido na v28) — zona é atributo da CENA (`EstadoFoW.zonaAtual`), não da
 *  região: guardar por região nunca funcionou de verdade, porque o tint só se aplicava quando
 *  TODAS as regiões reveladas coincidiam na mesma zona. */
export interface RegiaoFoW {
  id: string;
  forma: 'rect';
  x: number; // 0-1, canto superior esquerdo
  y: number; // 0-1, canto superior esquerdo
  w: number; // 0-1, largura
  h: number; // 0-1, altura
}

export interface EstadoFoW {
  /** já visitado — persiste entre sessões; "memória" corrompida (frame visto com degradação). */
  vistas: RegiaoFoW[];
  /** luz atual — subset de `vistas`; `visiveisAgora ⊆ vistas` sempre que cobrir luz (mantém memória). */
  visiveisAgora: RegiaoFoW[];
  /** Atmosfera da CENA — tinge o chiado "nunca visto" inteiro (rua=âmbar, corporativo=ciano,
   *  `null`=P&B puro). Nome antigo `proximoIdZona` (migração v28) sugeria "por região" mas
   *  nunca foi de verdade — a coluna do banco (`fow_estado.proximo_id_zona`) não mudou. */
  zonaAtual: ZonaFoW | null;
  /** liga/desliga só a RENDERIZAÇÃO das 3 camadas — nunca apaga `vistas`/`visiveisAgora`.
   *  Default `false`: mapa nasce limpo, sem forçar fog em cena que não vai usar a ferramenta
   *  (combate, referência). Ligar mostra o mapa inteiro em chiado "nunca visto" até o mestre
   *  revelar algo — desligar e religar preserva tudo que já foi revelado. */
  ativa: boolean;
}

export type ModoLoopMidia = 'nenhum' | 'faixa' | 'lista';

export interface FaixaMidia {
  id: string;
  nome: string;
  /** caminho do objeto — Supabase Storage (bucket 'midia') pra faixas antigas, R2 pras novas
   * (ver `isUrlSupabaseStorage` em `uploadR2.ts` pra saber qual backend pela `url`). */
  path: string;
  /** URL pública já resolvida no upload (bucket público — sem expiração). */
  url: string;
  ordem: number;
  criadoEm: string; // ISO
  /** Tag livre pro mestre organizar/buscar a playlist ("tensão", "combate"...). Aditivo
   *  opcional — ausente = sem tag. Sincronizada (coluna `tag` em `midia_faixas`, migração
   *  0035) igual ao resto da faixa. */
  tag?: string;
}

export interface EstadoMidia {
  faixas: FaixaMidia[];
  faixaAtualId: string | null;
  tocando: boolean;
  posicaoSegundos: number;
  /** ISO — timestamp do último push do GM; base do cálculo de posição esperada nos outros
   *  clientes (ver src/multiplayer/posicaoMidia.ts). */
  atualizadoEm: string;
  modoLoop: ModoLoopMidia;
  /** Só o GM ajusta (slider em MidiaTab.tsx) — sincronizado pra todo mundo ouvir no mesmo
   *  nível. Mudo continua local a cada jogador (MidiaPlayerJogador.tsx), não faz parte disso. */
  volume: number;
}

/** Biblioteca e transporte próprios. A faixa escolhida sempre repete em loop nativo. */
export type EstadoAmbiencia = Omit<EstadoMidia, 'modoLoop'>;

/** Um dos 12 botões do soundpad. `slot` (0–11) é a identidade de posição na grade. */
export interface SomSoundpad {
  id: string;
  slot: number;
  nome: string;
  path: string;
  url: string;
}

export interface EstadoSoundpad {
  sons: SomSoundpad[];
  /** Separado do volume da música — o GM controla os dois de forma independente. */
  volume: number;
  /** Evento, não estado: quem recebe compara `em` com o último disparo já tocado e só age
   *  se for mais novo, senão um refetch do Realtime repetiria a ação. `tipo` distingue tocar
   *  de parar — 'parar' pede pra CADA cliente interromper sua própria instância local daquele
   *  slot, se estiver tocando (ver `soundpadUiStore.ts`). */
  ultimoDisparo: { slot: number; em: string; tipo: 'tocar' | 'parar' } | null;
}

/** Uma entrada de tabela aleatória cobre uma faixa de rolagem `min`–`max` (inclusive).
 *  Mesma ideia da Tabela de Surto (`EntradaSurto.d20`), mas com ranges pra acomodar d100
 *  sem 100 linhas. Editável pelo GM na aba Dados. */
export interface EntradaTabela {
  id: string;
  min: number;
  max: number;
  texto: string;
}

/** Tabela aleatória editável pelo GM — rola `lados` faces, consulta `entradas` por range.
 *  Não sincroniza via Supabase (GM-only, fica no localStorage + export JSON). As 3 tabelas
 *  default (encontros de rua, ruídos noturnos, gancho de surto) vêm como seed na migrate
 *  v26→v27 e podem ser editadas, adicionadas ou removidas. */
export interface TabelaAleatoria {
  id: string;
  nome: string;
  lados: number;
  entradas: EntradaTabela[];
}

export interface EstadoGlobal {
  schemaVersion: number;
  sessaoPublica: SessaoPublica;
  sessaoPrivada: SessaoPrivada;
  fichas: Ficha[];
  fichaAtivaId: string | null;
  npcs: Npc[];
  pistas: Pista[];
  iniciativa: EntradaIniciativa[];
  mapa: EstadoMapa;
  midia: EstadoMidia;
  ambiencia: EstadoAmbiencia;
  soundpad: EstadoSoundpad;
  log: EntradaLog[];
  rollsLog: EntradaRoll[];
  tabelas: TabelaAleatoria[];
  config: EstadoConfig;
}
