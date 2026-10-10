import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getSession: vi.fn(), signInAnonymously: vi.fn(), invoke: vi.fn(),
}));
vi.mock('../lib/supabaseClient', () => ({ supabase: { auth: h, functions: { invoke: h.invoke } } }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal('window', { location: { search: '?t=teste-descartavel' } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.getSession.mockResolvedValue({ data: { session: null } });
  h.signInAnonymously.mockResolvedValue({ error: null });
  h.invoke.mockResolvedValue({ error: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('deduplica o bootstrap concorrente e mantém sucesso em cache', async () => {
  const { iniciarAuthMultiplayer } = await import('./auth');
  expect(await Promise.all(Array.from({ length: 7 }, () => iniciarAuthMultiplayer()))).toEqual(Array(7).fill(true));
  await iniciarAuthMultiplayer();
  expect(h.signInAnonymously).toHaveBeenCalledTimes(1);
  expect(h.invoke).toHaveBeenCalledTimes(1);
});

it('permite tentar novamente após falha de sign-in sem duplicar identidades em voo', async () => {
  h.signInAnonymously.mockResolvedValueOnce({ error: new Error('offline') });
  const { iniciarAuthMultiplayer } = await import('./auth');
  expect(await iniciarAuthMultiplayer()).toBe(false);
  expect(h.invoke).not.toHaveBeenCalled();
  expect(await Promise.all([iniciarAuthMultiplayer(), iniciarAuthMultiplayer()])).toEqual([true, true]);
  expect(h.signInAnonymously).toHaveBeenCalledTimes(2);
  expect(h.invoke).toHaveBeenCalledTimes(1);
});

it('refaz vínculo que falhou sem criar outra sessão autenticada', async () => {
  h.getSession.mockResolvedValue({ data: { session: { user: { id: 'qa' } } } });
  h.invoke.mockResolvedValueOnce({ error: new Error('rede') });
  const { iniciarAuthMultiplayer } = await import('./auth');
  expect(await iniciarAuthMultiplayer()).toBe(false);
  expect(await iniciarAuthMultiplayer()).toBe(true);
  expect(h.signInAnonymously).not.toHaveBeenCalled();
  expect(h.invoke).toHaveBeenCalledTimes(2);
});

it('recupera rejeição inesperada e erro de leitura de sessão', async () => {
  h.getSession.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: {}, error: new Error('rede') });
  const { iniciarAuthMultiplayer } = await import('./auth');
  expect(await iniciarAuthMultiplayer()).toBe(false);
  expect(await iniciarAuthMultiplayer()).toBe(false);
  expect(await iniciarAuthMultiplayer()).toBe(true);
});
