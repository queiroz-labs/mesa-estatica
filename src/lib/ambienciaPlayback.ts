import { calcularPosicaoEsperada } from '../multiplayer/posicaoMidia';
import type { EstadoAmbiencia } from '../state/types';

/** Loop nativo em todos os clientes, inclusive com mestre offline ou abas em segundo plano. */
export function posicionarAmbiencia(audio: HTMLAudioElement, estado: Pick<EstadoAmbiencia, 'tocando' | 'posicaoSegundos' | 'atualizadoEm'>): void {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const posicao = calcularPosicaoEsperada(estado) % audio.duration;
  if (Math.abs(audio.currentTime - posicao) > 0.05) audio.currentTime = posicao;
}
