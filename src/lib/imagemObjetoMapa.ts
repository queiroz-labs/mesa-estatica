import { supabase } from './supabaseClient';

const MAX_ENTRADA = 5 * 1024 * 1024;
const MAX_SAIDA = 1024 * 1024;
const texto = (b: Uint8Array, a: number, n: number) => String.fromCharCode(...b.slice(a, a + n));
/** Inspeciona dimensões ANTES do decode; SVG/GIF/animações não entram neste fluxo. */
export function inspecionarImagemObjeto(bytes: Uint8Array, mime: string): { largura: number; altura: number } {
  if (bytes.length > MAX_ENTRADA || bytes.length < 24) throw new Error('use PNG, JPEG ou WebP estático de até 5 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let largura = 0, altura = 0;
  if (mime === 'image/png' && texto(bytes, 1, 3) === 'PNG' && bytes[0] === 137 && texto(bytes, 12, 4) === 'IHDR') {
    largura = view.getUint32(16); altura = view.getUint32(20);
    for (let p = 8; p + 12 <= bytes.length;) { const tamanho = view.getUint32(p); if (texto(bytes, p + 4, 4) === 'acTL') throw new Error('use uma imagem estática.'); p += tamanho + 12; }
  } else if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p++] !== 255) break;
      while (bytes[p] === 255) p++;
      const marcador = bytes[p++];
      if (marcador === 217 || marcador === 218) break;
      const n = view.getUint16(p);
      if (n < 2 || p + n > bytes.length) break;
      if ([192, 193, 194].includes(marcador) && n >= 7) { altura = view.getUint16(p + 3); largura = view.getUint16(p + 5); break; }
      p += n;
    }
  } else if (mime === 'image/webp' && texto(bytes, 0, 4) === 'RIFF' && texto(bytes, 8, 4) === 'WEBP') {
    const formato = texto(bytes, 12, 4);
    if (formato === 'VP8X' && bytes.length >= 30) {
      if (bytes[20] & 2) throw new Error('use uma imagem estática.');
      largura = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      altura = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (formato === 'VP8L' && bytes.length >= 25 && bytes[20] === 47) {
      largura = 1 + (((bytes[22] & 63) << 8) | bytes[21]);
      altura = 1 + (((bytes[24] & 15) << 10) | (bytes[23] << 2) | ((bytes[22] & 192) >> 6));
    } else if (formato === 'VP8 ' && bytes.length >= 30 && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      largura = view.getUint16(26, true) & 16383; altura = view.getUint16(28, true) & 16383;
    }
  }
  if (!largura || !altura) throw new Error('o conteúdo não corresponde a PNG, JPEG ou WebP válido.');
  if (largura > 8192 || altura > 8192 || largura * altura > 16_000_000) throw new Error('a imagem deve ter até 16 megapixels e 8192 px por lado.');
  if (Math.max(largura / altura, altura / largura) > 20) throw new Error('use uma imagem com proporção menos alongada (até 20:1).');
  return { largura, altura };
}

export async function prepararImagemObjeto(arquivo: File, signal: AbortSignal) {
  if (arquivo.size > MAX_ENTRADA) throw new Error('a imagem deve ter até 5 MiB.');
  inspecionarImagemObjeto(new Uint8Array(await arquivo.arrayBuffer()), arquivo.type);
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(arquivo);
  try {
    signal.throwIfAborted();
    if (bitmap.width * bitmap.height > 16_000_000 || bitmap.width > 8192 || bitmap.height > 8192) throw new Error('dimensões de imagem inválidas.');
    const escala = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * escala)); canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('não foi possível preparar a imagem.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('não foi possível preparar a imagem.')), arquivo.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', .9));
    signal.throwIfAborted();
    if (blob.size > MAX_SAIDA) throw new Error('a imagem preparada ultrapassa 1 MiB; use uma imagem mais simples.');
    return { blob, largura: canvas.width, altura: canvas.height };
  } finally { bitmap.close(); }
}

export async function enviarImagemObjeto(mapaId: string, blob: Blob, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!supabase) {
    const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('não foi possível ler a imagem.')); r.readAsDataURL(blob); });
    signal.throwIfAborted(); return { url, path: '' };
  }
  const extensao = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `img/objetos/${mapaId}/${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage.from('midia').upload(path, blob, { contentType: blob.type, upsert: false });
  // O SDK não cancela esta transferência; cancelar impede qualquer referência ao resultado.
  signal.throwIfAborted();
  if (error) throw new Error('não foi possível enviar a imagem. tente novamente; nenhum objeto foi adicionado.');
  return { url: supabase.storage.from('midia').getPublicUrl(path).data.publicUrl, path };
}
