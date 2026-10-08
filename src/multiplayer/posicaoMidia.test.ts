import { describe, expect, it } from 'vitest';
import { calcularPosicaoEsperada, calcularPosicaoMidia, precisaResincronizar } from './posicaoMidia';

describe('calcularPosicaoEsperada', () => {
  it('parada: devolve a posição salva, sem projetar tempo', () => {
    const agora = Date.now();
    const estado = { tocando: false, posicaoSegundos: 42, atualizadoEm: new Date(agora - 10_000).toISOString() };
    expect(calcularPosicaoEsperada(estado, agora)).toBe(42);
  });

  it('tocando: soma o tempo decorrido desde atualizadoEm', () => {
    const agora = Date.now();
    const estado = { tocando: true, posicaoSegundos: 10, atualizadoEm: new Date(agora - 5_000).toISOString() };
    expect(calcularPosicaoEsperada(estado, agora)).toBeCloseTo(15, 1);
  });

  it('nunca projeta tempo negativo (relógio adiantado no cliente)', () => {
    const agora = Date.now();
    const estado = { tocando: true, posicaoSegundos: 10, atualizadoEm: new Date(agora + 5_000).toISOString() };
    expect(calcularPosicaoEsperada(estado, agora)).toBe(10);
  });

  it('um timestamp inválido não transforma o seek em NaN', () => {
    expect(calcularPosicaoEsperada({ tocando: true, posicaoSegundos: 10, atualizadoEm: 'inválido' })).toBe(10);
  });
});

describe('posição dentro da faixa de música', () => {
  const estado = { tocando: true, posicaoSegundos: 5, atualizadoEm: new Date(0).toISOString(), modoLoop: 'faixa' as const };

  it('reload depois de várias voltas recupera a posição do loop sem mostrar horas de duração', () => {
    expect(calcularPosicaoMidia(estado, 60, 3_725_000)).toBe(10);
  });

  it('sem loop individual limita a projeção à duração real', () => {
    expect(calcularPosicaoMidia({ ...estado, modoLoop: 'nenhum' }, 60, 3_725_000)).toBe(60);
    expect(calcularPosicaoMidia({ ...estado, modoLoop: 'lista' }, 60, 3_725_000)).toBe(60);
  });

  it('pausa conserva a posição sem avançar ou dar a volta', () => {
    expect(calcularPosicaoMidia({ ...estado, tocando: false, posicaoSegundos: 60 }, 60, 3_725_000)).toBe(60);
  });

  it('metadata ausente conserva o ponto salvo sem projetar dias de playback', () => {
    expect(calcularPosicaoMidia(estado, NaN, 3_725_000)).toBe(5);
    expect(calcularPosicaoMidia(estado, 0, 3_725_000)).toBe(5);
  });
});

describe('precisaResincronizar', () => {
  it('desvio dentro do limiar: não resincroniza', () => {
    expect(precisaResincronizar(10, 11)).toBe(false);
  });

  it('desvio acima do limiar: resincroniza', () => {
    expect(precisaResincronizar(10, 12)).toBe(true);
    expect(precisaResincronizar(12, 10)).toBe(true);
  });
});
