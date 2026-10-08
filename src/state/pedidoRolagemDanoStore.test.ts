import { afterEach, describe, expect, it } from 'vitest';
import { usePedidoRolagemDanoStore } from './pedidoRolagemDanoStore';

afterEach(() => {
  usePedidoRolagemDanoStore.getState().limparPedidoRolagemDano();
});

describe('pedidoRolagemDanoStore', () => {
  it('pedirRolagemDano seta o pedido; limparPedidoRolagemDano volta a null', () => {
    const pedido = { id: 'p1', fichaId: 'f1', armaId: 'a1', critico: false, visibilidade: 'publica' as const };
    usePedidoRolagemDanoStore.getState().pedirRolagemDano(pedido);
    expect(usePedidoRolagemDanoStore.getState().pedido).toEqual(pedido);

    usePedidoRolagemDanoStore.getState().limparPedidoRolagemDano();
    expect(usePedidoRolagemDanoStore.getState().pedido).toBeNull();
  });

  it('só um consumidor inicia o dano; conclusão não permite replay da fila antiga', () => {
    const s = usePedidoRolagemDanoStore.getState();
    s.pedirRolagemDano({ id: 'p1', fichaId: 'f1', armaId: 'a1', critico: false, visibilidade: 'publica' });
    expect(s.iniciarPedidoRolagemDano('p1')).toBe(true);
    expect(s.iniciarPedidoRolagemDano('p1')).toBe(false);
    s.limparPedidoRolagemDano('p1');
    expect(s.iniciarPedidoRolagemDano('p1')).toBe(false);
  });

  it('callback antigo preserva o pedido de dano mais novo', () => {
    const s = usePedidoRolagemDanoStore.getState();
    const pedido = { id: 'p1', fichaId: 'f1', armaId: 'a1', critico: false, visibilidade: 'publica' as const };
    s.pedirRolagemDano(pedido);
    s.iniciarPedidoRolagemDano('p1');
    s.pedirRolagemDano({ ...pedido, id: 'p2' });
    s.limparPedidoRolagemDano('p1');
    expect(usePedidoRolagemDanoStore.getState().pedido?.id).toBe('p2');
    expect(s.iniciarPedidoRolagemDano('p2')).toBe(true);
  });
});
