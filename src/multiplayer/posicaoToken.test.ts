import { expect, it } from 'vitest';
import { lerPosicaoTokenConfirmada, posicaoTokenEstaAtrasada } from './posicaoToken';

const payload = { id: 'pc-1', x: 0.3, y: 0.7, versao_posicao: 2 };
it('lê só coordenadas e versão confirmada do token do tópico', () => {
  expect(lerPosicaoTokenConfirmada({ ...payload, participante_id: 'não confiável' }, 'pc-1'))
    .toEqual({ id: 'pc-1', x: 0.3, y: 0.7, versaoPosicao: 2 });
  expect(lerPosicaoTokenConfirmada(payload, 'outro-token')).toBeNull();
});
it.each([null, 'texto', [], { ...payload, x: NaN }, { ...payload, y: Infinity },
  { ...payload, x: -0.1 }, { ...payload, y: 1.1 }, { ...payload, versao_posicao: 0 },
  { ...payload, versao_posicao: -1 }, { ...payload, versao_posicao: 1.5 },
  { ...payload, versao_posicao: '2' }, { ...payload, versao_posicao: Number.MAX_SAFE_INTEGER + 1 }])(
  'ignora payload inválido %j', (invalido) => {
    expect(lerPosicaoTokenConfirmada(invalido, 'pc-1')).toBeNull();
  },
);
it('versão antiga (incluindo 0) não vence confirmação nova; backend legado segue funcionando', () => {
  expect(posicaoTokenEstaAtrasada({ versaoPosicao: 1 }, 2)).toBe(true);
  expect(posicaoTokenEstaAtrasada({ versaoPosicao: 0 }, 2)).toBe(true);
  expect(posicaoTokenEstaAtrasada({ versaoPosicao: 2 }, 2)).toBe(false);
  expect(posicaoTokenEstaAtrasada({ versaoPosicao: 3 }, 2)).toBe(false);
  expect(posicaoTokenEstaAtrasada({}, 0)).toBe(false);
  expect(posicaoTokenEstaAtrasada({}, 2)).toBe(false);
});
