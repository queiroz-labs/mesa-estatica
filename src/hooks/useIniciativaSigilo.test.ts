import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia, criarNpcVazio } from '../state/factories';
vi.mock('react', async (original) => ({
  ...await original<any>(),
  useState: (inicial: any) => [typeof inicial === 'function' ? inicial() : inicial, () => {}],
}));
vi.mock('../state/store', async (original) => {
  const real = await original<any>();
  return { ...real, useStore: Object.assign((selector: any) => selector(real.useStore.getState()), real.useStore) };
});
vi.mock('../state/combateUiStore', async (original) => {
  const real = await original<any>();
  return { ...real, useCombateUiStore: Object.assign((selector: any) => selector(real.useCombateUiStore.getState()), real.useCombateUiStore) };
});
import { useStore } from '../state/store';
import { useCombateUiStore } from '../state/combateUiStore';
import { useIniciativa } from './useIniciativa';

function ControleIniciativa() { return useIniciativa(); }
let ficha: ReturnType<typeof criarFichaVazia>;
let visivel: ReturnType<typeof criarNpcVazio>;
let oculto: ReturnType<typeof criarNpcVazio>;
beforeEach(() => {
  useStore.setState(criarEstadoInicial());
  ficha = { ...criarFichaVazia(), nome: 'Arthur' };
  visivel = { ...criarNpcVazio(), nome: 'Guarda', visivel: true };
  oculto = { ...criarNpcVazio(), nome: 'Segredo', visivel: false };
  useStore.setState({
    fichas: [ficha], npcs: [visivel, oculto],
    iniciativa: [
      { id: 'pc', tipo: 'pc', participanteId: ficha.id, nome: ficha.nome, valor: 20 },
      { id: 'visivel', tipo: 'npc', participanteId: visivel.id, nome: visivel.nome, valor: 15 },
      { id: 'oculto', tipo: 'npc', participanteId: oculto.id, nome: oculto.nome, valor: 10 },
    ],
  });
  useCombateUiStore.setState({ selecionadosAplicar: new Set([ficha.id, visivel.id, oculto.id]) });
});
afterEach(() => vi.restoreAllMocks());

it('dano em área registra alvos públicos e NPC ocultos em logs separados, mantendo o dano', () => {
  ControleIniciativa().aplicarDanoEmMassa(-3);
  const estado = useStore.getState();
  expect(estado.fichas[0].pvAtual).toBe(ficha.pvAtual - 3);
  expect(estado.npcs.map((n) => n.pvAtual)).toEqual([visivel.pvAtual - 3, oculto.pvAtual - 3]);
  const logsArea = estado.log.filter((e) => e.texto.startsWith('dano em área'));
  const publico = logsArea.find((e) => e.visibilidade === 'publica');
  const privado = logsArea.find((e) => e.visibilidade === 'privada');
  expect(publico?.texto).toContain('Arthur, Guarda');
  expect(publico?.texto).not.toContain('Segredo');
  expect(privado?.texto).toContain('Segredo');
  expect(logsArea).toHaveLength(2);
});

it.each(['oculto', 'publico'] as const)('só cria o log %s se todos os alvos pertencem a essa visão', (visao) => {
  useCombateUiStore.setState({ selecionadosAplicar: new Set([visao === 'oculto' ? oculto.id : ficha.id]) });
  ControleIniciativa().aplicarDanoEmMassa(-3);
  const logsArea = useStore.getState().log.filter((e) => e.texto.startsWith('dano em área'));
  expect(logsArea).toHaveLength(1);
  expect(logsArea[0].visibilidade).toBe(visao === 'oculto' ? 'privada' : 'publica');
});

it.each([
  { pv: -5, condicoes: [], caso: 'morto pelos PV' },
  { pv: 8, condicoes: ['morto'], caso: 'morto marcado pelo mestre' },
])('socorro não estabiliza nem cura alguém $caso', ({ pv, condicoes }) => {
  useStore.getState().atualizarNpc(visivel.id, { pvAtual: pv });
  useStore.setState((s) => ({ sessaoPublica: { ...s.sessaoPublica, condicoesCombate: { [visivel.id]: condicoes } } }));
  useCombateUiStore.setState({ socorristaPorAlvo: { [visivel.id]: ficha.id } });
  const rolar = vi.spyOn(Math, 'random').mockReturnValue(0.99);
  const controle = ControleIniciativa();
  controle.tentarEstabilizar(visivel.id);
  controle.tentarPrimeirosSocorros(visivel.id);
  expect(rolar).not.toHaveBeenCalled();
  expect(useStore.getState().log).toEqual([]);
  expect(useStore.getState().sessaoPublica.condicoesCombate[visivel.id]).toEqual(condicoes);
  expect(useStore.getState().npcs.find((n) => n.id === visivel.id)?.pvAtual).toBe(pv);
});

it('estabilizar continua funcionando a 0 PV e um segundo clique não desliga Estável', () => {
  useStore.getState().atualizarNpc(visivel.id, { pvAtual: 0 });
  useCombateUiStore.setState({ socorristaPorAlvo: { [visivel.id]: ficha.id } });
  const rolar = vi.spyOn(Math, 'random').mockReturnValue(0.99);
  const controle = ControleIniciativa();
  controle.tentarEstabilizar(visivel.id);
  controle.tentarEstabilizar(visivel.id);
  expect(rolar).toHaveBeenCalledTimes(1);
  expect(useStore.getState().sessaoPublica.condicoesCombate[visivel.id]).toEqual(['estavel']);
  expect(useStore.getState().npcs.find((n) => n.id === visivel.id)?.pvAtual).toBe(0);
});

it.each(['pc', 'visivel', 'oculto'])('adiar turno %s preserva a rodada e a ordem dos demais', (atualId) => {
  const ordemOriginal = useStore.getState().iniciativa;
  const indice = ordemOriginal.findIndex((e) => e.id === atualId);
  useStore.setState((s) => ({ sessaoPublica: { ...s.sessaoPublica, modoCombate: true, turnoAtualId: atualId, rodada: 3 } }));
  ControleIniciativa().adiarIniciativa(atualId);
  let estado = useStore.getState();
  if (indice === ordemOriginal.length - 1) {
    expect(estado.iniciativa).toEqual(ordemOriginal);
    expect(estado.sessaoPublica.turnoAtualId).toBe(atualId);
    expect(estado.sessaoPublica.condicoesCombate).toEqual({});
    return;
  }
  expect(estado.iniciativa.map((e) => e.id)).toEqual([...ordemOriginal.filter((e) => e.id !== atualId).map((e) => e.id), atualId]);
  expect(estado.sessaoPublica.turnoAtualId).toBe(ordemOriginal[indice + 1].id);
  expect(estado.sessaoPublica.rodada).toBe(3);
  const participanteId = ordemOriginal[indice].participanteId;
  expect(estado.sessaoPublica.condicoesCombate[participanteId]).toContain('aguardando');
  for (let i = indice + 1; i < ordemOriginal.length; i++) {
    expect(useStore.getState().sessaoPublica.turnoAtualId).toBe(ordemOriginal[i].id);
    useStore.getState().avancarTurno();
    expect(useStore.getState().sessaoPublica.rodada).toBe(3);
  }
  expect(useStore.getState().sessaoPublica.turnoAtualId).toBe(atualId);
  useStore.getState().avancarTurno();
  estado = useStore.getState();
  expect(estado.sessaoPublica.rodada).toBe(4);
  expect(estado.sessaoPublica.condicoesCombate[participanteId] ?? []).not.toContain('aguardando');
});

it('adiar outro combatente preserva a vez atual e mantém Aguardando ligado', () => {
  useStore.setState((s) => ({ sessaoPublica: { ...s.sessaoPublica, modoCombate: true, turnoAtualId: 'pc', rodada: 2, condicoesCombate: { [visivel.id]: ['aguardando'] } } }));
  ControleIniciativa().adiarIniciativa('visivel');
  const estado = useStore.getState();
  expect(estado.sessaoPublica.turnoAtualId).toBe('pc');
  expect(estado.sessaoPublica.rodada).toBe(2);
  expect(estado.sessaoPublica.condicoesCombate[visivel.id]).toEqual(['aguardando']);
  expect(estado.sessaoPublica.condicaoDuracao?.[visivel.id]?.aguardando).toBe(1);
});

it('adiar não consome a duração das condições antes da ação adiada acontecer', () => {
  useStore.setState((s) => ({ sessaoPublica: { ...s.sessaoPublica, modoCombate: true, turnoAtualId: 'pc', rodada: 1, condicoesCombate: { [ficha.id]: ['exposto'] }, condicaoDuracao: { [ficha.id]: { exposto: 2 } } } }));
  ControleIniciativa().adiarIniciativa('pc');
  expect(useStore.getState().sessaoPublica.condicaoDuracao?.[ficha.id]?.exposto).toBe(2);
  useStore.getState().avancarTurno();
  useStore.getState().avancarTurno();
  expect(useStore.getState().sessaoPublica.turnoAtualId).toBe('pc');
  expect(useStore.getState().sessaoPublica.condicaoDuracao?.[ficha.id]?.exposto).toBe(2);
  useStore.getState().avancarTurno();
  expect(useStore.getState().sessaoPublica.condicaoDuracao?.[ficha.id]?.exposto).toBe(1);
});
