import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia } from './factories';
import { useStore } from './store';
import type { ArmaFicha } from './types';

const arma: ArmaFicha = { id: 'arma-1', nome: 'Revólver', bonusAtaque: '', dano: '1d6', alcance: '', nota: '', periciaAtaqueId: 'pontaria' };

beforeEach(() => {
  useStore.setState({ ...criarEstadoInicial(), fichas: [{ ...criarFichaVazia(), id: 'f1', nome: 'Helena', jogador: 'Ana' }] });
});
afterEach(() => vi.unstubAllGlobals());

describe('log privado das alterações de ficha', () => {
  it('registra aumentos e reduções da perícia com personagem, autor e graus', () => {
    vi.stubGlobal('window', { location: { pathname: '/jogador' } });
    const atualizar = useStore.getState().atualizarFicha;
    atualizar('f1', { pericias: { investigacao: 3 } });
    atualizar('f1', { pericias: { investigacao: 6 } });
    atualizar('f1', { pericias: {} });
    expect(useStore.getState().log.map((e) => e.texto)).toEqual([
      'Helena · jogador Ana alterou perícia Investigação: veterano → sem treino',
      'Helena · jogador Ana alterou perícia Investigação: treinado → veterano',
      'Helena · jogador Ana alterou perícia Investigação: sem treino → treinado',
    ]);
    for (const entrada of useStore.getState().log) {
      expect(entrada).toMatchObject({ tipo: 'ficha', personagemId: 'f1', visibilidade: 'privada' });
      expect(Number.isNaN(Date.parse(entrada.timestamp))).toBe(false);
    }
  });

  it('ignora o mesmo grau e a equivalência entre ausente e sem treino', () => {
    const atualizar = useStore.getState().atualizarFicha;
    atualizar('f1', { pericias: { investigacao: 0 } });
    atualizar('f1', { pericias: { investigacao: 0 } });
    atualizar('f1', { pericias: {} });
    expect(useStore.getState().log).toEqual([]);
  });

  it('registra cada inclusão por id, incluindo catálogo e importação em lote', () => {
    useStore.getState().atualizarFicha('f1', {
      kitInvestigacao: [{ id: 'kit-1', nome: 'Lanterna', nota: '' }],
      armas: [arma, { ...arma, id: 'arma-2' }],
      vinculos: [{ id: 'v1', quemOuOque: 'irmã', frase: 'vou protegê-la' }],
    });
    expect(useStore.getState().log.map((e) => e.texto)).toEqual([
      'Helena · mestre adicionou vínculo: irmã',
      'Helena · mestre adicionou arma: Revólver',
      'Helena · mestre adicionou arma: Revólver',
      'Helena · mestre adicionou item de investigação: Lanterna',
    ]);
  });

  it('avisa sobre inclusões vazias sem repetir a cada tecla, reordenação ou remoção', () => {
    const atualizar = useStore.getState().atualizarFicha;
    atualizar('f1', {
      kitInvestigacao: [{ id: 'kit-1', nome: '', nota: '' }],
      armas: [{ ...arma, nome: '' }],
      vinculos: [{ id: 'v1', quemOuOque: '', frase: '' }],
    });
    expect(useStore.getState().log.map((e) => e.texto)).toEqual([
      'Helena · mestre adicionou vínculo: vínculo (sem descrição)',
      'Helena · mestre adicionou arma: arma livre (sem nome)',
      'Helena · mestre adicionou item de investigação: item livre (sem nome)',
    ]);
    const log = useStore.getState().log;
    atualizar('f1', {
      kitInvestigacao: [{ id: 'kit-1', nome: 'Lanterna', nota: 'nova' }],
      armas: [arma],
      vinculos: [{ id: 'v1', quemOuOque: 'irmã', frase: 'texto' }],
    });
    atualizar('f1', { armas: [...useStore.getState().fichas[0].armas].reverse() });
    atualizar('f1', { kitInvestigacao: [], armas: [], vinculos: [] });
    expect(useStore.getState().log).toBe(log);
  });

  it('não gera avisos na hidratação remota ou em alterações fora do escopo', () => {
    useStore.setState({ fichas: [{ ...useStore.getState().fichas[0], pericias: { investigacao: 6 }, armas: [arma] }] });
    useStore.getState().atualizarFicha('f1', { anotacoes: 'anotação', nome: 'Novo nome' });
    useStore.getState().atualizarFicha('inexistente', { armas: [arma] });
    expect(useStore.getState().log).toEqual([]);
  });

  it('aceita ficha legada sem kit de investigação e mantém os ajustes de atributos', () => {
    const ficha = useStore.getState().fichas[0];
    useStore.setState({ fichas: [{ ...ficha, kitInvestigacao: undefined as never }] });
    useStore.getState().atualizarFicha('f1', {
      kitInvestigacao: [{ id: 'kit-1', nome: 'Lanterna', nota: '' }],
      atributos: { ...ficha.atributos, vigor: ficha.atributos.vigor + 1 },
    });
    expect(useStore.getState().log).toHaveLength(1);
    expect(useStore.getState().fichas[0].pvAtual).toBeGreaterThan(ficha.pvAtual);
  });
});
