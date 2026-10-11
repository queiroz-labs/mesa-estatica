import type { ObjetoMapa } from '../../state/types';
export interface RetanguloObjetos { offsetX: number; offsetY: number; renderW: number; renderH: number }
export const estiloObjeto = (o: ObjetoMapa, r: RetanguloObjetos) => ({ left: r.offsetX + o.x * r.renderW, top: r.offsetY + o.y * r.renderH, width: o.largura * r.renderW, height: o.altura * r.renderH });

/** Olho e excluir acima da imagem, inclusive quando ela é pequena. */
export function posicaoAcoesObjeto(imagem: { left: number; top: number; width: number; height: number }, viewport: { width: number; height: number }) {
  const largura = 52, altura = 24, margem = 4;
  const x = Math.max(margem, Math.min(imagem.left + imagem.width - largura, viewport.width - largura - margem));
  const y = Math.max(margem, Math.min(imagem.top, viewport.height - altura - margem));
  const candidatos = [
    { left: x, top: imagem.top - altura - margem },
    { left: x, top: imagem.top + imagem.height + margem },
    { left: imagem.left + imagem.width + margem, top: y },
    { left: imagem.left - largura - margem, top: y },
  ];
  return candidatos.find(p => p.left >= margem && p.top >= margem && p.left + largura <= viewport.width - margem && p.top + altura <= viewport.height - margem) ?? candidatos[0];
}

/** A alça permanece abaixo, alinhada à direita; não migra para a barra superior. */
export function posicaoAlcaObjeto(imagem: { left: number; top: number; width: number; height: number }, viewport: { width: number }) {
  return { left: Math.max(4, Math.min(imagem.left + imagem.width - 24, viewport.width - 28)), top: imagem.top + imagem.height + 4 };
}
