import type { ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia, criarNpcVazio } from '../../state/factories';
const h = vi.hoisted(() => ({ valores: [] as any[], indice: 0, efeitos: [] as any[], indiceEfeito: 0 }));
vi.mock('react', async (original) => ({
  ...await original<any>(),
  useEffect: (efeito: () => void, deps: unknown[]) => {
    const i = h.indiceEfeito++;
    if (!h.efeitos[i] || deps.some((d, j) => d !== h.efeitos[i][j])) { h.efeitos[i] = deps; efeito(); }
  },
  useState: (inicial: any) => {
    const i = h.indice++;
    if (!(i in h.valores)) h.valores[i] = typeof inicial === 'function' ? inicial() : inicial;
    return [h.valores[i], (valor: any) => { h.valores[i] = typeof valor === 'function' ? valor(h.valores[i]) : valor; }];
  },
}));
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }));
vi.mock('../../state/store', async (original) => {
  const real = await original<any>();
  return { ...real, useStore: Object.assign((selector: any) => selector(real.useStore.getState()), real.useStore) };
});
import { useStore } from '../../state/store';
import RoladorTeste from './RoladorTeste';
import RoladorTesteJogador from './RoladorTesteJogador';
import RolagemLivre from './RolagemLivre';
import RolagemLivreJogador from './RolagemLivreJogador';

beforeEach(() => { h.valores = []; h.indice = 0; h.efeitos = []; h.indiceEfeito = 0; useStore.setState(criarEstadoInicial()); });
function elementos(no: any, tipo: string): ReactElement<any>[] {
  if (Array.isArray(no)) return no.flatMap((filho) => elementos(filho, tipo));
  if (!no || typeof no !== 'object') return [];
  if (typeof no.type === 'function') return elementos(no.type(no.props), tipo);
  return [...(no.type === tipo ? [no] : []), ...elementos(no.props?.children, tipo)];
}
function texto(no: any): string {
  if (Array.isArray(no)) return no.map(texto).join('');
  if (no && typeof no.type === 'function') return texto(no.type(no.props));
  return typeof no === 'object' && no !== null ? texto(no.props?.children) : String(no ?? '');
}
function campo(tela: any, tipo: string, id: string): ReactElement<any> {
  return elementos(tela, tipo).find((el) => el.props.id === id)!;
}
function iniciar(modo: 'mestre' | 'jogador', livre: boolean) {
  const ficha = { ...criarFichaVazia(), nome: 'Arthur', pvAtual: 10, atributos: { ...criarFichaVazia().atributos, vigor: 1, agilidade: 2 }, pericias: { pontaria: 3 as const } };
  const npc = { ...criarNpcVazio(), nome: 'NPC teste' };
  useStore.setState({ fichas: [ficha], npcs: [npc] });
  let completar: (grupos: any[]) => void = () => {};
  const rolar = vi.fn((_notacao: any, callback: typeof completar, ..._contexto: any[]) => { completar = callback; });
  const renderizar = () => {
    h.indice = 0; h.indiceEfeito = 0;
    if (livre) return modo === 'mestre' ? RolagemLivre({ ready: true, rolar }) : RolagemLivreJogador({ fichaId: ficha.id, ready: true, rolar });
    return modo === 'mestre' ? RoladorTeste({ ready: true, rolar }) : RoladorTesteJogador({ ficha, ready: true, rolar });
  };
  let tela = renderizar();
  if (modo === 'mestre') {
    if (livre) {
      campo(tela, 'select', 'rl-modo').props.onChange({ target: { value: 'npc' } });
      tela = renderizar();
      campo(tela, 'select', 'rl-npc').props.onChange({ target: { value: npc.id } });
    } else campo(tela, 'select', 'rt-ficha').props.onChange({ target: { value: ficha.id } });
  }
  return { renderizar, rolar, concluir: (d20: number) => completar([{ qty: 1, sides: 20, value: d20, rolls: [{ value: d20 }] }]) };
}

it.each(['mestre', 'jogador'] as const)('teste do %s explica modificadores e mantém perícia rolada após mudar seletor', (modo) => {
  const { renderizar, concluir } = iniciar(modo, false);
  let tela = renderizar();
  const idPericia = modo === 'mestre' ? 'rt-pericia' : 'rtj-pericia';
  campo(tela, 'select', idPericia).props.onChange({ target: { value: 'pontaria' } });
  tela = renderizar();
  elementos(tela, 'button').find((b) => texto(b).startsWith('rolar '))!.props.onClick();
  concluir(14); tela = renderizar();
  expect(texto(tela)).toContain('total do teste: 17');
  expect(texto(tela)).toContain('d20: 14 + 2 (agilidade) + 3 (pontaria) − 2 (ferido)');
  campo(tela, 'select', idPericia).props.onChange({ target: { value: 'briga' } });
  tela = renderizar();
  expect(texto(elementos(tela, 'div').find((el) => el.props.role === 'status'))).toContain('Arthur · Pontaria');
  expect(useStore.getState().rollsLog[0].total).toBe(17);
});

it.each(['mestre', 'jogador'] as const)('livre do %s inclui ajuste no card/log e não reinterpreta resultado ao mudar bônus', (modo) => {
  const { renderizar, rolar, concluir } = iniciar(modo, true);
  let tela = renderizar();
  const idBonus = modo === 'mestre' ? 'rl-bonus' : 'rlj-bonus';
  campo(tela, 'input', idBonus).props.onChange({ target: { value: '-2' } });
  tela = renderizar();
  elementos(tela, 'button').find((b) => texto(b).startsWith('rolar '))!.props.onClick();
  if (modo === 'jogador') { expect(rolar.mock.calls[0][4]).toBe('qualquer'); expect(rolar.mock.calls[0][5]).toBe(-2); }
  concluir(20); tela = renderizar();
  expect(texto(tela)).toContain('total: 18');
  expect(texto(tela)).toContain('1d20: [20] − 2 (ajuste)');
  expect(texto(tela)).not.toContain('sucesso');
  campo(tela, 'input', idBonus).props.onChange({ target: { value: '5' } });
  tela = renderizar();
  expect(texto(tela)).toContain('total: 18');
  expect(texto(tela)).toContain('− 2 (ajuste)');
  expect(useStore.getState().rollsLog[0]).toMatchObject({ total: 18, formula: '1d20-2' });
});
