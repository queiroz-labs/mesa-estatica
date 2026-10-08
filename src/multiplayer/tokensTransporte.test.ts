import { afterEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial } from '../state/factories';
import { useStore } from '../state/store';
import { iniciarSyncTokens } from './tokensSync';
import { resolverPendencia, retomarPendenciasPersistidas, tentarTodasPendencias, usePendenciasStore } from './filaPendencias';

const h = vi.hoisted(() => ({ cliente: null as any }));
vi.mock('../lib/supabaseClient', () => ({ get supabase() { return h.cliente; } }));
const linha = { id: 'pc-transporte', participante_id: 'ficha-transporte', tipo: 'pc', x: 0.1, y: 0.1, versao_posicao: 0 };
let limpar: (() => void) | undefined;
afterEach(() => {
  limpar?.(); limpar = undefined;
  h.cliente = null;
  resolverPendencia('tokens-sync', linha.id);
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function iniciarTeste(versao: number | null = 0, tipo = 'pc', cobrirJoin = true) {
  vi.useFakeTimers();
  const leituras: Array<(data: unknown[]) => void> = [];
  const escritas: Array<{ id: string; payload: unknown }> = [];
  const canais = new Map<string, any>();
  let erroEscrita: unknown = null;
  let reterEscritas = false;
  const envios: Array<{ resolver: (resultado: any) => void; rejeitar: (erro: unknown) => void }> = [];
  const dados = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => { dados.set(chave, valor); },
  });
  usePendenciasStore.setState({ itens: [] });
  const cliente: any = {
    from: () => {
      const builder: any = {};
      builder.select = () => builder;
      builder.then = (resolve: (value: unknown) => unknown) => new Promise((resolver) => {
        leituras.push((data) => { resolver(resolve({ data, error: null })); });
      });
      builder.update = (payload: unknown) => ({ eq: (_campo: string, id: string) => ({ select: () => {
        escritas.push({ id, payload });
        if (reterEscritas) return new Promise((resolver, rejeitar) => { envios.push({ resolver, rejeitar }); });
        return Promise.resolve({ data: [{ id }], error: erroEscrita });
      } }) });
      builder.insert = vi.fn(() => Promise.resolve({ error: null }));
      return builder;
    },
    channel: (topic: string, options: unknown) => {
      const canal: any = { options, send: vi.fn() };
      canal.on = (event: string, _filter: unknown, receber: (payload: any) => void) => {
        canal.event = event; canal.receber = receber; return canal;
      };
      canal.subscribe = (status: (status: string) => void) => { canal.status = status; status('SUBSCRIBED'); return canal; };
      canais.set(topic, canal);
      return canal;
    },
    removeChannel: vi.fn(),
  };
  h.cliente = cliente;
  useStore.setState(criarEstadoInicial());
  limpar = iniciarSyncTokens();
  const remoto: any = { ...linha, tipo };
  if (versao !== null) remoto.versao_posicao = versao;
  else delete remoto.versao_posicao;
  leituras[0]([remoto]);
  await vi.advanceTimersByTimeAsync(0);
  if (cobrirJoin && canais.has(`token-pc:${linha.id}`)) {
    await vi.advanceTimersByTimeAsync(25);
    leituras[1]([remoto]);
    await vi.advanceTimersByTimeAsync(0);
  }
  return {
    leituras, escritas, canais, cliente,
    negarEscrita: () => { erroEscrita = { code: '42501', message: 'negado' }; },
    reterEscritas: () => { reterEscritas = true; },
    confirmarEscrita: (indice: number) => envios[indice].resolver({ data: [{ id: linha.id }], error: null }),
    rejeitarEscrita: (indice: number) => envios[indice].rejeitar(new Error('rede caiu')),
    pg: (row: unknown) => canais.get('tokens-sync').receber({ eventType: 'UPDATE', new: row }),
    broadcast: (posicao: unknown) => canais.get(`token-pc:${linha.id}`).receber({ payload: posicao }),
  };
}

it('Broadcast confirma posição imediatamente e PG atrasado/repetido não a recua nem publica eco', async () => {
  const mock = await iniciarTeste();
  expect(mock.canais.get(`token-pc:${linha.id}`).options).toEqual({ config: { private: true } });
  mock.broadcast({ id: linha.id, x: 0.7, y: 0.8, versao_posicao: 2 });
  expect(useStore.getState().mapa.tokens[0]).toMatchObject({ x: 0.7, y: 0.8, versaoPosicao: 2 });
  mock.pg({ ...linha, x: 0.3, y: 0.4, versao_posicao: 1 });
  mock.pg({ ...linha, x: 0.7, y: 0.8, versao_posicao: 2 });
  mock.broadcast({ id: linha.id, x: 0.3, y: 0.4, versao_posicao: 1 });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.7);
  expect(mock.escritas).toEqual([]);
  for (const c of mock.canais.values()) expect(c.send).not.toHaveBeenCalled();
});

it('refetch antigo não vence Broadcast novo; perda de Broadcast usa PG e reconexão busca posição perdida', async () => {
  const mock = await iniciarTeste();
  const pg = mock.canais.get('tokens-sync');
  const consultaAntiga = mock.leituras.length;
  pg.status('CHANNEL_ERROR'); pg.status('SUBSCRIBED');
  expect(mock.leituras).toHaveLength(consultaAntiga + 1);
  mock.broadcast({ id: linha.id, x: 0.8, y: 0.8, versao_posicao: 3 });
  mock.leituras[consultaAntiga]([{ ...linha, x: 0.4, y: 0.4, versao_posicao: 1 }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.8);

  const rapido = mock.canais.get(`token-pc:${linha.id}`);
  rapido.status('CHANNEL_ERROR');
  mock.pg({ ...linha, x: 0.9, y: 0.9, versao_posicao: 4 });
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.9);
  rapido.status('SUBSCRIBED');
  await vi.advanceTimersByTimeAsync(25);
  expect(mock.leituras).toHaveLength(consultaAntiga + 2);
  mock.leituras[consultaAntiga + 1]([{ ...linha, x: 0.6, y: 0.6, versao_posicao: 5 }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(useStore.getState().mapa.tokens[0]).toMatchObject({ x: 0.6, versaoPosicao: 5 });
  expect(mock.escritas).toEqual([]);
});

it('backend sem 0042 usa PG e UPDATE normalmente, sem abrir canal privado', async () => {
  const mock = await iniciarTeste(null);
  expect(mock.canais.size).toBe(1);
  mock.pg({ ...linha, x: 0.4, y: 0.4, versao_posicao: undefined });
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.4);
  useStore.getState().moverTokenMapa(linha.id, 0.5, 0.5);
  await vi.advanceTimersByTimeAsync(0);
  expect(mock.escritas).toHaveLength(1);
  expect(mock.escritas[0].payload).toEqual({ x: 0.5, y: 0.5, participante_id: linha.participante_id, tipo: 'pc' });
});

it('NPC não ganha canal de posição rápida; sua atualização permanece no PG', async () => {
  const mock = await iniciarTeste(0, 'npc');
  expect(mock.canais.size).toBe(1);
  mock.pg({ ...linha, tipo: 'npc', x: 0.6, y: 0.7, versao_posicao: 1 });
  expect(useStore.getState().mapa.tokens[0]).toMatchObject({ tipo: 'npc', x: 0.6, y: 0.7 });
  expect(mock.canais.size).toBe(1);
});

it('canal de recepção não contorna UPDATE negado por RLS e não publica posição de cliente', async () => {
  const mock = await iniciarTeste();
  const consoleErro = vi.spyOn(console, 'error').mockImplementation(() => {});
  mock.negarEscrita();
  useStore.getState().moverTokenMapa(linha.id, 0.6, 0.6);
  await vi.advanceTimersByTimeAsync(0);
  expect(mock.escritas).toHaveLength(1);
  expect(consoleErro).toHaveBeenCalledWith(expect.stringContaining('negado por permissão'), expect.objectContaining({ code: '42501' }));
  for (const c of mock.canais.values()) expect(c.send).not.toHaveBeenCalled();
});

it('leitura que termina após desmontar não reidrata posição antiga em outra instância', async () => {
  const mock = await iniciarTeste();
  const indice = mock.leituras.length;
  mock.canais.get('tokens-sync').status('CHANNEL_ERROR');
  mock.canais.get('tokens-sync').status('SUBSCRIBED');
  limpar?.(); limpar = undefined;
  useStore.setState((s) => ({ mapa: { ...s.mapa, tokens: s.mapa.tokens.map((t) => ({ ...t, x: 0.8 })) } }));
  mock.leituras[indice]([{ ...linha, x: 0.2, versao_posicao: 1 }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.8);
});

it('DELETE aceito impede refetch anterior de ressuscitar linha; INSERT legítimo do mesmo id desbloqueia', async () => {
  const mock = await iniciarTeste();
  const indice = mock.leituras.length;
  mock.canais.get('tokens-sync').status('CHANNEL_ERROR');
  mock.canais.get('tokens-sync').status('SUBSCRIBED');
  mock.canais.get('tokens-sync').receber({ eventType: 'DELETE', old: { id: linha.id } });
  expect(useStore.getState().mapa.tokens).toEqual([]);
  mock.leituras[indice]([{ ...linha, x: 0.2, versao_posicao: 1 }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(useStore.getState().mapa.tokens).toEqual([]);
  // Importação/restauração pode reutilizar um UUID de token apagado.
  mock.canais.get('tokens-sync').receber({ eventType: 'INSERT', new: { ...linha, x: 0.4, versao_posicao: 0 } });
  expect(useStore.getState().mapa.tokens[0]).toMatchObject({ id: linha.id, x: 0.4, versaoPosicao: 0 });
  expect(mock.escritas).toEqual([]);
});

it('primeiro join recupera movimento ocorrido depois da consulta inicial e antes da assinatura', async () => {
  const mock = await iniciarTeste(0, 'pc', false);
  expect(mock.leituras).toHaveLength(1);
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.1);
  // A versão 1 aconteceu na janela sem assinatura; seu Broadcast não foi recebido.
  await vi.advanceTimersByTimeAsync(25);
  expect(mock.leituras).toHaveLength(2);
  mock.leituras[1]([{ ...linha, x: 0.65, y: 0.65, versao_posicao: 1 }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(useStore.getState().mapa.tokens[0]).toMatchObject({ x: 0.65, versaoPosicao: 1 });
  expect(mock.escritas).toEqual([]);
});

it('refetch aguardado do primeiro join preserva posição e metadado enquanto UPDATE está em voo', async () => {
  const mock = await iniciarTeste(0, 'pc', false);
  mock.reterEscritas();
  useStore.getState().moverTokenMapa(linha.id, 0.8, 0.8);
  await vi.advanceTimersByTimeAsync(25);
  mock.leituras[1]([{ ...linha, x: 0.1, y: 0.1 }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.8);
  expect(retomarPendenciasPersistidas('tokens-sync')).toContain(linha.id);
  mock.confirmarEscrita(0);
  await vi.advanceTimersByTimeAsync(0);
  expect(retomarPendenciasPersistidas('tokens-sync')).not.toContain(linha.id);
});

it('rejeição final de UPDATE conserva retry e posição durante refetch; confirmação do retry limpa metadados', async () => {
  const mock = await iniciarTeste();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mock.reterEscritas();
  useStore.getState().moverTokenMapa(linha.id, 0.9, 0.9);
  mock.rejeitarEscrita(0);
  await vi.advanceTimersByTimeAsync(0);
  expect(retomarPendenciasPersistidas('tokens-sync')).toContain(linha.id);
  const indice = mock.leituras.length;
  mock.canais.get(`token-pc:${linha.id}`).status('SUBSCRIBED');
  await vi.advanceTimersByTimeAsync(25);
  mock.leituras[indice]([{ ...linha, x: 0.1, y: 0.1 }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.9);
  tentarTodasPendencias();
  expect(mock.escritas[1].payload).toMatchObject({ x: 0.9, y: 0.9 });
  mock.confirmarEscrita(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(retomarPendenciasPersistidas('tokens-sync')).not.toContain(linha.id);
});
