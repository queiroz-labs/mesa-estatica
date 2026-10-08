import { create } from 'zustand';

const CHAVE = 'estatica-audio-habilitado';
function lerPreferencia(): boolean {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}

export const useAudioJogadorStore = create<{ habilitado: boolean; definirHabilitado: (valor: boolean) => void }>((set) => ({
  habilitado: lerPreferencia(),
  definirHabilitado: (habilitado) => {
    set({ habilitado });
    try {
      if (habilitado) localStorage.setItem(CHAVE, '1');
      else localStorage.removeItem(CHAVE);
    } catch { /* Preferência só nesta carga quando o storage não está disponível. */ }
  },
}));

const retomadas = new Set<() => void>();
export function registrarRetomadaAudio(retomar: () => void): () => void {
  retomadas.add(retomar);
  return () => { retomadas.delete(retomar); };
}

/** Chamada dentro do clique: todos os canais recebem o MESMO gesto de desbloqueio. */
export function habilitarAudioJogador(): void {
  useAudioJogadorStore.getState().definirHabilitado(true);
  for (const retomar of retomadas) retomar();
}
