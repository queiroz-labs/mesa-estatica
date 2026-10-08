import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarNpcVazio } from '../state/factories';
import { useStore } from '../state/store';
const h = vi.hoisted(() => ({ cliente: null as any }));
vi.mock('../lib/supabaseClient', () => ({ get supabase() { return h.cliente; } }));
import { iniciarSyncNpcs, paraLinhaPublico } from './npcsSync';
import { resolverPendencia } from './filaPendencias';

let parar: () => void;
let enviar: ReturnType<typeof vi.fn>;
let confirmar: (resultado: { error: unknown }) => void;
let npc: ReturnType<typeof criarNpcVazio>;
beforeEach(() => {
  vi.useFakeTimers();
  useStore.setState(criarEstadoInicial());
  npc = { ...criarNpcVazio(), nome: 'Segredo', visivel: true };
  useStore.setState({ npcs: [npc] });
  let publico = paraLinhaPublico(npc);
  enviar = vi.fn(() => Promise.resolve('ok'));
  h.cliente = {
    from: (tabela: string) => {
      const b: any = {};
      const dados = () => tabela === 'npcs_publico' ? publico : { id: npc.id, notas_mestre: '' };
      b.select = () => b; b.eq = () => b;
      b.then = (cb: any) => Promise.resolve({ data: [dados()], error: null }).then(cb);
      b.maybeSingle = () => Promise.resolve({ data: dados(), error: null });
      b.update = (patch: any) => ({ eq: () => new Promise((resolve) => {
        confirmar = (resultado) => {
          if (!resultado.error) publico = { ...publico, ...patch };
          resolve(resultado);
        };
      }) });
      b.upsert = () => Promise.resolve({ error: null });
      return b;
    },
    channel: () => {
      const c: any = { on: () => c, subscribe: () => c, send: enviar };
      return c;
    },
    removeChannel: () => {},
  };
  parar = iniciarSyncNpcs();
});
afterEach(() => {
  parar();
  resolverPendencia('npcs-sync', npc.id);
  resolverPendencia('npcs-visibilidade', 'visibilidade');
  h.cliente = null;
  vi.useRealTimers();
});

it('notifica a ocultação só depois que o banco confirma a atualização pública', async () => {
  await vi.advanceTimersByTimeAsync(0);
  useStore.getState().atualizarNpc(npc.id, { visivel: false });
  await vi.advanceTimersByTimeAsync(500);
  expect(enviar).not.toHaveBeenCalled();
  confirmar({ error: null });
  await vi.advanceTimersByTimeAsync(0);
  expect(enviar).toHaveBeenCalledTimes(1);
  expect(enviar).toHaveBeenCalledWith({ type: 'broadcast', event: 'invalidar', payload: {} }, { timeout: 5000 });
});

it('não notifica visibilidade quando a escrita pública falha', async () => {
  await vi.advanceTimersByTimeAsync(0);
  useStore.getState().atualizarNpc(npc.id, { visivel: false });
  await vi.advanceTimersByTimeAsync(500);
  confirmar({ error: { code: '42501' } });
  await vi.advanceTimersByTimeAsync(0);
  expect(enviar).not.toHaveBeenCalled();
});

it('editar outro campo de NPC visível mantém só o Realtime normal, sem rebusca extra', async () => {
  await vi.advanceTimersByTimeAsync(0);
  useStore.getState().atualizarNpc(npc.id, { nome: 'Guarda' });
  await vi.advanceTimersByTimeAsync(500);
  confirmar({ error: null });
  await vi.advanceTimersByTimeAsync(0);
  expect(enviar).not.toHaveBeenCalled();
});
