import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia } from '../../state/factories';
import { useStore } from '../../state/store';
import CombateJogadorView from './CombateJogadorView';
vi.mock('../../state/store', async (original) => {
  const real = await original<any>();
  return { ...real, useStore: Object.assign((selector: any) => selector(real.useStore.getState()), real.useStore) };
});
beforeEach(() => useStore.setState(criarEstadoInicial()));

it('jogador lê as condições e sua duração sem botões que só alterariam a cópia local', () => {
  const ficha = { ...criarFichaVazia(), nome: 'Arthur' };
  const entrada = { id: 'entrada', participanteId: ficha.id, tipo: 'pc' as const, nome: ficha.nome, valor: 20 };
  useStore.setState((s) => ({
    fichas: [ficha],
    sessaoPublica: { ...s.sessaoPublica, modoCombate: true, turnoAtualId: entrada.id, condicoesCombate: { [ficha.id]: ['exposto'] }, condicaoDuracao: { [ficha.id]: { exposto: 2 } } },
  }));
  const html = renderToStaticMarkup(<CombateJogadorView iniciativa={[entrada]} minhaFicha={ficha} npcs={[]} />);
  expect(html).toContain('Exposto (2)');
  expect(html).toContain('2 rodadas restantes');
  expect(html).not.toMatch(/<button[^>]*class="combate-chip/);
  expect(html).toContain('PV');
});
