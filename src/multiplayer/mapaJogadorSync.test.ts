import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarMapaBiblioteca } from '../state/factories';
import { useStore } from '../state/store';
import { usePendenciasStore } from './filaPendencias';
import { iniciarSyncMapaAtivo } from './mapaAtivoSync';
import { iniciarSyncMapasBiblioteca, paraLinha } from './mapasBibliotecaSync';

const h = vi.hoisted(() => ({ cliente: null as any }));
vi.mock('../lib/supabaseClient', () => ({ get supabase() { return h.cliente; } }));

function criarCliente() {
  let mapas = [paraLinha(criarMapaBiblioteca('mapa remoto', '', 'https://example.test/mapa.png', 0))];
  let ativo: string | null = mapas[0].id;
  const escritas: string[] = [];
  const assinaturas: Array<{ tabela: string; receber: (payload: any) => void; status?: (status: string) => void }> = [];
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  return {
    from: (tabela: string) => {
      const builder: any = {};
      builder.select = () => builder;
      builder.order = () => builder;
      builder.eq = () => builder;
      builder.then = (resolve: (resultado: unknown) => unknown) =>
        Promise.resolve({ data: clone(mapas), error: null }).then(resolve);
      builder.maybeSingle = () => Promise.resolve({ data: { id: 'mapa', mapa_ativo_id: ativo }, error: null });
      builder.upsert = () => { escritas.push(`upsert:${tabela}`); return Promise.resolve({ error: null }); };
      builder.delete = () => { escritas.push(`delete:${tabela}`); return builder; };
      return builder;
    },
    channel: () => {
      const canal: any = {};
      let assinatura: (typeof assinaturas)[number];
      canal.on = (_evento: string, filtro: { table: string }, receber: (payload: any) => void) => {
        assinatura = { tabela: filtro.table, receber };
        assinaturas.push(assinatura);
        return canal;
      };
      canal.subscribe = (status: (status: string) => void) => {
        assinatura.status = status;
        status('SUBSCRIBED');
        return canal;
      };
      return canal;
    },
    removeChannel: () => {},
    escritas,
    get mapas() { return mapas; },
    alterarRemoto: () => {
      mapas = mapas.map((m) => ({ ...m, grade: { ...m.grade, ativa: true }, fow: { ...m.fow, ativa: true } }));
      ativo = null;
    },
    emitir: (tabela: string, eventType: string, linha: unknown) => {
      for (const a of assinaturas.filter((a) => a.tabela === tabela)) {
        a.receber({ eventType, new: eventType === 'DELETE' ? {} : clone(linha), old: eventType === 'DELETE' ? clone(linha) : {} });
      }
    },
    reconectar: () => {
      for (const a of assinaturas) { a.status?.('CHANNEL_ERROR'); a.status?.('SUBSCRIBED'); }
    },
  };
}

const limpezas: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  useStore.setState(criarEstadoInicial());
  usePendenciasStore.setState({ itens: [] });
  h.cliente = criarCliente();
});
afterEach(() => {
  for (const limpar of limpezas.splice(0)) limpar();
  usePendenciasStore.setState({ itens: [] });
  h.cliente = null;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function iniciarLeitura() {
  limpezas.push(iniciarSyncMapasBiblioteca({ somenteLeitura: true }), iniciarSyncMapaAtivo({ somenteLeitura: true }));
}

describe('mapas do jogador — somente leitura', () => {
  it('duas instâncias recebem referências novas de grade/FoW sem reempurrar a hidratação', async () => {
    const mock = h.cliente as ReturnType<typeof criarCliente>;
    iniciarLeitura();
    iniciarLeitura();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(useStore.getState().mapa.biblioteca).toHaveLength(1);
    expect(useStore.getState().mapa.mapaAtivoId).toBe(mock.mapas[0].id);
    expect(mock.escritas).toEqual([]);

    mock.alterarRemoto();
    mock.emitir('mapas_biblioteca', 'UPDATE', mock.mapas[0]);
    mock.emitir('mapa_publico', 'UPDATE', { id: 'mapa', mapa_ativo_id: null });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(useStore.getState().mapa.biblioteca[0].fow.ativa).toBe(true);
    expect(useStore.getState().mapa.mapaAtivoId).toBeNull();

    mock.reconectar();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.escritas).toEqual([]);
    expect(usePendenciasStore.getState().itens).toEqual([]);
  });

  it('não publica edição local de grade/FoW, inclusão, remoção explícita ou troca de mapa', async () => {
    const mock = h.cliente as ReturnType<typeof criarCliente>;
    iniciarLeitura();
    await vi.advanceTimersByTimeAsync(0);
    useStore.getState().atualizarGrade({ colunas: 72 });
    useStore.getState().definirFoWAtivo(true);
    const id = useStore.getState().adicionarMapaBiblioteca('local', '', 'https://example.test/local.png');
    useStore.getState().selecionarMapaAtivo(id);
    useStore.getState().removerMapaBiblioteca(id);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.escritas).toEqual([]);
    expect(usePendenciasStore.getState().itens).toEqual([]);
  });

  it('não reproduz fila persistida de publicação ou exclusão do mestre', async () => {
    const mock = h.cliente as ReturnType<typeof criarCliente>;
    const itens = [
      { modulo: 'mapas-biblioteca-sync', chave: mock.mapas[0].id },
      { modulo: 'mapas-biblioteca-sync', chave: 'delete:mapa-antigo' },
      { modulo: 'mapa-ativo-sync', chave: 'mapa' },
    ];
    usePendenciasStore.setState({ itens });
    iniciarLeitura();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.escritas).toEqual([]);
    expect(usePendenciasStore.getState().itens).toEqual(itens);
  });
});
