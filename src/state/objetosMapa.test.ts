import { beforeEach, expect, it } from 'vitest';
import { criarEstadoInicial, criarMapaBiblioteca } from './factories';
import { useStore } from './store';
import { mesclarObjetosMapa, normalizarObjetosMapa, objetoMapaValido } from './objetosMapa';
import type { ObjetoMapa } from './types';

const objeto = (patch: Partial<ObjetoMapa> = {}): ObjetoMapa => ({ id: 'o', nome: 'pista', imagemUrl: 'https://example.test/pista.webp', imagemPath: 'img/objetos/pista.webp', x: .2, y: .3, largura: .2, altura: .1, visivel: false, ...patch });
beforeEach(() => useStore.setState(criarEstadoInicial()));
it('sempre adiciona oculto; modificar e remover não muda tokens, grade ou FoW', () => {
  const s = useStore.getState(), id = s.adicionarMapaBiblioteca('m', '', 'https://example.test/m.jpg');
  const antes = useStore.getState().mapa;
  s.adicionarObjetoMapa(id, objeto({ visivel: true }));
  expect(useStore.getState().mapa.biblioteca[0].objetos?.[0].visivel).toBe(false);
  s.atualizarObjetoMapa(id, 'o', { visivel: true, x: .5 });
  expect(useStore.getState().mapa.biblioteca[0].objetos?.[0]).toMatchObject({ visivel: true, x: .5 });
  s.removerObjetoMapa(id, 'o');
  expect(useStore.getState().mapa.biblioteca[0].objetos).toEqual([]);
  expect(useStore.getState().mapa.tokens).toBe(antes.tokens);
  expect(useStore.getState().mapa.biblioteca[0].grade).toBe(antes.biblioteca[0].grade);
  expect(useStore.getState().mapa.biblioteca[0].fow).toBe(antes.biblioteca[0].fow);
});
it('não duplica, não aceita coordenadas inválidas e mapa removido não ressuscita', () => {
  const s = useStore.getState(), id = s.adicionarMapaBiblioteca('m', '', 'https://example.test/m.jpg');
  s.adicionarObjetoMapa(id, objeto()); s.adicionarObjetoMapa(id, objeto()); s.atualizarObjetoMapa(id, 'o', { x: 2 });
  expect(useStore.getState().mapa.biblioteca[0].objetos).toEqual([objeto()]);
  s.removerMapaBiblioteca(id); s.adicionarObjetoMapa(id, objeto());
  expect(useStore.getState().mapa.biblioteca).toEqual([]);
});
it('backup antigo normaliza vazio e novo preserva geometria, transparência por URL e visibilidade', () => {
  const mapa = criarMapaBiblioteca('m', '', 'https://example.test/m.jpg', 0);
  const base = { ...criarEstadoInicial(), mapa: { biblioteca: [mapa], mapaAtivoId: mapa.id, tokens: [] } };
  useStore.getState().importarJSON(JSON.stringify(base)); expect(useStore.getState().mapa.biblioteca[0].objetos).toEqual([]);
  useStore.getState().adicionarObjetoMapa(mapa.id, objeto()); useStore.getState().atualizarObjetoMapa(mapa.id, 'o', { visivel: true });
  const json = useStore.getState().exportarJSON(); useStore.setState(criarEstadoInicial()); useStore.getState().importarJSON(json);
  expect(useStore.getState().mapa.biblioteca[0].objetos).toEqual([objeto({ visivel: true })]);
});
it('rejeita backup inválido sem mutação e oculta dados remotos inválidos', () => {
  const antes = useStore.getState(); const base = criarEstadoInicial();
  base.mapa.biblioteca = [{ ...criarMapaBiblioteca('m', '', 'x', 0), objetos: [objeto({ imagemUrl: 'javascript:alert(1)' })] }];
  expect(() => antes.importarJSON(JSON.stringify(base))).toThrow('objetos'); expect(useStore.getState()).toBe(antes);
  expect(normalizarObjetosMapa(base.mapa.biblioteca[0].objetos)).toEqual([]);
  expect(objetoMapaValido(objeto({ largura: NaN }))).toBe(false);
});
it('eco atrasado não apaga lista mais nova nem rascunho; nova revisão remota atualiza', () => {
  const mapa = { ...criarMapaBiblioteca('m', '', 'x', 0), objetos: [objeto()], objetosRevisao: 3 };
  expect(mesclarObjetosMapa(mapa, { ...mapa, objetos: [], objetosRevisao: 2 }).objetos).toEqual([objeto()]);
  expect(mesclarObjetosMapa({ ...mapa, objetosPendentes: true }, { ...mapa, objetos: [], objetosRevisao: 4 }).objetos).toEqual([objeto()]);
  expect(mesclarObjetosMapa(mapa, { ...mapa, objetos: [], objetosRevisao: 4 }).objetos).toEqual([]);
});
