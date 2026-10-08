import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia, SCHEMA_VERSION } from './factories';

// O alvo é a persistência local; nenhum cliente remoto deve nascer neste teste.
vi.mock('../lib/supabaseClient', () => ({ supabase: null }));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function simularPagina(pathname: string, search: string) {
  const estadoMestre = criarEstadoInicial();
  estadoMestre.sessaoPrivada.oQueRealmenteAcontece = 'segredo do mestre';
  estadoMestre.fichas = [{ ...criarFichaVazia(), nome: 'ficha local do mestre' }];
  const dados = new Map<string, string>([
    ['estatica-mesa', JSON.stringify({ state: estadoMestre, version: SCHEMA_VERSION })],
  ]);
  const storage = {
    getItem: vi.fn((chave: string) => dados.get(chave) ?? null),
    setItem: vi.fn((chave: string, valor: string) => { dados.set(chave, valor); }),
    removeItem: vi.fn((chave: string) => { dados.delete(chave); }),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { location: { pathname, search }, addEventListener: vi.fn() });
  vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });
  return { storage, dados };
}

describe('isolamento da persistência do jogador', () => {
  it.each([
    ['/jogador', ''],
    ['/jogador', '?t=token-invalido'],
    ['/jogador.html', '?t=token-invalido'],
    ['/jogador/', ''],
    ['/mesa-estatica/jogador', ''],
    ['/mesa-estatica/jogador.html/', ''],
  ])('não lê nem altera a mesa local em %s%s', async (pathname, search) => {
    const { storage, dados } = simularPagina(pathname, search);
    const mesaAntes = dados.get('estatica-mesa');
    const { useStore } = await import('./store');

    expect(useStore.getState().sessaoPrivada.oQueRealmenteAcontece).toBe('');
    expect(useStore.getState().fichas).toEqual([]);
    expect(storage.getItem).not.toHaveBeenCalled();

    // O sync do jogador preenche o store compartilhado, mas jamais o save do mestre.
    useStore.setState({ fichas: [{ ...criarFichaVazia(), nome: 'ficha recebida da nuvem' }] });
    await useStore.persist.rehydrate();
    vi.advanceTimersByTime(1_000);
    useStore.persist.clearStorage();

    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(dados.get('estatica-mesa')).toBe(mesaAntes);
  });

  it.each(['/', '/index.html', '/mesa-estatica/', '/mesa-estatica/index.html'])(
    'mantém leitura e gravação da mesa do mestre em %s', async (pathname) => {
      const { storage, dados } = simularPagina(pathname, '');
      const { useStore } = await import('./store');

      expect(storage.getItem).toHaveBeenCalledWith('estatica-mesa');
      expect(useStore.getState().sessaoPrivada.oQueRealmenteAcontece).toBe('segredo do mestre');
      expect(useStore.getState().fichas[0].nome).toBe('ficha local do mestre');

      useStore.setState((s) => ({
        sessaoPrivada: { ...s.sessaoPrivada, oQueRealmenteAcontece: 'segredo atualizado' },
      }));
      vi.advanceTimersByTime(400);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(JSON.parse(dados.get('estatica-mesa')!).state.sessaoPrivada.oQueRealmenteAcontece)
        .toBe('segredo atualizado');
    },
  );
});
