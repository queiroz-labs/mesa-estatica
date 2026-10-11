import { calcularPosicaoEsperada } from '../multiplayer/posicaoMidia';
import type { EstadoAmbiencia } from '../state/types';

/** Posição de entrada/seek; as voltas seguintes usam o relógio local do player. */
export function posicionarAmbiencia(audio: Pick<HTMLAudioElement, 'duration' | 'currentTime'>, estado: Pick<EstadoAmbiencia, 'tocando' | 'posicaoSegundos' | 'atualizadoEm'>): void {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const posicao = calcularPosicaoEsperada(estado) % audio.duration;
  if (Math.abs(audio.currentTime - posicao) > 0.05) audio.currentTime = posicao;
}
