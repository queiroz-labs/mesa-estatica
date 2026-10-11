import { describe, expect, it } from 'vitest';
import { posicaoAcoesObjeto, posicaoAlcaObjeto } from './objetosMapaGeometria';

describe('controles externos de imagens', () => {
  it.each([
    { left: 30, top: 100, width: 8, height: 6 },
    { left: 4, top: 4, width: 8, height: 6 },
    { left: 378, top: 4, width: 8, height: 6 },
    { left: 4, top: 830, width: 8, height: 6 },
    { left: 378, top: 830, width: 8, height: 6 },
    { left: 4, top: 150, width: 382, height: 690 },
    { left: 4, top: 4, width: 180, height: 832 },
    { left: 206, top: 4, width: 180, height: 832 },
  ])('não cobre a imagem nem sai da tela: %j', imagem => {
    const p = posicaoAcoesObjeto(imagem, { width: 390, height: 844 });
    expect(p.left).toBeGreaterThanOrEqual(4);
    expect(p.top).toBeGreaterThanOrEqual(4);
    expect(p.left + 52).toBeLessThanOrEqual(386);
    expect(p.top + 24).toBeLessThanOrEqual(840);
    expect(p.left + 52 <= imagem.left || p.left >= imagem.left + imagem.width || p.top + 24 <= imagem.top || p.top >= imagem.top + imagem.height).toBe(true);
  });

  it.each([
    { left: 30, top: 100, width: 8, height: 6 },
    { left: 25, top: 180, width: 340, height: 632 },
    { left: 356, top: 806, width: 9, height: 6 },
  ])('mantém alça abaixo à direita, separada do olho/excluir: %j', imagem => {
    const p = posicaoAlcaObjeto(imagem, { width: 390 });
    const topo = posicaoAcoesObjeto(imagem, { width: 390, height: 844 });
    expect(p.top).toBe(imagem.top + imagem.height + 4);
    expect(p.left + 24).toBe(imagem.left + imagem.width);
    expect(p.top + 24).toBeLessThanOrEqual(840);
    expect(topo.top + 24).toBeLessThan(imagem.top);
  });
});
