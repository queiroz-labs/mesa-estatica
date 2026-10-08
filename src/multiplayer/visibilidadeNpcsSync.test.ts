import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  cliente: null as any,
  efeitos: [] as Array<() => void | (() => void)>,
  estados: [] as any[],
}));
vi.mock('../lib/supabaseClient', () => ({ get supabase() { return h.cliente; } }));
vi.mock('react', async (original) => ({
  ...await original<any>(),
  useEffect: (efeito: () => void | (() => void)) => { h.efeitos.push(efeito); },
  useState: (inicial: any) => {
    const indice = h.estados.length;
    h.estados.push(inicial);
    return [inicial, (novo: any) => { h.estados[indice] = typeof novo === 'function' ? novo(h.estados[indice]) : novo; }];
  },
}));
vi.mock('../lib/statusMesa', async (original) => ({
  ...await original<any>(),
  assinarStatusCanal: () => () => {},
  assinarStatusCanalComRefetch: (_nome: string, refetch: () => void) => {
    let erro = false;
    return (status: string) => {
      if (status === 'SUBSCRIBED' && erro) void refetch();
      erro = status !== 'SUBSCRIBED';
    };
  },
  desconectarCanal: () => {},
}));
import { useIniciativaPublica, useNpcsPublicos } from './hidratacaoJogador';
import { iniciarNotificacoesVisibilidadeNpcs, notificarVisibilidadeNpcs } from './visibilidadeNpcsSync';
import { resolverPendencia, tentarTodasPendencias, usePendenciasStore } from './filaPendencias';

const npc = {
  id: 'npc', nome: 'Segredo', cor_visual: '#fff', foto: null, silhueta: null,
  notas: '', visivel: true,
};
const entrada = { id: 'entrada', participante_id: 'npc', tipo: 'npc', nome: 'Segredo', valor: 20, posicao: 0 };
let consultas: Array<{ tabela: string; resolver: (linhas: any[]) => void }>;
let canais: Map<string, any>;
let paradas: Array<() => void>;

beforeEach(() => {
  h.efeitos = []; h.estados = []; consultas = []; canais = new Map(); paradas = [];
  h.cliente = {
    from: (tabela: string) => {
      const b: any = {};
      b.select = () => b; b.order = () => b;
      b.then = (cb: (r: any) => any) => new Promise((resolve) => {
        consultas.push({ tabela, resolver: (data) => resolve(cb({ data, error: null })) });
      });
      return b;
    },
    channel: vi.fn((nome: string) => {
      const c: any = { handlers: new Map(), status: () => {}, send: vi.fn(() => Promise.resolve('ok')) };
      c.on = (tipo: string, _filtro: any, callback: any) => { c.handlers.set(tipo, callback); return c; };
      c.subscribe = (callback: any) => { c.status = callback; return c; };
      canais.set(nome, c);
      return c;
    }),
    removeChannel: vi.fn(),
  };
});
afterEach(() => {
  paradas.forEach((parar) => parar());
  resolverPendencia('npcs-visibilidade', 'visibilidade');
  h.cliente = null;
});

function MontarJogador() {
  useNpcsPublicos(); useIniciativaPublica();
  for (const efeito of h.efeitos) {
    const parar = efeito();
    if (parar) paradas.push(parar);
  }
}
async function responder(consulta: typeof consultas[number], linhas: any[]) {
  consulta.resolver(linhas);
  await Promise.resolve();
}
async function carregarVisivel() {
  await responder(consultas[0], [npc]);
  await responder(consultas[1], [entrada]);
  expect(h.estados.map((itens) => itens.length)).toEqual([1, 1]);
}
function invalidar() { canais.get('npcs-visibilidade').handlers.get('broadcast')({ payload: {} }); }

it('ocultar NPC carregado retira NPC e iniciativa sem precisar receber UPDATE negado pela RLS', async () => {
  MontarJogador(); await carregarVisivel();
  invalidar();
  expect(consultas.slice(2).map((q) => q.tabela)).toEqual(['npcs_publico', 'iniciativa']);
  await responder(consultas[2], []); await responder(consultas[3], []);
  expect(h.estados).toEqual([[], []]);
  expect(h.cliente.channel.mock.calls.filter(([nome]: [string]) => nome === 'npcs-visibilidade')).toHaveLength(1);
});

it('revelar NPC já na iniciativa reconsulta ambas as tabelas sem reescrever iniciativa', async () => {
  MontarJogador();
  await responder(consultas[0], []); await responder(consultas[1], []);
  invalidar();
  await responder(consultas[2], [npc]); await responder(consultas[3], [entrada]);
  expect(h.estados.map((itens) => itens[0].nome)).toEqual(['Segredo', 'Segredo']);
});

it('respostas antigas não ressuscitam NPC ocultado por uma consulta posterior', async () => {
  MontarJogador();
  invalidar();
  await responder(consultas[0], [npc]); await responder(consultas[1], [entrada]);
  expect(h.estados).toEqual([[], []]);
  await responder(consultas[2], []); await responder(consultas[3], []);
  expect(h.estados).toEqual([[], []]);
});

it('entrada no canal e reconexão recuperam avisos perdidos nas duas consultas', async () => {
  MontarJogador(); await carregarVisivel();
  const c = canais.get('npcs-visibilidade');
  c.status('SUBSCRIBED');
  await responder(consultas[2], []); await responder(consultas[3], []);
  c.status('CHANNEL_ERROR'); c.status('SUBSCRIBED');
  await responder(consultas[4], [npc]); await responder(consultas[5], [entrada]);
  expect(h.estados.map((itens) => itens.length)).toEqual([1, 1]);
});

it('UPDATE concorrente renova uma invalidação em voo em vez de perdê-la', async () => {
  MontarJogador(); await carregarVisivel(); invalidar();
  const outro = { ...npc, id: 'outro', nome: 'Guarda' };
  canais.get('jogador-npcs-publico').handlers.get('postgres_changes')({ eventType: 'UPDATE', new: outro });
  canais.get('jogador-iniciativa').handlers.get('postgres_changes')({ eventType: 'UPDATE', new: { ...entrada, id: 'outra', participante_id: 'outro', nome: 'Guarda' } });
  await responder(consultas[2], [npc]); await responder(consultas[3], [entrada]);
  await responder(consultas[4], [outro]);
  await responder(consultas[5], [{ ...entrada, id: 'outra', participante_id: 'outro', nome: 'Guarda' }]);
  expect(h.estados.map((itens) => itens.map((item: any) => item.nome))).toEqual([['Guarda'], ['Guarda']]);
});

it('rajada de avisos mantém uma consulta por tabela em voo e só uma repetição pendente', async () => {
  MontarJogador();
  for (let i = 0; i < 20; i++) invalidar();
  expect(consultas).toHaveLength(2);
  await responder(consultas[0], [npc]); await responder(consultas[1], [entrada]);
  expect(consultas).toHaveLength(4);
  await responder(consultas[2], []); await responder(consultas[3], []);
  expect(consultas).toHaveLength(4);
  expect(h.estados).toEqual([[], []]);
});

it('envio usa ACK e payload vazio; falha fica pendente até envio confirmado', async () => {
  paradas.push(iniciarNotificacoesVisibilidadeNpcs());
  const c = canais.get('npcs-visibilidade');
  c.send.mockResolvedValueOnce('timed out');
  notificarVisibilidadeNpcs();
  await vi.waitFor(() => expect(usePendenciasStore.getState().itens).toContainEqual({ modulo: 'npcs-visibilidade', chave: 'visibilidade' }));
  expect(h.cliente.channel).toHaveBeenCalledWith('npcs-visibilidade', { config: { broadcast: { ack: true, self: false } } });
  expect(c.send).toHaveBeenCalledWith({ type: 'broadcast', event: 'invalidar', payload: {} }, { timeout: 5000 });
  tentarTodasPendencias();
  await vi.waitFor(() => expect(usePendenciasStore.getState().itens).not.toContainEqual({ modulo: 'npcs-visibilidade', chave: 'visibilidade' }));
  expect(c.send).toHaveBeenCalledTimes(2);
});

it('o mestre recupera uma invalidação pendente após recarregar', async () => {
  usePendenciasStore.setState({ itens: [{ modulo: 'npcs-visibilidade', chave: 'visibilidade' }] });
  paradas.push(iniciarNotificacoesVisibilidadeNpcs());
  await vi.waitFor(() => expect(usePendenciasStore.getState().itens).toEqual([]));
  expect(canais.get('npcs-visibilidade').send).toHaveBeenCalledOnce();
});

it('desmontar um hook preserva o canal enquanto o outro ainda observa', () => {
  MontarJogador();
  const compartilhado = canais.get('npcs-visibilidade');
  paradas[0]();
  expect(h.cliente.removeChannel).not.toHaveBeenCalledWith(compartilhado);
  paradas[1]();
  expect(h.cliente.removeChannel).toHaveBeenCalledWith(compartilhado);
  paradas = [];
});

it('callbacks atrasados do canal desmontado não invalidam os novos observadores', () => {
  MontarJogador();
  const anterior = canais.get('npcs-visibilidade');
  paradas.forEach((parar) => parar()); paradas = [];
  h.efeitos = []; h.estados = []; MontarJogador();
  const antes = consultas.length;
  anterior.handlers.get('broadcast')({ payload: {} });
  anterior.status('SUBSCRIBED');
  expect(consultas).toHaveLength(antes);
});
