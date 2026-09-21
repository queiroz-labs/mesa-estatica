/**
 * Rampa `audio.volume` até `alvo` em `duracaoMs`, via `requestAnimationFrame`. `tokenRef` é um
 * contador simples: cada chamada incrementa e guarda "seu" valor, e o passo seguinte só
 * continua se ainda for o dono do token — assim uma rampa nova invalida qualquer rampa anterior
 * ainda em voo sem precisar de `cancelAnimationFrame` espalhado pelos call sites (usado tanto
 * pra fade de troca de faixa quanto pro "duck" do soundpad, no mesmo `<audio>`/mesmo token).
 */
export function fadeVolume(
  audio: HTMLAudioElement,
  alvo: number,
  duracaoMs: number,
  tokenRef: { current: number },
  aoTerminar?: () => void,
): void {
  const alvoClamped = Math.min(1, Math.max(0, alvo));

  if (duracaoMs <= 0) {
    tokenRef.current += 1;
    audio.volume = alvoClamped;
    aoTerminar?.();
    return;
  }

  const meuToken = ++tokenRef.current;
  const inicio = performance.now();
  const de = audio.volume;
  let terminou = false;
  // Abas em segundo plano podem suspender rAF enquanto o áudio continua tocando.
  // A conclusão (incluindo pause()) não pode depender de um próximo frame visual.
  const finalizar = () => {
    if (terminou) return;
    terminou = true;
    clearTimeout(limite);
    if (tokenRef.current !== meuToken) return;
    audio.volume = alvoClamped;
    aoTerminar?.();
  };
  const limite = setTimeout(finalizar, duracaoMs);

  const passo = (agora: number) => {
    if (terminou) return;
    if (tokenRef.current !== meuToken) { finalizar(); return; }
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    audio.volume = de + (alvoClamped - de) * t;
    if (t < 1) requestAnimationFrame(passo);
    else finalizar();
  };
  requestAnimationFrame(passo);
}
