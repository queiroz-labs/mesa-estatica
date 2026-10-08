import { create } from 'zustand';

export interface PedidoRolagemDano {
  /** crypto.randomUUID() — chave de "é um pedido novo?" pro efeito que consome (mesmo motivo do
   *  contador `pedidoRolagem` de QuickRollOverlay.tsx: precisa disparar de novo mesmo se, por
   *  coincidência, os outros campos forem iguais ao pedido anterior). */
  id: string;
  /** `armaId` é o id da entrada de arma — em `ficha.armas` (PC) ou `npc.acoes` (NPC), conforme
   *  qual dos dois ids abaixo vem preenchido. Exatamente um dos dois. */
  fichaId?: string;
  npcId?: string;
  armaId: string;
  critico: boolean;
  visibilidade: 'publica' | 'privada';
}

interface PedidoRolagemDanoState {
  pedido: PedidoRolagemDano | null;
  emExecucaoId: string | null;
  pedirRolagemDano: (p: PedidoRolagemDano) => void;
  iniciarPedidoRolagemDano: (id: string) => boolean;
  limparPedidoRolagemDano: (id?: string) => void;
}

/**
 * Store separado do `useStore` principal, sem `persist` — mesmo padrão de `rolagemAoVivoStore.ts`
 * / `rolagemRapidaSanidadeStore.ts`: estado de interação ao vivo, não estado da mesa.
 *
 * Ponte entre `ArmasCombate.tsx` (chip de arma, longe da árvore — dentro de
 * `IniciativaPanel.tsx`/`CombateJogadorView.tsx`) e `QuickRollOverlay.tsx`/
 * `QuickRollOverlayJogador.tsx` (dono da bandeja física 3D onde o dano agora é rolado, montado
 * perto da raiz em `App.tsx`/`PlayerApp.tsx`) — sem isso seria prop drilling através de vários
 * componentes que não usam esse dado pra nada além de repassar.
 *
 * Cada bundle (mestre/jogador) importa seu próprio módulo — sem sincronização de rede, mesmo
 * isolamento que já existe entre as duas bandejas físicas hoje.
 */
export const usePedidoRolagemDanoStore = create<PedidoRolagemDanoState>((set, get) => ({
  pedido: null,
  emExecucaoId: null,
  pedirRolagemDano: (p) => set({ pedido: p, emExecucaoId: null }),
  iniciarPedidoRolagemDano: (id) => {
    if (get().pedido?.id !== id || get().emExecucaoId === id) return false;
    set({ emExecucaoId: id });
    return true;
  },
  limparPedidoRolagemDano: (id) => {
    if (id !== undefined && get().pedido?.id !== id) return;
    set({ pedido: null, emExecucaoId: null });
  },
}));
