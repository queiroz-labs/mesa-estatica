import { beforeEach, expect, it } from 'vitest';
import { criarEstadoInicial } from '../../state/factories';
import { useStore } from '../../state/store';
import { revelarPistaAosJogadores } from './revelarPista';

beforeEach(() => useStore.setState(criarEstadoInicial()));

it.each(['nao-descoberta', 'descoberta', 'compartilhada'] as const)('revela a pista %s com uma única ação e preserva as demais', (status) => {
  const id = useStore.getState().adicionarPista();
  const outra = useStore.getState().adicionarPista();
  useStore.getState().atualizarPista(id, { status, texto: 'bilhete molhado', ligadoA: 'estação' });
  useStore.getState().atualizarPista(outra, { texto: 'segredo do caso' });
  revelarPistaAosJogadores(id);
  expect(useStore.getState().pistas.find((p) => p.id === id)).toMatchObject({ status: 'compartilhada', reveladoEm: expect.any(String) });
  expect(useStore.getState().pistas.find((p) => p.id === outra)?.status).toBe('nao-descoberta');
  expect(useStore.getState().pistas.find((p) => p.id === outra)?.reveladoEm).toBeUndefined();
  expect(useStore.getState().log).toEqual([expect.objectContaining({ tipo: 'anotacao', visibilidade: 'publica', texto: 'pista revelada: bilhete molhado — ligado a: estação' })]);
});

it('um clique repetido ou antigo não publica duas vezes nem revela uma pista removida', () => {
  const id = useStore.getState().adicionarPista();
  useStore.getState().atualizarPista(id, { texto: 'chave antiga' });
  revelarPistaAosJogadores(id);
  revelarPistaAosJogadores(id);
  useStore.getState().removerPista(id);
  revelarPistaAosJogadores(id);
  expect(useStore.getState().log).toHaveLength(1);
});

it('texto vazio e a mudança manual de coluna não publicam informação', () => {
  const id = useStore.getState().adicionarPista();
  useStore.getState().atualizarPista(id, { texto: '  ', ligadoA: 'segredo' });
  revelarPistaAosJogadores(id);
  expect(useStore.getState().pistas[0].status).toBe('nao-descoberta');
  useStore.getState().atualizarPista(id, { texto: 'texto privado', status: 'compartilhada' });
  expect(useStore.getState().log).toEqual([]);
});
