import type { TokenMapa } from '../state/types';

export interface PosicaoTokenConfirmada {
  id: string;
  x: number;
  y: number;
  versaoPosicao: number;
}

export function versaoPosicaoValida(versao: unknown): versao is number {
  return typeof versao === 'number' && Number.isSafeInteger(versao) && versao >= 0;
}

/** Payload mínimo do trigger 0042, vinculado ao token do tópico, nunca ao id alegado sozinho. */
export function lerPosicaoTokenConfirmada(payload: unknown, tokenId: string): PosicaoTokenConfirmada | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.id !== tokenId || !versaoPosicaoValida(p.versao_posicao) || p.versao_posicao === 0) return null;
  if (typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null;
  return { id: tokenId, x: p.x, y: p.y, versaoPosicao: p.versao_posicao };
}

/** Um backend sem 0042 continua recebendo o transporte antigo, sem exigir versão. */
export function posicaoTokenEstaAtrasada(token: Pick<TokenMapa, 'versaoPosicao'>, ultimaVersao: number): boolean {
  return token.versaoPosicao !== undefined && token.versaoPosicao < ultimaVersao;
}
