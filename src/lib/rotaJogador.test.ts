import { describe, expect, it } from 'vitest';
import { ehRotaJogador } from './rotaJogador';

describe('ehRotaJogador', () => {
  it.each([
    '/jogador', '/jogador/', '/jogador.html', '/jogador.html/',
    '/mesa-estatica/jogador', '/mesa-estatica/jogador/',
    '/mesa-estatica/jogador.html', '/mesa-estatica/jogador.html/',
  ])('reconhece a entrada do jogador em %s', (pathname) => {
    expect(ehRotaJogador(pathname)).toBe(true);
  });

  it.each([
    '/', '/index.html', '/mesa-estatica/', '/mesa-estatica/index.html',
    '/controle', '/jogador.html.bak', '/outro-jogador.html', '/jogador/config',
  ])('não confunde outra entrada com jogador em %s', (pathname) => {
    expect(ehRotaJogador(pathname)).toBe(false);
  });
});
