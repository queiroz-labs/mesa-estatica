import { create } from 'zustand';
import type { RollTermo } from '../dice/useDiceBox';
import type { ColorsetId } from '../dice/colorsets';
import type { TipoRolagemForcada } from '../dice/registroForcados';

/** Uma rolagem de jogador em trânsito pra ser reproduzida na tela de todo mundo. */
export interface RolagemAoVivo {
  id: string;
  /** mesmo shape de useDiceBox — termos na ordem em que os dados foram criados. */
  termos: RollTermo[];
  /** valores já resolvidos, na mesma ordem dos termos — `reproduzir()` os força na física. */
  valores: number[];
  /** paleta de fundo/vidro pelo tipo de rolagem (rede=teste, ruido=sanidade/surto/trauma). */
  colorsetBase: ColorsetId;
  /** corVisual de quem rolou — sobrepõe os números do dado. */
  cor: string;
  /** nome de quem rolou, pro aviso "X está rolando". */
  origem: string;
  tipo: TipoRolagemForcada;
  /** Apenas apresentação; a categoria usada para resolver/forçar continua em `tipo`. */
  contexto?: 'livre' | 'trauma';
  /** modificador plano somado ao(s) dado(s) (perícia+atributo, bônus manual...) — não é um
   *  dado, não passa pela física; só entra no total mostrado pelo aviso ao vivo
   *  (`formatarHeaderRolagem`). Ausente/undefined quando a rolagem não tem bônus. */
  bonus?: number;
}

/** Sinal de atividade sem valores, notação ou informações da fila de dados. */
export type InicioRolagemAoVivo = Pick<RolagemAoVivo, 'id' | 'origem' | 'cor' | 'tipo'>;

interface RolagemAoVivoState {
  atual: RolagemAoVivo | null;
  iniciando: InicioRolagemAoVivo | null;
  definirInicio: (r: InicioRolagemAoVivo | null) => void;
  definirAtual: (r: RolagemAoVivo | null) => void;
  /** Espelha o `visivel` de `RolagemAoVivoPlayer.tsx` (dado rolando + graça mostrando o
   *  resultado) — `atual` nunca volta a `null` sozinho, então não serve pra saber se o aviso
   *  ainda está em tela; `mostrando` é o que outros lugares (destaque da aba "Dados" em
   *  `App.tsx`/`PlayerApp.tsx`) devem ler pra saber quando desligar o realce. */
  mostrando: boolean;
  definirMostrando: (v: boolean) => void;
}

/**
 * Store separado do `useStore` principal — de propósito SEM `persist`, mesmo motivo de
 * `aoeStore.ts`/`pingsStore.ts`: é estado de interação ao vivo (um jogador rolando agora), não
 * estado da mesa; não pode vazar pro localStorage nem pro export/import JSON.
 *
 * O jogador avisa o início no clique, sem números, e publica o resultado após a física.
 * Os helpers de perícia, ataque e dano também publicam resultados de rolagens públicas do
 * mestre. Cada chamada conserva a própria decisão de visibilidade: rolagens privadas
 * ficam fora deste store e do broadcast, mesmo quando envolvem um PC.
 */
export const useRolagemAoVivoStore = create<RolagemAoVivoState>((set) => ({
  atual: null,
  iniciando: null,
  definirInicio: (r) => set({ iniciando: r }),
  definirAtual: (r) => set((s) => ({ atual: r, iniciando: r?.id === s.iniciando?.id ? null : s.iniciando })),
  mostrando: false,
  definirMostrando: (v) => set({ mostrando: v }),
}));

/** Ids de rolagens que o PRÓPRIO cliente publicou — sem isso, o jogador que rolou reproduziria
 *  a própria rolagem de novo ao ler o store de volta (o mesmo `definirAtual` que dispara o
 *  broadcast pros outros também aciona os consumidores locais: `RolagemAoVivoPlayer.tsx` no
 *  header, e agora `DadosTab.tsx`/`DadosTabJogador.tsx` reproduzindo na própria bandeja — sem o
 *  filtro, a bandeja de quem rolou tocaria o mesmo resultado duas vezes seguidas). Set simples,
 *  sem limpeza ativa: poucas rolagens por sessão, memória irrelevante. */
const idsProprios = new Set<string>();

export function marcarComoProprio(id: string): void {
  idsProprios.add(id);
}

/** Chamado no clique, antes de esperar o servidor e a física. O resultado continua
 *  sendo publicado pelo caminho existente somente quando a rolagem termina. */
export function avisarInicioRolagem(origem: string, cor: string, tipo: TipoRolagemForcada = 'teste'): string {
  const id = crypto.randomUUID();
  marcarComoProprio(id);
  useRolagemAoVivoStore.getState().definirInicio({ id, origem, cor, tipo });
  return id;
}

export function ehRolagemPropria(id: string): boolean {
  return idsProprios.has(id);
}
