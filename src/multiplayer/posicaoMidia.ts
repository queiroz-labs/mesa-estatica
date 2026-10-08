import type { EstadoMidia } from '../state/types';

/** Segundos de desvio tolerados antes de re-sincronizar o `<audio>` local — evita
 *  microssaltos audíveis a cada eco do Realtime enquanto a faixa toca normalmente. */
export const LIMIAR_DRIFT_SEGUNDOS = 1.5;

/** Posição esperada agora, projetando o tempo decorrido desde o último push do GM
 *  (`atualizadoEm`) quando a faixa está tocando. Parada, a posição não avança sozinha. */
export function calcularPosicaoEsperada(
  estado: Pick<EstadoMidia, 'tocando' | 'posicaoSegundos' | 'atualizadoEm'>,
  agora: number = Date.now(),
): number {
  const posicao = Number.isFinite(estado.posicaoSegundos) ? Math.max(0, estado.posicaoSegundos) : 0;
  if (!estado.tocando) return posicao;
  const atualizado = Date.parse(estado.atualizadoEm);
  const decorridoMs = Number.isFinite(atualizado) ? Math.max(0, agora - atualizado) : 0;
  return posicao + decorridoMs / 1000;
}

/** Ao entrar novamente na mesa, o timestamp pode ter várias voltas (ou dias).
 *  O transporte e o áudio precisam usar um ponto que exista dentro da faixa. */
export function calcularPosicaoMidia(
  estado: Pick<EstadoMidia, 'tocando' | 'posicaoSegundos' | 'atualizadoEm' | 'modoLoop'>,
  duracao: number,
  agora: number = Date.now(),
): number {
  const posicao = calcularPosicaoEsperada(estado, agora);
  if (!Number.isFinite(duracao) || duracao <= 0) return Number.isFinite(estado.posicaoSegundos) ? Math.max(0, estado.posicaoSegundos) : 0;
  return estado.tocando && estado.modoLoop === 'faixa' ? posicao % duracao : Math.min(posicao, duracao);
}

export function precisaResincronizar(atualSegundos: number, esperadoSegundos: number): boolean {
  return Math.abs(atualSegundos - esperadoSegundos) > LIMIAR_DRIFT_SEGUNDOS;
}
