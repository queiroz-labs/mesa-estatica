import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { criarFichaVazia } from '../state/factories';
import { dividirFicha } from './fichaSplit';

const h = vi.hoisted(() => ({
  efeito: null as null | (() => (() => void) | undefined),
  autenticar: vi.fn(), getUser: vi.fn(), privado: vi.fn(), publico: vi.fn(),
  parar: vi.fn(), sync: vi.fn(), setState: vi.fn(),
}));
vi.mock('react', () => ({
  useState: (valor: unknown) => [valor, vi.fn()],
  useEffect: (efeito: typeof h.efeito) => { h.efeito = efeito; },
}));
vi.mock('./auth', () => ({ iniciarAuthMultiplayer: h.autenticar }));
vi.mock('./fichasSync', () => ({
  iniciarSyncFichas: h.sync,
  paraFichaPublica: (linha: { id: string; nome: string }) => ({ ...linha, corVisual: '#fff', foto: null }),
}));
vi.mock('../state/store', () => ({ useStore: { setState: h.setState } }));
vi.mock('../lib/supabaseClient', () => ({ supabase: {
  auth: { getUser: h.getUser },
  from: (tabela: string) => {
    const query = { select: () => query, eq: () => query, maybeSingle: tabela === 'characters_privado' ? h.privado : h.publico };
    return query;
  },
} }));
import { useMinhaFicha } from './minhaFicha';

let limpar: (() => void) | undefined;
const drenar = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { search: '?t=qa' } }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.sync.mockReturnValue(h.parar);
  h.autenticar.mockResolvedValue(true);
  h.getUser.mockResolvedValue({ data: { user: { id: 'qa' } } });
  const ficha = { ...criarFichaVazia(), id: 'qa', nome: 'descartável' };
  h.privado.mockResolvedValue({ data: { id: 'qa', dados: dividirFicha(ficha).privado } });
  h.publico.mockResolvedValue({ data: { id: 'qa', nome: 'descartável', pv_maximo: 20, pv_atual: 20, surtos_ativos: [] } });
});
afterEach(() => { limpar?.(); limpar = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function Montar() { useMinhaFicha(); limpar = h.efeito?.(); }

it('recupera falha inicial no próximo retry sem duplicar sync ou manter timer depois de carregar', async () => {
  h.autenticar.mockResolvedValueOnce(false);
  Montar(); await drenar();
  expect(h.setState).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.setState).toHaveBeenCalledTimes(1);
  expect(h.sync).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('online retoma imediatamente e chamadas repetidas não sobrepõem consultas ou reidratam uma ficha já editável', async () => {
  h.autenticar.mockResolvedValueOnce(false);
  Montar(); await drenar();
  for (let i = 0; i < 7; i++) window.dispatchEvent(new Event('online'));
  await drenar();
  window.dispatchEvent(new Event('online')); await drenar();
  expect(h.autenticar).toHaveBeenCalledTimes(2);
  expect(h.setState).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('falha ao buscar ficha é recuperada sem recarregar a página', async () => {
  h.privado.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  Montar(); await drenar();
  await vi.advanceTimersByTimeAsync(5000);
  expect(h.setState).toHaveBeenCalledTimes(1);
});

it('desmontar cancela retry e listener e encerra exatamente a assinatura criada', async () => {
  h.autenticar.mockResolvedValue(false);
  Montar(); await drenar(); limpar?.(); limpar = undefined;
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(15000);
  expect(h.autenticar).toHaveBeenCalledTimes(1);
  expect(h.parar).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('resposta atrasada depois de desmontar não altera a mesa nem cria retry', async () => {
  let resolver!: (ok: boolean) => void;
  h.autenticar.mockReturnValue(new Promise<boolean>((resolve) => { resolver = resolve; }));
  Montar(); limpar?.(); limpar = undefined;
  resolver(false); await drenar();
  expect(h.setState).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
