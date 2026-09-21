import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fadeVolume } from './audioFade';

/** `requestAnimationFrame` real depende do navegador estar visível/compositando frames — não
 *  dá pra testar a rampa de verdade sem isso. Aqui a gente controla o "relógio" manualmente:
 *  `avancar(ms)` dispara os callbacks pendentes com o timestamp já avançado, do jeito que o
 *  navegador faria a cada frame. */
describe('fadeVolume', () => {
  let callbacks: FrameRequestCallback[];
  let agora: number;

  beforeEach(() => {
    vi.useFakeTimers();
    callbacks = [];
    agora = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.spyOn(performance, 'now').mockImplementation(() => agora);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const avancar = (ms: number) => {
    agora += ms;
    const pendentes = callbacks;
    callbacks = [];
    for (const cb of pendentes) cb(agora);
  };

  const audioFalso = (volumeInicial: number) => ({ volume: volumeInicial }) as HTMLAudioElement;

  it('conclui a pausa mesmo sem frames e não repete o callback quando os frames voltam', () => {
    const audio = audioFalso(0.8);
    const pausar = vi.fn();
    fadeVolume(audio, 0, 700, { current: 0 }, pausar);
    vi.advanceTimersByTime(700);
    expect(audio.volume).toBe(0);
    expect(pausar).toHaveBeenCalledOnce();
    avancar(1000);
    expect(pausar).toHaveBeenCalledOnce();
  });

  it('timer de uma pausa cancelada não interrompe um play posterior', () => {
    const audio = audioFalso(0.8);
    const token = { current: 0 };
    const pausar = vi.fn();
    fadeVolume(audio, 0, 700, token, pausar);
    fadeVolume(audio, 0.6, 300, token);
    vi.advanceTimersByTime(1000);
    expect(pausar).not.toHaveBeenCalled();
    expect(audio.volume).toBe(0.6);
  });

  it('duração <= 0 aplica o alvo na hora, sem esperar frame', () => {
    const audio = audioFalso(0.8);
    const tokenRef = { current: 0 };
    const aoTerminar = vi.fn();
    fadeVolume(audio, 0.2, 0, tokenRef, aoTerminar);
    expect(audio.volume).toBe(0.2);
    expect(aoTerminar).toHaveBeenCalledOnce();
  });

  it('rampa gradualmente até o alvo ao longo da duração', () => {
    const audio = audioFalso(0);
    const tokenRef = { current: 0 };
    fadeVolume(audio, 1, 1000, tokenRef);
    avancar(500);
    expect(audio.volume).toBeCloseTo(0.5, 5);
    avancar(500);
    expect(audio.volume).toBeCloseTo(1, 5);
  });

  it('chama aoTerminar só quando a rampa completa, não a cada frame', () => {
    const audio = audioFalso(0);
    const tokenRef = { current: 0 };
    const aoTerminar = vi.fn();
    fadeVolume(audio, 1, 200, tokenRef, aoTerminar);
    avancar(100);
    expect(aoTerminar).not.toHaveBeenCalled();
    avancar(100);
    expect(aoTerminar).toHaveBeenCalledOnce();
  });

  it('uma rampa nova invalida a anterior (token) — a antiga para de mexer no volume', () => {
    const audio = audioFalso(0);
    const tokenRef = { current: 0 };
    fadeVolume(audio, 1, 1000, tokenRef); // rampa A: 0 → 1
    avancar(500); // A chega em ~0.5
    fadeVolume(audio, 0, 1000, tokenRef); // rampa B começa do volume atual (~0.5) → 0
    avancar(1000); // se A ainda estivesse viva, teria empurrado o volume de volta pra perto de 1
    expect(audio.volume).toBeCloseTo(0, 5);
  });

  it('clampa o alvo em [0,1]', () => {
    const audio = audioFalso(0.5);
    const tokenRef = { current: 0 };
    fadeVolume(audio, 5, 0, tokenRef);
    expect(audio.volume).toBe(1);
    fadeVolume(audio, -3, 0, tokenRef);
    expect(audio.volume).toBe(0);
  });
});
