import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia, criarMapaBiblioteca, criarNpcVazio } from '../../state/factories';

const h = vi.hoisted(() => ({ valores: [] as any[], indice: 0, refs: [] as any[], indiceRef: 0, indiceEfeito: 0, efeitos: [] as any[] }));
vi.mock('react', async (original) => ({
  ...await original<any>(),
  useCallback: (callback: any) => callback,
  useRef: (valor: any) => h.refs[h.indiceRef++] ??= { current: valor },
  useState: (valor: any) => {
    const i = h.indice++;
    if (!(i in h.valores)) h.valores[i] = valor;
    return [h.valores[i], (novo: any) => { h.valores[i] = novo; }];
  },
  useEffect: (executar: any, deps: any[]) => {
    const i = h.indiceEfeito++;
    const antigo = h.efeitos[i];
    h.efeitos[i] = { executar, deps, limpar: antigo?.limpar, rodar: !antigo || deps.some((dep, j) => dep !== antigo.deps[j]) };
  },
}));
vi.mock('../../state/store', async (original) => { const real = await original<any>(); return { ...real, useStore: Object.assign((s: any) => s(real.useStore.getState()), real.useStore) }; });
vi.mock('./useRegua', () => ({ useRegua: () => ({}) }));
vi.mock('../../tokens3d/TokenScene', () => ({ default: () => null }));
import { useStore } from '../../state/store';
import MapaJogadorView from './MapaJogadorView';
import TokenScene from '../../tokens3d/TokenScene';
import TokenOverlayJogador from './TokenOverlayJogador';
import ObjetosMapaView from './ObjetosMapaView';

const minhaFicha = { ...criarFichaVazia(), id: 'eu', nome: 'Meu personagem' };
const outraFicha = { ...criarFichaVazia(), id: 'outro', nome: 'Outro personagem' };
const npc = { ...criarNpcVazio(), id: 'npc', nome: 'NPC revelado', notas: 'Detalhes do NPC' };
const regiao = { id: 'luz', forma: 'rect' as const, x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
const props = { minhaFicha, outrasFichas: [outraFicha], npcs: [npc], iniciativa: [] };
function elementos(no: any, tipo: any): ReactElement<any>[] {
  if (Array.isArray(no)) return no.flatMap((filho) => elementos(filho, tipo));
  if (!no || typeof no !== 'object') return [];
  return [...(no.type === tipo ? [no] : []), ...elementos(no.props?.children, tipo)];
}
function renderizar() {
  h.indice = 0; h.indiceRef = 0; h.indiceEfeito = 0;
  const tela = MapaJogadorView(props);
  for (const efeito of h.efeitos) if (efeito.rodar) { efeito.limpar?.(); efeito.limpar = efeito.executar(); efeito.rodar = false; }
  return tela;
}
const tokens = (tela: ReactElement) => elementos(tela, 'div').filter((el) => el.props.className === 'mapa-token');
function luz(ativa: boolean, visiveisAgora = [] as typeof regiao[]) {
  useStore.setState((s) => ({ mapa: { ...s.mapa, biblioteca: s.mapa.biblioteca.map((m) => ({ ...m, fow: { ...m.fow, ativa, visiveisAgora } })) } }));
}
beforeEach(() => {
  h.valores = [{ width: 600, height: 400 }]; h.refs = []; h.efeitos = [];
  useStore.setState(criarEstadoInicial());
  const mapa = criarMapaBiblioteca('mapa', '', 'https://example.test/mapa.png', 0);
  mapa.fow = { ativa: true, zonaAtual: null, vistas: [regiao], visiveisAgora: [] };
  useStore.setState((s) => ({ mapa: { ...s.mapa, biblioteca: [mapa], mapaAtivoId: mapa.id, tokens: [
    { id: 'meu-token', participanteId: 'eu', tipo: 'pc', x: 0.8, y: 0.8 },
    { id: 'outro-token', participanteId: 'outro', tipo: 'pc', x: 0.2, y: 0.2 },
    { id: 'npc-token', participanteId: 'npc', tipo: 'npc', x: 0.2, y: 0.2 },
  ] } }));
});
afterEach(() => h.efeitos.forEach((efeito) => efeito.limpar?.()));

it('retira PCs e NPCs sem luz dos alvos acessíveis e do canvas, preservando o próprio token', () => {
  const tela = renderizar();
  expect(tokens(tela).map((t) => t.props['aria-label'])).toEqual(['token Meu personagem']);
  expect(elementos(tela, TokenScene)[0].props.tokens.map((t: any) => t.participanteId)).toEqual(['eu']);
  luz(true, [regiao]);
  expect(tokens(renderizar())).toHaveLength(3);
  luz(false);
  expect(tokens(renderizar())).toHaveLength(3);
});

it.each(['cobrir', 'remover', 'trocar mapa'])('fecha detalhes já abertos ao %s e não reabre sozinho', (acao) => {
  luz(true, [regiao]);
  tokens(renderizar()).find((t) => t.props['aria-label'] === 'token NPC revelado')!.props.onClick();
  expect(elementos(renderizar(), TokenOverlayJogador)).toHaveLength(1);
  const anterior = useStore.getState().mapa;
  if (acao === 'cobrir') luz(true);
  if (acao === 'remover') useStore.setState({ mapa: { ...anterior, tokens: anterior.tokens.filter((t) => t.tipo !== 'npc') } });
  if (acao === 'trocar mapa') useStore.setState({ mapa: { ...anterior, mapaAtivoId: null } });
  expect(elementos(renderizar(), TokenOverlayJogador)).toHaveLength(0);
  useStore.setState({ mapa: anterior });
  expect(elementos(renderizar(), TokenOverlayJogador)).toHaveLength(0);
});

it('permite abrir pelo teclado apenas os tokens atualmente revelados', () => {
  luz(true, [regiao]);
  const token = tokens(renderizar()).find((t) => t.props['aria-label'] === 'token Outro personagem')!;
  const alvo = {};
  token.props.onKeyDown({ target: alvo, currentTarget: alvo, key: 'Enter', preventDefault: vi.fn() });
  expect(elementos(renderizar(), TokenOverlayJogador)).toHaveLength(1);
  luz(true);
  const tela = renderizar();
  expect(tokens(tela).some((t) => t.props['aria-label'] === 'token Outro personagem')).toBe(false);
  expect(elementos(tela, TokenOverlayJogador)).toHaveLength(0);
});

it('não inclui imagens nunca vistas no DOM, mas preserva símbolos parcialmente revelados ou em memória', () => {
  useStore.setState((s) => ({ mapa: { ...s.mapa, biblioteca: s.mapa.biblioteca.map((m) => ({ ...m, objetos: [
    { id: 'fora', nome: 'Segredo', imagemUrl: 'segredo.png', imagemPath: '', x: 0.7, y: 0.7, largura: 0.1, altura: 0.1, visivel: true },
    { id: 'parcial', nome: 'Parcial', imagemUrl: 'parcial.png', imagemPath: '', x: 0.3, y: 0.3, largura: 0.3, altura: 0.3, visivel: true },
    { id: 'oculto', nome: 'Oculto', imagemUrl: 'oculto.png', imagemPath: '', x: 0.2, y: 0.2, largura: 0.1, altura: 0.1, visivel: false },
  ] })) } }));
  const desenhar = () => ObjetosMapaView({ rect: { offsetX: 0, offsetY: 0, renderW: 600, renderH: 400 } });
  expect(elementos(desenhar(), 'img').map((el) => el.props.alt)).toEqual(['Parcial']);
  luz(false);
  expect(elementos(desenhar(), 'img').map((el) => el.props.alt)).toEqual(['Segredo', 'Parcial']);
});
