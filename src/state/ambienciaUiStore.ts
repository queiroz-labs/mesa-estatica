import { create } from 'zustand';

/** Tempo real do áudio local; não envia escritas por frame nem persiste a mesa. */
export const useAmbienciaUiStore = create<{
  duracaoSegundos: number;
  posicaoSegundos: number;
  atualizar: (duracaoSegundos: number, posicaoSegundos: number) => void;
}>((set) => ({
  duracaoSegundos: 0, posicaoSegundos: 0,
  atualizar: (duracao, posicao) => set({
    duracaoSegundos: Number.isFinite(duracao) ? duracao : 0,
    posicaoSegundos: Number.isFinite(posicao) ? posicao : 0,
  }),
}));
