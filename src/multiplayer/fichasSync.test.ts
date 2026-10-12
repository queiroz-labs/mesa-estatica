import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia } from '../state/factories';
import { useStore } from '../state/store';
import { retomarPendenciasPersistidas } from './filaPendencias';
import { paraFichaPublica, paraLinhaPublico, resolverReplayFicha } from './fichasSync';

const criarStorageFalso = () => {
  const dados = new Map<string, string>();
  return {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => {
      dados.set(chave, valor);
    },
  };
};

describe('resolverReplayFicha', () => {
  it('chave normal (id de ficha) que ainda existe localmente devolve a ficha pra reenviar', () => {
    const ficha = { ...criarFichaVazia(), nome: 'Helena' };
    expect(resolverReplayFicha(ficha.id, [ficha])).toEqual(ficha);
  });

  it('chave normal que não existe mais localmente devolve null', () => {
    expect(resolverReplayFicha('sumiu', [criarFichaVazia()])).toBeNull();
  });

  it('chave "delete:<id>" sempre devolve \'apagar\'', () => {
    expect(resolverReplayFicha('delete:x', [criarFichaVazia()])).toBe('apagar');
    expect(resolverReplayFicha('delete:x', [])).toBe('apagar');
  });
});

describe('paraLinhaPublico / paraFichaPublica', () => {
  it('round-trip preserva id/nome/corVisual/foto (o que FichaPublica cobre)', () => {
    const ficha = {
      ...criarFichaVazia(),
      nome: 'Helena',
      corVisual: '#4fc1d4',
      foto: 'data:image/jpeg;base64,xyz',
    };
    const linha = paraLinhaPublico(ficha, 20);
    expect(linha.id).toBe(ficha.id);
    expect(linha.nome).toBe('Helena');
    expect(linha.cor_visual).toBe('#4fc1d4');
    expect(linha.foto).toBe('data:image/jpeg;base64,xyz');

    const publica = paraFichaPublica(linha);
    expect(publica).toEqual({ id: ficha.id, nome: 'Helena', corVisual: '#4fc1d4', foto: 'data:image/jpeg;base64,xyz', estadoCombate: { desacordado: false, morto: false } });
  });

  it('calcula pv_maximo e defesa a partir dos atributos e basePV, não copia da ficha', () => {
    const ficha = { ...criarFichaVazia(), atributos: { ...criarFichaVazia().atributos, vigor: 3, agilidade: 2 } };
    const linha = paraLinhaPublico(ficha, 20);
    expect(linha.pv_maximo).toBe(20 + 5 * 3);
    expect(linha.defesa).toBe(10 + 2 + ficha.equipamentoModificadorDefesa);
  });

  it('foto null vira null na linha (não undefined)', () => {
    const linha = paraLinhaPublico({ ...criarFichaVazia(), foto: null }, 20);
    expect(linha.foto).toBeNull();
    expect(paraFichaPublica(linha).foto).toBeNull();
  });

  it.each([
    { pvAtual: 1, desacordado: false, morto: false },
    { pvAtual: 0, desacordado: true, morto: false },
    { pvAtual: -9, desacordado: true, morto: false },
    { pvAtual: -10, desacordado: true, morto: true },
  ])('deriva o estado com PV=$pvAtual sem expor PV no objeto público da interface', ({ pvAtual, desacordado, morto }) => {
    const ficha = criarFichaVazia();
    const publica = paraFichaPublica(paraLinhaPublico({ ...ficha, pvAtual, atributos: { ...ficha.atributos, vigor: 0 } }, 20));
    expect(publica.estadoCombate).toEqual({ desacordado, morto });
    expect(Object.keys(publica).sort()).toEqual(['id', 'nome', 'corVisual', 'foto', 'estadoCombate'].sort());
  });
});

// ===== guard de corrida (iniciarSyncFichas) =====
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

const { iniciarSyncFichas } = await import('./fichasSync');

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
      eq: vi.fn(() => ({
        then: (cb: (r: any) => void) => cb({ error: null }),
      })),
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

function fichaRemotaPublica(id: string, nome: string) {
  return {
    id, nome, cor_visual: '#4fc1d4', foto: null,
    pv_atual: 20, pv_maximo: 35, defesa: 10,
    surtos_ativos: [],
  };
}

function fichaRemotaPrivada(id: string) {
  return {
    id,
    owner_token: 'tok-' + id,
    auth_uid: null,
    dados: {
      jogador: '',
      antecedenteId: null,
      motivo: '',
      perguntaQueTeDefine: '',
      respostaPergunta: '',
      gancho: '',
      vinculos: [],
      atributos: { vigor: 2, agilidade: 1, intelecto: 1, percepcao: 1, presenca: 1, vontade: 1 },
      pericias: {},
      determinacao: 1,
      sanidadeAtual: 10,
      traumas: [],
      kitAntecedente: '',
      contatoOuRecurso: '',
      outrosItens: '',
      armas: [],
      reguladores: [],
      acessos: 0,
      anestesiaAte: null,
      dinheiroReal: 500,
      dinheiroPonto: 800,
      anotacoes: '',
      pvAtual: 20,
      surtosAtivos: [],
    },
  };
}

/** Shape real do `select('dados')` em `characters_privado` (owner_token/auth_uid nunca são
 *  lidos por fichasSync.ts — só a Edge Function vincular-jogador os usa, via service_role) —
 *  garante que `buscarEMontar`/`buscarTodas` continuam montando a Ficha certa com esse select
 *  mais estreito, não só com o `select('*')` antigo que os outros helpers acima simulam. */
function fichaRemotaPrivadaEstreita(id: string) {
  return { dados: fichaRemotaPrivada(id).dados };
}

describe('iniciarSyncFichas — guard de corrida', () => {
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
    const fichaId = 'ficha-remota-1';
    useStore.getState().adicionarFicha();
    const localId = useStore.getState().fichas[0].id;
    useStore.getState().atualizarFicha(localId, { nome: 'Helena Local' });

    cleanup = iniciarSyncFichas();

    // aguarda a microtask da busca inicial agendar os fetches
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([]); // characters_publico vazio
    mock.resolvers[1]([]); // characters_privado vazio

    // dispara evento remoto
    const handler = mock.handlers[0];
    expect(handler).toBeDefined();
    handler({ new: { id: fichaId }, old: {} });

    // aguarda buscarEMontar iniciar (2 maybeSingle: publico + privado)
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));

    // edita localmente ANTES do fetch remoto resolver
    useStore.getState().atualizarFicha(localId, { nome: 'Helena Editada Durante Fetch' });

    // resolve o fetch remoto com dados antigos
    mock.resolvers[2](fichaRemotaPublica(fichaId, 'Helena Remota'));
    mock.resolvers[3](fichaRemotaPrivada(fichaId));

    await vi.waitFor(() => {
      expect(useStore.getState().fichas.some((f) => f.id === fichaId)).toBe(true);
    });

    const helenaLocal = useStore.getState().fichas.find((f) => f.id === localId);
    expect(helenaLocal?.nome).toBe('Helena Editada Durante Fetch');
  });

  it('sem edição concorrente, dado remoto é aplicado normalmente', async () => {
    cleanup = iniciarSyncFichas();

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([]);
    mock.resolvers[1]([]);

    const fichaId = 'ficha-remota-2';
    const handler = mock.handlers[0];
    handler({ new: { id: fichaId }, old: {} });

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));

    mock.resolvers[2](fichaRemotaPublica(fichaId, 'Helena do Servidor'));
    mock.resolvers[3](fichaRemotaPrivada(fichaId));

    await vi.waitFor(() => {
      expect(useStore.getState().fichas.some((f) => f.id === fichaId && f.nome === 'Helena do Servidor')).toBe(true);
    });
  });

  it('dois eventos (publico+privado) pro MESMO id no mesmo push fazem só um buscarEMontar (dedup de egress)', async () => {
    cleanup = iniciarSyncFichas();

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([]);
    mock.resolvers[1]([]);

    const fichaId = 'ficha-dedup-1';
    // um único push de verdade escreve nas duas tabelas em sequência — cada uma dispara seu
    // próprio evento Realtime pro mesmo id, quase simultâneos.
    mock.handlers[0]({ new: { id: fichaId }, old: {} }); // canal characters_publico
    mock.handlers[1]({ new: { id: fichaId }, old: {} }); // canal characters_privado

    // um buscarEMontar (2 selects: publico+privado) — não dois buscarEMontar (4 selects).
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));
    await Promise.resolve();
    expect(mock.resolvers.length).toBe(4);

    mock.resolvers[2](fichaRemotaPublica(fichaId, 'Helena Dedup'));
    mock.resolvers[3](fichaRemotaPrivada(fichaId));

    await vi.waitFor(() => {
      expect(useStore.getState().fichas.some((f) => f.id === fichaId && f.nome === 'Helena Dedup')).toBe(true);
    });
  });

  it('monta a ficha corretamente com o select estreito de characters_privado (só {dados}, sem owner_token/auth_uid)', async () => {
    cleanup = iniciarSyncFichas();

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([]);
    mock.resolvers[1]([]);

    const fichaId = 'ficha-remota-select-estreito';
    const handler = mock.handlers[0];
    handler({ new: { id: fichaId }, old: {} });

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));

    mock.resolvers[2](fichaRemotaPublica(fichaId, 'Helena Estreita'));
    mock.resolvers[3](fichaRemotaPrivadaEstreita(fichaId));

    // `expect` dentro do waitFor é o que faz ele de fato repetir até a condição bater (ou
    // estourar o timeout) — um `return fichas.some(...)` sem `expect` resolve na primeira
    // checagem mesmo que dê falso, porque `vi.waitFor` só reage a exceção lançada, não ao
    // valor de retorno (achado depurando esta mudança: os testes de guarda de corrida
    // pré-existentes tinham exatamente esse padrão vazio na última espera — corrigidos também).
    await vi.waitFor(() => {
      expect(useStore.getState().fichas.some((f) => f.id === fichaId)).toBe(true);
    });

    const ficha = useStore.getState().fichas.find((f) => f.id === fichaId);
    expect(ficha?.nome).toBe('Helena Estreita');
    expect(ficha?.atributos.vigor).toBe(2);
    expect(ficha?.determinacao).toBe(1);
  });

  it('busca inicial (buscarTodas) monta fichas certas com o select estreito de characters_privado', async () => {
    const fichaId = 'ficha-busca-inicial-estreita';
    cleanup = iniciarSyncFichas();

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([fichaRemotaPublica(fichaId, 'Helena da Busca Inicial')]);
    mock.resolvers[1]([{ id: fichaId, ...fichaRemotaPrivadaEstreita(fichaId) }]);

    await vi.waitFor(() => {
      expect(useStore.getState().fichas.some((f) => f.id === fichaId)).toBe(true);
    });

    const ficha = useStore.getState().fichas.find((f) => f.id === fichaId);
    expect(ficha?.nome).toBe('Helena da Busca Inicial');
    expect(ficha?.atributos.vigor).toBe(2);
  });

  it('marca "em voo" no momento em que agenda o push — antes do debounce (ATRASO_PUSH_MS) disparar', () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', criarStorageFalso());

    useStore.getState().adicionarFicha();
    const localId = useStore.getState().fichas[0].id;
    cleanup = iniciarSyncFichas();

    useStore.getState().atualizarFicha(localId, { nome: 'Helena' });

    // o timer do debounce nem chegou a disparar (fake timers, nunca avançados) — se a marca já
    // existe aqui, uma aba fechada NESSE exato meio-tempo não perde a edição (achado de 23/08).
    expect(retomarPendenciasPersistidas('fichas-sync')).toContain(localId);
  });

  it('canal cai e reconecta atualiza ficha JÁ carregada localmente (não só a que falta)', async () => {
    const fichaId = 'ficha-reconexao';
    cleanup = iniciarSyncFichas();

    // busca inicial já traz a ficha (simula um mount que já achou ela na primeira carga)
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([fichaRemotaPublica(fichaId, 'Helena')]);
    mock.resolvers[1]([{ id: fichaId, ...fichaRemotaPrivadaEstreita(fichaId) }]);
    await vi.waitFor(() => expect(useStore.getState().fichas.some((f) => f.id === fichaId)).toBe(true));
    expect(useStore.getState().fichas.find((f) => f.id === fichaId)?.pvAtual).toBe(20);

    // canal cai e reconecta — SEM nenhum evento `postgres_changes` (o cenário que o Realtime
    // não cobre: o mestre baixou o PV dela enquanto este cliente estava desconectado).
    mock.subscribeCallbacks[0]('CHANNEL_ERROR');
    mock.subscribeCallbacks[0]('SUBSCRIBED');

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));
    mock.resolvers[2]([{ ...fichaRemotaPublica(fichaId, 'Helena'), pv_atual: 3 }]);
    mock.resolvers[3]([{ id: fichaId, ...fichaRemotaPrivadaEstreita(fichaId) }]);

    await vi.waitFor(() => {
      expect(useStore.getState().fichas.find((f) => f.id === fichaId)?.pvAtual).toBe(3);
    });
  });

  it('refetch de reconexão nunca sobrescreve uma edição local ainda pendente de push', async () => {
    vi.stubGlobal('localStorage', criarStorageFalso());
    const fichaId = 'ficha-pendente';
    cleanup = iniciarSyncFichas();

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([fichaRemotaPublica(fichaId, 'Helena')]);
    mock.resolvers[1]([{ id: fichaId, ...fichaRemotaPrivadaEstreita(fichaId) }]);
    await vi.waitFor(() => expect(useStore.getState().fichas.some((f) => f.id === fichaId)).toBe(true));

    // edição local ainda não confirmada no servidor (marcada em `pendencias` pelo subscriber,
    // debounce nem disparou)
    useStore.getState().atualizarFicha(fichaId, { nome: 'Helena Editando Agora' });
    expect(retomarPendenciasPersistidas('fichas-sync')).toContain(fichaId);

    mock.subscribeCallbacks[0]('CHANNEL_ERROR');
    mock.subscribeCallbacks[0]('SUBSCRIBED');

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));
    mock.resolvers[2]([fichaRemotaPublica(fichaId, 'Helena (dado velho do servidor)')]);
    mock.resolvers[3]([{ id: fichaId, ...fichaRemotaPrivadaEstreita(fichaId) }]);

    await new Promise((r) => setTimeout(r, 0));
    expect(useStore.getState().fichas.find((f) => f.id === fichaId)?.nome).toBe('Helena Editando Agora');
  });

  it('refetch de reconexão aplica uma mesa genuinamente vazia (reset-mesa), não só "não achei essa ficha"', async () => {
    const fichaId = 'ficha-que-sera-resetada';
    cleanup = iniciarSyncFichas();

    // busca inicial já traz a ficha (mount anterior ao reset)
    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(2));
    mock.resolvers[0]([fichaRemotaPublica(fichaId, 'Helena')]);
    mock.resolvers[1]([{ id: fichaId, ...fichaRemotaPrivadaEstreita(fichaId) }]);
    await vi.waitFor(() => expect(useStore.getState().fichas.some((f) => f.id === fichaId)).toBe(true));

    // canal cai e reconecta — nesse meio-tempo o mestre rodou "sessão limpa" (reset-mesa),
    // então o servidor agora responde 0 linhas de verdade, não um erro de query.
    mock.subscribeCallbacks[0]('CHANNEL_ERROR');
    mock.subscribeCallbacks[0]('SUBSCRIBED');

    await vi.waitFor(() => expect(mock.resolvers.length).toBeGreaterThanOrEqual(4));
    mock.resolvers[2]([]); // characters_publico genuinamente vazio
    mock.resolvers[3]([]); // characters_privado genuinamente vazio

    await vi.waitFor(() => {
      expect(useStore.getState().fichas.some((f) => f.id === fichaId)).toBe(false);
    });
  });
});
