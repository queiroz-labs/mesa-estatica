import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FaixaMidia } from '../state/types';
import { criarEstadoInicial } from '../state/factories';
import { useStore } from '../state/store';
import { paraFaixa, paraLinha, resolverReplayFaixa } from './midiaFaixasSync';

describe('paraLinha / paraFaixa', () => {
  it('round-trip preserva os campos da faixa', () => {
    const faixa: FaixaMidia = {
      id: 'f1',
      nome: 'Tema da cena',
      path: 'midia/tema.mp3',
      url: 'https://exemplo.supabase.co/storage/v1/object/public/midia/tema.mp3',
      ordem: 3,
      criadoEm: '2026-07-20T10:00:00.000Z',
    };
    const linha = paraLinha(faixa);
    expect(linha).toEqual({
      id: 'f1',
      nome: 'Tema da cena',
      storage_path: 'midia/tema.mp3',
      url: faixa.url,
      ordem: 3,
      criado_em: '2026-07-20T10:00:00.000Z',
      tag: null,
    });

    expect(paraFaixa(linha)).toEqual(faixa);
  });

  it('round-trip preserva a tag quando definida', () => {
    const faixa: FaixaMidia = {
      id: 'f2',
      nome: 'Tensão',
      path: 'midia/tensao.mp3',
      url: 'https://exemplo.supabase.co/storage/v1/object/public/midia/tensao.mp3',
      ordem: 0,
      criadoEm: '2026-07-20T10:00:00.000Z',
      tag: 'tensão',
    };
    const linha = paraLinha(faixa);
    expect(linha.tag).toBe('tensão');
    expect(paraFaixa(linha)).toEqual(faixa);
  });
});

describe('resolverReplayFaixa', () => {
  const faixa: FaixaMidia = { id: 'f1', nome: 'Tema', path: 'midia/tema.mp3', url: 'https://x/tema.mp3', ordem: 0, criadoEm: '2026-07-20T10:00:00.000Z' };

  it('chave normal (id de faixa) que ainda existe localmente devolve a faixa pra reenviar', () => {
    expect(resolverReplayFaixa('f1', [faixa])).toEqual(faixa);
  });

  it('chave normal que não existe mais localmente devolve null', () => {
    expect(resolverReplayFaixa('sumiu', [faixa])).toBeNull();
  });

  it('chave "delete:<id>" sempre devolve \'apagar\'', () => {
    expect(resolverReplayFaixa('delete:x', [faixa])).toBe('apagar');
    expect(resolverReplayFaixa('delete:x', [])).toBe('apagar');
  });
});

// ===== marcarEmVoo na janela do debounce (iniciarSyncMidiaFaixas) =====
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

const { iniciarSyncMidiaFaixas } = await import('./midiaFaixasSync');
const { retomarPendenciasPersistidas } = await import('./filaPendencias');

/** Cliente mínimo — só o suficiente pra `iniciarSyncMidiaFaixas()` montar sem lançar. Não
 *  precisa simular sucesso/falha de rede porque o teste abaixo nunca deixa o debounce disparar. */
function criarClienteMinimo() {
  const resolvido = { data: null, error: null };
  const builder: any = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.then = (resolve: (r: typeof resolvido) => unknown) => Promise.resolve(resolvido).then(resolve);
  builder.upsert = () => Promise.resolve({ error: null });
  builder.delete = () => builder;

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

describe('iniciarSyncMidiaFaixas — marca "em voo" antes do debounce disparar', () => {
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

  it('marca "em voo" no momento em que agenda o upsert — antes do debounce (ATRASO_PUSH_MS) disparar', () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', criarStorageFalso());

    cleanup = iniciarSyncMidiaFaixas();
    const id = useStore.getState().adicionarFaixaMidia('Tema', 'midia/tema.mp3', 'https://x/tema.mp3');

    // o timer do debounce nem chegou a disparar (fake timers, nunca avançados) — se a marca já
    // existe aqui, uma aba fechada NESSE exato meio-tempo não perde a faixa (achado de 23/08).
    expect(retomarPendenciasPersistidas('midia-faixas-sync')).toContain(id);
  });
});
