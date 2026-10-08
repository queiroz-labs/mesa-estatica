/** Pages usa `/jogador`; Vite e links antigos usam `/jogador.html`.
 *  O isolamento local do jogador depende da rota, mesmo sem token válido. */
export function ehRotaJogador(pathname: string): boolean {
  return /(?:^|\/)jogador(?:\.html)?\/*$/.test(pathname);
}
