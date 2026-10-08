import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ valores: [] as any[], indice: 0, refs: [] as any[], indiceRef: 0, efeitos: [] as Array<() => void | (() => void)> }));
vi.mock('react', async (original) => ({
  ...await original<any>(),
  useCallback: (callback: any) => callback,
  useId: () => 'confirmacao-combate-teste',
  useRef: (valor: any) => h.refs[h.indiceRef++] ??= { current: valor },
  useEffect: (executar: any) => { h.efeitos.push(executar); },
  useState: (valor: any) => {
    const i = h.indice++;
    if (!(i in h.valores)) h.valores[i] = typeof valor === 'function' ? valor() : valor;
    return [h.valores[i], (novo: any) => { h.valores[i] = typeof novo === 'function' ? novo(h.valores[i]) : novo; }];
  },
}));
import IniciativaPanel from './IniciativaPanel';
import ConfirmacaoCombate from './ConfirmacaoCombate';
function elementos(no: any, tipo: any): any[] {
  if (Array.isArray(no)) return no.flatMap((filho) => elementos(filho, tipo));
  if (!no || typeof no !== 'object') return [];
  return [...(no.type === tipo ? [no] : []), ...elementos(no.props?.children, tipo)];
}
function texto(no: any): string {
  if (Array.isArray(no)) return no.map(texto).join('');
  return typeof no === 'object' && no !== null ? texto(no.props?.children) : String(no ?? '');
}
function botao(tela: any, nome: string) { return elementos(tela, 'button').find((el) => texto(el) === nome)!; }
function renderizar(hook: any) { h.indice = 0; h.indiceRef = 0; return IniciativaPanel({ hook, header: 'combate' }); }
let hook: any;
let limpezas: Array<() => void>;
let teclado: (evento: any) => void;
beforeEach(() => {
  h.valores = []; h.refs = []; h.efeitos = []; limpezas = [];
  hook = {
    iniciativa: [], modoCombate: false, turnoAtualId: null, rodada: 3, contadorCena: 1,
    condicoesCombate: {}, condicaoDuracao: {}, fichas: [], npcs: [], selecionadosIniciativa: [],
    disponiveis: [], todosSelecionados: false, nenhumSelecionado: true, adicionarDisponiveis: [],
    expandidos: new Set(), adicionarAberto: false, selecionadosAplicar: new Set(), agruparNpcs: false,
    pvDoCombatente: () => null, defesaDoCombatente: () => null, podePrimeirosSocorros: () => true, socorristaPorAlvo: {},
    encerrarModoCombate: vi.fn(), resetar: vi.fn(),
  };
  vi.stubGlobal('document', { activeElement: null, addEventListener: (_nome: string, handler: any) => { teclado = handler; }, removeEventListener: vi.fn() });
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible', display: 'block' }));
});
afterEach(() => { limpezas.forEach((limpar) => limpar()); vi.unstubAllGlobals(); });

it('reset vazio é imediato; reset com iniciativa pede confirmação e Cancelar preserva dados', () => {
  let tela = renderizar(hook); botao(tela, 'resetar').props.onClick();
  expect(hook.resetar).toHaveBeenCalledOnce();
  hook.resetar.mockClear();
  hook.iniciativa = [{ id: 'a', participanteId: 'npc', tipo: 'npc', nome: 'Guarda', valor: 10 }];
  tela = renderizar(hook); botao(tela, 'resetar').props.onClick(); tela = renderizar(hook);
  const modal = elementos(tela, ConfirmacaoCombate)[0];
  expect(modal.props.acao).toBe('resetar');
  expect(hook.resetar).not.toHaveBeenCalled();
  modal.props.onCancelar(); tela = renderizar(hook);
  expect(elementos(tela, ConfirmacaoCombate)).toEqual([]);
  expect(hook.iniciativa).toHaveLength(1); expect(hook.rodada).toBe(3);
});
it.each(['encerrar', 'resetar'])('%s só executa ação após confirmar explicitamente', (acao) => {
  hook.modoCombate = true;
  let tela = renderizar(hook); botao(tela, acao).props.onClick(); tela = renderizar(hook);
  expect(hook.encerrarModoCombate).not.toHaveBeenCalled(); expect(hook.resetar).not.toHaveBeenCalled();
  elementos(tela, ConfirmacaoCombate)[0].props.onConfirmar(); tela = renderizar(hook);
  expect(acao === 'encerrar' ? hook.encerrarModoCombate : hook.resetar).toHaveBeenCalledOnce();
  expect(elementos(tela, ConfirmacaoCombate)).toEqual([]);
});
it('nomes dos alvos selecionados aparecem no painel GM, sem incluir outros ou executar ações', () => {
  hook.iniciativa = [
    { id: 'pc', participanteId: 'arthur', tipo: 'pc', nome: 'Arthur', valor: 20 },
    { id: 'oculto', participanteId: 'segredo', tipo: 'npc', nome: 'NPC oculto', valor: 15 },
    { id: 'outro', participanteId: 'outro', tipo: 'npc', nome: 'Não selecionado', valor: 10 },
  ];
  hook.selecionadosAplicar = new Set(['arthur', 'segredo']);
  const tela = renderizar(hook);
  const linha = elementos(tela, 'p').find((el) => texto(el).startsWith('alvos selecionados:'))!;
  expect(texto(linha)).toBe('alvos selecionados: Arthur, NPC oculto');
  expect(hook.encerrarModoCombate).not.toHaveBeenCalled(); expect(hook.resetar).not.toHaveBeenCalled();
});
it('modal foca Cancelar; Esc/backdrop cancelam sem confirmar e devolvem foco ao sair', () => {
  const cancelar = vi.fn(); const confirmar = vi.fn();
  const anterior = { isConnected: true, focus: vi.fn() };
  const doc = document as any; doc.activeElement = anterior;
  const tela = ConfirmacaoCombate({ acao: 'encerrar', combateAtivo: true, onCancelar: cancelar, onConfirmar: confirmar });
  const cancelarElemento = { focus: vi.fn(() => { doc.activeElement = cancelarElemento; }) };
  const confirmarElemento = { focus: vi.fn() };
  h.refs[0].current = { getClientRects: () => [{}], querySelectorAll: () => [cancelarElemento, confirmarElemento] };
  h.refs[1].current = cancelarElemento;
  for (const executar of h.efeitos) { const limpar = executar(); if (limpar) limpezas.push(limpar); }
  expect(cancelarElemento.focus).toHaveBeenCalledOnce();
  teclado({ key: 'Escape', preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() });
  expect(cancelar).toHaveBeenCalledOnce(); expect(confirmar).not.toHaveBeenCalled();
  tela.props.onClick();
  expect(cancelar).toHaveBeenCalledTimes(2); expect(confirmar).not.toHaveBeenCalled();
  botao(tela, 'cancelar').props.onClick();
  expect(cancelar).toHaveBeenCalledTimes(3); expect(confirmar).not.toHaveBeenCalled();
  limpezas.forEach((limpar) => limpar()); limpezas = [];
  expect(anterior.focus).toHaveBeenCalledOnce();
});
