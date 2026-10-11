import { expect, it } from 'vitest';
import { inspecionarImagemObjeto } from './imagemObjetoMapa';
const png = (w: number, h: number) => {
  const b = new Uint8Array(33); b.set([137,80,78,71,13,10,26,10]); const d = new DataView(b.buffer);
  d.setUint32(8,13); b.set([73,72,68,82],12); d.setUint32(16,w); d.setUint32(20,h); return b;
};
it('lê dimensões do cabeçalho PNG antes de decodificar', () => expect(inspecionarImagemObjeto(png(256,128),'image/png')).toEqual({ largura:256, altura:128 }));
it('recusa MIME falso, conteúdo inválido, SVG e dimensões/arquivo excessivos', () => {
  for (const [b,mime] of [[png(256,128),'image/jpeg'],[png(256,128),'image/svg+xml'],[png(9000,100),'image/png'],[png(5000,5000),'image/png'],[new Uint8Array(6*1024*1024),'image/png']] as const)
    expect(() => inspecionarImagemObjeto(b,mime)).toThrow();
});
it('recusa PNG animado e proporção extrema', () => {
  const b=new Uint8Array(45);b.set(png(128,128)); b.set([97,99,84,76],37);
  expect(() => inspecionarImagemObjeto(b,'image/png')).toThrow('estática');
  expect(() => inspecionarImagemObjeto(png(2000,10),'image/png')).toThrow('alongada');
});
