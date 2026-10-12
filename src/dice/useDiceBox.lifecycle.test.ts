import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  refs: [] as { current: any }[], estados: [] as any[], efeitos: [] as any[],
  ref: 0, estado: 0, efeito: 0, instancias: [] as any[],
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (valor: any) => h.refs[h.ref++] ??= { current: valor },
  useState: (valor: any) => {
    const i = h.estado++;
    if (!(i in h.estados)) h.estados[i] = valor;
    return [h.estados[i], (novo: any) => { h.estados[i] = typeof novo === 'function' ? novo(h.estados[i]) : novo; }];
  },
  useEffect: (executar: () => any, deps: unknown[]) => {
    const i = h.efeito++;
    const anterior = h.efeitos[i];
    h.efeitos[i] = { executar, deps, limpar: anterior?.limpar, rodar: !anterior || deps.some((d, j) => !Object.is(d, anterior.deps[j])) };
  },
}));
vi.mock('./DiceBoxGerenciado', () => ({ default: class {
  initialize = vi.fn().mockResolvedValue(undefined);
  encerrar = vi.fn();
  redimensionar = vi.fn();
  updateConfig = vi.fn().mockResolvedValue(undefined);
  roll = vi.fn().mockResolvedValue({ sets: [{ num: 1, sides: 20, total: 17, rolls: [{ value: 17 }] }] });
  constructor() { h.instancias.push(this); }
} }));
import { useDiceBox } from './useDiceBox';

let container: EventTarget & { clientWidth: number; clientHeight: number };
function RenderizarHook(enabled: boolean) {
  h.ref = 0; h.estado = 0; h.efeito = 0;
  const resultado = useDiceBox('teste', enabled, 100, async () => [17]);
  for (const efeito of h.efeitos) {
    if (!efeito.rodar) continue;
    efeito.limpar?.();
    efeito.limpar = efeito.executar();
    efeito.rodar = false;
  }
  return resultado;
}
beforeEach(() => {
  h.refs = []; h.estados = []; h.efeitos = []; h.instancias = [];
  vi.useFakeTimers();
  const raf = (callback: () => void) => setTimeout(callback, 16);
  vi.stubGlobal('window', { requestAnimationFrame: raf, cancelAnimationFrame: clearTimeout });
  container = Object.assign(new EventTarget(), { clientWidth: 200, clientHeight: 100 });
  vi.stubGlobal('document', { getElementById: () => container });
});
afterEach(() => {
  for (const efeito of h.efeitos) efeito.limpar?.();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it('100 trocas de disponibilidade reutilizam uma única bandeja', async () => {
  RenderizarHook(true);
  await vi.runAllTimersAsync();
  expect(RenderizarHook(true).ready).toBe(true);
  for (let i = 0; i < 100; i++) {
    expect(RenderizarHook(false).ready).toBe(false);
    expect(RenderizarHook(true).ready).toBe(true);
  }
  expect(h.instancias).toHaveLength(1);
  expect(h.instancias[0].initialize).toHaveBeenCalledOnce();
  expect(h.instancias[0].encerrar).not.toHaveBeenCalled();
});

it('painel fechado antes do primeiro frame espera reabrir antes de inicializar', async () => {
  RenderizarHook(false); RenderizarHook(true); RenderizarHook(true);
  container.clientWidth = 0; container.clientHeight = 0;
  RenderizarHook(false);
  await vi.runAllTimersAsync();
  expect(h.instancias[0].initialize).not.toHaveBeenCalled();
  container.clientWidth = 200; container.clientHeight = 100;
  RenderizarHook(true);
  await vi.runAllTimersAsync();
  expect(h.instancias[0].initialize).toHaveBeenCalledOnce();
  expect(RenderizarHook(true).ready).toBe(true);
});

it('rolagem pendente conclui uma vez ao ocultar a bandeja', async () => {
  RenderizarHook(true); await vi.runAllTimersAsync();
  let terminar!: (valor: any) => void;
  h.instancias[0].roll.mockImplementation(() => new Promise(resolve => { terminar = resolve; }));
  const completo = vi.fn();
  RenderizarHook(true).rolar('1d20', completo);
  await vi.runAllTimersAsync();
  RenderizarHook(false);
  terminar({ sets: [{ num: 1, sides: 20, total: 17, rolls: [{ value: 17 }] }] });
  await vi.runAllTimersAsync();
  expect(completo).toHaveBeenCalledOnce();
  expect(completo.mock.calls[0][0][0].value).toBe(17);
  expect(RenderizarHook(true).rolando).toBe(false);
});

it('callbacks de rolagem antigos não são publicados depois do unmount', async () => {
  RenderizarHook(true); await vi.runAllTimersAsync();
  let terminar!: (valor: any) => void;
  h.instancias[0].roll.mockImplementation(() => new Promise(resolve => { terminar = resolve; }));
  const completo = vi.fn();
  RenderizarHook(true).rolar('1d20', completo);
  await vi.runAllTimersAsync();
  for (const efeito of h.efeitos) { efeito.limpar?.(); efeito.limpar = undefined; }
  terminar({ sets: [] }); await vi.runAllTimersAsync();
  expect(completo).not.toHaveBeenCalled();
  expect(h.instancias[0].encerrar).toHaveBeenCalledOnce();
});
