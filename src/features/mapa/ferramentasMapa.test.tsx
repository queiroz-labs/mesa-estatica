import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia, criarGradeInicial, criarMapaBiblioteca, criarNpcVazio } from '../../state/factories';
const h = vi.hoisted(() => ({ valores: [] as any[], indice: 0, refs: [] as any[], indiceRef: 0, indiceEfeito: 0, efeitos: [] as any[], pv: null as any }));
vi.mock('react', async (original) => ({
  ...await original<any>(),
  useCallback: (callback: any) => callback,
  useRef: (valor: any) => h.refs[h.indiceRef++] ??= { current: valor },
  useState: (valor: any) => {
    const i = h.indice++;
    if (!(i in h.valores)) h.valores[i] = typeof valor === 'function' ? valor() : valor;
    return [h.valores[i], (novo: any) => { h.valores[i] = typeof novo === 'function' ? novo(h.valores[i]) : novo; }];
  },
  useEffect: (executar: any, deps: any[]) => {
    const i = h.indiceEfeito++;
    const antigo = h.efeitos[i];
    h.efeitos[i] = { executar, deps, limpar: antigo?.limpar, rodar: !antigo || deps.some((dep, j) => dep !== antigo.deps[j]) };
  },
}));
vi.mock('../../state/store', async (original) => { const real = await original<any>(); return { ...real, useStore: Object.assign((s: any) => s(real.useStore.getState()), real.useStore) }; });
vi.mock('../../state/fowStore', async (original) => { const real = await original<any>(); return { ...real, useFowStore: Object.assign((s: any) => s(real.useFowStore.getState()), real.useFowStore) }; });
vi.mock('../../state/aoeStore', async (original) => { const real = await original<any>(); return { ...real, useAoeStore: Object.assign((s: any) => s(real.useAoeStore.getState()), real.useAoeStore) }; });
vi.mock('../../hooks/useIniciativa', () => ({ useIniciativa: () => ({ pvDoCombatente: h.pv }) }));
import { useStore } from '../../state/store';
import { useFowStore } from '../../state/fowStore';
import { useAoeStore, type AoeVivo } from '../../state/aoeStore';
import FoWOverlay from './FoWOverlay';
import AoEOverlay from './AoEOverlay';
let teclado: (e: any) => void;
let props: any;
const anterior: AoeVivo = { forma: 'circulo', origem: { x: 0.2, y: 0.2 }, alvo: { x: 0.3, y: 0.2 }, ativa: false };
function elementos(no: any, tipo: string): ReactElement<any>[] {
  if (Array.isArray(no)) return no.flatMap((filho) => elementos(filho, tipo));
  if (!no || typeof no !== 'object') return [];
  return [...(no.type === tipo ? [no] : []), ...elementos(no.props?.children, tipo)];
}
function renderizar(componente: () => any) {
  h.indice = 0; h.indiceRef = 0; h.indiceEfeito = 0;
  const tela = componente();
  for (const efeito of h.efeitos) if (efeito.rodar) { efeito.limpar?.(); efeito.limpar = efeito.executar(); efeito.rodar = false; }
  return tela;
}
function renderizarFoW() { const el = FoWOverlay(props); return (el.type as any)(el.props); }
function captura(tela: any, nome: string) { return elementos(tela, 'div').find((el) => el.props.className === nome)!; }
const alvoPonteiro = { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() };
const ponteiro = (x: number, y: number) => ({ clientX: x, clientY: y, button: 0, pointerId: 1, currentTarget: alvoPonteiro, preventDefault: vi.fn(), stopPropagation: vi.fn() });
beforeEach(() => {
  h.valores = []; h.refs = []; h.efeitos = []; alvoPonteiro.releasePointerCapture.mockClear();
  vi.stubGlobal('window', { addEventListener: (_nome: string, callback: any) => { teclado = callback; }, removeEventListener: vi.fn() });
  vi.stubGlobal('document', { querySelectorAll: () => [] });
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible', display: 'block' }));
  useStore.setState(criarEstadoInicial()); useFowStore.setState({ rascunho: null }); useAoeStore.setState({ template: anterior });
  const mapa = criarMapaBiblioteca('mapa', '', 'https://example.test/mapa.png', 0);
  mapa.fow = { ativa: true, zonaAtual: null, vistas: [{ id: 'salva', forma: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }], visiveisAgora: [{ id: 'salva', forma: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] };
  useStore.setState((s) => ({ mapa: { ...s.mapa, biblioteca: [mapa], mapaAtivoId: mapa.id } }));
  props = { imgRenderRect: null, tamanho: { width: 100, height: 100 }, grade: criarGradeInicial(), containerRef: { current: { clientLeft: 0, clientTop: 0, clientWidth: 100, clientHeight: 100, getClientRects: () => [{}], getBoundingClientRect: () => ({ left: 0, top: 0 }) } }, imgRef: { current: null } };
});
afterEach(() => { h.efeitos.forEach((efeito) => efeito.limpar?.()); vi.unstubAllGlobals(); });
const esc = () => teclado({ key: 'Escape', target: { tagName: 'DIV' }, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() });

it('Esc cancela rascunho FoW, libera captura e preserva regiões gravadas mesmo se chegar pointerup antigo', () => {
  const fow = useStore.getState().mapa.biblioteca[0].fow;
  let tela = renderizar(renderizarFoW);
  elementos(tela, 'button').find((el) => el.props.title?.startsWith('revelar'))!.props.onClick();
  tela = renderizar(renderizarFoW); const camada = captura(tela, 'fow-camada-captura');
  camada.props.onPointerDown(ponteiro(20, 20)); camada.props.onPointerMove(ponteiro(70, 70));
  expect(useFowStore.getState().rascunho).not.toBeNull();
  esc(); camada.props.onPointerUp(ponteiro(70, 70)); tela = renderizar(renderizarFoW);
  expect(useFowStore.getState().rascunho).toBeNull();
  expect(useStore.getState().mapa.biblioteca[0].fow).toBe(fow);
  expect(captura(tela, 'fow-camada-captura').props.style.pointerEvents).toBe('none');
  expect(alvoPonteiro.releasePointerCapture).toHaveBeenCalledWith(1);
});
it.each([true, false])('Esc restaura AoE concluída anterior (existente: %s) e ignora pointerup do arrasto cancelado', (existente) => {
  useAoeStore.setState({ template: existente ? anterior : null });
  const desenhar = () => AoEOverlay(props);
  let tela = renderizar(desenhar);
  elementos(tela, 'button').find((el) => el.props.title?.includes('círculo'))!.props.onClick();
  tela = renderizar(desenhar); const camada = captura(tela, 'mapa-aoe-captura');
  camada.props.onPointerDown(ponteiro(50, 50)); camada.props.onPointerMove(ponteiro(90, 90));
  expect(useAoeStore.getState().template?.ativa).toBe(true);
  esc(); camada.props.onPointerUp(); tela = renderizar(desenhar);
  expect(useAoeStore.getState().template).toBe(existente ? anterior : null);
  expect(captura(tela, 'mapa-aoe-captura').props.style.pointerEvents).toBe('none');
});
it('sair do modo AoE sem arrastar preserva a área concluída', () => {
  const desenhar = () => AoEOverlay(props);
  const tela = renderizar(desenhar);
  elementos(tela, 'button').find((el) => el.props.title?.includes('círculo'))!.props.onClick();
  renderizar(desenhar); esc();
  expect(useAoeStore.getState().template).toBe(anterior);
});
it('dano AoE mantém nomes de NPC ocultos somente no log privado', () => {
  const ficha = { ...criarFichaVazia(), nome: 'Arthur' };
  const npc = { ...criarNpcVazio(), nome: 'Segredo', visivel: false };
  useStore.setState((s) => ({ fichas: [ficha], npcs: [npc], mapa: { ...s.mapa, tokens: [{ id: 'pc', participanteId: ficha.id, tipo: 'pc', x: 0.5, y: 0.5 }, { id: 'npc', participanteId: npc.id, tipo: 'npc', x: 0.6, y: 0.5 }] } }));
  useAoeStore.setState({ template: { ...anterior, origem: { x: 0.5, y: 0.5 }, alvo: { x: 0.9, y: 0.5 } } });
  h.pv = (id: string, tipo: string) => ({ aplicar: (delta: number) => {
    const s = useStore.getState();
    if (tipo === 'pc') s.ajustarPvAtual(id, s.fichas.find((f) => f.id === id)!.pvAtual + delta);
    else s.atualizarNpc(id, { pvAtual: s.npcs.find((n) => n.id === id)!.pvAtual + delta });
  } });
  const desenhar = () => AoEOverlay(props);
  let tela = renderizar(desenhar);
  elementos(tela, 'input')[0].props.onChange({ target: { value: '3' } }); tela = renderizar(desenhar);
  elementos(tela, 'button').find((el) => el.props.children?.[0] === 'aplicar a ')!.props.onClick();
  const logs = useStore.getState().log.filter((e) => e.texto.startsWith('área de efeito'));
  expect(logs.find((e) => e.visibilidade === 'publica')?.texto).toContain('Arthur');
  expect(logs.find((e) => e.visibilidade === 'publica')?.texto).not.toContain('Segredo');
  expect(logs.find((e) => e.visibilidade === 'privada')?.texto).toContain('Segredo');
});
