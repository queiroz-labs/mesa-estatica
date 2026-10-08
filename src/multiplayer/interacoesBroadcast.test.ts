import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStatusMesa } from '../lib/statusMesa';
import { usePingsStore } from '../state/pingsStore';
import { useReguasStore, type ReguaViva } from '../state/reguasStore';
import { useRolagemAoVivoStore, type RolagemAoVivo } from '../state/rolagemAoVivoStore';
import { iniciarSyncPing } from './pingSync';
import { iniciarSyncReguas, notificarCancelamentoRegua } from './reguasSync';
import { iniciarSyncRolagemAoVivo } from './rolagemAoVivoSync';

const mocks = vi.hoisted(() => ({
  canais: new Map<string, { callbacks: Map<string, (msg: { payload: unknown }) => void>; send: ReturnType<typeof vi.fn>; config: unknown }>(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    channel: (nome: string, config: unknown) => {
      const canal = { callbacks: new Map<string, (msg: { payload: unknown }) => void>(), send: vi.fn().mockResolvedValue('ok'), config };
      mocks.canais.set(nome, canal);
      const api = {
        on: (_tipo: string, filtro: { event: string }, callback: (msg: { payload: unknown }) => void) => { canal.callbacks.set(filtro.event, callback); return api; },
        subscribe: () => api,
        send: canal.send,
      };
      return api;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock('./filaPendencias', () => ({
  executarComRetentativa: (_escopo: string, _id: string, executar: () => unknown) => { void executar(); },
  retomarPendenciasPersistidas: () => [],
}));

let limpar: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  mocks.canais.clear();
  useStatusMesa.setState({ online: true });
  usePingsStore.setState({ pings: {} });
  useReguasStore.setState({ reguas: {} });
  useRolagemAoVivoStore.setState({ atual: null, iniciando: null, mostrando: false });
});
afterEach(() => {
  limpar?.();
  limpar = undefined;
  vi.useRealTimers();
  vi.clearAllMocks();
});

const regua = (id: string, x: number, ativa = true): ReguaViva => ({ id, autorId: id, cor: '#888888', pontos: [{ x: 0, y: 0 }, { x, y: 0.5 }], atualizadaEm: Date.now(), ativa });
const rolagem: RolagemAoVivo = { id: 'rolagem-remota', termos: [{ sides: 20, qty: 1 }], valores: [12], colorsetBase: 'rede', cor: '#888888', origem: 'Arthur', tipo: 'teste' };

describe('régua de medição ao vivo', () => {
  it('primeiro ponto é imediato e arrasto contínuo envia o ponto mais novo sem esperar parar', () => {
    limpar = iniciarSyncReguas();
    const canal = mocks.canais.get('reguas')!;
    useReguasStore.getState().upsertRegua(regua('local', 0.1));
    expect(canal.send).toHaveBeenCalledOnce();
    for (let i = 2; i <= 20; i++) {
      vi.advanceTimersByTime(10);
      useReguasStore.getState().upsertRegua(regua('local', i / 100));
    }
    expect(canal.send.mock.calls.length).toBeGreaterThan(2);
    vi.advanceTimersByTime(80);
    expect(canal.send).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { regua: expect.objectContaining({ pontos: [{ x: 0, y: 0 }, { x: 0.2, y: 0.5 }] }) } }));
    expect(canal.config).toEqual({ config: { broadcast: { self: false, ack: false }, private: true } });
  });

  it('soltura envia o ponto final imediatamente e nenhum tick ressuscita a régua ativa', () => {
    limpar = iniciarSyncReguas();
    const canal = mocks.canais.get('reguas')!;
    useReguasStore.getState().upsertRegua(regua('local', 0.1));
    useReguasStore.getState().upsertRegua(regua('local', 0.2));
    useReguasStore.getState().upsertRegua(regua('local', 0.3, false));
    expect(canal.send).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { regua: expect.objectContaining({ ativa: false }) } }));
    expect(canal.send).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(canal.send).toHaveBeenCalledTimes(2);
  });

  it('Esc e desconexão impedem qualquer envio pendente do movimento anterior', () => {
    limpar = iniciarSyncReguas();
    const canal = mocks.canais.get('reguas')!;
    useReguasStore.getState().upsertRegua(regua('local', 0.1));
    useReguasStore.getState().upsertRegua(regua('local', 0.2));
    useReguasStore.getState().removerRegua('local');
    notificarCancelamentoRegua('local');
    vi.advanceTimersByTime(1000);
    expect(canal.send).toHaveBeenCalledTimes(2);
    useReguasStore.getState().upsertRegua(regua('local', 0.4));
    useReguasStore.getState().upsertRegua(regua('local', 0.5));
    limpar(); limpar = undefined;
    vi.advanceTimersByTime(1000);
    expect(canal.send).toHaveBeenCalledTimes(3);
  });

  it('receber régua remota não a retransmite ao editar a própria régua', () => {
    limpar = iniciarSyncReguas();
    const canal = mocks.canais.get('reguas')!;
    canal.callbacks.get('regua')!({ payload: { regua: regua('outro-jogador', 0.1) } });
    useReguasStore.getState().upsertRegua(regua('local', 0.2));
    vi.advanceTimersByTime(1000);
    expect(canal.send).toHaveBeenCalledOnce();
    expect(canal.send.mock.calls[0][0].payload.regua.id).toBe('local');
  });
});

describe('pings e dados sem eco', () => {
  it('início de dados sai imediatamente no canal privado sem resultados nem metadata extra', () => {
    limpar = iniciarSyncRolagemAoVivo();
    const canal = mocks.canais.get('dados')!;
    const inicio = { id: 'inicio-local', origem: 'Arthur', cor: '#888888', tipo: 'teste' as const, valores: [20], segredo: 'não transmitir' };
    useRolagemAoVivoStore.getState().definirInicio(inicio);
    expect(canal.send).toHaveBeenCalledOnce();
    expect(canal.send).toHaveBeenCalledWith({ type: 'broadcast', event: 'rolagem-inicio', payload: { inicio: { id: 'inicio-local', origem: 'Arthur', cor: '#888888', tipo: 'teste' } } });
    expect(canal.config).toEqual({ config: { broadcast: { self: false, ack: false }, private: true } });
    useRolagemAoVivoStore.getState().definirAtual({ ...rolagem, id: 'inicio-local' });
    expect(canal.send).toHaveBeenCalledTimes(2);
    expect(canal.send.mock.calls[1][0].payload.rolagem.id).toBe('inicio-local');
    expect(useRolagemAoVivoStore.getState().iniciando).toBeNull();
  });

  it('início remoto é validado e não retransmitido pelo aviso local', () => {
    limpar = iniciarSyncRolagemAoVivo();
    const canal = mocks.canais.get('dados')!;
    canal.callbacks.get('rolagem-inicio')!({ payload: { inicio: { id: 'invalido', origem: 'Arthur', tipo: 'teste' } } });
    expect(useRolagemAoVivoStore.getState().iniciando).toBeNull();
    canal.callbacks.get('rolagem-inicio')!({ payload: { inicio: { id: 'valido', origem: 'Arthur', tipo: 'teste', cor: '#888888', valores: [20] } } });
    expect(useRolagemAoVivoStore.getState().iniciando).toEqual({ id: 'valido', origem: 'Arthur', tipo: 'teste', cor: '#888888' });
    useRolagemAoVivoStore.getState().definirMostrando(true);
    expect(canal.send).not.toHaveBeenCalled();
  });

  it('ping sai imediatamente; um ping recebido não volta junto com o próximo clique local', () => {
    limpar = iniciarSyncPing();
    const canal = mocks.canais.get('ping')!;
    const ping = { id: 'remoto', autorId: 'outro', cor: '#888888', ponto: { x: 0.1, y: 0.2 }, criadoEm: 0 };
    canal.callbacks.get('ping')!({ payload: { ping } });
    usePingsStore.getState().adicionarPing({ ...ping, id: 'local', autorId: 'eu' });
    expect(canal.send).toHaveBeenCalledOnce();
    expect(canal.send.mock.calls[0][0].payload.ping.id).toBe('local');
  });

  it('aviso local de resultado não retransmite uma rolagem recebida', () => {
    limpar = iniciarSyncRolagemAoVivo();
    const canal = mocks.canais.get('dados')!;
    canal.callbacks.get('rolagem')!({ payload: { rolagem } });
    useRolagemAoVivoStore.getState().definirMostrando(true);
    expect(canal.send).not.toHaveBeenCalled();
    useRolagemAoVivoStore.getState().definirAtual({ ...rolagem, id: 'local' });
    expect(canal.send).toHaveBeenCalledOnce();
  });
});
