import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarEstadoMidia } from '../state/factories';
import { useStore } from '../state/store';
import { paraEstadoMidia, paraLinha, type PatchEstadoMidia } from './midiaEstadoSync';

describe('paraLinha / paraEstadoMidia', () => {
  it('round-trip preserva o estado de playback', () => {
    const { atualizadoEm } = criarEstadoMidia();
    const midia: PatchEstadoMidia = {
      faixaAtualId: 'faixa-1',
      tocando: true,
      posicaoSegundos: 42.5,
      modoLoop: 'faixa',
      atualizadoEm,
      volume: 0.6,
    };
    const linha = paraLinha(midia);
    expect(linha).toEqual({
      faixa_atual_id: 'faixa-1',
      tocando: true,
      posicao_segundos: 42.5,
      modo_loop: 'faixa',
      atualizado_em: midia.atualizadoEm,
      volume: 0.6,
    });

    const reconstruido = paraEstadoMidia({ id: 'midia', ...linha });
    expect(reconstruido).toEqual(midia);
  });

  it('faixaAtualId null (nenhuma faixa tocando) sobrevive ao round-trip', () => {
    const midia: PatchEstadoMidia = { ...criarEstadoMidia(), faixaAtualId: null };
    const linha = paraLinha(midia);
    expect(linha.faixa_atual_id).toBeNull();
    expect(paraEstadoMidia({ id: 'midia', ...linha }).faixaAtualId).toBeNull();
  });
});

// ===== marcarEmVoo na janela do debounce (iniciarSyncMidiaEstado) =====
const h = vi.hoisted(() => ({ clienteAtual: null as unknown }));
vi.mock('../lib/supabaseClient', () => ({
  get supabase() {
    return h.clienteAtual;
  },
}));
vi.mock('../lib/statusMesa', () => ({
  assinarStatusCanal: vi.fn(() => vi.fn()),
  // mesma lógica de edge-detection do real (statusMesa.ts), reimplementada aqui como nos
  // outros mocks deste projeto — evita depender do módulo de verdade.
  assinarStatusCanalComRefetch: vi.fn((_nome: string, refetch: () => void | Promise<void>) => {
    let viuErro = false;
    return (status: string) => {
      if (status === 'SUBSCRIBED') {
        if (viuErro) void refetch();
        viuErro = false;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        viuErro = true;
      }
    };
  }),
  desconectarCanal: vi.fn(),
  useStatusMesa: {
    getState: vi.fn(() => ({ canaisConectados: new Set(), canaisComErro: new Set() })),
    setState: vi.fn(),
    subscribe: vi.fn(),
  },
}));

const { iniciarSyncMidiaEstado } = await import('./midiaEstadoSync');
const { retomarPendenciasPersistidas } = await import('./filaPendencias');

/** Cliente mínimo — só o suficiente pra `iniciarSyncMidiaEstado()` montar sem lançar. Não
 *  precisa simular sucesso/falha de rede porque o teste abaixo nunca deixa o debounce disparar. */
function criarClienteMinimo() {
  const resolvido = { data: null, error: null };
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.maybeSingle = () => Promise.resolve(resolvido);
  builder.upsert = () => Promise.resolve({ error: null });

  const channelObj: any = {};
  channelObj.on = () => channelObj;
  channelObj.subscribe = (cb?: (status: string) => void) => {
    cb?.('SUBSCRIBED');
    return channelObj;
  };

  return { from: () => builder, channel: () => channelObj, removeChannel: () => {} };
}

function criarStorageFalso() {
  const dados = new Map<string, string>();
  return {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => {
      dados.set(chave, valor);
    },
  };
}

describe('iniciarSyncMidiaEstado — marca "em voo" antes do debounce disparar', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    useStore.setState(criarEstadoInicial());
    h.clienteAtual = criarClienteMinimo();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    h.clienteAtual = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('marca "em voo" (chave fixa "midia") no momento em que agenda o push — antes do debounce disparar', () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', criarStorageFalso());

    cleanup = iniciarSyncMidiaEstado();
    useStore.setState((s) => ({ midia: { ...s.midia, tocando: true } }));

    // o timer do debounce nem chegou a disparar (fake timers, nunca avançados) — se a marca já
    // existe aqui, uma aba fechada NESSE exato meio-tempo não perde o estado (achado de 23/08).
    expect(retomarPendenciasPersistidas('midia-estado-sync')).toContain('midia');
  });
});

// ===== eco remoto durante a janela de debounce não reverte a ação local (achado pré-sessão) =====
describe('iniciarSyncMidiaEstado — eco remoto atrasado não reverte clique local em voo', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    useStore.setState(criarEstadoInicial());
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    h.clienteAtual = null;
    vi.restoreAllMocks();
  });

  it('play seguido de pause rápido: eco do 1o push (play) não desfaz o pause ainda não pushado', () => {
    let handlerPostgresChanges: ((payload: { new: unknown }) => void) | undefined;

    const builder: any = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
    builder.upsert = () => Promise.resolve({ error: null });

    const channelObj: any = {};
    channelObj.on = (_evento: string, _filtro: unknown, handler: (payload: { new: unknown }) => void) => {
      handlerPostgresChanges = handler;
      return channelObj;
    };
    channelObj.subscribe = (cb?: (status: string) => void) => {
      cb?.('SUBSCRIBED');
      return channelObj;
    };

    h.clienteAtual = { from: () => builder, channel: () => channelObj, removeChannel: () => {} };
    cleanup = iniciarSyncMidiaEstado();

    // clica "play" — agenda o push (debounce 150ms ainda não disparou).
    useStore.setState((s) => ({ midia: { ...s.midia, tocando: true } }));
    // clica "pause" logo em seguida, ainda dentro da janela de debounce.
    useStore.setState((s) => ({ midia: { ...s.midia, tocando: false } }));

    // eco Realtime do push do "play" chega ANTES do debounce do "pause" disparar.
    handlerPostgresChanges?.({ new: { id: 'midia', ...paraLinha({ ...useStore.getState().midia, tocando: true }) } });

    expect(useStore.getState().midia.tocando).toBe(false);
  });
});

// ===== restart do loop individual (achado 31/08: mestre ouvia, jogadores não) =====
describe('iniciarSyncMidiaEstado — restart do loop individual sempre agenda push', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    useStore.setState(criarEstadoInicial());
    h.clienteAtual = criarClienteMinimo();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    h.clienteAtual = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('atualizarEstadoMidia com os mesmos valores de antes (tocando/posicaoSegundos) ainda marca "em voo"', () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', criarStorageFalso());

    useStore.setState((s) => ({
      midia: { ...s.midia, faixaAtualId: 'faixa-1', tocando: true, posicaoSegundos: 0 },
    }));
    cleanup = iniciarSyncMidiaEstado();

    // simula o handler `aoTerminar` do loop individual: reseta pra posicaoSegundos 0/tocando
    // true, os MESMOS valores que já estavam — só atualizadoEm muda.
    useStore.getState().atualizarEstadoMidia({ posicaoSegundos: 0, tocando: true });

    expect(retomarPendenciasPersistidas('midia-estado-sync')).toContain('midia');
  });
});

describe('sincronização da ambiência', () => {
  afterEach(() => { h.clienteAtual = null; vi.useRealTimers(); });

  it('envia biblioteca, transporte e volume de ambiência junto do estado musical intacto', async () => {
    vi.useFakeTimers();
    useStore.setState(criarEstadoInicial());
    const cliente = criarClienteMinimo();
    const builder = cliente.from();
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    builder.upsert = upsert;
    cliente.from = () => builder;
    h.clienteAtual = cliente;
    const parar = iniciarSyncMidiaEstado();
    const id = useStore.getState().adicionarFaixaAmbiencia('chuva', 'sfx/chuva.wav', 'https://audio.test/chuva.wav');
    useStore.getState().atualizarEstadoAmbiencia({ faixaAtualId: id, tocando: true });
    useStore.getState().definirVolumeAmbiencia(0.3);
    await vi.advanceTimersByTimeAsync(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      tocando: false, volume: 0.8, ambiencia: expect.objectContaining({ faixaAtualId: id, tocando: true, volume: 0.3 }),
    }));
    parar();
  });

  it('resposta de push antigo não permite que eco remoto apague um pause mais novo', async () => {
    vi.useFakeTimers();
    useStore.setState(criarEstadoInicial());
    const cliente = criarClienteMinimo();
    const builder = cliente.from();
    let concluir!: (r: { error: null }) => void;
    builder.upsert = () => new Promise((resolve) => { concluir = resolve; });
    cliente.from = () => builder;
    const canal = cliente.channel();
    let receber!: (payload: { new: unknown }) => void;
    canal.on = (_: unknown, __: unknown, handler: typeof receber) => { receber = handler; return canal; };
    cliente.channel = () => canal;
    h.clienteAtual = cliente;
    const parar = iniciarSyncMidiaEstado();
    const id = useStore.getState().adicionarFaixaAmbiencia('chuva', 'sfx/chuva.wav', 'https://audio.test/chuva.wav');
    useStore.getState().atualizarEstadoAmbiencia({ faixaAtualId: id, tocando: true });
    await vi.advanceTimersByTimeAsync(150);
    const antiga = useStore.getState().ambiencia;
    useStore.getState().atualizarEstadoAmbiencia({ tocando: false, posicaoSegundos: 2 });
    concluir({ error: null });
    await Promise.resolve();
    receber({ new: { id: 'midia', ...paraLinha(useStore.getState().midia), ambiencia: antiga } });
    expect(useStore.getState().ambiencia.tocando).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    concluir({ error: null });
    await Promise.resolve();
    parar();
  });
});
