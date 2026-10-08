import { describe, expect, it, vi } from 'vitest';
import { criarEstadoAmbiencia } from '../state/factories';
import { posicionarAmbiencia } from './ambienciaPlayback';

describe('posição da ambiência em loop', () => {
  it('quem entra após várias voltas ou recarrega ouve o ponto atual dentro da faixa', () => {
    vi.spyOn(Date, 'now').mockReturnValue(25_000);
    const audio = { duration: 7, currentTime: 0 } as HTMLAudioElement;
    posicionarAmbiencia(audio, { ...criarEstadoAmbiencia(), tocando: true, atualizadoEm: new Date(0).toISOString(), posicaoSegundos: 1 });
    expect(audio.currentTime).toBe(5);
    vi.restoreAllMocks();
  });

  it('pausa não avança e metadata ausente não faz seek inválido', () => {
    const audio = { duration: NaN, currentTime: 2 };
    posicionarAmbiencia(audio as HTMLAudioElement, { ...criarEstadoAmbiencia(), posicaoSegundos: 5 });
    expect(audio.currentTime).toBe(2);
    audio.duration = 8;
    posicionarAmbiencia(audio as HTMLAudioElement, { ...criarEstadoAmbiencia(), posicaoSegundos: 5 });
    expect(audio.currentTime).toBe(5);
  });
});
