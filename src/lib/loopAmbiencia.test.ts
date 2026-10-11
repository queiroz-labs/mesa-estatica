import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LoopAmbiencia } from './loopAmbiencia';
const mock = vi.hoisted(() => ({ adquirir: vi.fn() }));
vi.mock('./bufferAmbiencia', () => ({ adquirirBufferAmbiencia: (...args: unknown[]) => mock.adquirir(...args) }));

function ambiente() {
  const listeners = new Map<string, Set<EventListener>>();
  const audio = { src: '', get currentSrc() { return audio.src; }, readyState: 4, duration: 10, currentTime: 0, volume: .3, muted: false, paused: true, dataset: {} as Record<string, string>,
    play: vi.fn(async () => { audio.paused = false; }), pause: vi.fn(() => { audio.paused = true; }), load: vi.fn(),
    getAttribute: () => audio.src || null, removeAttribute: () => { audio.src = ''; },
    addEventListener: (name: string, fn: EventListener) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    removeEventListener: (name: string, fn: EventListener) => { listeners.get(name)?.delete(fn); },
  };
  const fontes: { loop: boolean; buffer: AudioBuffer | null; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const ganho = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const ctx = { state: 'running', currentTime: 0, destination: {}, resume: vi.fn(async () => {}), createGain: vi.fn(() => ganho),
    createBufferSource: vi.fn(() => { const fonte = { loop: false, buffer: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }; fontes.push(fonte); return fonte; }),
  };
  const lease = { contexto: ctx, promessa: Promise.resolve({ duration: 10 } as AudioBuffer), liberar: vi.fn() };
  mock.adquirir.mockReturnValue(lease);
  const tempo = vi.fn(), fallback = vi.fn();
  const player = new LoopAmbiencia(audio as unknown as HTMLAudioElement, tempo, fallback);
  const carregar = () => { for (const fn of listeners.get('loadedmetadata') ?? []) fn(new Event('loadedmetadata')); };
  return { player, audio, ctx, ganho, fontes, lease, carregar, listeners, tempo, fallback };
}
beforeEach(() => { vi.useFakeTimers(); mock.adquirir.mockReset(); });
afterEach(() => { vi.useRealTimers(); });
const flush = () => vi.advanceTimersByTimeAsync(0);

it('troca para uma fonte em loop e repete sem criar fontes, seeks ou loads por volta', async () => {
  const h = ambiente(); h.player.src = 'chuva'; await h.player.play(); h.carregar(); await flush();
  expect(h.audio.paused).toBe(true); expect(h.player.paused).toBe(false); expect(h.fontes[0].loop).toBe(true);
  h.ctx.currentTime = 35; expect(h.player.currentTime).toBe(5);
  await vi.advanceTimersByTimeAsync(1000); expect(h.tempo).toHaveBeenLastCalledWith(10, 5);
  expect(h.fontes).toHaveLength(1); expect(h.audio.load).not.toHaveBeenCalled(); h.player.dispose();
});

it('volume e mute alteram só ganho; pausa/retomada e seek conservam offset', async () => {
  const h = ambiente(); h.player.src = 'chuva'; await h.player.play(); h.carregar(); await flush();
  h.ctx.currentTime = 3; h.player.volume = .15; expect(h.ganho.gain.value).toBe(.15);
  h.player.muted = true; expect(h.ganho.gain.value).toBe(0); h.player.muted = false;
  expect(h.fontes).toHaveLength(1); h.player.pause(); expect(h.player.currentTime).toBe(3); expect(h.player.paused).toBe(true);
  h.ctx.currentTime = 15; await h.player.play(); expect(h.fontes[1].start).toHaveBeenCalledWith(0, 3);
  h.player.currentTime = 7; expect(h.fontes[2].start).toHaveBeenCalledWith(0, 7); h.player.dispose();
});

it('pausa enquanto prepara não volta a tocar quando decode termina', async () => {
  const h = ambiente(); let resolver!: (buffer: AudioBuffer) => void;
  h.lease.promessa = new Promise(resolve => { resolver = resolve; });
  h.player.src = 'chuva'; await h.player.play(); h.carregar(); h.player.pause();
  resolver({ duration: 10 } as AudioBuffer); await flush();
  expect(h.fontes).toHaveLength(0); expect(h.player.paused).toBe(true); h.player.dispose();
});

it('descarte remove fonte, ganho, timer, listener e referência; resultado tardio é ignorado', async () => {
  const h = ambiente(); h.player.src = 'chuva'; await h.player.play(); h.carregar(); await flush();
  h.player.pause(); h.player.removeAttribute('src'); h.player.load(); h.player.dispose();
  expect(h.fontes[0].stop).toHaveBeenCalledOnce(); expect(h.fontes[0].disconnect).toHaveBeenCalledOnce();
  expect(h.ganho.disconnect).toHaveBeenCalledOnce(); expect(h.lease.liberar).toHaveBeenCalledOnce();
  expect(h.listeners.get('loadedmetadata')?.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  const outro = ambiente(); let resolver!: (buffer: AudioBuffer) => void;
  outro.lease.promessa = new Promise(resolve => { resolver = resolve; }); outro.player.src = 'vento'; await outro.player.play(); outro.carregar(); outro.player.dispose();
  resolver({ duration: 10 } as AudioBuffer); await flush(); expect(outro.fontes).toHaveLength(0); expect(outro.ctx.createGain).not.toHaveBeenCalled();
});

it('falha CORS/decode e limite conservam reprodução nativa e informam fallback', async () => {
  const h = ambiente(); h.lease.promessa = Promise.reject(new TypeError('CORS'));
  h.player.src = 'chuva'; await h.player.play(); h.carregar(); await flush();
  expect(h.audio.paused).toBe(false); expect(h.fallback).toHaveBeenCalledOnce(); expect(h.lease.liberar).toHaveBeenCalledOnce(); h.player.dispose();
  const outro = ambiente(); mock.adquirir.mockReturnValue(null); outro.player.src = 'longa'; await outro.player.play(); outro.carregar();
  expect(outro.audio.paused).toBe(false); expect(outro.fallback).toHaveBeenCalledOnce(); outro.player.dispose();
});

it('não contorna bloqueio de autoplay nem toca buffer antes do gesto', async () => {
  const h = ambiente(); h.audio.play.mockRejectedValueOnce(new DOMException('gesto necessário', 'NotAllowedError'));
  h.player.src = 'chuva'; h.carregar(); await expect(h.player.play()).rejects.toMatchObject({ name: 'NotAllowedError' }); await flush();
  expect(h.fontes).toHaveLength(0); await h.player.play(); await flush(); expect(h.fontes).toHaveLength(1); h.player.dispose();
});

it('contexto suspenso mantém relógio nativo; resume tardio não ressuscita camada removida', async () => {
  const h = ambiente(); let resolver!: () => void; h.ctx.state = 'suspended'; h.ctx.resume.mockImplementation(() => new Promise<void>(resolve => { resolver = resolve; }));
  h.player.src = 'chuva'; await h.player.play(); h.carregar(); await flush(); h.audio.currentTime = 4;
  expect(h.player.currentTime).toBe(4); expect(h.audio.paused).toBe(false);
  h.player.pause(); h.player.dispose(); h.ctx.state = 'running'; resolver(); await flush(); expect(h.fontes).toHaveLength(0);
});

it('falha tardia ao retomar contexto antigo não informa fallback da faixa nova', async () => {
  const h = ambiente(); const rejeitar: ((erro: Error) => void)[] = [];
  h.ctx.resume.mockImplementation(() => new Promise<void>((_resolve, reject) => { rejeitar.push(reject); }));
  h.player.src = 'chuva'; await h.player.play(); await flush();
  h.player.pause(); h.player.src = 'vento';
  for (const reject of rejeitar) reject(new Error('contexto fechado'));
  await flush(); expect(h.fallback).not.toHaveBeenCalled(); h.player.dispose();
});
