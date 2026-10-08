import { useEffect, useRef, useState } from 'react';
import DiceBox, { type RollResults, type CustomColorset } from '@3d-dice/dice-box-threejs';
import { COLORSETS, colorsetComCor, type ColorsetId } from './colorsets';
import type { ConsumirForcadosFn, TipoRolagemForcada } from './registroForcados';
import { resolverRolagemRemota } from '../multiplayer/rolagemRemota';
import { textoResultadoRolagem, type TipoTextoRolagem } from '../lib/textoRolagem';

/** Termo de rolagem — ex: { sides: 20, qty: 2 } = 2d20. */
export interface RollTermo {
  sides: number;
  qty: number;
}

/** Shape agrupado que os roladores consomem (mantido da lib anterior p/ não reescrever a UI). */
export interface GrupoResultado {
  qty: number;
  sides: number;
  value: number; // total do grupo
  rolls: { value: number }[];
}

/** Alias de compatibilidade — os roladores foram escritos contra este nome. */
export type RollGroupResult = GrupoResultado;

/** Colorset ou fundo/vidro fixo (rede/ruído) ou fundo/vidro + cor do jogador nos números —
 *  ver `colorsetComCor` em `colorsets.ts`. */
export type ColorsetSpec = ColorsetId | { base: ColorsetId; cor: string };

function chaveColorset(spec: ColorsetSpec): string {
  return typeof spec === 'string' ? spec : `${spec.base}:${spec.cor}`;
}

function resolverColorset(spec: ColorsetSpec): CustomColorset {
  return typeof spec === 'string' ? COLORSETS[spec] : colorsetComCor(spec.base, spec.cor);
}

export function normalizarTermos(notacao: string | RollTermo | RollTermo[]): RollTermo[] {
  if (typeof notacao === 'string') {
    return notacao.split('+').map((parte) => {
      const [qty, sides] = parte.trim().toLowerCase().split('d').map(Number);
      return { qty: qty || 1, sides };
    });
  }
  return Array.isArray(notacao) ? notacao : [notacao];
}

/** Um grupo de dados do mesmo tipo (ex.: "1d20", "2d6") — ou um pseudo-grupo sem dado físico
 *  (ex.: "Vigor" somado ao dano corpo a corpo) — com os valores individuais já rolados. */
export interface GrupoDados {
  notacao: string;
  resultados: number[];
}

/** Total e modificadores identificados; Sanidade separa teste/perda e Surto separa opções. */
function montarCorpoRolagem(grupos: GrupoDados[], bonus: number | undefined, total: number, tipo?: TipoTextoRolagem): string {
  return textoResultadoRolagem({ grupos, bonus, total, tipo });
}

/** Mensagem de log padrão pra qualquer rolagem com dado por trás (`EntradaLog.texto`):
 *  "Quem - Tipo - notação → [d1, d2, ...] + bônus = total". `sufixo` é texto narrativo livre
 *  anexado depois do total (ex.: "· segura", "· sucesso, perde 3") — mesmo padrão que várias
 *  mensagens já usavam antes de existir essa função central. */
export function formatarLogRolagem(params: {
  quem: string;
  tipo: string;
  grupos: GrupoDados[];
  bonus?: number;
  total: number;
  sufixo?: string;
}): string {
  const tipo = /^sanidade(?:\b|:)/i.test(params.tipo) ? 'sanidade' : /^surto(?:\b|:)/i.test(params.tipo) ? 'surto' : undefined;
  const corpo = montarCorpoRolagem(params.grupos, params.bonus, params.total, tipo).replace(/^(?:sanidade|surto) · /, '');
  const sufixo = params.sufixo ? ` ${params.sufixo}` : '';
  return `${params.quem} - ${params.tipo} - ${corpo}${sufixo}`;
}

/** Mensagem do aviso de rolagem ao vivo (`RolagemAoVivoPlayer.tsx`), depois que o dado assenta:
 *  "Quem: notação → [d1, d2, ...] + bônus = total" — mesmo corpo do log, sem o campo "tipo". */
export function formatarHeaderRolagem(params: { quem: string; grupos: GrupoDados[]; bonus?: number; total: number; tipo?: TipoTextoRolagem }): string {
  return `${params.quem}: ${montarCorpoRolagem(params.grupos, params.bonus, params.total, params.tipo)}`;
}

/**
 * Monta a notação da lib. Rolagem honesta por padrão: "1d8+1d20".
 *
 * Se o mestre tiver enfileirado valores forçados (janela de controle, ver forcarRolagem.ts),
 * anexa "@v1,v2,..." — a lib faz swap da face pra cair no valor, indistinguível de uma rolagem real.
 *
 * IMPORTANTE: o "@" só pode aparecer UMA VEZ, no final de toda a notação combinada — nunca um "@"
 * por termo. O parser da lib (`parseNotation`) faz `notacao.split("@")` sem limite: tudo que vem
 * depois do PRIMEIRO "@" vira a lista de valores forçados, e qualquer coisa depois de um segundo
 * "@" quebra a leitura — um termo como "1d20@5+1d4@1" faz o "+1d4" inteiro ser absorvido como texto
 * de valores forçados em vez de virar um dado de verdade, e ele nunca chega a ser criado na cena
 * (achado ao investigar por que o dado de Sanidade sumia da bandeja ao forçar valores múltiplos).
 * Os valores forçados são aplicados por ÍNDICE, na ordem em que os dados são criados — que segue a
 * ordem dos termos na notação (1º termo primeiro, etc.), então a ordem de `termos` aqui precisa
 * bater com a ordem que o valor forçado pretende atingir.
 */
export type ResolverRemoto = (
  termos: RollTermo[],
  personagemId: string | null,
  tipo: TipoRolagemForcada,
) => Promise<number[] | null>;

/** Consome a fila local de forçados (`forcarRolagem.ts`). Injetável de propósito: este módulo
 *  (`useDiceBox`) é compartilhado entre mestre e jogador, e `forcarRolagem.ts` abre um
 *  BroadcastChannel com a fila secreta do mestre — importá-lo aqui direto o colocaria no bundle
 *  do jogador mesmo sem uso real (o Rollup não consegue tree-shakear uma referência de código,
 *  só o default no-op fica no caminho do jogador). Cada chamador do mestre passa a função real;
 *  o jogador não passa nada. Mesmo tipo usado pelo registro global (`registroForcados.ts`), que
 *  atende os pontos de rolagem fora da bandeja. */
const semForcados: ConsumirForcadosFn = () => null;

export async function montarNotacao(
  termos: RollTermo[],
  personagemId: string | null = null,
  resolverRemoto: ResolverRemoto = resolverRolagemRemota,
  consumirForcadosFn: ConsumirForcadosFn = semForcados,
  tipo: TipoRolagemForcada = 'teste',
): Promise<string> {
  const base = termos.map((t) => `${t.qty}d${t.sides}`).join('+');
  const totalDados = termos.reduce((n, t) => n + t.qty, 0);
  // Fase D (desligada por padrão — ver rolagemRemota.ts): tenta o servidor primeiro; null
  // cai pro caminho local de sempre (fila local via BroadcastChannel, honesto se vazia).
  // `resolverRemoto` é injetável — o PlayerApp usa `resolverRolagemJogador` (sempre tenta o
  // servidor, sem o gate da flag) em vez do padrão do mestre.
  const forcados = (await resolverRemoto(termos, personagemId, tipo)) ?? consumirForcadosFn(totalDados, personagemId, tipo);
  if (!forcados) return base;
  return `${base}@${forcados.join(',')}`;
}

function paraGrupos(r: RollResults): GrupoResultado[] {
  return r.sets.map((s) => ({
    qty: s.num,
    sides: s.sides,
    value: s.total,
    rolls: s.rolls.map((roll) => ({ value: roll.value })),
  }));
}

/**
 * Rolagem por matemática pura (Math.random), sem física nem visual 3D — usada quando o WebGL
 * não inicializa (GPU indisponível, driver bloqueado, etc.). Mantém o mesmo shape de resultado
 * dos roladores e ainda respeita valores forçados da janela de controle, pela mesma ordem
 * (1º termo primeiro) que a rolagem física usaria — só sem o dado caindo na tela. Async pelo
 * mesmo motivo de `montarNotacao`: tenta o servidor primeiro (Fase D), cai pro local se a flag
 * estiver desligada ou a chamada falhar.
 */
export async function rolarFallback2D(
  termos: RollTermo[],
  personagemId: string | null = null,
  resolverRemoto: ResolverRemoto = resolverRolagemRemota,
  consumirForcadosFn: ConsumirForcadosFn = semForcados,
  tipo: TipoRolagemForcada = 'teste',
): Promise<GrupoResultado[]> {
  const totalDados = termos.reduce((n, t) => n + t.qty, 0);
  const forcados = (await resolverRemoto(termos, personagemId, tipo)) ?? consumirForcadosFn(totalDados, personagemId, tipo);
  let cursor = 0;
  return termos.map((t) => {
    const rolls: { value: number }[] = [];
    for (let i = 0; i < t.qty; i++) {
      const valor = forcados?.[cursor] ?? Math.floor(Math.random() * t.sides) + 1;
      rolls.push({ value: valor });
      cursor++;
    }
    return { qty: t.qty, sides: t.sides, value: rolls.reduce((soma, r) => soma + r.value, 0), rolls };
  });
}

interface PedidoRolagem {
  termos: RollTermo[];
  onComplete: (grupos: GrupoResultado[]) => void;
  colorset: ColorsetSpec;
  personagemId: string | null;
  tipo: TipoRolagemForcada;
  /** presente só em `reproduzir()`: valores já conhecidos (vindos do broadcast), notação
   *  `termos@valores` pronta — bypassa `montarNotacao`/fila de forçados/servidor. */
  notacaoForcada?: string;
}

export function useDiceBox(
  containerId: string,
  enabled = true,
  baseScale = 100,
  resolverRemoto: ResolverRemoto = resolverRolagemRemota,
  consumirForcadosFn: ConsumirForcadosFn = semForcados,
) {
  const boxRef = useRef<DiceBox | null>(null);
  const [ready, setReady] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [falhaRolagem, setFalhaRolagem] = useState(false);
  const [rolando, setRolando] = useState(false);
  /** true quando box.initialize() falhou (sem WebGL, GPU bloqueada, etc.) — rolar() passa a usar
   *  rolarFallback2D em vez de tentar física. A ferramenta continua funcionando, só sem o visual. */
  const [modo2D, setModo2D] = useState(false);
  /** espelho síncrono de `rolando` — a lib não enfileira roll() concorrente (ver rolar() abaixo),
   *  então o guard de "já tem uma rolagem em andamento" precisa ser lido antes do setState assentar. */
  const rolandoRef = useRef(false);
  /** evita chamar updateConfig (recarrega tema) toda rolagem — só quando o colorset pedido muda.
   *  chave string (`chaveColorset`) porque agora o colorset pode ser fixo ('rede'/'ruido') ou
   *  dinâmico (base + cor do jogador). */
  const colorsetAtualRef = useRef<string>('rede');
  /** fila de rolagens pedidas enquanto a bandeja já estava ocupada — tocam sozinhas, em ordem,
   *  assim que a rolagem em andamento assenta. Nenhum clique se perde. */
  const filaRef = useRef<PedidoRolagem[]>([]);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      setErro(null);
      setModo2D(false);
      boxRef.current?.clearDice();
      boxRef.current = null;
      filaRef.current = [];
      rolandoRef.current = false;
      document.getElementById(containerId)?.replaceChildren();
      return;
    }

    let vivo = true;
    const container = document.getElementById(containerId);
    if (!container) {
      setErro('container dos dados não encontrado');
      return;
    }

    const box = new DiceBox(`#${containerId}`, {
      // BASE_URL, não '/': o app é servido num subpath (`base: '/mesa-estatica/'`), então um
      // caminho absoluto da raiz dá 404 tanto em dev quanto no GitHub Pages. Passou despercebido
      // enquanto `sounds` era false — a lib gera a geometria dos dados por código e só usa o
      // assetPath pra buscar áudio, então nada mais aqui exercitava esse caminho.
      assetPath: `${import.meta.env.BASE_URL}assets/dice-box-threejs/`,
      theme_surface: 'green-felt',
      theme_material: 'glass',
      theme_customColorset: COLORSETS.rede,
      baseScale,
      // Som da física (colisão + superfície de feltro) desligado: `initialize()` só marca
      // `ready` DEPOIS de `loadSounds()` terminar, e a lib carrega 28 arquivos de áudio em
      // série (um `await` por arquivo, não paralelo) — "nada de rede em runtime" (os mp3 são
      // locais, copiados pelo postinstall) não significa instantâneo, e a "física dos dados"
      // ficava travada por segundos antes do dado ficar clicável. Ligar de novo exige mudar
      // a lib pra carregar som em paralelo sem bloquear `ready` (não é uma opção de config
      // pública dela hoje) — até lá, `false` é o que sempre funcionou rápido.
      sounds: false,
      shadows: true,
    });
    boxRef.current = box;
    colorsetAtualRef.current = 'rede';

    const iniciar = async () => {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
      if (!vivo) return;
      await box.initialize();
      if (!vivo) {
        // Componente desmontou (StrictMode dev double-invoke: monta, desmonta, monta de novo)
        // enquanto `initialize()` rodava — a lib já inseriu o canvas dela no container ANTES
        // dessa checagem rodar, então a limpeza do cleanup abaixo (que já rodou nesse meio-tempo)
        // não pegou esse canvas. Sem isso, ele fica órfão ao lado do canvas da instância nova —
        // dois `<canvas>` sobrepostos no mesmo container, um deles morto (nunca mais recebe
        // comando de rolar), e só o de baixo (na ordem do DOM) fica visível — sintoma real:
        // "a mensagem aparece, o dado nunca aparece caindo" no header (`RolagemAoVivoPlayer.tsx`,
        // o único `useDiceBox` sempre habilitado desde o primeiro render — os outros começam
        // desabilitados e só ligam depois que o usuário abre a aba/painel, fora da janela de
        // double-invoke do StrictMode, por isso nunca mostraram esse sintoma).
        container.replaceChildren();
        return;
      }
      setReady(true);
    };

    iniciar().catch((e: unknown) => {
      // WebGL indisponível ou falha de inicialização — cai pro modo 2D em vez de travar a
      // ferramenta. `ready` fica true porque os roladores ficam usáveis mesmo sem física.
      if (vivo) {
        setErro(String(e));
        setModo2D(true);
        setReady(true);
      }
    });

    return () => {
      vivo = false;
      boxRef.current = null;
      container.replaceChildren();
    };
  }, [containerId, enabled, baseScale]);

  // a lib não protege roll() concorrente: uma segunda chamada enquanto a primeira ainda anima
  // reescreve notationVectors/diceList (estado único da instância) e derruba o resultado da
  // primeira — por isso só UMA chamada real de roll() está em voo por vez. Pedidos que chegam
  // nesse meio-tempo entram na fila e tocam sozinhos, em ordem, sem o mestre precisar clicar de novo.
  const executarRolagem = async (pedido: PedidoRolagem) => {
    const box = boxRef.current;
    if (!box) {
      filaRef.current = [];
      rolandoRef.current = false;
      setRolando(false);
      return;
    }
    try {
      // só recarrega o tema se o colorset pedido for diferente do atual — updateConfig é async
      // e refaz o loadTheme, então evitar isso em toda rolagem honesta (padrão 'rede').
      const chave = chaveColorset(pedido.colorset);
      if (chave !== colorsetAtualRef.current) {
        await box.updateConfig({ theme_customColorset: resolverColorset(pedido.colorset) });
        colorsetAtualRef.current = chave;
      }
      const notacao =
        pedido.notacaoForcada ??
        (await montarNotacao(pedido.termos, pedido.personagemId, resolverRemoto, consumirForcadosFn, pedido.tipo));
      const r = await box.roll(notacao);
      pedido.onComplete(paraGrupos(r));
    } catch (e: unknown) {
      setErro(String(e));
      setFalhaRolagem(true);
    } finally {
      const proximo = filaRef.current.shift();
      if (proximo) {
        void executarRolagem(proximo);
      } else {
        rolandoRef.current = false;
        setRolando(false);
      }
    }
  };

  const rolar = (
    notacao: string | RollTermo | RollTermo[],
    onComplete: (grupos: GrupoResultado[]) => void,
    colorset: ColorsetSpec = 'rede',
    personagemId: string | null = null,
    tipo: TipoRolagemForcada = 'teste',
  ) => {
    const termos = normalizarTermos(notacao);
    setErro(null);
    setFalhaRolagem(false);
    if (modo2D) {
      // sem física rodando, então sem concorrência real pra proteger — resolve na hora (async
      // por dentro só pra poder tentar o servidor primeiro; onComplete dispara quando chegar).
      void rolarFallback2D(termos, personagemId, resolverRemoto, consumirForcadosFn, tipo).then(onComplete).catch((e: unknown) => { setErro(String(e)); setFalhaRolagem(true); });
      return;
    }
    if (!boxRef.current) return;
    const pedido: PedidoRolagem = { termos, onComplete, colorset, personagemId, tipo };
    if (rolandoRef.current) {
      filaRef.current.push(pedido);
      return;
    }
    rolandoRef.current = true;
    setRolando(true);
    void executarRolagem(pedido);
  };

  /** Reproduz uma rolagem cujos valores já são conhecidos (chegou pelo broadcast de
   *  `rolagemAoVivoSync.ts`) — mesmo mecanismo de dado forçado que `montarNotacao` já usa pro
   *  mestre, só que a origem do valor é remota, não a fila de `forcarRolagem.ts`. Nunca chama
   *  `resolverRemoto`/`consumirForcadosFn`: os valores já vieram prontos, forçar de novo (ou
   *  tentar o servidor) reescreveria o resultado que todo mundo já viu no log. */
  const reproduzir = (
    termos: RollTermo[],
    valores: number[],
    colorset: ColorsetSpec,
    onComplete: (grupos: GrupoResultado[]) => void,
  ) => {
    setErro(null);
    setFalhaRolagem(false);
    if (modo2D) {
      let cursor = 0;
      const grupos: GrupoResultado[] = termos.map((t) => {
        const rolls = Array.from({ length: t.qty }, () => ({ value: valores[cursor++] ?? 0 }));
        return { qty: t.qty, sides: t.sides, value: rolls.reduce((soma, r) => soma + r.value, 0), rolls };
      });
      onComplete(grupos);
      return;
    }
    if (!boxRef.current) return;
    const base = termos.map((t) => `${t.qty}d${t.sides}`).join('+');
    const pedido: PedidoRolagem = {
      termos,
      onComplete,
      colorset,
      personagemId: null,
      tipo: 'qualquer',
      notacaoForcada: `${base}@${valores.join(',')}`,
    };
    if (rolandoRef.current) {
      filaRef.current.push(pedido);
      return;
    }
    rolandoRef.current = true;
    setRolando(true);
    void executarRolagem(pedido);
  };

  return { ready, erro, falhaRolagem, rolando, modo2D, rolar, reproduzir };
}
