import { afterEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarMapaBiblioteca } from '../state/factories';
import { useStore } from '../state/store';
const h = vi.hoisted(() => ({ cliente: null as any }));
vi.mock('../lib/supabaseClient', () => ({ get supabase() { return h.cliente; } }));
import { iniciarSyncMapaAtivo } from './mapaAtivoSync';
import { iniciarSyncMapasBiblioteca } from './mapasBibliotecaSync';
import { usePendenciasStore } from './filaPendencias';

afterEach(() => { vi.useRealTimers(); h.cliente = null; });
it.each(['upload', 'backup'])('publica mapa antes de ativá-lo: %s', async (modo) => {
  vi.useFakeTimers();
  useStore.setState(criarEstadoInicial());
  const mapas = new Map<string, any>();
  let ativo: string | null = null;
  const chamadas: string[] = [];
  h.cliente = {
    from: (table: string) => {
      const builder: any = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.order = () => Promise.resolve({ data: [...mapas.values()], error: null });
      builder.maybeSingle = () => Promise.resolve({ data: { id: 'mapa', mapa_ativo_id: ativo }, error: null });
      builder.upsert = (row: any) => {
        chamadas.push(table);
        if (table === 'mapas_biblioteca') { mapas.set(row.id, row); return Promise.resolve({ error: null }); }
        if (row.mapa_ativo_id && !mapas.has(row.mapa_ativo_id)) return Promise.resolve({ error: { code: '23503' } });
        ativo = row.mapa_ativo_id;
        return Promise.resolve({ error: null });
      };
      return builder;
    },
    channel: () => { const c: any = {}; c.on = () => c; c.subscribe = () => c; return c; },
    removeChannel: () => {},
  };
  const pararBiblioteca = iniciarSyncMapasBiblioteca();
  const pararAtivo = iniciarSyncMapaAtivo();
  try {
    await vi.advanceTimersByTimeAsync(0);
    let id: string;
    if (modo === 'backup') {
      const dados = criarEstadoInicial();
      const mapa = criarMapaBiblioteca('mapa', '', 'https://example.test/mapa.png', 0);
      id = mapa.id;
      dados.mapa.biblioteca = [mapa];
      dados.mapa.mapaAtivoId = id;
      useStore.getState().importarJSON(JSON.stringify(dados));
    } else {
      id = useStore.getState().adicionarMapaBiblioteca('mapa', '', 'data:image/png;base64,AAAA');
      useStore.getState().selecionarMapaAtivo(id);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(chamadas).toEqual([]);
    if (modo === 'upload') useStore.getState().atualizarImagemMapaBiblioteca(id, 'img/mapas/test.png', 'https://example.test/mapa.png');
    await vi.advanceTimersByTimeAsync(1000);
    expect(chamadas).toEqual(['mapas_biblioteca', 'mapa_publico']);
    expect(ativo).toBe(id);
    expect(useStore.getState().mapa.mapaAtivoId).toBe(id);
    expect(usePendenciasStore.getState().itens).toEqual([]);
  } finally { pararAtivo(); pararBiblioteca(); }
});
