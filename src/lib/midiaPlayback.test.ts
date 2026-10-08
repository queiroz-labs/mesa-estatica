import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoMidia } from '../state/factories';
import { posicionarMidia } from './midiaPlayback';

afterEach(() => vi.restoreAllMocks());

describe('posição do elemento de música', () => {
  it('espera metadata e reaplica o estado atual após a duração carregar', () => {
    vi.spyOn(Date, 'now').mockReturnValue(25_000);
    const estado = { ...criarEstadoMidia(), tocando: true, atualizadoEm: new Date(0).toISOString(), modoLoop: 'faixa' as const };
    const audio = { currentTime: 0, duration: NaN };
    posicionarMidia(audio as HTMLAudioElement, estado);
    expect(audio.currentTime).toBe(0);
    audio.duration = 7;
    posicionarMidia(audio as HTMLAudioElement, estado);
    expect(audio.currentTime).toBe(4);
  });

  it('seek preciso do mestre e resync remoto usam tolerâncias diferentes', () => {
    const estado = { ...criarEstadoMidia(), posicaoSegundos: 10 };
    const audio = { currentTime: 9, duration: 60 } as HTMLAudioElement;
    posicionarMidia(audio, estado);
    expect(audio.currentTime).toBe(9);
    posicionarMidia(audio, estado, true);
    expect(audio.currentTime).toBe(10);
  });
});
