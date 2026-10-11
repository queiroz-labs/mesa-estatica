import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoMidia } from '../state/factories';
import { TransporteMusica } from './transporteMusica';
const h = vi.hoisted(() => ({ ctx: null as any, obter: vi.fn(), reter: vi.fn(), dispose: vi.fn() }));
vi.mock('./bufferMusica', () => ({ CacheBufferMusica: class {
  get contexto() { return h.ctx; }
  obter = h.obter; reter = h.reter; dispose = h.dispose;
} }));
const faixas = ['a', 'b', 'c'].map((id, ordem) => ({ id, nome: id, url: `https://example.test/${id}.wav`, path: '', ordem, criadoEm: '' }));
const buffer = (duration = 2) => ({ duration } as AudioBuffer);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function ambiente(modo: 'faixa' | 'lista' | 'nenhum' = 'lista') {
  const fontes: any[] = [], listeners = new Map<string, Set<() => void>>();
  const ganho = { gain: { value: .5 }, connect: vi.fn(), disconnect: vi.fn() };
  h.ctx = { currentTime: 0, state: 'running', destination: {}, resume: vi.fn(async () => {}), createGain: () => ganho,
    createBufferSource: () => { const fonte = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as any, loop: false }; fontes.push(fonte); return fonte; } };
  const audio = { src: '', get currentSrc() { return this.src; }, readyState: 4, duration: 2, currentTime: 0, volume: .5, muted: false, paused: true, loop: false, dataset: {} as Record<string, string>,
    play: vi.fn(async () => { audio.paused = false; }), pause: vi.fn(() => { audio.paused = true; }), load: vi.fn(),
    getAttribute: () => audio.src || null, removeAttribute: () => { audio.src = ''; },
    addEventListener: (tipo: string, fn: () => void) => { if (!listeners.has(tipo)) listeners.set(tipo, new Set()); listeners.get(tipo)!.add(fn); },
    removeEventListener: (tipo: string, fn: () => void) => listeners.get(tipo)?.delete(fn),
  };
  const eventos = { avancou: vi.fn(), terminou: vi.fn(), fallback: vi.fn() };
  const motor = new TransporteMusica(audio as unknown as HTMLAudioElement, eventos);
  motor.configurar(faixas, modo); motor.selecionar('a'); motor.src = faixas[0].url;
  return { motor, audio, fontes, ganho, eventos, listeners };
}
beforeEach(() => { vi.clearAllMocks(); h.obter.mockImplementation(async () => buffer()); });
afterEach(() => vi.restoreAllMocks());

it('agenda próxima fonte no fim exato da atual antes de ended; avança sem play, seek ou fade', async () => {
  const a = ambiente(); await a.motor.play(); await flush();
  expect(a.fontes).toHaveLength(2);
  expect(a.fontes[0].start).toHaveBeenCalledWith(0, 0);
  expect(a.fontes[1].start).toHaveBeenCalledWith(2, 0);
  h.ctx.currentTime = 2.1; a.fontes[0].onended(); await flush();
  expect(a.motor.src).toBe(faixas[1].url); expect(a.motor.currentTime).toBeCloseTo(.1);
  expect(a.eventos.avancou).toHaveBeenCalledWith('b', expect.closeTo(.1), 2);
  expect(a.fontes[2].start).toHaveBeenCalledWith(4, 0);
  expect(a.audio.play).toHaveBeenCalledOnce(); expect(a.motor.volume).toBe(.5);
  expect(a.motor.consumirTransicao(faixas[1].url)).toBe(true);
  expect(a.motor.consumirTransicao(faixas[1].url)).toBe(false);
  a.motor.dispose();
});
it('loop de faixa usa uma fonte por várias voltas e nenhum ended para reiniciar', async () => {
  const a = ambiente('faixa'); await a.motor.play(); await flush();
  h.ctx.currentTime = 101;
  expect(a.motor.currentTime).toBe(1); expect(a.fontes).toHaveLength(1); expect(a.fontes[0].loop).toBe(true);
  expect(a.eventos.avancou).not.toHaveBeenCalled(); a.motor.dispose();
});
it('trocar loop de faixa por playlist preserva a posição dentro da volta atual', async () => {
  const a = ambiente('faixa'); await a.motor.play(); await flush();
  h.ctx.currentTime = 101.25;
  a.motor.configurar(faixas, 'lista'); await flush();
  expect(a.fontes[1].start).toHaveBeenCalledWith(101.25, 1.25);
  expect(a.fontes[2].start).toHaveBeenCalledWith(102, 0);
  expect(a.motor.currentTime).toBe(1.25); a.motor.dispose();
});
it('pausar cancela a próxima fonte, retomar preserva offset; volume/mudo não reagendam', async () => {
  const a = ambiente(); await a.motor.play(); await flush(); h.ctx.currentTime = .75;
  a.motor.volume = .2; a.motor.muted = true; expect(a.ganho.gain.value).toBe(0);
  a.motor.muted = false; expect(a.ganho.gain.value).toBe(.2); expect(a.fontes).toHaveLength(2);
  a.motor.pause(); expect(a.fontes.every(f => f.stop.mock.calls.length === 1)).toBe(true);
  h.ctx.currentTime = 10; await a.motor.play(); await flush();
  expect(a.fontes[2].start).toHaveBeenCalledWith(10, .75);
  expect(a.fontes[3].start).toHaveBeenCalledWith(11.25, 0); a.motor.dispose();
});
it('remover/reordenar a próxima faixa cancela a fonte antiga e agenda a nova', async () => {
  const a = ambiente(); await a.motor.play(); await flush();
  a.motor.configurar([faixas[0], faixas[2]], 'lista'); await flush();
  expect(a.fontes[1].stop).toHaveBeenCalledOnce(); expect(a.fontes[1].onended).toBeNull();
  expect(a.fontes[2].start).toHaveBeenCalledWith(2, 0);
  h.ctx.currentTime = 2; a.fontes[0].onended(); await flush(); expect(a.motor.src).toBe(faixas[2].url);
  a.motor.dispose();
});
it('não revive uma reprodução pausada ou descartada quando o preparo termina tarde', async () => {
  let concluir!: (b: AudioBuffer) => void;
  h.obter.mockImplementation(() => new Promise(resolve => { concluir = resolve; }));
  const a = ambiente(); await a.motor.play(); a.motor.pause(); concluir(buffer()); await flush();
  expect(a.fontes).toHaveLength(0); expect(a.audio.paused).toBe(true); a.motor.dispose();
  expect(a.listeners.get('loadedmetadata')?.size).toBe(0); expect(a.listeners.get('ended')?.size).toBe(0); expect(h.dispose).toHaveBeenCalledOnce();
});
it('um eco antigo não desfaz o avanço local do jogador; ordem nova pode interrompê-lo', async () => {
  const a = ambiente(); const estado = { ...criarEstadoMidia(), faixaAtualId: 'a', tocando: true };
  expect(a.motor.aceitarEstado(estado)).toBe(true); await a.motor.play(); await flush();
  h.ctx.currentTime = 2; a.fontes[0].onended(); await flush();
  expect(a.motor.aceitarEstado({ ...estado, atualizadoEm: new Date(estado.atualizadoEm).toISOString() })).toBe(false);
  expect(a.motor.aceitarEstado({ ...estado, tocando: false })).toBe(true); a.motor.dispose();
});
it('preserva fallback nativo em falha de preparo e bloqueio de autoplay', async () => {
  h.obter.mockRejectedValue(new Error('CORS'));
  const a = ambiente('faixa'); await a.motor.play(); await flush();
  expect(a.audio.paused).toBe(false); expect(a.audio.loop).toBe(true); expect(a.eventos.fallback).toHaveBeenCalledWith(true); a.motor.dispose();
  h.obter.mockResolvedValue(buffer());
  const b = ambiente(); b.audio.play.mockRejectedValueOnce(new DOMException('gesto necessário', 'NotAllowedError'));
  await expect(b.motor.play()).rejects.toMatchObject({ name: 'NotAllowedError' }); await flush();
  expect(b.fontes).toHaveLength(0); b.motor.dispose();
});
it('só encerra no final da lista sem loop; descarte para também fontes futuras', async () => {
  const a = ambiente('nenhum'); a.motor.configurar([faixas[0]], 'nenhum');
  await a.motor.play(); await flush(); h.ctx.currentTime = 2; a.fontes[0].onended();
  expect(a.eventos.terminou).toHaveBeenCalledOnce(); a.motor.dispose();
});
