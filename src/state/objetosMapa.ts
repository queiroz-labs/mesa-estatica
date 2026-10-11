import type { MapaBiblioteca, ObjetoMapa } from './types';

export const MAX_OBJETOS_MAPA = 40;
const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function urlImagemObjetoValida(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 1_500_000) return false;
  if (/^data:image\/(png|webp|jpeg);base64,[a-z\d+/=]+$/i.test(url)) return true;
  try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
export function objetoMapaValido(d: unknown): d is ObjetoMapa {
  if (!d || typeof d !== 'object') return false;
  const o = d as ObjetoMapa;
  return typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 100 && typeof o.nome === 'string' && o.nome.length <= 80
    && urlImagemObjetoValida(o.imagemUrl) && typeof o.imagemPath === 'string' && o.imagemPath.length <= 500
    && [o.x, o.y, o.largura, o.altura].every(numero) && o.x >= 0 && o.y >= 0 && o.largura >= .01 && o.altura >= .01
    && o.x + o.largura <= 1.000001 && o.y + o.altura <= 1.000001 && typeof o.visivel === 'boolean';
}
export function normalizarObjetosMapa(d: unknown): ObjetoMapa[] {
  if (!Array.isArray(d)) return [];
  const ids = new Set<string>();
  return d.filter((o): o is ObjetoMapa => {
    if (!objetoMapaValido(o) || ids.has(o.id) || ids.size >= MAX_OBJETOS_MAPA) return false;
    ids.add(o.id); return true;
  }).map(o => ({ id: o.id, nome: o.nome, imagemUrl: o.imagemUrl, imagemPath: o.imagemPath, x: o.x, y: o.y, largura: o.largura, altura: o.altura, visivel: o.visivel }));
}
/** Metadados antigos e ecos fora de ordem nunca substituem os objetos mais novos. */
export function mesclarObjetosMapa(local: MapaBiblioteca, remoto: MapaBiblioteca): MapaBiblioteca {
  if (local.objetosPendentes || (local.objetosRevisao ?? 0) > (remoto.objetosRevisao ?? 0)) {
    return { ...remoto, objetos: local.objetos, objetosRevisao: local.objetosRevisao, objetosPendentes: local.objetosPendentes };
  }
  return remoto;
}
