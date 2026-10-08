import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia } from '../state/factories';
import { useStore } from '../state/store';
import ResumoJogador from './ResumoJogador';

vi.mock('../lib/supabaseClient', () => ({ supabase: null }));
vi.mock('../state/store', async (original) => {
  const real = await original<any>();
  return { ...real, useStore: Object.assign((selector: any) => selector(real.useStore.getState()), real.useStore) };
});
beforeEach(() => useStore.setState(criarEstadoInicial()));

function preparar() {
  const minhaFicha = { ...criarFichaVazia(), id: 'minha-ficha', nome: 'Arthur', pvAtual: 17,
    atributos: { ...criarFichaVazia().atributos, vigor: 2, agilidade: 3 }, equipamentoModificadorDefesa: 1, determinacao: 1 };
  const minhaEntrada = { id: 'minha-entrada', participanteId: minhaFicha.id, tipo: 'pc' as const };
  useStore.setState((s) => ({ config: { ...s.config, basePV: 10 },
    sessaoPublica: { ...s.sessaoPublica, modoCombate: true, turnoAtualId: minhaEntrada.id, rodada: 4 } }));
  return { minhaFicha, minhaEntrada };
}

it('usa PV máximo configurado, proteção e Determinação da própria ficha, sem consumir dados alheios', () => {
  const { minhaFicha, minhaEntrada } = preparar();
  const outra = { ...criarFichaVazia(), id: 'alheia', nome: 'nome privado alheio', pvAtual: 999, determinacao: 2 };
  useStore.setState({ fichas: [outra], fichaAtivaId: outra.id });
  const html = renderToStaticMarkup(<ResumoJogador minhaFicha={minhaFicha} iniciativa={[minhaEntrada]} />);
  expect(html).toContain('PV <strong>17/20</strong>');
  expect(html).toContain('Defesa <strong>14</strong>');
  expect(html).toContain('Determinação <strong>1/2</strong>');
  expect(html).toContain('rodada 4 · sua vez');
  expect(html).not.toMatch(/999|nome privado alheio/);
});

it('sinaliza sua vez só em combate e remove aviso quando turno passa para outro PC', () => {
  const { minhaFicha, minhaEntrada } = preparar();
  const outro = { id: 'outra-entrada', participanteId: 'alheia', tipo: 'pc' as const };
  let html = renderToStaticMarkup(<ResumoJogador minhaFicha={minhaFicha} iniciativa={[minhaEntrada, outro]} />);
  expect(html).toContain('sua vez');
  useStore.setState((s) => ({ sessaoPublica: { ...s.sessaoPublica, turnoAtualId: outro.id } }));
  html = renderToStaticMarkup(<ResumoJogador minhaFicha={minhaFicha} iniciativa={[minhaEntrada, outro]} />);
  expect(html).not.toContain('sua vez');
  expect(html).toContain('17/20');
  useStore.setState((s) => ({ sessaoPublica: { ...s.sessaoPublica, turnoAtualId: minhaEntrada.id, modoCombate: false } }));
  html = renderToStaticMarkup(<ResumoJogador minhaFicha={minhaFicha} iniciativa={[minhaEntrada]} />);
  expect(html).not.toContain('sua vez');
  expect(html).toContain('Determinação');
});

it('turno de NPC oculto/ausente não expõe nome e não confunde id de NPC com a própria ficha', () => {
  const { minhaFicha } = preparar();
  useStore.setState((s) => ({ sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'npc-oculto' } }));
  const npc = { id: 'npc-oculto', participanteId: minhaFicha.id, tipo: 'npc' as const, nome: 'nome secreto do NPC' };
  const html = renderToStaticMarkup(<ResumoJogador minhaFicha={minhaFicha} iniciativa={[npc]} />);
  expect(html).not.toMatch(/sua vez|nome secreto do NPC/);
  expect(renderToStaticMarkup(<ResumoJogador minhaFicha={minhaFicha} iniciativa={[]} />)).not.toContain('sua vez');
});

it('sem ficha própria não apresenta dados de outra ficha ativa nem aviso de turno', () => {
  preparar();
  const outra = criarFichaVazia();
  useStore.setState({ fichas: [outra], fichaAtivaId: outra.id });
  expect(renderToStaticMarkup(<ResumoJogador minhaFicha={null} iniciativa={[]} />)).toBe('');
});
