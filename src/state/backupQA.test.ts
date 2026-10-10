import { beforeEach, expect, it } from 'vitest';
import { criarEstadoInicial } from './factories';
import { useStore } from './store';

beforeEach(() => { useStore.setState(criarEstadoInicial()); });
it.each([
  ['log', { id: 'qa', texto: { invalido: true } }],
  ['npcs', { id: 'qa', acoes: [{ nome: { invalido: true } }] }],
  ['npcs', { id: 'qa', acoes: [{ nome: 'ataque', bonus: 'quebrado' }] }],
  ['fichas', { id: 'qa', armas: [{ nome: { invalido: true } }] }],
  ['fichas', { id: 'qa', atributos: { vigor: 'quebrado' } }],
  ['iniciativa', { id: 'qa', nome: {}, valor: 12 }],
  ['rollsLog', { id: 'qa', formula: {}, total: 12 }],
])('rejeita campos renderizados inválidos em %s sem persistir sobre a mesa válida', (campo, item) => {
  const antes = useStore.getState().exportarJSON();
  const dados = JSON.parse(antes);
  dados[campo as string] = [item];
  expect(() => useStore.getState().importarJSON(JSON.stringify(dados))).toThrow('formato inválido');
  expect(useStore.getState().exportarJSON()).toBe(antes);
  expect(() => useStore.getState().importarJSON(antes)).not.toThrow();
});
it.each([
  ['texto', 123], ['ligadoA', {}], ['status', 'desconhecido'],
])('pista com %s inválido é recusada antes de substituir a mesa', (campo, valor) => {
  useStore.getState().adicionarPista();
  const antes = useStore.getState().exportarJSON();
  const dados = JSON.parse(antes);
  dados.pistas[0][campo as string] = valor;
  expect(() => useStore.getState().importarJSON(JSON.stringify(dados))).toThrow(`pistas[0].${campo}`);
  expect(useStore.getState().exportarJSON()).toBe(antes);
});
it('pistas válidas continuam preservadas ao restaurar o próprio backup', () => {
  const id = useStore.getState().adicionarPista();
  useStore.getState().atualizarPista(id, { texto: 'bilhete molhado', ligadoA: 'sala', status: 'descoberta' });
  const pistas = useStore.getState().pistas;
  useStore.getState().importarJSON(useStore.getState().exportarJSON());
  expect(useStore.getState().pistas).toEqual(pistas);
});
it('restaura todos os 12 sons com posições e URLs intactas', () => {
  const sons = Array.from({ length: 12 }, (_, slot) => ({ id: `som-${slot}`, slot, nome: `som ${slot}`, path: 'sfx/test.mp3', url: 'https://example.test/test.mp3' }));
  useStore.setState((s) => ({ soundpad: { ...s.soundpad, sons } }));
  useStore.getState().importarJSON(useStore.getState().exportarJSON());
  expect(useStore.getState().soundpad.sons).toEqual(sons);
});
it.each(['suspense', '', undefined])('restaura tag %s sem mudar a faixa', (tag) => {
  const faixa = { id: 'faixa', nome: 'chuva', path: 'sfx/test.mp3', url: 'https://example.test/test.mp3', ordem: 0, criadoEm: new Date().toISOString(), tag };
  useStore.setState((s) => ({ midia: { ...s.midia, faixas: [faixa] } }));
  useStore.getState().importarJSON(useStore.getState().exportarJSON());
  expect(useStore.getState().midia.faixas).toEqual([faixa]);
});
it.each(['sessaoPrivada.eventos', 'sessaoPrivada.lembretes', 'pistas', 'rollsLog', 'midia.faixas', 'soundpad.sons', 'tabelas'])('rejeita %s inválido sem alterar a mesa', (caminho) => {
  for (const invalido of ['quebrado', {}, [null]]) {
    const dados = criarEstadoInicial() as any;
    const partes = caminho.split('.');
    const campo = partes.pop()!;
    const pai = partes.reduce((atual, parte) => atual[parte], dados);
    pai[campo] = invalido;
    const antes = useStore.getState();
    expect(() => useStore.getState().importarJSON(JSON.stringify(dados))).toThrow('formato inválido');
    expect(useStore.getState()).toBe(antes);
  }
});
