import { calcularPosicaoMidia, precisaResincronizar } from '../multiplayer/posicaoMidia';
import type { EstadoMidia } from '../state/types';

/** Seek antes dos metadados pode ser descartado pelo navegador ou lançar erro.
 *  O player reaplica esta função em loadedmetadata usando o estado mais recente. */
export function posicionarMidia(audio: HTMLAudioElement, estado: EstadoMidia, preciso = false): void {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const esperado = calcularPosicaoMidia(estado, audio.duration);
  if (preciso ? Math.abs(audio.currentTime - esperado) > 0.05 : precisaResincronizar(audio.currentTime, esperado)) {
    audio.currentTime = esperado;
  }
}
