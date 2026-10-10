import { create } from 'zustand';

/** Tempo real do áudio local; não envia escritas por frame nem persiste a mesa. */
export const useAmbienciaUiStore = create<{
  duracaoSegundos: number;
  posicaoSegundos: number;
  atualizar: (duracaoSegundos: number, posicaoSegundos: number) => void;
  camadas: Record<string, { duracaoSegundos: number; posicaoSegundos: number }>;
  atualizarCamada: (id: string, duracao: number, posicao: number) => void;
  removerCamada: (id: string) => void;
}>((set) => ({
  duracaoSegundos: 0, posicaoSegundos: 0,
  camadas: {},
  atualizarCamada: (id, duracao, posicao) => set((s) => ({ camadas: { ...s.camadas, [id]: {
    duracaoSegundos: Number.isFinite(duracao) ? duracao : 0,
    posicaoSegundos: Number.isFinite(posicao) ? posicao : 0,
  } } })),
  removerCamada: (id) => set((s) => {
    const camadas = { ...s.camadas };
    delete camadas[id];
    return { camadas };
  }),
  atualizar: (duracao, posicao) => set({
    duracaoSegundos: Number.isFinite(duracao) ? duracao : 0,
    posicaoSegundos: Number.isFinite(posicao) ? posicao : 0,
  }),
}));
