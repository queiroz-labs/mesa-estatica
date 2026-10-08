import { beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia } from './factories';
import { useStore } from './store';

vi.mock('../dice/registroForcados', () => ({
  rolarDadoComForcados: () => 2,
  rolarDadosComForcados: () => [5, 18],
}));

beforeEach(() => useStore.setState(criarEstadoInicial()));
it('perda privada mantém delta, surto automático e escolha posteriores privados', () => {
  const ficha = criarFichaVazia();
  ficha.atributos.vontade = 2;
  ficha.sanidadeAtual = 20;
  useStore.setState({ fichas: [ficha] });
  const store = useStore.getState();
  store.ajustarSanidadeAtual(ficha.id, 14, 'privada');
  expect(useStore.getState().fichas[0].surtoPendente?.visibilidade).toBe('privada');
  store.resolverEscolhaSurtoPendente(ficha.id, 'A');
  expect(useStore.getState().log.every((e) => e.visibilidade === 'privada')).toBe(true);
  expect(useStore.getState().log.some((e) => e.tipo === 'surto')).toBe(true);
});
it('ajuste manual sem parâmetro continua público como antes', () => {
  const ficha = criarFichaVazia();
  useStore.setState({ fichas: [ficha] });
  useStore.getState().ajustarSanidadeAtual(ficha.id, ficha.sanidadeAtual - 1);
  expect(useStore.getState().log[0].visibilidade).toBe('publica');
});
it('ganho privado de Determinação mantém a consequência no log privado', () => {
  const ficha = criarFichaVazia();
  useStore.setState({ fichas: [ficha] });
  useStore.getState().ajustarDeterminacao(ficha.id, 2, 'privada');
  expect(useStore.getState().fichas[0].determinacao).toBe(2);
  expect(useStore.getState().log[0].visibilidade).toBe('privada');
});
