import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CacheBufferMusica, LIMITE_BUFFER_MUSICA } from './bufferMusica';
const buffer = { duration: 2, length: 96000, numberOfChannels: 1 } as AudioBuffer;
let contextos: { decodeAudioData: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[];
beforeEach(() => {
  contextos = [];
  vi.stubGlobal('AudioContext', class {
    decodeAudioData = vi.fn(async () => buffer); close = vi.fn(async () => {});
    constructor() { contextos.push(this); }
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('compartilha download/decode por URL, força resposta CORS nova e fecha contexto no descarte', async () => {
  const cache = new CacheBufferMusica();
  const a = cache.obter('a.wav', 2), b = cache.obter('a.wav', 2);
  expect(a).toBe(b); await a;
  expect(fetch).toHaveBeenCalledExactlyOnceWith('a.wav', expect.objectContaining({ cache: 'reload' }));
  expect(contextos[0].decodeAudioData).toHaveBeenCalledOnce();
  cache.dispose(); expect(contextos[0].close).toHaveBeenCalledOnce();
});
it('recusa faixas longas antes de baixar e arquivos comprimidos grandes antes de consumir corpo', async () => {
  const cache = new CacheBufferMusica();
  await expect(cache.obter('longa.wav', 10000)).rejects.toThrow('limite');
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { 'content-length': String(33 * 1024 * 1024) } }));
  await expect(cache.obter('grande.mp3', 10)).rejects.toThrow('grande');
  expect(contextos[0].decodeAudioData).not.toHaveBeenCalled(); cache.dispose();
});
it('aplica orçamento total e libera reserva ao descartar buffers antigos', async () => {
  const cache = new CacheBufferMusica(); const a = cache.obter('a', 340);
  contextos[0].decodeAudioData.mockResolvedValue({ ...buffer, length: LIMITE_BUFFER_MUSICA / 4 });
  await a; await cache.obter('b', 340);
  await expect(cache.obter('c', 2)).rejects.toThrow('limite');
  expect(fetch).toHaveBeenCalledTimes(2);
  cache.reter(new Set(['b'])); await cache.obter('d', 2);
  expect(fetch).toHaveBeenCalledTimes(3); cache.dispose();
});
it('cancelamento durante decode não retém orçamento nem revive o resultado', async () => {
  const cache = new CacheBufferMusica(); let concluir!: (b: AudioBuffer) => void;
  const a = cache.obter('a', 340);
  contextos[0].decodeAudioData.mockImplementationOnce(() => new Promise(resolve => { concluir = resolve; }));
  await vi.waitFor(() => expect(concluir).toBeTypeOf('function'));
  cache.reter(new Set()); concluir(buffer);
  await expect(a).rejects.toMatchObject({ name: 'AbortError' });
  await expect(cache.obter('b', 340)).resolves.toBe(buffer); cache.dispose();
});
it('fila serial e timeout impedem downloads pendurados de bloquear próximas faixas', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))));
  const cache = new CacheBufferMusica(); const a = cache.obter('a', 2);
  const falha = expect(a).rejects.toMatchObject({ name: 'AbortError' }); const b = cache.obter('b', 2);
  await vi.advanceTimersByTimeAsync(30001); await falha;
  await expect(b).resolves.toBe(buffer); cache.dispose();
});
it('sem Web Audio rejeita preparo sem iniciar download', async () => {
  vi.stubGlobal('AudioContext', undefined); const cache = new CacheBufferMusica();
  await expect(cache.obter('a', 2)).rejects.toThrow('Web Audio'); expect(fetch).not.toHaveBeenCalled(); cache.dispose();
});
