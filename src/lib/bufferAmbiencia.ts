// Só a ambiência usa este cache. Buffers em uso são compartilhados por URL e liberados
// ao trocar/remover a última camada. Não decodifica música longa sem limite de memória.
export const LIMITE_BUFFER_AMBIENCIA = 64 * 1024 * 1024;
export const LIMITE_TOTAL_AMBIENCIA = 128 * 1024 * 1024;
export const LIMITE_ARQUIVO_AMBIENCIA = 16 * 1024 * 1024;
const LIMITE_DURACAO = 180;

interface Entrada {
  contexto: AudioContext;
  promessa: Promise<AudioBuffer>;
  abortar: AbortController;
  referencias: number;
  bytes: number;
}
export interface BufferAmbiencia {
  contexto: AudioContext;
  promessa: Promise<AudioBuffer>;
  liberar: () => void;
}

const entradas = new Map<string, Entrada>();
let contexto: AudioContext | null = null;
let bytesReservados = 0;
let fila: Promise<unknown> = Promise.resolve();

async function baixar(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const resposta = await fetch(url, { signal });
  if (!resposta.ok || !resposta.body) throw new Error('áudio indisponível para buffer');
  if (Number(resposta.headers.get('content-length')) > LIMITE_ARQUIVO_AMBIENCIA) {
    await resposta.body.cancel();
    throw new Error('arquivo grande');
  }
  const leitor = resposta.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_ARQUIVO_AMBIENCIA) { await leitor.cancel(); throw new Error('arquivo grande'); }
      partes.push(value);
    }
  } finally { leitor.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) { bytes.set(parte, offset); offset += parte.byteLength; }
  return bytes.buffer;
}

/** Limites protegem o desktop; sem CORS/Web Audio ou fora deles continua o player nativo. */
export function adquirirBufferAmbiencia(url: string, duracao: number): BufferAmbiencia | null {
  if (typeof AudioContext === 'undefined' || !Number.isFinite(duracao) || duracao <= 0 || duracao > LIMITE_DURACAO) return null;
  let entrada = entradas.get(url);
  if (!entrada) {
    const estimativa = Math.ceil(duracao * 48000 * 2 * 4);
    if (estimativa > LIMITE_BUFFER_AMBIENCIA || bytesReservados + estimativa > LIMITE_TOTAL_AMBIENCIA) return null;
    const ctx = contexto ??= new AudioContext({ sampleRate: 48000 });
    const abortar = new AbortController();
    entrada = { contexto: ctx, promessa: Promise.resolve(null as unknown as AudioBuffer), abortar, referencias: 0, bytes: estimativa };
    const atual = entrada;
    entradas.set(url, atual);
    bytesReservados += estimativa;
    // Uma transferência/decodificação por vez limita picos transitórios de memória.
    atual.promessa = fila.catch(() => {}).then(async () => {
      if (abortar.signal.aborted) throw new DOMException('cancelado', 'AbortError');
      const timeout = setTimeout(() => abortar.abort(), 20000);
      let dados: ArrayBuffer;
      try { dados = await baixar(url, abortar.signal); }
      finally { clearTimeout(timeout); }
      if (abortar.signal.aborted) throw new DOMException('cancelado', 'AbortError');
      const buffer = await ctx.decodeAudioData(dados);
      if (abortar.signal.aborted) throw new DOMException('cancelado', 'AbortError');
      const bytes = buffer.length * buffer.numberOfChannels * 4;
      if (bytes > LIMITE_BUFFER_AMBIENCIA || bytesReservados - atual.bytes + bytes > LIMITE_TOTAL_AMBIENCIA) throw new Error('buffer grande');
      bytesReservados += bytes - atual.bytes;
      atual.bytes = bytes;
      return buffer;
    });
    fila = atual.promessa.then(() => {}, () => {});
  }
  const atual = entrada;
  atual.referencias++;
  let liberado = false;
  return { contexto: atual.contexto, promessa: atual.promessa, liberar() {
    if (liberado) return;
    liberado = true;
    if (--atual.referencias > 0) return;
    atual.abortar.abort();
    entradas.delete(url);
    bytesReservados -= atual.bytes;
    if (entradas.size === 0 && contexto === atual.contexto) {
      contexto = null;
      void atual.contexto.close().catch(() => {});
    }
  } };
}
