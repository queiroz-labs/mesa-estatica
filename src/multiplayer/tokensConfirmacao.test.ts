import { afterEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial } from '../state/factories';
import { useStore } from '../state/store';
import { iniciarSyncTokens, marcarTokenEmArrasto, desmarcarTokenEmArrasto } from './tokensSync';
import { retomarPendenciasPersistidas } from './filaPendencias';

const h = vi.hoisted(() => ({ cliente: null as any }));
vi.mock('../lib/supabaseClient', () => ({ get supabase() { return h.cliente; } }));

let limpar: (() => void) | undefined;
afterEach(() => {
  limpar?.();
  limpar = undefined;
  desmarcarTokenEmArrasto('tok-confirmacao');
  h.cliente = null;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function iniciarTeste() {
  vi.useFakeTimers();
  const dados = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => { dados.set(chave, valor); },
  });
  const remoto = { id: 'tok-confirmacao', participante_id: 'pc-1', tipo: 'pc', x: 0.1, y: 0.1 };
  const escritas: Array<{ payload: any; resolver: (value: { data: unknown; error: null }) => void }> = [];
  let receber: (payload: any) => void = () => {};
  h.cliente = {
    from: () => {
      const builder: any = {};
      builder.select = () => builder;
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [remoto], error: null }).then(resolve);
      builder.update = (payload: unknown) => ({ eq: () => ({ select: () =>
        new Promise((resolver) => { escritas.push({ payload, resolver }); }),
      }) });
      return builder;
    },
    channel: () => {
      const canal: any = {};
      canal.on = (_event: string, _filter: unknown, handler: typeof receber) => { receber = handler; return canal; };
      canal.subscribe = (status: (status: string) => void) => { status('SUBSCRIBED'); return canal; };
      return canal;
    },
    removeChannel: () => {},
  };
  useStore.setState(criarEstadoInicial());
  limpar = iniciarSyncTokens();
  await vi.advanceTimersByTimeAsync(0);
  return { remoto, escritas, receber: (payload: any) => receber(payload) };
}

it('confirmação de posição anterior não libera eco enquanto a posição final aguarda o throttle', async () => {
  const { remoto, escritas, receber } = await iniciarTeste();
  marcarTokenEmArrasto(remoto.id);
  useStore.getState().moverTokenMapa(remoto.id, 0.2, 0.2);
  expect(escritas).toHaveLength(1); // leading edge: primeira posição sai sem espera
  await vi.advanceTimersByTimeAsync(50);
  useStore.getState().moverTokenMapa(remoto.id, 0.8, 0.8);
  desmarcarTokenEmArrasto(remoto.id); // soltou antes do próximo tick de 150 ms

  escritas[0].resolver({ data: [{ id: remoto.id }], error: null });
  await vi.advanceTimersByTimeAsync(0);
  receber({ eventType: 'UPDATE', new: { ...remoto, x: 0.2, y: 0.2 } });
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.8);
  expect(retomarPendenciasPersistidas('tokens-sync')).toContain(remoto.id);

  await vi.advanceTimersByTimeAsync(100);
  expect(escritas).toHaveLength(2);
  expect(escritas[1].payload).toMatchObject({ x: 0.8, y: 0.8 });
  escritas[1].resolver({ data: [{ id: remoto.id }], error: null });
  await vi.advanceTimersByTimeAsync(0);
  expect(retomarPendenciasPersistidas('tokens-sync')).not.toContain(remoto.id);
});

it('respostas fora de ordem reenviam o destino final sem deixar o eco antigo recuar o token', async () => {
  const { remoto, escritas, receber } = await iniciarTeste();
  useStore.getState().moverTokenMapa(remoto.id, 0.2, 0.2);
  await vi.advanceTimersByTimeAsync(50);
  useStore.getState().moverTokenMapa(remoto.id, 0.9, 0.9);
  await vi.advanceTimersByTimeAsync(100);
  expect(escritas).toHaveLength(2);

  // A segunda escrita terminou primeiro. A primeira ainda pode chegar com a posição velha.
  escritas[1].resolver({ data: [{ id: remoto.id }], error: null });
  await vi.advanceTimersByTimeAsync(0);
  expect(retomarPendenciasPersistidas('tokens-sync')).toContain(remoto.id);
  receber({ eventType: 'UPDATE', new: { ...remoto, x: 0.2, y: 0.2 } });
  expect(useStore.getState().mapa.tokens[0].x).toBe(0.9);
  escritas[0].resolver({ data: [{ id: remoto.id }], error: null });
  await vi.advanceTimersByTimeAsync(150);
  expect(escritas).toHaveLength(3);
  expect(escritas[2].payload).toMatchObject({ x: 0.9, y: 0.9 });
  escritas[2].resolver({ data: [{ id: remoto.id }], error: null });
  await vi.advanceTimersByTimeAsync(0);
  expect(retomarPendenciasPersistidas('tokens-sync')).not.toContain(remoto.id);
});
