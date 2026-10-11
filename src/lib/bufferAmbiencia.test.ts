import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let contextos: { decodeAudioData: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[];
let adquirir: typeof import('./bufferAmbiencia').adquirirBufferAmbiencia;
const buffer = { duration: 1, length: 48000, numberOfChannels: 2 } as AudioBuffer;
beforeEach(async () => {
  vi.resetModules(); contextos = [];
  vi.stubGlobal('AudioContext', class {
    decodeAudioData = vi.fn(async () => buffer);
    close = vi.fn(async () => {});
    constructor() { contextos.push(this); }
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
  adquirir = (await import('./bufferAmbiencia')).adquirirBufferAmbiencia;
});
afterEach(() => { vi.unstubAllGlobals(); });

it('compartilha download/decodificação por URL e fecha contexto apenas após última referência', async () => {
  const a = adquirir('chuva.wav', 1)!, b = adquirir('chuva.wav', 1)!;
  expect(await a.promessa).toBe(await b.promessa);
  expect(fetch).toHaveBeenCalledOnce(); expect(contextos).toHaveLength(1);
  expect(contextos[0].decodeAudioData).toHaveBeenCalledOnce();
  a.liberar(); a.liberar(); expect(contextos[0].close).not.toHaveBeenCalled();
  b.liberar(); expect(contextos[0].close).toHaveBeenCalledOnce();
});

it('recusa duração/buffer individual grande e orçamento total reservado, sem iniciar transferências extras', async () => {
  expect(adquirir('longa', 181)).toBeNull(); expect(adquirir('grande', 180)).toBeNull();
  expect(adquirir('indefinida', Infinity)).toBeNull();
  const a = adquirir('a', 170)!, b = adquirir('b', 170)!;
  expect(adquirir('c', 170)).toBeNull();
  await Promise.all([a.promessa, b.promessa]); expect(fetch).toHaveBeenCalledTimes(2);
  a.liberar(); b.liberar();
});

it('cancelamento antes da fila impede download e libera reserva/contexto', async () => {
  const a = adquirir('cancelada', 10)!; a.liberar();
  await expect(a.promessa).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).not.toHaveBeenCalled(); expect(contextos[0].close).toHaveBeenCalledOnce();
  const b = adquirir('nova', 170)!; await b.promessa; b.liberar();
});

it('falha de CORS/download permite liberação sem reter cache', async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const a = adquirir('cors', 1)!; await expect(a.promessa).rejects.toThrow('Failed to fetch'); a.liberar();
  const b = adquirir('cors', 1)!; await expect(b.promessa).resolves.toBe(buffer); b.liberar();
  expect(fetch).toHaveBeenCalledTimes(2); expect(contextos).toHaveLength(2);
});

it('recusa download acima do limite e buffer decodificado acima do limite', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { 'content-length': String(17 * 1024 * 1024) } }));
  const a = adquirir('arquivo-grande', 1)!; await expect(a.promessa).rejects.toThrow('arquivo grande'); a.liberar();
  const b = adquirir('pcm-grande', 1)!;
  contextos[1].decodeAudioData.mockResolvedValueOnce({ ...buffer, length: 20 * 1024 * 1024 });
  await expect(b.promessa).rejects.toThrow('buffer grande'); b.liberar();
});

it('serializa decodificação e descarta resultado tardio de uma camada removida', async () => {
  let resolver!: (b: AudioBuffer) => void;
  const a = adquirir('a', 1)!;
  contextos[0].decodeAudioData.mockImplementationOnce(() => new Promise<AudioBuffer>(resolve => { resolver = resolve; }));
  const b = adquirir('b', 1)!;
  await vi.waitFor(() => expect(resolver).toBeTypeOf('function'));
  expect(fetch).toHaveBeenCalledOnce(); a.liberar(); resolver(buffer);
  await expect(a.promessa).rejects.toMatchObject({ name: 'AbortError' });
  await expect(b.promessa).resolves.toBe(buffer); expect(fetch).toHaveBeenCalledTimes(2); b.liberar();
});

it('timeout de download libera a fila e ausência de Web Audio não cria contexto', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')));
  }));
  const a = adquirir('sem-resposta', 1)!;
  const rejeicao = expect(a.promessa).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(20001); await rejeicao; a.liberar(); vi.useRealTimers();
  vi.stubGlobal('AudioContext', undefined); expect(adquirir('sem-api', 1)).toBeNull();
});
