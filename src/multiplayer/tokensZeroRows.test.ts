import { afterEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial } from '../state/factories';
import { useStore } from '../state/store';
import { useStatusMesa } from '../lib/statusMesa';
import { iniciarSyncTokens, marcarTokenEmArrasto, desmarcarTokenEmArrasto } from './tokensSync';
import { resolverPendencia, retomarPendenciasPersistidas, usePendenciasStore } from './filaPendencias';

const h = vi.hoisted(() => ({ cliente: null as any }));
vi.mock('../lib/supabaseClient', () => ({ get supabase() { return h.cliente; } }));
let limpar: (() => void) | undefined;
let idTeste = '';
let sequenciaTeste = 0;
afterEach(() => {
  limpar?.(); limpar = undefined;
  desmarcarTokenEmArrasto(idTeste);
  resolverPendencia('tokens-sync', idTeste);
  h.cliente = null;
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function iniciarTeste() {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  idTeste = `zero-rows-${++sequenciaTeste}`;
  const linha = { id: idTeste, participante_id: 'ficha', tipo: 'pc', x: 0.1, y: 0.1, versao_posicao: 0 };
  let remotos: unknown[] = [linha];
  const dados = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => { dados.set(chave, valor); },
  });
  usePendenciasStore.setState({ itens: [] });
  useStatusMesa.setState({ erroRuntime: null });
  const envios: Array<{ payload: any; resolver: (resultado: any) => void }> = [];
  const leituras: Array<(resultado: any) => void> = [];
  const canais = new Map<string, any>();
  const inserir = vi.fn(() => Promise.resolve({ error: null }));
  const apagar = vi.fn(() => Promise.resolve({ error: null }));
  const cliente: any = {
    from: () => {
      const builder: any = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.then = (resolve: (resultado: any) => unknown) => Promise.resolve({ data: remotos, error: null }).then(resolve);
      builder.maybeSingle = () => new Promise((resolve) => { leituras.push(resolve); });
      builder.update = (payload: unknown) => ({ eq: () => ({ select: () => new Promise((resolve) => { envios.push({ payload, resolver: resolve }); }) }) });
      builder.insert = inserir;
      builder.delete = apagar;
      return builder;
    },
    channel: (topic: string) => {
      const canal: any = {};
      canal.on = (_event: string, _filter: unknown, receber: (payload: any) => void) => { canal.receber = receber; return canal; };
      canal.subscribe = (status: (status: string) => void) => { status('SUBSCRIBED'); return canal; };
      canais.set(topic, canal);
      return canal;
    },
    removeChannel: () => {},
  };
  h.cliente = cliente;
  useStore.setState(criarEstadoInicial());
  limpar = iniciarSyncTokens();
  await vi.advanceTimersByTimeAsync(25);
  return { linha, envios, leituras, inserir, apagar, canais,
    apagarNoServidor: () => { remotos = []; },
    zero: (indice: number) => envios[indice].resolver({ data: [], error: null }),
    confirmar: (indice: number) => envios[indice].resolver({ data: [{ id: linha.id }], error: null }),
  };
}

it('movimento confirmado normalmente não faz leitura adicional por id', async () => {
  const mock = await iniciarTeste();
  useStore.getState().moverTokenMapa(mock.linha.id, 0.8, 0.8);
  mock.confirmar(0);
  await vi.advanceTimersByTimeAsync(0);
  expect(mock.leituras).toEqual([]);
  expect(mock.envios).toHaveLength(1);
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.8);
});

it('UPDATE filtrado após revínculo restaura posição real, preserva versão e informa 42501', async () => {
  const mock = await iniciarTeste();
  marcarTokenEmArrasto(mock.linha.id);
  useStore.getState().moverTokenMapa(mock.linha.id, 0.9, 0.9);
  mock.zero(0);
  await vi.advanceTimersByTimeAsync(0);
  expect(mock.leituras).toHaveLength(1);
  mock.leituras[0]({ data: { ...mock.linha, x: 0.3, y: 0.4, versao_posicao: 2 }, error: null });
  await vi.advanceTimersByTimeAsync(0);
  expect(useStore.getState().mapa.tokens[0]).toMatchObject({ x: 0.3, y: 0.4, versaoPosicao: 2 });
  expect(useStatusMesa.getState().erroRuntime).toContain('sem permissão pra salvar (tokens-sync)');
  expect(retomarPendenciasPersistidas('tokens-sync')).not.toContain(mock.linha.id);
  expect(mock.inserir).not.toHaveBeenCalled(); expect(mock.apagar).not.toHaveBeenCalled();
});

it('token apagado durante arrasto some localmente e tick antigo não ressuscita ou apaga no servidor', async () => {
  const mock = await iniciarTeste();
  marcarTokenEmArrasto(mock.linha.id);
  useStore.getState().moverTokenMapa(mock.linha.id, 0.2, 0.2);
  await vi.advanceTimersByTimeAsync(50);
  useStore.getState().moverTokenMapa(mock.linha.id, 0.8, 0.8);
  mock.canais.get('tokens-sync').receber({ eventType: 'DELETE', old: { id: mock.linha.id } });
  expect(useStore.getState().mapa.tokens).toEqual([]); // DELETE é autoridade sobre existência
  mock.zero(0); await vi.advanceTimersByTimeAsync(0);
  mock.leituras[0]({ data: null, error: null }); await vi.advanceTimersByTimeAsync(0);
  expect(useStore.getState().mapa.tokens).toEqual([]);
  mock.canais.get('tokens-sync').receber({ eventType: 'UPDATE', new: { ...mock.linha, x: 0.2, versao_posicao: 1 } });
  await vi.advanceTimersByTimeAsync(300);
  expect(useStore.getState().mapa.tokens).toEqual([]);
  expect(mock.envios).toHaveLength(1);
  expect(retomarPendenciasPersistidas('tokens-sync')).not.toContain(mock.linha.id);
  expect(mock.inserir).not.toHaveBeenCalled(); expect(mock.apagar).not.toHaveBeenCalled();
});

it('DELETE durante ACK retido remove token e sucesso atrasado não restaura última posição ou versão', async () => {
  const mock = await iniciarTeste();
  marcarTokenEmArrasto(mock.linha.id);
  useStore.getState().moverTokenMapa(mock.linha.id, 0.8, 0.8);
  // O UPDATE salvou e publicou versão 1, mas a resposta HTTP ainda não voltou.
  mock.canais.get(`token-pc:${mock.linha.id}`).receber({ payload: { id: mock.linha.id, x: 0.8, y: 0.8, versao_posicao: 1 } });
  expect(retomarPendenciasPersistidas('tokens-sync')).toContain(mock.linha.id);
  mock.apagarNoServidor();
  mock.canais.get('tokens-sync').receber({ eventType: 'DELETE', old: { id: mock.linha.id } });
  expect(useStore.getState().mapa.tokens).toEqual([]);
  mock.confirmar(0);
  await vi.advanceTimersByTimeAsync(300);
  expect(useStore.getState().mapa.tokens).toEqual([]);
  expect(retomarPendenciasPersistidas('tokens-sync')).not.toContain(mock.linha.id);
  expect(mock.envios).toHaveLength(1);
  expect(mock.inserir).not.toHaveBeenCalled(); expect(mock.apagar).not.toHaveBeenCalled();
});

it('leitura de zeroRows antiga não recua versão nova já confirmada nem perde seus metadados', async () => {
  const mock = await iniciarTeste();
  useStore.getState().moverTokenMapa(mock.linha.id, 0.2, 0.2);
  mock.zero(0); await vi.advanceTimersByTimeAsync(0); // leitura antiga ainda em voo
  await vi.advanceTimersByTimeAsync(50);
  useStore.getState().moverTokenMapa(mock.linha.id, 0.8, 0.8);
  await vi.advanceTimersByTimeAsync(100);
  mock.canais.get(`token-pc:${mock.linha.id}`).receber({ payload: { id: mock.linha.id, x: 0.8, y: 0.8, versao_posicao: 3 } });
  mock.confirmar(1); await vi.advanceTimersByTimeAsync(0);
  expect(retomarPendenciasPersistidas('tokens-sync')).toContain(mock.linha.id);
  mock.leituras[0]({ data: { ...mock.linha, versao_posicao: 1 }, error: null });
  await vi.advanceTimersByTimeAsync(300);
  expect(useStore.getState().mapa.tokens[0]).toMatchObject({ x: 0.8, y: 0.8, versaoPosicao: 3 });
  expect(retomarPendenciasPersistidas('tokens-sync')).not.toContain(mock.linha.id);
  expect(mock.envios).toHaveLength(2);
  expect(useStatusMesa.getState().erroRuntime).toBeNull();
});
