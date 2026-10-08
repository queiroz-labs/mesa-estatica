import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarNpcVazio } from '../state/factories';
import { useStore } from '../state/store';
import { retomarPendenciasPersistidas } from './filaPendencias';
import { paraLinhaPublico, paraNpcPublico, paraNpcSemNotasMestre, resolverReplayNpc } from './npcsSync';

const criarStorageFalso = () => {
  const dados = new Map<string, string>();
  return {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => {
      dados.set(chave, valor);
    },
  };
};

describe('resolverReplayNpc', () => {
  it('chave normal (id de npc) que ainda existe localmente devolve o npc pra reenviar', () => {
    const npc = { ...criarNpcVazio(), nome: 'Guarda 1' };
    expect(resolverReplayNpc(npc.id, [npc])).toEqual(npc);
  });

  it('chave normal que não existe mais localmente devolve null', () => {
    expect(resolverReplayNpc('sumiu', [criarNpcVazio()])).toBeNull();
  });

  it('chave "delete:<id>" sempre devolve \'apagar\'', () => {
    expect(resolverReplayNpc('delete:x', [criarNpcVazio()])).toBe('apagar');
    expect(resolverReplayNpc('delete:x', [])).toBe('apagar');
  });
});

describe('paraLinhaPublico / paraNpcSemNotasMestre', () => {
  it('round-trip preserva os campos públicos do NPC', () => {
    const npc = {
      ...criarNpcVazio(),
      nome: 'Guarda 1',
      corVisual: '#5a7d9a',
      silhueta: 'guarda',
      foto: 'data:image/jpeg;base64,xyz',
      pvAtual: 8,
      defesa: 12,
      visivel: true,
      notasMestre: 'segredo — nunca deve ir pra linha pública',
    };

    const linha = paraLinhaPublico(npc);
    const reconstruido = paraNpcSemNotasMestre(linha);

    expect(reconstruido).toEqual({
      id: npc.id,
      nome: 'Guarda 1',
      corVisual: '#5a7d9a',
      silhueta: 'guarda',
      foto: 'data:image/jpeg;base64,xyz',
      pvAtual: 8,
      pvMaximo: npc.pvMaximo,
      defesa: 12,
      agilidade: npc.agilidade,
      notas: npc.notas,
      categoria: npc.categoria,
      acoes: npc.acoes,
      visivel: true,
    });
    expect(reconstruido).not.toHaveProperty('notasMestre');
  });

  it('foto/silhueta null viram null na linha (não undefined)', () => {
    const npc = { ...criarNpcVazio(), foto: null, silhueta: null };
    const linha = paraLinhaPublico(npc);
    expect(linha.foto).toBeNull();
    expect(linha.silhueta).toBeNull();
  });
});

describe('paraNpcPublico', () => {
  it('traz só o que o jogador vê — nunca notasMestre, mesmo que a linha privada exista em algum lugar do fluxo', () => {
    const npc = { ...criarNpcVazio(), nome: 'Guarda 1', corVisual: '#5a7d9a', silhueta: 'guarda', foto: null, visivel: true };
    const linha = paraLinhaPublico(npc);
    const publico = paraNpcPublico(linha);

    expect(publico).toEqual({
      id: npc.id,
      nome: 'Guarda 1',
      corVisual: '#5a7d9a',
      silhueta: 'guarda',
      foto: null,
      visivel: true,
      notas: npc.notas,
    });
  });
});

// ===== guard de corrida (iniciarSyncNpcs) =====
const h = vi.hoisted(() => ({ clienteAtual: null as unknown }));
vi.mock('../lib/supabaseClient', () => ({
  get supabase() {
    return h.clienteAtual;
  },
}));
vi.mock('./visibilidadeNpcsSync', () => ({
  iniciarNotificacoesVisibilidadeNpcs: vi.fn(() => () => {}),
  notificarVisibilidadeNpcs: vi.fn(),
}));
vi.mock('../lib/statusMesa', () => ({
  assinarStatusCanal: vi.fn(() => vi.fn()),
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

const { iniciarSyncNpcs } = await import('./npcsSync');

function criarClienteComControle() {
  const resolvers: Array<(data: any) => void> = [];
  const handlers: Array<(payload: any) => void> = [];
  const subscribeCallbacks: Array<(status: string) => void> = [];

  function criarBuilder(): any {
    const builder: any = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => {
      return new Promise<any>((resolve) => {
        resolvers.push((data: any) => resolve({ data, error: null }));
      });
    });
    builder.then = (onFulfilled: (result: { data: any; error: null }) => void) => {
      return new Promise((resolve) => {
        resolvers.push((data: any) => {
          resolve(onFulfilled({ data, error: null }));
        });
      });
    };
    builder.insert = vi.fn(() => Promise.resolve({ error: null }));
    builder.upsert = vi.fn(() => Promise.resolve({ error: null }));
    builder.update = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }));
    builder.delete = vi.fn(() => ({
      eq: vi.fn(() => ({
        then: (cb: (r: any) => void) => cb({ error: null }),
      })),
      not: vi.fn(() => ({
        is: vi.fn(() => ({
          then: (cb: (r: any) => void) => cb({ error: null }),
        })),
      })),
    }));
    return builder;
  }

  const from = vi.fn(() => criarBuilder());

  const channelObj: any = {};
  channelObj.on = vi.fn((_event: string, _filter: object, handler: (payload: any) => void) => {
    handlers.push(handler);
    return channelObj;
  });
  channelObj.subscribe = vi.fn((cb: (status: string) => void) => {
    subscribeCallbacks.push(cb);
    cb('SUBSCRIBED');
    return channelObj;
  });
  const channel = vi.fn(() => channelObj);
  const removeChannel = vi.fn();

  return { from, channel, channelObj, handlers, resolvers, removeChannel, subscribeCallbacks };
}

function npcRemoto(id: string, nome: string) {
  return {
    id, nome, cor_visual: '#fff', silhueta: null, foto: null,
    pv_atual: 10, pv_maximo: 10, defesa: 10, agilidade: 1,
    notas: '', categoria: '', acoes: [], visivel: true,
  };
}

function linhasPrivadasVazias(npcId: string) {
  return { id: npcId, notas_mestre: '' };
}

describe('iniciarSyncNpcs — guard de corrida', () => {
  let mock: ReturnType<typeof criarClienteComControle>;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    useStore.setState(criarEstadoInicial());
    mock = criarClienteComControle();
    h.clienteAtual = {
      from: mock.from,
      channel: mock.channel,
      removeChannel: mock.removeChannel,
    };
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    h.clienteAtual = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('edição local concorrente vence o dado remoto obtido antes da edição', async () => {
    const npcId = 'npc-remoto-1';
    useStore.getState().adicionarNpc();
    const localId = useStore.getState().npcs[0].id;
    useStore.getState().atualizarNpc(localId, { nome: 'Guarda Local' });

    cleanup = iniciarSyncNpcs();

    // aguarda a microtask da busca inicial agendar os fetches
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));

    // resolve busca inicial (2 selects *)
    mock.resolvers[0]([]); // npcs_publico vazio
    mock.resolvers[1]([]); // npcs_privado vazio

    // dispara evento remoto (simula que outro cliente criou/alterou o npc-remoto-1)
    const handler = mock.handlers[0];
    expect(handler).toBeDefined();
    handler({ new: { id: npcId }, old: {} });

    // aguarda a microtask do handler → aplicarRemoto → buscarEMontar
    // buscarEMontar faz Promise.all de 2 maybeSingle (publico + privado)
    // isso empurra +2 resolvers (índices 2 e 3)
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));

    // ANTES de resolver o fetch remoto, edita localmente
    useStore.getState().atualizarNpc(localId, { nome: 'Guarda Editado Durante Fetch' });

    // resolve o fetch remoto com dados antigos
    mock.resolvers[2](npcRemoto(npcId, 'Guarda Remoto'));
    mock.resolvers[3](linhasPrivadasVazias(npcId));

    // deixa as promises resolverem — `expect` dentro do waitFor é o que faz ele repetir de
    // verdade até bater (ou estourar o timeout); um `return npcs.some(...)` sem `expect`
    // resolve na primeira checagem mesmo com falso, porque `vi.waitFor` só reage a exceção
    // lançada, não ao valor de retorno.
    await vi.waitFor(() => {
      expect(useStore.getState().npcs.some((n) => n.id === npcId)).toBe(true);
    });

    // a edição local deve ter sobrevivido
    const guardaLocal = useStore.getState().npcs.find((n) => n.id === localId);
    expect(guardaLocal?.nome).toBe('Guarda Editado Durante Fetch');
  });

  it('sem edição concorrente, dado remoto é aplicado normalmente', async () => {
    cleanup = iniciarSyncNpcs();

    // aguarda busca inicial
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([]);
    mock.resolvers[1]([]);

    const npcId = 'npc-remoto-2';
    const handler = mock.handlers[0];
    handler({ new: { id: npcId }, old: {} });

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));

    // resolve com dados remotos (sem edição local concorrente)
    mock.resolvers[2](npcRemoto(npcId, 'Guarda do Servidor'));
    mock.resolvers[3](linhasPrivadasVazias(npcId));

    await vi.waitFor(() => {
      expect(useStore.getState().npcs.some((n) => n.id === npcId && n.nome === 'Guarda do Servidor')).toBe(true);
    });
  });

  it('dois eventos (publico+privado) pro MESMO id no mesmo push fazem só um buscarEMontar (dedup de egress)', async () => {
    cleanup = iniciarSyncNpcs();

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([]);
    mock.resolvers[1]([]);

    const npcId = 'npc-dedup-1';
    // um único push de verdade escreve nas duas tabelas em sequência — cada uma dispara seu
    // próprio evento Realtime pro mesmo id, quase simultâneos.
    mock.handlers[0]({ new: { id: npcId }, old: {} }); // canal npcs_publico
    mock.handlers[1]({ new: { id: npcId }, old: {} }); // canal npcs_privado

    // um buscarEMontar (2 selects: publico+privado) — não dois buscarEMontar (4 selects).
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));
    await Promise.resolve();
    expect(mock.resolvers.length).toBe(4);

    mock.resolvers[2](npcRemoto(npcId, 'Guarda Dedup'));
    mock.resolvers[3](linhasPrivadasVazias(npcId));

    await vi.waitFor(() => {
      expect(useStore.getState().npcs.some((n) => n.id === npcId && n.nome === 'Guarda Dedup')).toBe(true);
    });
  });

  it('marca "em voo" no momento em que agenda o push — antes do debounce (ATRASO_PUSH_MS) disparar', () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', criarStorageFalso());

    useStore.getState().adicionarNpc();
    const localId = useStore.getState().npcs[0].id;
    cleanup = iniciarSyncNpcs();

    useStore.getState().atualizarNpc(localId, { nome: 'Guarda' });

    // o timer do debounce nem chegou a disparar (fake timers, nunca avançados) — se a marca já
    // existe aqui, uma aba fechada NESSE exato meio-tempo não perde a edição (achado de 23/08).
    expect(retomarPendenciasPersistidas('npcs-sync')).toContain(localId);
  });

  it('canal cai e reconecta atualiza NPC JÁ carregado localmente (não só o que falta)', async () => {
    const npcId = 'npc-reconexao';
    cleanup = iniciarSyncNpcs();

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([npcRemoto(npcId, 'Guarda')]);
    mock.resolvers[1]([linhasPrivadasVazias(npcId)]);
    await vi.waitFor(() => expect(useStore.getState().npcs.some((n) => n.id === npcId)).toBe(true));
    expect(useStore.getState().npcs.find((n) => n.id === npcId)?.pvAtual).toBe(10);

    // canal cai e reconecta — o mestre baixou o PV dele enquanto este cliente estava
    // desconectado, sem nenhum evento `postgres_changes` chegar aqui.
    mock.subscribeCallbacks[0]('CHANNEL_ERROR');
    mock.subscribeCallbacks[0]('SUBSCRIBED');

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));
    mock.resolvers[2]([{ ...npcRemoto(npcId, 'Guarda'), pv_atual: 2 }]);
    mock.resolvers[3]([linhasPrivadasVazias(npcId)]);

    await vi.waitFor(() => {
      expect(useStore.getState().npcs.find((n) => n.id === npcId)?.pvAtual).toBe(2);
    });
  });

  it('refetch de reconexão aplica uma mesa genuinamente vazia (reset-mesa), não só "não achei esse NPC"', async () => {
    const npcId = 'npc-que-sera-resetado';
    cleanup = iniciarSyncNpcs();

    // busca inicial já traz o NPC (mount anterior ao reset)
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([npcRemoto(npcId, 'Guarda')]);
    mock.resolvers[1]([linhasPrivadasVazias(npcId)]);
    await vi.waitFor(() => expect(useStore.getState().npcs.some((n) => n.id === npcId)).toBe(true));

    // canal cai e reconecta — nesse meio-tempo o mestre rodou "sessão limpa" (reset-mesa),
    // então o servidor agora responde 0 linhas de verdade, não um erro de query.
    mock.subscribeCallbacks[0]('CHANNEL_ERROR');
    mock.subscribeCallbacks[0]('SUBSCRIBED');

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));
    mock.resolvers[2]([]); // npcs_publico genuinamente vazio
    mock.resolvers[3]([]); // npcs_privado genuinamente vazio

    await vi.waitFor(() => {
      expect(useStore.getState().npcs.some((n) => n.id === npcId)).toBe(false);
    });
  });
});
