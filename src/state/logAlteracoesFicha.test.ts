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

  it('avisa sobre inclusões vazias, seu preenchimento e sua remoção', () => {
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
    atualizar('f1', {
      kitInvestigacao: [{ id: 'kit-1', nome: 'Lanterna', nota: 'nova' }],
      armas: [arma],
      vinculos: [{ id: 'v1', quemOuOque: 'irmã', frase: 'texto' }],
    });
    expect(useStore.getState().log).toHaveLength(6);
    expect(useStore.getState().log[0].texto).toContain('quem ou o quê: (vazio) → "irmã"; frase: (vazio) → "texto"');
    const log = useStore.getState().log;
    atualizar('f1', { armas: [...useStore.getState().fichas[0].armas].reverse() });
    expect(useStore.getState().log).toBe(log);
    atualizar('f1', { kitInvestigacao: [], armas: [], vinculos: [] });
    expect(useStore.getState().log).toHaveLength(9);
    expect(useStore.getState().log.slice(0, 3).map((e) => e.texto)).toEqual([
      'Helena · mestre removeu vínculo: irmã · quem ou o quê: "irmã"; frase: "texto"',
      'Helena · mestre removeu arma: Revólver · nome: "Revólver"; dano: "1d6"; perícia de ataque: "Pontaria"',
      'Helena · mestre removeu item de investigação: Lanterna · nome: "Lanterna"; nota / acesso: "nova"',
    ]);
    expect(useStore.getState().log.every((e) => e.visibilidade === 'privada')).toBe(true);
  });

  it('detalha todos os campos editáveis das armas em um registro por arma', () => {
    useStore.setState({ fichas: [{ ...useStore.getState().fichas[0], armas: [arma] }] });
    useStore.getState().atualizarFicha('f1', { armas: [{ ...arma, nome: 'Faca', bonusAtaque: 'Vigor + Briga', dano: '1d4', alcance: '1 m', nota: 'oculta', periciaAtaqueId: 'briga' }] });
    expect(useStore.getState().log.map((e) => e.texto)).toEqual([
      'Helena · mestre editou arma: Revólver · nome: "Revólver" → "Faca"; ataque: (vazio) → "Vigor + Briga"; dano: "1d6" → "1d4"; alcance: (vazio) → "1 m"; nota: (vazio) → "oculta"; perícia de ataque: "Pontaria" → "Briga"',
    ]);
    const log = useStore.getState().log;
    useStore.getState().atualizarFicha('f1', { armas: [{ ...useStore.getState().fichas[0].armas[0] }] });
    expect(useStore.getState().log).toBe(log);
  });

  it('mostra quando o jogador limpa valores de item e vínculo ou retira a perícia da arma', () => {
    vi.stubGlobal('window', { location: { pathname: '/jogador.html' } });
    useStore.setState({ fichas: [{ ...useStore.getState().fichas[0],
      armas: [arma], kitInvestigacao: [{ id: 'kit-1', nome: 'Lanterna', nota: 'restrito' }],
      vinculos: [{ id: 'v1', quemOuOque: 'irmã', frase: 'proteger' }],
    }] });
    useStore.getState().atualizarFicha('f1', {
      armas: [{ ...arma, periciaAtaqueId: null }],
      kitInvestigacao: [{ id: 'kit-1', nome: '', nota: '' }],
      vinculos: [{ id: 'v1', quemOuOque: '', frase: '' }],
    });
    expect(useStore.getState().log.map((e) => e.texto)).toEqual([
      'Helena · jogador Ana editou vínculo: irmã · quem ou o quê: "irmã" → (vazio); frase: "proteger" → (vazio)',
      'Helena · jogador Ana editou arma: Revólver · perícia de ataque: "Pontaria" → (vazio)',
      'Helena · jogador Ana editou item de investigação: Lanterna · nome: "Lanterna" → (vazio); nota / acesso: "restrito" → (vazio)',
    ]);
  });

  it('distingue itens de mesmo nome por id e ignora reordenação', () => {
    useStore.setState({ fichas: [{ ...useStore.getState().fichas[0], armas: [arma, { ...arma, id: 'arma-2' }] }] });
    useStore.getState().atualizarFicha('f1', { armas: [{ ...arma, id: 'arma-2' }, arma] });
    expect(useStore.getState().log).toEqual([]);
    useStore.getState().atualizarFicha('f1', { armas: [{ ...arma, id: 'arma-2', dano: '1d8' }] });
    expect(useStore.getState().log).toHaveLength(2);
    expect(useStore.getState().log[0].texto).toContain('removeu arma: Revólver');
    expect(useStore.getState().log[1].texto).toContain('dano: "1d6" → "1d8"');
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
