import { afterEach, describe, expect, it } from 'vitest';
import { usePedidoRolagemTesteStore } from './pedidoRolagemTesteStore';

afterEach(() => usePedidoRolagemTesteStore.getState().limparPedidoRolagemTeste());

describe('pedido de teste executado uma única vez', () => {
  const pedido = { id: 'p1', fichaId: 'f1', periciaId: 'investigacao', visibilidade: 'publica' as const };

  it('rerender ou outro consumidor não executa novamente o pedido ainda em voo', () => {
    const s = usePedidoRolagemTesteStore.getState();
    s.pedirRolagemTeste(pedido);
    expect(s.iniciarPedidoRolagemTeste(pedido.id)).toBe(true);
    expect(s.iniciarPedidoRolagemTeste(pedido.id)).toBe(false);
    expect(usePedidoRolagemTesteStore.getState().pedido).toEqual(pedido);
    s.limparPedidoRolagemTeste(pedido.id);
    expect(s.iniciarPedidoRolagemTeste(pedido.id)).toBe(false);
  });

  it('finalização de um pedido anterior não apaga o próximo', () => {
    const s = usePedidoRolagemTesteStore.getState();
    s.pedirRolagemTeste(pedido);
    s.iniciarPedidoRolagemTeste(pedido.id);
    s.pedirRolagemTeste({ ...pedido, id: 'p2' });
    s.limparPedidoRolagemTeste(pedido.id);
    expect(usePedidoRolagemTesteStore.getState().pedido?.id).toBe('p2');
    expect(s.iniciarPedidoRolagemTeste('p2')).toBe(true);
    expect(s.iniciarPedidoRolagemTeste('p2')).toBe(false);
  });
});
