import { create } from 'zustand';

export interface PedidoRolagemTeste {
  /** crypto.randomUUID() — mesma razão do `id` de `PedidoRolagemDano` (pedidoRolagemDanoStore.ts):
   *  precisa disparar de novo mesmo se os outros campos coincidirem com o pedido anterior. */
  id: string;
  /** Caminho PC — `fichaId`+`periciaId`: o overlay calcula d20+atributo+perícia
   *  (`rolarTestePericiaFicha`). Exatamente um dos dois caminhos (PC ou NPC) vem preenchido. */
  fichaId?: string;
  periciaId?: string;
  /** Caminho NPC — `npcId`+`bonusFixo`: NPC não tem atributo/perícia, o "ataque" já é um bônus
   *  fixo (`NpcAcao.bonus`) somado direto no d20 (`rolarAtaqueNpc`). */
  npcId?: string;
  bonusFixo?: number;
  /** nome da arma/ação — presente quando o pedido veio de um botão "atacar" (aba Combate ou
   *  ações de NPC), pra rotular o log como ataque em vez de teste de perícia solo. */
  rotuloArma?: string;
  visibilidade: 'publica' | 'privada';
}

interface PedidoRolagemTesteState {
  pedido: PedidoRolagemTeste | null;
  emExecucaoId: string | null;
  pedirRolagemTeste: (p: PedidoRolagemTeste) => void;
  iniciarPedidoRolagemTeste: (id: string) => boolean;
  limparPedidoRolagemTeste: (id?: string) => void;
}

/**
 * Store separado do `useStore` principal, sem `persist` — mesmo padrão de `pedidoRolagemDanoStore.ts`:
 * estado de interação ao vivo, não estado da mesa.
 *
 * Ponte entre quem pede um teste de perícia "d20 + atributo + perícia" longe da raiz
 * (`ArmasCombate.tsx` pro ataque de arma, `PericiasSection.tsx` pro teste solo) e
 * `QuickRollOverlay.tsx`/`QuickRollOverlayJogador.tsx` (dono da bandeja física 3D), sem prop
 * drilling pelos componentes no meio do caminho.
 */
export const usePedidoRolagemTesteStore = create<PedidoRolagemTesteState>((set, get) => ({
  pedido: null,
  emExecucaoId: null,
  pedirRolagemTeste: (p) => set({ pedido: p, emExecucaoId: null }),
  // O pedido permanece visível até o fim para bloquear novos cliques, mas pode
  // ser executado só uma vez mesmo após rerender, eco da ficha ou StrictMode.
  iniciarPedidoRolagemTeste: (id) => {
    if (get().pedido?.id !== id || get().emExecucaoId === id) return false;
    set({ emExecucaoId: id });
    return true;
  },
  limparPedidoRolagemTeste: (id) => {
    if (id !== undefined && get().pedido?.id !== id) return;
    set({ pedido: null, emExecucaoId: null });
  },
}));
