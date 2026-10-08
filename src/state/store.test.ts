import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarStorageComDebounce, migrate, useStore } from './store';
import { calcularSanidadeMaxima } from '../rules/derivados';
import { criarEstadoInicial, criarFichaVazia, criarGradeInicial } from './factories';
import { TABELA_SURTO } from '../rules/data/surto';
import { personagemEstaEmSurto } from '../rules/surto';
import { limparConsumidorForcados, registrarConsumidorForcados } from '../dice/registroForcados';
import { useStatusMesa } from '../lib/statusMesa';
import type { EstadoFoW } from './types';

beforeEach(() => {
  useStore.setState(criarEstadoInicial());
});

/** Cria um item na biblioteca de mapas e seleciona como ativo — as ações de grid/FoW são
 *  no-op sem um mapa ativo (`patchMapaAtivo`/`patchFowAtivo` em store.ts), então os testes que
 *  exercitam essas ações precisam de um antes de mais nada. Com `fow`, sobrescreve o FoW vazio
 *  default do item recém-criado (mesmo padrão do `useStore.setState({ mapa: { ...fow } })`
 *  usado antes da biblioteca existir). Retorna o id do item ativo. */
function prepararMapaDeTeste(fow?: EstadoFoW): string {
  const id = useStore.getState().adicionarMapaBiblioteca('mapa de teste', 'img/mapas/teste.jpg', 'https://exemplo.test/mapa.jpg');
  useStore.getState().selecionarMapaAtivo(id);
  if (fow) {
    useStore.setState((s) => ({
      mapa: { ...s.mapa, biblioteca: s.mapa.biblioteca.map((m) => (m.id === id ? { ...m, fow } : m)) },
    }));
  }
  return id;
}

/** `fow` do mapa ativo agora — equivalente ao antigo `useStore.getState().mapa.fow`. */
function fowAtivo(): EstadoFoW {
  const s = useStore.getState();
  return s.mapa.biblioteca.find((m) => m.id === s.mapa.mapaAtivoId)!.fow;
}

describe('avancarCena', () => {
  it('incrementa contadorCena', () => {
    useStore.setState({ sessaoPublica: { ...useStore.getState().sessaoPublica, contadorCena: 5 } });
    useStore.getState().avancarCena();
    expect(useStore.getState().sessaoPublica.contadorCena).toBe(6);
  });

  it('zera surtosAtivos de toda ficha — fim de cena é fronteira absoluta pro Surto (regras.md)', () => {
    const ficha = criarFichaVazia();
    ficha.surtosAtivos = [
      { id: '1', expiraEm: 2, escolha: 'Fuga cega', modo: 'cena' },
      { id: '2', expiraEm: 3, escolha: 'Fúria', modo: 'combate' },
    ];
    useStore.setState({ fichas: [ficha], sessaoPublica: { ...useStore.getState().sessaoPublica, contadorCena: 1 } });
    useStore.getState().avancarCena(); // 1 -> 2
    expect(useStore.getState().fichas[0].surtosAtivos).toEqual([]);
  });

  it('não quebra se surtosAtivos for undefined', () => {
    const ficha = criarFichaVazia();
    delete (ficha as any).surtosAtivos;
    useStore.setState({ fichas: [ficha] });
    expect(() => useStore.getState().avancarCena()).not.toThrow();
  });

  it('incrementa contadorCena em chamadas sucessivas', () => {
    expect(useStore.getState().sessaoPublica.contadorCena).toBe(1);
    useStore.getState().avancarCena();
    expect(useStore.getState().sessaoPublica.contadorCena).toBe(2);
    useStore.getState().avancarCena();
    expect(useStore.getState().sessaoPublica.contadorCena).toBe(3);
  });
});

describe('encerrarModoCombate — surtos', () => {
  it('remove só surtos com modo === "combate", preserva modo === "cena"', () => {
    const ficha = criarFichaVazia();
    ficha.surtosAtivos = [
      { id: '1', expiraEm: 5, escolha: 'Fúria', modo: 'combate' },
      { id: '2', expiraEm: 3, escolha: 'Congelamento', modo: 'cena' },
    ];
    useStore.setState({ fichas: [ficha], sessaoPublica: { ...useStore.getState().sessaoPublica, modoCombate: true } });
    useStore.getState().encerrarModoCombate();
    const surtos = useStore.getState().fichas[0].surtosAtivos;
    expect(surtos).toHaveLength(1);
    expect(surtos[0].id).toBe('2');
  });

  it('não quebra se surtosAtivos for undefined', () => {
    const ficha = criarFichaVazia();
    delete (ficha as any).surtosAtivos;
    useStore.setState({ fichas: [ficha] });
    expect(() => useStore.getState().encerrarModoCombate()).not.toThrow();
  });

  it('reproduz o bug relatado: Surto de combate não reaparece ao reiniciar o combate', () => {
    const ficha = criarFichaVazia();
    ficha.surtosAtivos = [{ id: '1', expiraEm: 5, escolha: 'Fúria', modo: 'combate' }];
    useStore.setState({
      fichas: [ficha],
      iniciativa: [{ id: 'it1', participanteId: ficha.id, tipo: 'pc', nome: ficha.nome || 'pc', valor: 10 }],
      sessaoPublica: { ...useStore.getState().sessaoPublica, modoCombate: true, rodada: 2 },
    });
    expect(personagemEstaEmSurto(useStore.getState().fichas[0].surtosAtivos, useStore.getState().sessaoPublica)).toBe(true);

    useStore.getState().encerrarModoCombate();
    expect(personagemEstaEmSurto(useStore.getState().fichas[0].surtosAtivos, useStore.getState().sessaoPublica)).toBe(false);

    useStore.getState().iniciarModoCombate(); // rodada volta pra 1
    expect(useStore.getState().sessaoPublica.rodada).toBe(1);
    expect(personagemEstaEmSurto(useStore.getState().fichas[0].surtosAtivos, useStore.getState().sessaoPublica)).toBe(false);
  });
});

describe('ajustarSanidadeAtual', () => {
  function adicionarFicha(sanidadeAtual: number, vontade: number = 5): string {
    const ficha = criarFichaVazia();
    ficha.sanidadeAtual = sanidadeAtual;
    ficha.atributos.vontade = vontade;
    useStore.setState({ fichas: [ficha] });
    return ficha.id;
  }

  it('atualiza sanidade dentro dos limites', () => {
    const id = adicionarFicha(10);
    useStore.getState().ajustarSanidadeAtual(id, 3);
    expect(useStore.getState().fichas[0].sanidadeAtual).toBe(3);
  });

  it('não negativa', () => {
    const id = adicionarFicha(5);
    useStore.getState().ajustarSanidadeAtual(id, -10);
    expect(useStore.getState().fichas[0].sanidadeAtual).toBe(0);
  });

  it('não ultrapassa máxima', () => {
    const id = adicionarFicha(8);
    const max = calcularSanidadeMaxima(useStore.getState().fichas[0].atributos.vontade);
    useStore.getState().ajustarSanidadeAtual(id, max + 15); // bem acima do máximo, pra testar o clamp de verdade
    expect(useStore.getState().fichas[0].sanidadeAtual).toBe(max);
  });

  it('dispara surto quando perde 5+ de uma vez', () => {
    const id = adicionarFicha(10);
    // d20 diferentes (3 e 11) — sem travar, os dois rolamentos tinham 1/20 de chance de
    // empatar e derrubar esse teste de vez em quando (flakou de verdade em CI em 24/07).
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.5);
    useStore.getState().ajustarSanidadeAtual(id, 4);
    vi.restoreAllMocks();
    expect(useStore.getState().fichas.find((f) => f.id === id)?.surtoPendente).toBeDefined();
  });

  it('cria entrada com escolha pendente quando d20 diferem', () => {
    const id = adicionarFicha(10);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.5);
    useStore.getState().ajustarSanidadeAtual(id, 4);
    vi.restoreAllMocks();
    const pendente = useStore.getState().fichas.find((f) => f.id === id)?.surtoPendente;
    expect(pendente).toBeDefined();
    expect(pendente!.entradaA).not.toEqual(pendente!.entradaB);
  });

  it('d20 iguais: resolve direto, sem pendência de escolha — o resultado já entra em surtosAtivos', () => {
    const id = adicionarFicha(10);
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // mesmo valor pros dois d20 → "mesmoNumero"
    useStore.getState().ajustarSanidadeAtual(id, 4);
    expect(useStore.getState().fichas.find((f) => f.id === id)?.surtoPendente).toBeUndefined();
    const ficha = useStore.getState().fichas.find((f) => f.id === id)!;
    expect(ficha.surtosAtivos).toHaveLength(1);
    expect(ficha.surtosAtivos[0].escolha).not.toBeNull();
    vi.restoreAllMocks();
  });

  it('incrementa estatística de surtos', () => {
    const id = adicionarFicha(10);
    useStore.getState().ajustarSanidadeAtual(id, 4);
    expect(useStore.getState().sessaoPrivada.estatisticas.surtos).toBe(1);
  });

  it('surto automático fora de combate usa calcularExpiraSurto — badge "ativo" já na cena do colapso', () => {
    const id = adicionarFicha(10);
    useStore.setState((s) => ({ sessaoPublica: { ...s.sessaoPublica, contadorCena: 7, modoCombate: false } }));
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // mesmo valor pros dois d20 → resolve direto, sem 1d4 aqui
    useStore.getState().ajustarSanidadeAtual(id, 4);
    vi.restoreAllMocks();
    const ficha = useStore.getState().fichas.find((f) => f.id === id)!;
    expect(ficha.surtosAtivos[0].expiraEm).toBe(7);
    expect(personagemEstaEmSurto(ficha.surtosAtivos, useStore.getState().sessaoPublica)).toBe(true);
  });

  it('surto automático em combate usa rodada+1d4+1 (calcularExpiraSurto), não contadorCena', () => {
    const id = adicionarFicha(10);
    useStore.setState((s) => ({
      sessaoPublica: { ...s.sessaoPublica, modoCombate: true, rodada: 3, contadorCena: 99 },
    }));
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // d20A=d20B=3 (mesmoNumero) e 1d4=1 → expiraEm = 3+1
    useStore.getState().ajustarSanidadeAtual(id, 4);
    vi.restoreAllMocks();
    const ficha = useStore.getState().fichas.find((f) => f.id === id)!;
    expect(ficha.surtosAtivos[0].expiraEm).toBe(4);
    expect(personagemEstaEmSurto(ficha.surtosAtivos, useStore.getState().sessaoPublica)).toBe(true);
  });
});

describe('resolverEscolhaSurtoPendente', () => {
  function adicionarFicha(sanidadeAtual: number, vontade: number = 5): string {
    const ficha = criarFichaVazia();
    ficha.sanidadeAtual = sanidadeAtual;
    ficha.atributos.vontade = vontade;
    useStore.setState({ fichas: [ficha] });
    return ficha.id;
  }

  it('atualiza escolha do surto pendente', () => {
    const id = adicionarFicha(10);
    // d20 forçados a diferir (0.1→3, 0.9→19) — garante a pendência de escolha em vez de
    // depender da sorte de dois d20 reais nunca baterem (~5% de chance de falso negativo).
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
    useStore.getState().ajustarSanidadeAtual(id, 4);
    vi.restoreAllMocks();
    const pendente = useStore.getState().fichas.find((f) => f.id === id)?.surtoPendente;
    expect(pendente).toBeDefined();
    useStore.getState().resolverEscolhaSurtoPendente(id, 'A');
    const ficha = useStore.getState().fichas.find((f) => f.id === id)!;
    expect(ficha.surtosAtivos[ficha.surtosAtivos.length - 1].escolha).toBe(pendente!.entradaA.nome);
  });

  it('não duplica entradas', () => {
    const id = adicionarFicha(10);
    useStore.getState().ajustarSanidadeAtual(id, 4);
    useStore.getState().resolverEscolhaSurtoPendente(id, 'A');
    expect(useStore.getState().fichas.find((f) => f.id === id)?.surtoPendente).toBeUndefined();
  });

  it('limpa escolha pendente após resolver', () => {
    const id = adicionarFicha(10);
    useStore.getState().ajustarSanidadeAtual(id, 4);
    useStore.getState().resolverEscolhaSurtoPendente(id, 'A');
    expect(useStore.getState().fichas.find((f) => f.id === id)?.surtoPendente).toBeUndefined();
  });

  it('não quebra se não há pendente', () => {
    const id = adicionarFicha(10);
    expect(() => useStore.getState().resolverEscolhaSurtoPendente(id, 'A')).not.toThrow();
  });

  describe('surtosAtivos undefined', () => {
    it('ajustarSanidadeAtual não quebra se surtosAtivos for undefined', () => {
      const id = adicionarFicha(10);
      delete (useStore.getState().fichas[0] as any).surtosAtivos;
      expect(() => useStore.getState().ajustarSanidadeAtual(id, 5)).not.toThrow();
      const ficha = useStore.getState().fichas.find((f) => f.id === id)!;
      expect(ficha.sanidadeAtual).toBe(5);
    });

    it('resolverEscolhaSurtoPendente não quebra se surtosAtivos for undefined', () => {
      const id = adicionarFicha(10);
      useStore.setState((s) => ({
        fichas: s.fichas.map((f) =>
          f.id === id
            ? {
                ...f,
                surtoPendente: {
                  nomeFicha: 'Teste',
                  entradaA: TABELA_SURTO.find((e) => e.d20 === 1)!,
                  entradaB: TABELA_SURTO.find((e) => e.d20 === 20)!,
                },
              }
            : f,
        ),
      }));
      expect(() => useStore.getState().resolverEscolhaSurtoPendente(id, 'A')).not.toThrow();
    });

    it('avancarCena não quebra se surtosAtivos for undefined', () => {
      const ficha = criarFichaVazia();
      delete (ficha as any).surtosAtivos;
      useStore.setState({ fichas: [ficha] });
      expect(() => useStore.getState().avancarCena()).not.toThrow();
    });
  });
});

describe('removerSurtoAtivo', () => {
  function adicionarFicha(sanidadeAtual: number, vontade: number = 5): string {
    const ficha = criarFichaVazia();
    ficha.sanidadeAtual = sanidadeAtual;
    ficha.atributos.vontade = vontade;
    useStore.setState({ fichas: [ficha] });
    return ficha.id;
  }

  it('remove uma entrada resolvida específica, mantendo as outras', () => {
    const id = adicionarFicha(10);
    useStore.setState((s) => ({
      fichas: s.fichas.map((f) =>
        f.id === id
          ? {
              ...f,
              surtosAtivos: [
                { id: 'surto-1', expiraEm: 1, escolha: 'primeiro', modo: 'cena' as const },
                { id: 'surto-2', expiraEm: 1, escolha: 'segundo', modo: 'cena' as const },
              ],
            }
          : f,
      ),
    }));
    useStore.getState().removerSurtoAtivo(id, 'surto-1');
    const ficha = useStore.getState().fichas.find((f) => f.id === id)!;
    expect(ficha.surtosAtivos.map((s) => s.id)).toEqual(['surto-2']);
  });

  it('remove uma entrada pendente e limpa surtoPendente junto', () => {
    const id = adicionarFicha(10);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
    useStore.getState().ajustarSanidadeAtual(id, 4);
    vi.restoreAllMocks();
    const ficha = useStore.getState().fichas.find((f) => f.id === id)!;
    expect(ficha.surtoPendente).toBeDefined();
    const surtoId = ficha.surtosAtivos[ficha.surtosAtivos.length - 1].id;

    useStore.getState().removerSurtoAtivo(id, surtoId);
    const depois = useStore.getState().fichas.find((f) => f.id === id)!;
    expect(depois.surtosAtivos.find((s) => s.id === surtoId)).toBeUndefined();
    expect(depois.surtoPendente).toBeUndefined();
  });

  it('id inexistente ou ficha inexistente: não quebra, não muda nada', () => {
    const id = adicionarFicha(10);
    useStore.setState((s) => ({
      fichas: s.fichas.map((f) =>
        f.id === id ? { ...f, surtosAtivos: [{ id: 'surto-1', expiraEm: 1, escolha: 'x', modo: 'cena' as const }] } : f,
      ),
    }));
    expect(() => useStore.getState().removerSurtoAtivo(id, 'nao-existe')).not.toThrow();
    expect(() => useStore.getState().removerSurtoAtivo('ficha-nao-existe', 'surto-1')).not.toThrow();
    const ficha = useStore.getState().fichas.find((f) => f.id === id)!;
    expect(ficha.surtosAtivos.map((s) => s.id)).toEqual(['surto-1']);
  });
});

describe('npcs.acoes undefined', () => {
  function npcSemAcoes(): string {
    useStore.getState().adicionarNpc();
    const npcId = useStore.getState().npcs[0].id;
    useStore.setState((s) => ({
      npcs: s.npcs.map((n) => {
        if (n.id !== npcId) return n;
        const { acoes: _, ...rest } = n as any;
        return rest as any;
      }),
    }));
    return npcId;
  }

  it('salvarNovaAcao não quebra se acoes for undefined', () => {
    const npcId = npcSemAcoes();
    const npc = useStore.getState().npcs.find((n) => n.id === npcId) as any;
    const novaAcao = { id: 'a1', nome: 'Ataque', bonus: 5, dano: '1d6' };
    expect(() =>
      useStore.getState().atualizarNpc(npcId, { acoes: [...(npc.acoes ?? []), novaAcao] }),
    ).not.toThrow();
  });

  it('atualizarNpc com patch de acoes não quebra se array for undefined', () => {
    const npcId = npcSemAcoes();
    const novaAcao = { id: 'a1', nome: 'Ataque', bonus: 5, dano: '1d6' };
    useStore.getState().atualizarNpc(npcId, { acoes: [novaAcao] });
    const npc = useStore.getState().npcs.find((n) => n.id === npcId)!;
    expect(npc.acoes).toEqual([novaAcao]);
  });
});

describe('undefined em arrays aninhados', () => {
  it('registrarRoll não quebra se rollsLog for undefined', () => {
    useStore.setState({ rollsLog: undefined as any });
    expect(() =>
      useStore.getState().registrarRoll({
        origem: 'teste',
        personagemId: null,
        formula: '1d20',
        total: 10,
        bruto: 10,
        visibilidade: 'publica',
      }),
    ).not.toThrow();
    expect(useStore.getState().rollsLog.length).toBe(1);
  });

  it('condicoesCombate undefined não quebra alternarCondicaoCombate', () => {
    useStore.setState((s) => ({
      sessaoPublica: { ...s.sessaoPublica, condicoesCombate: undefined as any },
    }));
    expect(() => useStore.getState().alternarCondicaoCombate('pc-1', 'cond-1')).not.toThrow();
  });
});

describe('definirVisibilidadeRoll', () => {
  it('alterna nos dois sentidos (privada -> pública -> privada)', () => {
    useStore.getState().registrarRoll({
      origem: 'teste', personagemId: null, formula: '1d20', total: 10, bruto: 10, visibilidade: 'privada',
    });
    const id = useStore.getState().rollsLog[0].id;

    useStore.getState().definirVisibilidadeRoll(id, 'publica');
    expect(useStore.getState().rollsLog[0].visibilidade).toBe('publica');

    useStore.getState().definirVisibilidadeRoll(id, 'privada');
    expect(useStore.getState().rollsLog[0].visibilidade).toBe('privada');
  });

  it('não afeta outras entradas de rollsLog', () => {
    useStore.getState().registrarRoll({ origem: 'a', personagemId: null, formula: '1d20', total: 1, bruto: 1, visibilidade: 'privada' });
    useStore.getState().registrarRoll({ origem: 'b', personagemId: null, formula: '1d20', total: 2, bruto: 2, visibilidade: 'privada' });
    const [rollB, rollA] = useStore.getState().rollsLog; // prepend — mais novo primeiro

    useStore.getState().definirVisibilidadeRoll(rollB.id, 'publica');

    expect(useStore.getState().rollsLog.find((r) => r.id === rollB.id)?.visibilidade).toBe('publica');
    expect(useStore.getState().rollsLog.find((r) => r.id === rollA.id)?.visibilidade).toBe('privada');
  });
});

describe('definirVisibilidadeLog', () => {
  it('marca como privada uma entrada que nasceu pública (sem campo visibilidade setado)', () => {
    useStore.getState().registrarLog('teste', 'texto qualquer', null);
    const entrada = useStore.getState().log[0];
    expect(entrada.visibilidade).toBeUndefined(); // ausência = pública, hoje

    useStore.getState().definirVisibilidadeLog(entrada.id, 'privada');

    expect(useStore.getState().log[0].visibilidade).toBe('privada');
  });

  it('alterna nos dois sentidos', () => {
    useStore.getState().registrarLog('teste', 'texto qualquer', null, 'privada');
    const id = useStore.getState().log[0].id;

    useStore.getState().definirVisibilidadeLog(id, 'publica');
    expect(useStore.getState().log[0].visibilidade).toBe('publica');

    useStore.getState().definirVisibilidadeLog(id, 'privada');
    expect(useStore.getState().log[0].visibilidade).toBe('privada');
  });
});

// ===== definirDuracaoCondicao (UI genérica de duração no rastreador/token) =====
describe('definirDuracaoCondicao', () => {
  it('define a duração de uma condição pra um participante', () => {
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 3);
    expect(useStore.getState().sessaoPublica.condicaoDuracao).toEqual({ 'pc-1': { exposto: 3 } });
  });

  it('sobrescreve a duração já existente (clicar "+" de novo)', () => {
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 1);
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 2);
    expect(useStore.getState().sessaoPublica.condicaoDuracao?.['pc-1'].exposto).toBe(2);
  });

  it('rodadas <= 0 remove a entrada — volta a manual/persistente, sem prazo', () => {
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 1);
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 0);
    expect(useStore.getState().sessaoPublica.condicaoDuracao?.['pc-1']?.exposto).toBeUndefined();
  });

  it('rodadas null remove a entrada, mesmo comportamento de 0', () => {
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 2);
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', null);
    expect(useStore.getState().sessaoPublica.condicaoDuracao?.['pc-1']?.exposto).toBeUndefined();
  });

  it('remove a última duração de um participante limpa o participante do mapa inteiro', () => {
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 1);
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 0);
    expect(useStore.getState().sessaoPublica.condicaoDuracao?.['pc-1']).toBeUndefined();
  });

  it('duas condições diferentes no mesmo participante coexistem', () => {
    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 2);
    useStore.getState().definirDuracaoCondicao('pc-1', 'caido', 1);
    expect(useStore.getState().sessaoPublica.condicaoDuracao?.['pc-1']).toEqual({ exposto: 2, caido: 1 });

    useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 0);
    expect(useStore.getState().sessaoPublica.condicaoDuracao?.['pc-1']).toEqual({ caido: 1 });
  });

  it('condicaoDuracao undefined não quebra', () => {
    useStore.setState((s) => ({
      sessaoPublica: { ...s.sessaoPublica, condicaoDuracao: undefined as any },
    }));
    expect(() => useStore.getState().definirDuracaoCondicao('pc-1', 'exposto', 1)).not.toThrow();
    expect(useStore.getState().sessaoPublica.condicaoDuracao).toEqual({ 'pc-1': { exposto: 1 } });
  });
});

// ===== importarJSON =====
describe('importarJSON', () => {
  beforeEach(() => {
    useStore.getState().resetarEstado();
  });

  it('importa JSON válido e normaliza campos', () => {
    const json = JSON.stringify({
      schemaVersion: 10,
      sessaoPublica: { nomeDaMesa: 'Teste', numeroSessao: 1, clima: 'garoa', hora: '20:00', cenaAtual: 'cena 1', caso: '', localAtual: '', objetivo: '', progresso: { atual: 0, total: 0 }, atmosfera: '', contadorCena: 1, modoCombate: false, indiceAtualTurno: 0, rodada: 1, condicoesCombate: {} },
      sessaoPrivada: { oQueRealmenteAcontece: '', proximoEvento: '', lembretes: [], eventos: [], tensao: 0, ruidoNarrativo: 0, ameaca: 0, estatisticas: { rolagens: 0, surtos: 0, mortes: 0, iniciadaEm: null }, dificuldadeCena: 'media', dificuldadeCenaCustom: 15, selecionadosIniciativa: [] },
      fichas: [],
      fichaAtivaId: null,
      npcs: [],
      iniciativa: [],
      mapa: { imagemDataUrl: null, tokens: [], grade: { ativa: false, x: 0, y: 0, largura: 100, altura: 100, colunas: 10, linhas: 10 } },
      log: [],
      rollsLog: [],
      config: { basePV: 20 },
    });
    useStore.getState().importarJSON(json);
    expect(useStore.getState().npcs).toEqual([]);
  });

  it('normaliza NPCs sem acoes (JSON antigo)', () => {
    const npcAntigo = { id: 'n1', nome: 'Bandido', corVisual: '#7d8594', pvAtual: 10, pvMaximo: 10, defesa: 10, agilidade: 1, notas: '', visivel: false, notasMestre: '', categoria: '' };
    const json = JSON.stringify({
      schemaVersion: 10,
      sessaoPublica: { nomeDaMesa: 'Teste', numeroSessao: 1, clima: 'garoa', hora: '20:00', cenaAtual: 'cena 1', caso: '', localAtual: '', objetivo: '', progresso: { atual: 0, total: 0 }, atmosfera: '', contadorCena: 1, modoCombate: false, indiceAtualTurno: 0, rodada: 1, condicoesCombate: {} },
      sessaoPrivada: { oQueRealmenteAcontece: '', proximoEvento: '', lembretes: [], eventos: [], tensao: 0, ruidoNarrativo: 0, ameaca: 0, estatisticas: { rolagens: 0, surtos: 0, mortes: 0, iniciadaEm: null }, dificuldadeCena: 'media', dificuldadeCenaCustom: 15, selecionadosIniciativa: [] },
      fichas: [],
      fichaAtivaId: null,
      npcs: [npcAntigo],
      iniciativa: [],
      mapa: { imagemDataUrl: null, tokens: [], grade: { ativa: false, x: 0, y: 0, largura: 100, altura: 100, colunas: 10, linhas: 10 } },
      log: [],
      rollsLog: [],
      config: { basePV: 20 },
    });
    useStore.getState().importarJSON(json);
    const npcs = useStore.getState().npcs;
    expect(npcs[0].acoes).toEqual([]);
    expect(npcs[0].visivel).toBe(false);
    expect(npcs[0].notasMestre).toBe('');
    expect(npcs[0].categoria).toBe('');
  });

  it('normaliza ficha sem surtosAtivos e campos opcionais', () => {
    const fichaAntiga = { id: 'f1', corVisual: '#4fc1d4', nome: 'Teste', jogador: '', antecedenteId: null, motivo: '', perguntaQueTeDefine: '', respostaPergunta: '', gancho: '', vinculos: [], atributos: { vigor: 2, agilidade: 1, intelecto: 1, percepcao: 1, presenca: 1, vontade: 1 }, pvAtual: 20, sanidadeAtual: 10, equipamentoModificadorDefesa: 0, determinacao: 1, pericias: {}, traumas: [], kitAntecedente: '', contatoOuRecurso: '', outrosItens: '', armas: [], reguladores: [], acessos: 0, anestesiaAte: null, dinheiroReal: 500, dinheiroPonto: 800, anotacoes: '' };
    const json = JSON.stringify({
      schemaVersion: 10,
      sessaoPublica: { nomeDaMesa: 'Teste', numeroSessao: 1, clima: 'garoa', hora: '20:00', cenaAtual: 'cena 1', caso: '', localAtual: '', objetivo: '', progresso: { atual: 0, total: 0 }, atmosfera: '', contadorCena: 1, modoCombate: false, indiceAtualTurno: 0, rodada: 1, condicoesCombate: {} },
      sessaoPrivada: { oQueRealmenteAcontece: '', proximoEvento: '', lembretes: [], eventos: [], tensao: 0, ruidoNarrativo: 0, ameaca: 0, estatisticas: { rolagens: 0, surtos: 0, mortes: 0, iniciadaEm: null }, dificuldadeCena: 'media', dificuldadeCenaCustom: 15, selecionadosIniciativa: [] },
      fichas: [fichaAntiga],
      fichaAtivaId: null,
      npcs: [],
      iniciativa: [],
      mapa: { imagemDataUrl: null, tokens: [], grade: { ativa: false, x: 0, y: 0, largura: 100, altura: 100, colunas: 10, linhas: 10 } },
      log: [],
      rollsLog: [],
      config: { basePV: 20 },
    });
    useStore.getState().importarJSON(json);
    const fichas = useStore.getState().fichas;
    expect(fichas[0].surtosAtivos).toEqual([]);
    expect(fichas[0].pericias).toEqual({});
    expect(fichas[0].traumas).toEqual([]);
  });

  it('normaliza tokens sem x/y (default 0.5)', () => {
    const tokenAntigo = { id: 't1', participanteId: 'f1', tipo: 'pc' as const };
    const json = JSON.stringify({
      schemaVersion: 10,
      sessaoPublica: { nomeDaMesa: 'Teste', numeroSessao: 1, clima: 'garoa', hora: '20:00', cenaAtual: 'cena 1', caso: '', localAtual: '', objetivo: '', progresso: { atual: 0, total: 0 }, atmosfera: '', contadorCena: 1, modoCombate: false, indiceAtualTurno: 0, rodada: 1, condicoesCombate: {} },
      sessaoPrivada: { oQueRealmenteAcontece: '', proximoEvento: '', lembretes: [], eventos: [], tensao: 0, ruidoNarrativo: 0, ameaca: 0, estatisticas: { rolagens: 0, surtos: 0, mortes: 0, iniciadaEm: null }, dificuldadeCena: 'media', dificuldadeCenaCustom: 15, selecionadosIniciativa: [] },
      fichas: [{ id: 'f1', corVisual: '#4fc1d4', nome: 'Teste', jogador: '', antecedenteId: null, motivo: '', perguntaQueTeDefine: '', respostaPergunta: '', gancho: '', vinculos: [], atributos: { vigor: 2, agilidade: 1, intelecto: 1, percepcao: 1, presenca: 1, vontade: 1 }, pvAtual: 20, sanidadeAtual: 10, equipamentoModificadorDefesa: 0, determinacao: 1, pericias: {}, traumas: [], kitAntecedente: '', contatoOuRecurso: '', outrosItens: '', armas: [], reguladores: [], acessos: 0, anestesiaAte: null, dinheiroReal: 500, dinheiroPonto: 800, anotacoes: '', surtosAtivos: [] }],
      fichaAtivaId: null,
      npcs: [],
      iniciativa: [],
      mapa: { imagemDataUrl: null, tokens: [tokenAntigo], grade: { ativa: false, x: 0, y: 0, largura: 100, altura: 100, colunas: 10, linhas: 10 } },
      log: [],
      rollsLog: [],
      config: { basePV: 20 },
    });
    useStore.getState().importarJSON(json);
    const tokens = useStore.getState().mapa.tokens;
    expect(tokens[0].x).toBe(0.5);
    expect(tokens[0].y).toBe(0.5);
  });

  it('lança erro em JSON inválido', () => {
    expect(() => useStore.getState().importarJSON('{ invalid json }')).toThrow('JSON inválido');
  });

  it('lança erro se não for objeto', () => {
    expect(() => useStore.getState().importarJSON('"string"')).toThrow('JSON não é um objeto');
  });

  it('lança erro se faltar campo obrigatório', () => {
    const json = JSON.stringify({ fichas: [], npcs: [], log: [], config: {} }); // falta mapa, iniciativa
    expect(() => useStore.getState().importarJSON(json)).toThrow('Campo obrigatório ausente: mapa');
  });

  // antes disto, um `traumas: "oops"` (tipo errado, mas as 6 chaves obrigatórias presentes)
  // passava batido aqui e só quebrava depois, num TypeError sem contexto no render de uma
  // ficha — validarTiposEstado pega isso ANTES de mexer no estado.
  it('lança erro com formato inválido quando um campo tem o tipo errado (não trava sozinho na chave obrigatória)', () => {
    const json = JSON.stringify({
      fichas: [{ nome: 123, traumas: 'oops' }],
      npcs: [],
      mapa: {},
      iniciativa: [],
      log: [],
      config: {},
    });
    expect(() => useStore.getState().importarJSON(json)).toThrow(/formato inválido/);
    expect(() => useStore.getState().importarJSON(json)).toThrow(/fichas\[0\]\.nome/);
    expect(() => useStore.getState().importarJSON(json)).toThrow(/fichas\[0\]\.traumas/);
  });

  it('formato inválido não mexe no estado (falha antes de aplicar qualquer mudança)', () => {
    useStore.getState().resetarEstado();
    const antes = useStore.getState().fichas;
    const json = JSON.stringify({ fichas: 'oops', npcs: [], mapa: {}, iniciativa: [], log: [], config: {} });
    expect(() => useStore.getState().importarJSON(json)).toThrow();
    expect(useStore.getState().fichas).toBe(antes);
  });

  it('roundtrip: exporta -> importa mantém dados', () => {
    useStore.getState().resetarEstado();
    useStore.getState().adicionarFicha();
    const fichaId = useStore.getState().fichas[0].id;
    useStore.getState().atualizarFicha(fichaId, { nome: 'Teste Roundtrip', atributos: { vigor: 3, agilidade: 2, intelecto: 1, percepcao: 1, presenca: 1, vontade: 2 } });
    useStore.getState().adicionarNpc();
    const npcId = useStore.getState().npcs[0].id;
    useStore.getState().atualizarNpc(npcId, { nome: 'NPC Roundtrip', acoes: [{ id: 'a1', nome: 'Ataque', bonus: 3, dano: '1d6' }] });
    useStore.getState().avancarCena(); // contadorCena = 2
    const exported = useStore.getState().exportarJSON();
    useStore.getState().resetarEstado();
    useStore.getState().importarJSON(exported);
    const state = useStore.getState();
    expect(state.fichas[0].nome).toBe('Teste Roundtrip');
    expect(state.fichas[0].atributos.vigor).toBe(3);
    expect(state.npcs[0].nome).toBe('NPC Roundtrip');
    expect(state.npcs[0].acoes).toHaveLength(1);
    expect(state.sessaoPublica.contadorCena).toBe(2);
    expect(state.npcs[0].acoes[0].bonus).toBe(3);
  });
});

// ===== avancarCena + surtos: coberto acima em describe('avancarCena') =====

// ===== converterDinheiro =====
describe('converterDinheiro', () => {
  beforeEach(() => {
    useStore.setState(criarEstadoInicial());
    useStore.getState().adicionarFicha();
  });

  describe('pontoParaReal (P$ → R$)', () => {
    it('1 P$ → 1 R$ (mínimo 1)', () => {
      useStore.getState().atualizarFicha(useStore.getState().fichas[0].id, { dinheiroPonto: 10 });
      useStore.getState().converterDinheiro(useStore.getState().fichas[0].id, 'pontoParaReal', 1);
      expect(useStore.getState().fichas[0].dinheiroPonto).toBe(9);
      expect(useStore.getState().fichas[0].dinheiroReal).toBe(501);
    });

    it('2 P$ → 1 R$ (1.4 arredonda p/ 1)', () => {
      useStore.getState().atualizarFicha(useStore.getState().fichas[0].id, { dinheiroPonto: 10 });
      useStore.getState().converterDinheiro(useStore.getState().fichas[0].id, 'pontoParaReal', 2);
      expect(useStore.getState().fichas[0].dinheiroReal).toBe(501);
    });

    it('3 P$ → 2 R$ (2.1 arredonda p/ 2)', () => {
      useStore.getState().atualizarFicha(useStore.getState().fichas[0].id, { dinheiroPonto: 10 });
      useStore.getState().converterDinheiro(useStore.getState().fichas[0].id, 'pontoParaReal', 3);
      expect(useStore.getState().fichas[0].dinheiroReal).toBe(502);
    });

    it('4 P$ → 3 R$ (2.8 arredonda p/ 3)', () => {
      useStore.getState().atualizarFicha(useStore.getState().fichas[0].id, { dinheiroPonto: 10 });
      useStore.getState().converterDinheiro(useStore.getState().fichas[0].id, 'pontoParaReal', 4);
      expect(useStore.getState().fichas[0].dinheiroReal).toBe(503);
    });

    it('5 P$ → 4 R$ (3.5 arredonda p/ 4)', () => {
      useStore.getState().atualizarFicha(useStore.getState().fichas[0].id, { dinheiroPonto: 10 });
      useStore.getState().converterDinheiro(useStore.getState().fichas[0].id, 'pontoParaReal', 5);
      expect(useStore.getState().fichas[0].dinheiroReal).toBe(504);
    });

    it('não converte se P$ insuficiente', () => {
      useStore.getState().atualizarFicha(useStore.getState().fichas[0].id, { dinheiroPonto: 0 });
      useStore.getState().converterDinheiro(useStore.getState().fichas[0].id, 'pontoParaReal', 10);
      expect(useStore.getState().fichas[0].dinheiroPonto).toBe(0);
      expect(useStore.getState().fichas[0].dinheiroReal).toBe(500);
    });
  });

  describe('realParaPonto (R$ → P$)', () => {
    it('1:1 sem taxa', () => {
      useStore.getState().atualizarFicha(useStore.getState().fichas[0].id, { dinheiroReal: 100 });
      useStore.getState().converterDinheiro(useStore.getState().fichas[0].id, 'realParaPonto', 10);
      expect(useStore.getState().fichas[0].dinheiroReal).toBe(90);
      expect(useStore.getState().fichas[0].dinheiroPonto).toBe(810);
    });

    it('não converte se R$ insuficiente', () => {
      useStore.getState().atualizarFicha(useStore.getState().fichas[0].id, { dinheiroReal: 0 });
      useStore.getState().converterDinheiro(useStore.getState().fichas[0].id, 'realParaPonto', 10);
      expect(useStore.getState().fichas[0].dinheiroReal).toBe(0);
      expect(useStore.getState().fichas[0].dinheiroPonto).toBe(800);
    });
  });
});

describe('midia', () => {
  describe('adicionarFaixaMidia/removerFaixaMidia/moverFaixaMidia', () => {
    it('adiciona faixa com ordem incremental e retorna o id', () => {
      const id1 = useStore.getState().adicionarFaixaMidia('faixa 1', 'p1.mp3', 'https://x.test/p1.mp3');
      const id2 = useStore.getState().adicionarFaixaMidia('faixa 2', 'p2.mp3', 'https://x.test/p2.mp3');
      const faixas = useStore.getState().midia.faixas;
      expect(faixas.map((f) => f.id)).toEqual([id1, id2]);
      expect(faixas.map((f) => f.ordem)).toEqual([0, 1]);
    });

    it('remover a faixa atual limpa faixaAtualId e para o playback', () => {
      const id = useStore.getState().adicionarFaixaMidia('faixa 1', 'p1.mp3', 'https://x.test/p1.mp3');
      useStore.getState().atualizarEstadoMidia({ faixaAtualId: id, tocando: true });
      useStore.getState().removerFaixaMidia(id);
      expect(useStore.getState().midia.faixaAtualId).toBeNull();
      expect(useStore.getState().midia.tocando).toBe(false);
    });

    it('remover uma faixa que não é a atual não mexe no playback', () => {
      const idAtual = useStore.getState().adicionarFaixaMidia('atual', 'p1.mp3', 'https://x.test/p1.mp3');
      const idOutra = useStore.getState().adicionarFaixaMidia('outra', 'p2.mp3', 'https://x.test/p2.mp3');
      useStore.getState().atualizarEstadoMidia({ faixaAtualId: idAtual, tocando: true });
      useStore.getState().removerFaixaMidia(idOutra);
      expect(useStore.getState().midia.faixaAtualId).toBe(idAtual);
      expect(useStore.getState().midia.tocando).toBe(true);
    });

    it('moverFaixaMidia troca ordem com o vizinho', () => {
      const idA = useStore.getState().adicionarFaixaMidia('a', 'pa.mp3', 'https://x.test/pa.mp3');
      const idB = useStore.getState().adicionarFaixaMidia('b', 'pb.mp3', 'https://x.test/pb.mp3');
      useStore.getState().moverFaixaMidia(idB, 'cima');
      const ordenadas = [...useStore.getState().midia.faixas].sort((f1, f2) => f1.ordem - f2.ordem);
      expect(ordenadas.map((f) => f.id)).toEqual([idB, idA]);
    });

    it('moverFaixaMidia nas bordas é no-op', () => {
      const idA = useStore.getState().adicionarFaixaMidia('a', 'pa.mp3', 'https://x.test/pa.mp3');
      const antes = useStore.getState().midia.faixas;
      useStore.getState().moverFaixaMidia(idA, 'cima');
      expect(useStore.getState().midia.faixas).toBe(antes);
    });
  });

  describe('atualizarEstadoMidia', () => {
    it('aplica o patch e recarimba atualizadoEm', () => {
      const antes = useStore.getState().midia.atualizadoEm;
      useStore.getState().atualizarEstadoMidia({ tocando: true, posicaoSegundos: 12 });
      const midia = useStore.getState().midia;
      expect(midia.tocando).toBe(true);
      expect(midia.posicaoSegundos).toBe(12);
      expect(midia.atualizadoEm).not.toBe(antes);
    });
  });

  describe('definirVolumeMidia', () => {
    it('muda o volume sem recarimbar atualizadoEm — mudar volume não pode saltar a posição', () => {
      const antes = useStore.getState().midia.atualizadoEm;
      useStore.getState().definirVolumeMidia(0.3);
      const midia = useStore.getState().midia;
      expect(midia.volume).toBe(0.3);
      expect(midia.atualizadoEm).toBe(antes);
    });

    it('é clampado em 0..1', () => {
      useStore.getState().definirVolumeMidia(5);
      expect(useStore.getState().midia.volume).toBe(1);
      useStore.getState().definirVolumeMidia(-1);
      expect(useStore.getState().midia.volume).toBe(0);
    });
  });
});

describe('soundpad', () => {
  beforeEach(() => {
    useStore.setState(criarEstadoInicial());
  });

  it('definirSomSoundpad grava no slot pedido', () => {
    useStore.getState().definirSomSoundpad(2, 'porta', 'sfx/porta', 'https://x/porta');
    const sons = useStore.getState().soundpad.sons;
    expect(sons).toHaveLength(1);
    expect(sons[0]).toMatchObject({ slot: 2, nome: 'porta', path: 'sfx/porta' });
  });

  it('definir no mesmo slot substitui, nunca acumula', () => {
    useStore.getState().definirSomSoundpad(2, 'porta', 'sfx/porta', 'https://x/porta');
    useStore.getState().definirSomSoundpad(2, 'vidro', 'sfx/vidro', 'https://x/vidro');
    const sons = useStore.getState().soundpad.sons;
    expect(sons).toHaveLength(1);
    expect(sons[0].nome).toBe('vidro');
  });

  it('remover esvazia só o slot alvo', () => {
    useStore.getState().definirSomSoundpad(0, 'a', 'p', 'u');
    useStore.getState().definirSomSoundpad(1, 'b', 'p', 'u');
    useStore.getState().removerSomSoundpad(0);
    expect(useStore.getState().soundpad.sons.map((s) => s.slot)).toEqual([1]);
  });

  it('volume do soundpad é clampado em 0..1 e não mexe no volume da música', () => {
    const volumeMusica = useStore.getState().midia.volume;
    useStore.getState().definirVolumeSoundpad(2);
    expect(useStore.getState().soundpad.volume).toBe(1);
    useStore.getState().definirVolumeSoundpad(-1);
    expect(useStore.getState().soundpad.volume).toBe(0);
    expect(useStore.getState().midia.volume).toBe(volumeMusica);
  });

  it('cada disparo gera um carimbo novo — é o que o player usa pra não repetir o efeito', async () => {
    useStore.getState().dispararSoundpad(3);
    const primeiro = useStore.getState().soundpad.ultimoDisparo;
    expect(primeiro?.slot).toBe(3);
    await new Promise((r) => setTimeout(r, 210));
    useStore.getState().dispararSoundpad(3);
    expect(useStore.getState().soundpad.ultimoDisparo?.em).not.toBe(primeiro?.em);
  });

  it('disparos rápidos (< 200ms) no mesmo slot são ignorados', () => {
    useStore.getState().dispararSoundpad(3);
    const primeiro = useStore.getState().soundpad.ultimoDisparo!;
    useStore.getState().dispararSoundpad(3);
    expect(useStore.getState().soundpad.ultimoDisparo?.em).toBe(primeiro.em);
  });

  it('disparos rápidos em slots diferentes são aceitos', () => {
    useStore.getState().dispararSoundpad(3);
    useStore.getState().dispararSoundpad(5);
    expect(useStore.getState().soundpad.ultimoDisparo?.slot).toBe(5);
  });

  it('dispararSoundpad carimba tipo "tocar"', () => {
    useStore.getState().dispararSoundpad(3);
    expect(useStore.getState().soundpad.ultimoDisparo?.tipo).toBe('tocar');
  });

  it('pararSoundpad carimba tipo "parar" pro slot pedido', () => {
    useStore.getState().pararSoundpad(4);
    const disparo = useStore.getState().soundpad.ultimoDisparo;
    expect(disparo?.slot).toBe(4);
    expect(disparo?.tipo).toBe('parar');
  });
});

describe('rerolarIniciativaDe', () => {
  const montarIniciativa = () => {
    const npc1 = { id: 'n1', nome: 'Alvo', corVisual: '#fff', silhueta: null, foto: null, pvAtual: 10, pvMaximo: 10, defesa: 10, agilidade: 3, notas: '', visivel: false, notasMestre: '', categoria: '', acoes: [] };
    const npc2 = { id: 'n2', nome: 'Fixo', corVisual: '#fff', silhueta: null, foto: null, pvAtual: 10, pvMaximo: 10, defesa: 10, agilidade: 1, notas: '', visivel: false, notasMestre: '', categoria: '', acoes: [] };
    useStore.setState({
      npcs: [npc1, npc2],
      iniciativa: [
        { id: 'e1', participanteId: 'n1', tipo: 'npc', nome: 'Alvo', valor: 20 },
        { id: 'e2', participanteId: 'n2', tipo: 'npc', nome: 'Fixo', valor: 10 },
      ],
      sessaoPublica: { ...useStore.getState().sessaoPublica, modoCombate: true, turnoAtualId: 'e2' },
    });
  };

  it('atualiza o valor e reordena a lista', () => {
    montarIniciativa();
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1
    useStore.getState().rerolarIniciativaDe('n1'); // 1 + agilidade(3) = 4, cai abaixo do Fixo (10)
    const iniciativa = useStore.getState().iniciativa;
    expect(iniciativa.map((e) => e.participanteId)).toEqual(['n2', 'n1']);
    expect(iniciativa.find((e) => e.participanteId === 'n1')?.valor).toBe(4);
    vi.restoreAllMocks();
  });

  it('mantém turnoAtualId grudado em quem estava na vez, mesmo com a reordenação', () => {
    montarIniciativa(); // turnoAtualId='e2' → 'n2' (Fixo) está na vez
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1 → n1 cai pra depois de n2
    useStore.getState().rerolarIniciativaDe('n1');
    const s = useStore.getState();
    expect(s.iniciativa.find((e) => e.id === s.sessaoPublica.turnoAtualId)?.participanteId).toBe('n2');
    vi.restoreAllMocks();
  });

  it('rerrolagem empatada usa maior Agilidade e preserva turnoAtualId e metadados legados', () => {
    montarIniciativa();
    useStore.setState((s) => ({ iniciativa: [s.iniciativa[1], { ...s.iniciativa[0], valor: 5 }] }));
    vi.spyOn(Math, 'random').mockReturnValue(0.3); // d20 7 + Agilidade 3 = 10, empatado com Fixo
    useStore.getState().rerolarIniciativaDe('n1');
    const s = useStore.getState();
    expect(s.iniciativa.map((e) => e.participanteId)).toEqual(['n1', 'n2']);
    expect(s.iniciativa[0]).toMatchObject({ valor: 10, d20: 7, agilidade: 3 });
    expect(s.iniciativa[1].d20).toBeUndefined();
    expect(s.sessaoPublica.turnoAtualId).toBe('e2');
    vi.restoreAllMocks();
  });

  it('participanteId fora da iniciativa não faz nada', () => {
    montarIniciativa();
    const antes = useStore.getState().iniciativa;
    useStore.getState().rerolarIniciativaDe('nao-existe');
    expect(useStore.getState().iniciativa).toBe(antes);
  });
});

describe('avancarTurno/voltarTurno', () => {
  const iniciativaABC = () => [
    { id: 'e1', participanteId: 'a', tipo: 'npc' as const, nome: 'A', valor: 20 },
    { id: 'e2', participanteId: 'b', tipo: 'npc' as const, nome: 'B', valor: 15 },
    { id: 'e3', participanteId: 'c', tipo: 'npc' as const, nome: 'C', valor: 10 },
  ];

  it('voltarTurno reverte pro participante anterior sem mudar rodada no meio dela', () => {
    useStore.setState((s) => ({
      iniciativa: iniciativaABC(),
      sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'e2', rodada: 3 }, // 'b' está na vez
    }));
    useStore.getState().voltarTurno();
    const s = useStore.getState();
    expect(s.sessaoPublica.turnoAtualId).toBe('e1');
    expect(s.sessaoPublica.rodada).toBe(3);
  });

  it('voltarTurno do primeiro da lista dá a volta pro último e decrementa a rodada', () => {
    useStore.setState((s) => ({
      iniciativa: iniciativaABC(),
      sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'e1', rodada: 3 }, // 'a' (1º) está na vez
    }));
    useStore.getState().voltarTurno();
    const s = useStore.getState();
    expect(s.sessaoPublica.turnoAtualId).toBe('e3');
    expect(s.sessaoPublica.rodada).toBe(2);
  });

  it('voltarTurno na rodada 1 não deixa a rodada ir a 0', () => {
    useStore.setState((s) => ({
      iniciativa: iniciativaABC(),
      sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'e1', rodada: 1 },
    }));
    useStore.getState().voltarTurno();
    expect(useStore.getState().sessaoPublica.rodada).toBe(1);
  });

  it('avancarTurno seguido de voltarTurno volta pra mesma pessoa e rodada', () => {
    useStore.setState((s) => ({
      iniciativa: iniciativaABC(),
      sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'e3', rodada: 2 }, // 'c' (último) está na vez
    }));
    useStore.getState().avancarTurno(); // volta pro início, rodada 3
    expect(useStore.getState().sessaoPublica).toMatchObject({ turnoAtualId: 'e1', rodada: 3 });
    useStore.getState().voltarTurno();
    expect(useStore.getState().sessaoPublica).toMatchObject({ turnoAtualId: 'e3', rodada: 2 });
  });

  it('iniciativa vazia não quebra nenhum dos dois', () => {
    useStore.setState((s) => ({ iniciativa: [], sessaoPublica: { ...s.sessaoPublica, turnoAtualId: null } }));
    expect(() => useStore.getState().voltarTurno()).not.toThrow();
    expect(() => useStore.getState().avancarTurno()).not.toThrow();
  });
});

describe('removerDaIniciativa', () => {
  const iniciativaABCD = () => [
    { id: 'e1', participanteId: 'a', tipo: 'npc' as const, nome: 'A', valor: 20 },
    { id: 'e2', participanteId: 'b', tipo: 'npc' as const, nome: 'B', valor: 15 },
    { id: 'e3', participanteId: 'c', tipo: 'npc' as const, nome: 'C', valor: 10 },
    { id: 'e4', participanteId: 'd', tipo: 'npc' as const, nome: 'D', valor: 5 },
  ];

  it('remove quem não está na vez — turnoAtualId continua apontando pra MESMA pessoa', () => {
    useStore.setState((s) => ({
      iniciativa: iniciativaABCD(),
      sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'e3' }, // 'c' está na vez
    }));
    useStore.getState().removerDaIniciativa('e1'); // remove 'a', antes de 'c'
    const s = useStore.getState();
    expect(s.iniciativa.map((e) => e.participanteId)).toEqual(['b', 'c', 'd']);
    expect(s.iniciativa.find((e) => e.id === s.sessaoPublica.turnoAtualId)?.participanteId).toBe('c');
  });

  it('remove o próprio combatente da vez — assume o slot seguinte em vez de pular alguém', () => {
    useStore.setState((s) => ({
      iniciativa: iniciativaABCD(),
      sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'e3' }, // 'c' está na vez
    }));
    useStore.getState().removerDaIniciativa('e3'); // remove a própria 'c'
    const s = useStore.getState();
    expect(s.iniciativa.map((e) => e.participanteId)).toEqual(['a', 'b', 'd']);
    expect(s.sessaoPublica.turnoAtualId).toBe('e4');
    expect(s.iniciativa.find((e) => e.id === s.sessaoPublica.turnoAtualId)?.participanteId).toBe('d');
  });

  it('remove o último da lista enquanto ele está na vez — clampa pro novo último', () => {
    useStore.setState((s) => ({
      iniciativa: iniciativaABCD().slice(0, 3), // a, b, c
      sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'e3' }, // 'c' (último) está na vez
    }));
    useStore.getState().removerDaIniciativa('e3');
    const s = useStore.getState();
    expect(s.iniciativa.map((e) => e.participanteId)).toEqual(['a', 'b']);
    expect(s.sessaoPublica.turnoAtualId).toBe('e2');
  });

  it('limpa condicoesCombate/condicaoDuracao órfãos do participante removido', () => {
    useStore.setState((s) => ({
      iniciativa: iniciativaABCD(),
      sessaoPublica: {
        ...s.sessaoPublica,
        condicoesCombate: { c: ['atordoado'] },
        condicaoDuracao: { c: { atordoado: 2 } },
      },
    }));
    useStore.getState().removerDaIniciativa('e3'); // remove 'c'
    const s = useStore.getState();
    expect(s.sessaoPublica.condicoesCombate.c).toBeUndefined();
    expect(s.sessaoPublica.condicaoDuracao.c).toBeUndefined();
  });

  it('não limpa a condição se outra entrada da iniciativa ainda referencia o mesmo participanteId', () => {
    useStore.setState((s) => ({
      iniciativa: [...iniciativaABCD(), { id: 'e5', participanteId: 'c', tipo: 'npc' as const, nome: 'C (2)', valor: 1 }],
      sessaoPublica: { ...s.sessaoPublica, condicoesCombate: { c: ['atordoado'] } },
    }));
    useStore.getState().removerDaIniciativa('e3'); // remove só UMA entrada de 'c', a outra ('e5') continua
    expect(useStore.getState().sessaoPublica.condicoesCombate.c).toEqual(['atordoado']);
  });
});

describe('removerFicha/removerNpc limpam a iniciativa órfã', () => {
  const criarNpc = (id: string, nome: string) => ({
    id, nome, corVisual: '#fff', silhueta: null, foto: null, pvAtual: 10, pvMaximo: 10, defesa: 10, agilidade: 0,
    notas: '', visivel: false, notasMestre: '', categoria: '', acoes: [],
  });

  it('removerFicha tira o PC da iniciativa em vez de deixar um combatente fantasma', () => {
    const ficha = { ...criarFichaVazia(), id: 'pc1', nome: 'Iguinho' };
    useStore.setState({
      fichas: [ficha],
      iniciativa: [{ id: 'e1', participanteId: 'pc1', tipo: 'pc' as const, nome: 'Iguinho', valor: 15 }],
    });
    useStore.getState().removerFicha('pc1');
    expect(useStore.getState().iniciativa).toEqual([]);
  });

  it('removerNpc reancora turnoAtualId pro próximo combatente quando o removido estava na vez', () => {
    useStore.setState((s) => ({
      npcs: [criarNpc('n1', 'Fantasma')],
      iniciativa: [
        { id: 'e1', participanteId: 'n1', tipo: 'npc' as const, nome: 'Fantasma', valor: 20 },
        { id: 'e2', participanteId: 'n2', tipo: 'npc' as const, nome: 'Sobrevivente', valor: 5 },
      ],
      sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'e1' },
    }));
    useStore.getState().removerNpc('n1');
    const s = useStore.getState();
    expect(s.iniciativa.map((e) => e.participanteId)).toEqual(['n2']);
    expect(s.sessaoPublica.turnoAtualId).toBe('e2');
  });

  it('removerNpc limpa condicoesCombate/condicaoDuracao órfãos junto com a entrada', () => {
    useStore.setState((s) => ({
      npcs: [criarNpc('n1', 'Fantasma')],
      iniciativa: [{ id: 'e1', participanteId: 'n1', tipo: 'npc' as const, nome: 'Fantasma', valor: 20 }],
      sessaoPublica: {
        ...s.sessaoPublica,
        condicoesCombate: { n1: ['atordoado'] },
        condicaoDuracao: { n1: { atordoado: 2 } },
      },
    }));
    useStore.getState().removerNpc('n1');
    const s = useStore.getState();
    expect(s.sessaoPublica.condicoesCombate.n1).toBeUndefined();
    expect(s.sessaoPublica.condicaoDuracao.n1).toBeUndefined();
  });

  it('remover ficha/NPC fora de combate não mexe em iniciativa nem sessaoPublica', () => {
    const ficha = { ...criarFichaVazia(), id: 'pc1' };
    useStore.setState((s) => ({
      fichas: [ficha],
      npcs: [criarNpc('n1', 'Fora')],
      iniciativa: [{ id: 'e1', participanteId: 'outro', tipo: 'npc' as const, nome: 'Outro', valor: 10 }],
      sessaoPublica: { ...s.sessaoPublica, turnoAtualId: 'e1' },
    }));
    useStore.getState().removerFicha('pc1');
    useStore.getState().removerNpc('n1');
    const s = useStore.getState();
    expect(s.iniciativa.map((e) => e.id)).toEqual(['e1']);
    expect(s.sessaoPublica.turnoAtualId).toBe('e1');
  });
});

describe('iniciativa respeita a fila de forçados', () => {
  const criarNpc = (id: string, nome: string, agilidade: number) => ({
    id, nome, corVisual: '#fff', silhueta: null, foto: null, pvAtual: 10, pvMaximo: 10, defesa: 10, agilidade,
    notas: '', visivel: false, notasMestre: '', categoria: '', acoes: [],
  });

  afterEach(() => limparConsumidorForcados());

  it('rolarIniciativa usa o valor forçado do participante em vez do d20 aleatório', () => {
    useStore.setState({ npcs: [criarNpc('n1', 'Guarda', 2)], fichas: [], iniciativa: [] });
    // fila devolve 20 só pra n1, em rolagem de iniciativa
    registrarConsumidorForcados((_total, personagemId, tipo) =>
      personagemId === 'n1' && tipo === 'iniciativa' ? [20] : null,
    );
    vi.spyOn(Math, 'random').mockReturnValue(0); // honesto daria d20=1 → valor 3

    useStore.getState().rolarIniciativa(['n1']);

    vi.restoreAllMocks();
    expect(useStore.getState().iniciativa[0].valor).toBe(22); // 20 forçado + agilidade 2
  });

  it('só consome forçado de quem realmente entra na rolagem', () => {
    useStore.setState({
      npcs: [criarNpc('n1', 'Guarda', 0), criarNpc('n2', 'Fora', 0)],
      fichas: [],
      iniciativa: [],
    });
    const pedidos: (string | null)[] = [];
    registrarConsumidorForcados((_t, personagemId) => {
      pedidos.push(personagemId);
      return null;
    });

    useStore.getState().rolarIniciativa(['n1']);

    // antes, o store rolava d20 pra TODA ficha/NPC da mesa e filtrava depois — n2 teria
    // consumido uma entrada da fila sem nunca aparecer na iniciativa.
    expect(pedidos).toEqual(['n1']);
  });

  it('rerolarIniciativaDe respeita forçado do participante', () => {
    useStore.setState({
      npcs: [criarNpc('n1', 'Guarda', 1)],
      fichas: [],
      iniciativa: [{ id: 'e1', participanteId: 'n1', tipo: 'npc', nome: 'Guarda', valor: 5 }],
    });
    registrarConsumidorForcados((_t, personagemId, tipo) =>
      personagemId === 'n1' && tipo === 'iniciativa' ? [19] : null,
    );

    useStore.getState().rerolarIniciativaDe('n1');

    expect(useStore.getState().iniciativa[0].valor).toBe(20); // 19 + agilidade 1
  });

  it('surto automático por perda de 5+ Sanidade consome a fila de tipo surto', () => {
    const ficha = criarFichaVazia();
    ficha.sanidadeAtual = 10;
    ficha.atributos.vontade = 5;
    useStore.setState({ fichas: [ficha] });
    // 13 e 13 → mesmoNumero, resolve sem pendência de escolha
    registrarConsumidorForcados((_t, _p, tipo) => (tipo === 'surto' ? [13, 13] : null));

    useStore.getState().ajustarSanidadeAtual(ficha.id, 4);

    const log = useStore.getState().log.find((e) => e.tipo === 'surto');
    expect(log?.texto).toContain('2d20: 13 e 13');
  });
});

describe('rolarIniciativaGrupo', () => {
  const criarNpc = (id: string, nome: string, agilidade: number) => ({
    id, nome, corVisual: '#fff', silhueta: null, foto: null, pvAtual: 10, pvMaximo: 10, defesa: 10, agilidade,
    notas: '', visivel: false, notasMestre: '', categoria: '', acoes: [],
  });

  it('todos os NPCs do grupo recebem o mesmo valor — d20 + a MAIOR agilidade entre eles', () => {
    const npcs = [criarNpc('p1', 'Pol1', 2), criarNpc('p2', 'Pol2', 4), criarNpc('p3', 'Pol3', 1)];
    useStore.setState({ npcs, iniciativa: [] });
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1
    useStore.getState().rolarIniciativaGrupo(['p1', 'p2', 'p3']);
    const iniciativa = useStore.getState().iniciativa;
    expect(iniciativa).toHaveLength(3);
    expect(iniciativa.every((e) => e.valor === 5)).toBe(true); // 1 + maior agilidade (4)
    expect(iniciativa.every((e) => e.tipo === 'npc')).toBe(true);
    vi.restoreAllMocks();
  });

  it('registra uma entrada de log por personagem do grupo (formato padrão)', () => {
    const npcs = [criarNpc('p1', 'Pol1', 2), criarNpc('p2', 'Pol2', 3)];
    useStore.setState({ npcs, iniciativa: [], log: [] });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    useStore.getState().rolarIniciativaGrupo(['p1', 'p2']);
    const log = useStore.getState().log;
    expect(log).toHaveLength(2);
    expect(log.some((e) => e.texto.includes('Pol1'))).toBe(true);
    expect(log.some((e) => e.texto.includes('Pol2'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('ids que não batem com nenhum NPC não fazem nada', () => {
    useStore.setState({ npcs: [], iniciativa: [] });
    const antes = useStore.getState().iniciativa;
    useStore.getState().rolarIniciativaGrupo(['nao-existe']);
    expect(useStore.getState().iniciativa).toBe(antes);
  });

  it('não mexe em entradas de iniciativa já existentes de outros participantes', () => {
    const npcs = [criarNpc('p1', 'Pol1', 2), criarNpc('p2', 'Pol2', 3)];
    useStore.setState({
      npcs,
      iniciativa: [{ id: 'e0', participanteId: 'outro', tipo: 'npc', nome: 'Outro', valor: 99 }],
    });
    useStore.getState().rolarIniciativaGrupo(['p1', 'p2']);
    const iniciativa = useStore.getState().iniciativa;
    expect(iniciativa.find((e) => e.participanteId === 'outro')?.valor).toBe(99);
    expect(iniciativa).toHaveLength(3);
  });
});

// Combatente adicionado NO MEIO de um combate: antes ele era sempre anexado no fim da
// lista, ignorando o valor rolado. `turnoAtualId` é o id de uma entrada, não uma posição —
// inserir alguém em qualquer ponto do array nunca precisa reancorar a vez.
describe('adicionar combatente com combate em andamento', () => {
  const criarNpc = (id: string, nome: string, agilidade: number) => ({
    id, nome, corVisual: '#fff', silhueta: null, foto: null, pvAtual: 10, pvMaximo: 10, defesa: 10, agilidade,
    notas: '', visivel: false, notasMestre: '', categoria: '', acoes: [],
  });
  // lista em combate: valores 20 / 12 / 5
  const iniciativaBase = [
    { id: 'e1', participanteId: 'a', tipo: 'npc' as const, nome: 'A', valor: 20 },
    { id: 'e2', participanteId: 'b', tipo: 'npc' as const, nome: 'B', valor: 12 },
    { id: 'e3', participanteId: 'c', tipo: 'npc' as const, nome: 'C', valor: 5 },
  ];

  const prepararCombate = (agilidadeDoNovo: number, turnoAtualId: string) => {
    useStore.setState((s) => ({
      npcs: [criarNpc('novo', 'Novo', agilidadeDoNovo)],
      iniciativa: iniciativaBase.map((e) => ({ ...e })),
      sessaoPublica: { ...s.sessaoPublica, modoCombate: true, turnoAtualId },
    }));
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11
  };

  it('entra na posição do valor rolado, não no fim da lista', () => {
    prepararCombate(0, 'e1'); // 11 + 0 = 11 → entre B (12) e C (5)
    useStore.getState().rolarIniciativa(['novo']);
    expect(useStore.getState().iniciativa.map((e) => e.participanteId)).toEqual(['a', 'b', 'novo', 'c']);
    vi.restoreAllMocks();
  });

  it('inserir DEPOIS do turno atual não move a seta de turno', () => {
    prepararCombate(0, 'e2'); // B está na vez; novo (11) entra depois dele
    useStore.getState().rolarIniciativa(['novo']);
    const s = useStore.getState();
    expect(s.sessaoPublica.turnoAtualId).toBe('e2');
    expect(s.iniciativa.find((e) => e.id === s.sessaoPublica.turnoAtualId)?.participanteId).toBe('b');
    vi.restoreAllMocks();
  });

  it('inserir ANTES do turno atual não muda o id — a vez continua da mesma pessoa', () => {
    prepararCombate(4, 'e3'); // C está na vez; novo (11+4=15) entra antes, entre A e B
    useStore.getState().rolarIniciativa(['novo']);
    const s = useStore.getState();
    expect(s.iniciativa.map((e) => e.participanteId)).toEqual(['a', 'novo', 'b', 'c']);
    expect(s.sessaoPublica.turnoAtualId).toBe('e3');
    expect(s.iniciativa.find((e) => e.id === s.sessaoPublica.turnoAtualId)?.participanteId).toBe('c');
    vi.restoreAllMocks();
  });

  it('rolagem em grupo também respeita a posição e mantém o grupo adjacente', () => {
    useStore.setState((s) => ({
      npcs: [criarNpc('g1', 'G1', 4), criarNpc('g2', 'G2', 2)],
      iniciativa: iniciativaBase.map((e) => ({ ...e })),
      sessaoPublica: { ...s.sessaoPublica, modoCombate: true, turnoAtualId: 'e3' },
    }));
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11 → 11 + maior agilidade (4) = 15
    useStore.getState().rolarIniciativaGrupo(['g1', 'g2']);
    const s = useStore.getState();
    expect(s.iniciativa.map((e) => e.participanteId)).toEqual(['a', 'g1', 'g2', 'b', 'c']);
    expect(s.iniciativa.find((e) => e.id === s.sessaoPublica.turnoAtualId)?.participanteId).toBe('c');
    vi.restoreAllMocks();
  });
});


describe('cobrirAreaFoW', () => {
  /** Revela a metade esquerda do mapa e devolve a região criada. */
  function revelarMetadeEsquerda() {
    prepararMapaDeTeste({ vistas: [], visiveisAgora: [], zonaAtual: null, ativa: true });
    useStore.getState().adicionarRegiaoFoW({ forma: 'rect', x: 0, y: 0, w: 0.5, h: 1 });
  }

  it('cobrir um pedaço no meio recorta só aquele pedaço, mantendo o resto iluminado', () => {
    revelarMetadeEsquerda();
    // buraco central dentro da área revelada
    useStore.getState().cobrirAreaFoW({ x: 0.125, y: 0.25, w: 0.25, h: 0.5 });

    const { visiveisAgora, vistas } = fowAtivo();
    const areaVisivel = visiveisAgora.reduce((t, r) => t + r.w * r.h, 0);
    // 0.5 de área revelada menos 0.25*0.5 do buraco
    expect(areaVisivel).toBeCloseTo(0.5 - 0.125, 6);
    expect(visiveisAgora.length).toBeGreaterThan(1); // virou várias faixas
    // a memória continua intacta: cobrir apaga a luz, não desfaz a visita
    expect(vistas).toHaveLength(1);
    expect(vistas[0].w * vistas[0].h).toBeCloseTo(0.5, 6);
  });

  it('cobrir fora de qualquer área revelada não muda nada', () => {
    revelarMetadeEsquerda();
    const antes = fowAtivo().visiveisAgora;
    useStore.getState().cobrirAreaFoW({ x: 0.8, y: 0.8, w: 0.1, h: 0.1 });
    expect(fowAtivo().visiveisAgora).toBe(antes); // mesma referência
  });

  it('cobrir a área toda apaga a luz por completo, sem apagar a memória', () => {
    revelarMetadeEsquerda();
    useStore.getState().cobrirAreaFoW({ x: 0, y: 0, w: 1, h: 1 });
    expect(fowAtivo().visiveisAgora).toEqual([]);
    expect(fowAtivo().vistas).toHaveLength(1);
  });

  it('sem nada revelado é no-op (antes o arrasto de cobrir simplesmente não fazia nada)', () => {
    prepararMapaDeTeste({ vistas: [], visiveisAgora: [], zonaAtual: null, ativa: true });
    expect(() => useStore.getState().cobrirAreaFoW({ x: 0, y: 0, w: 1, h: 1 })).not.toThrow();
    expect(fowAtivo().visiveisAgora).toEqual([]);
  });
});

describe('esquecerAreaFoW', () => {
  function revelarMetadeEsquerda() {
    prepararMapaDeTeste({ vistas: [], visiveisAgora: [], zonaAtual: null, ativa: true });
    useStore.getState().adicionarRegiaoFoW({ forma: 'rect', x: 0, y: 0, w: 0.5, h: 1 });
  }

  it('esquecer um pedaço no meio some da memória E da luz, mantendo o resto', () => {
    revelarMetadeEsquerda();
    useStore.getState().esquecerAreaFoW({ x: 0.125, y: 0.25, w: 0.25, h: 0.5 });

    const { visiveisAgora, vistas } = fowAtivo();
    const areaEsperada = 0.5 - 0.125;
    expect(visiveisAgora.reduce((t, r) => t + r.w * r.h, 0)).toBeCloseTo(areaEsperada, 6);
    // diferente de cobrirAreaFoW: a MEMÓRIA também é recortada, não só a luz
    expect(vistas.reduce((t, r) => t + r.w * r.h, 0)).toBeCloseTo(areaEsperada, 6);
  });

  it('esquecer a área toda zera vistas e visiveisAgora — volta a ser nunca-visto', () => {
    revelarMetadeEsquerda();
    useStore.getState().esquecerAreaFoW({ x: 0, y: 0, w: 1, h: 1 });
    expect(fowAtivo().vistas).toEqual([]);
    expect(fowAtivo().visiveisAgora).toEqual([]);
  });

  it('esquecer fora de qualquer área revelada não muda nada (mesma referência)', () => {
    revelarMetadeEsquerda();
    const { vistas, visiveisAgora } = fowAtivo();
    useStore.getState().esquecerAreaFoW({ x: 0.8, y: 0.8, w: 0.1, h: 0.1 });
    expect(fowAtivo().vistas).toBe(vistas);
    expect(fowAtivo().visiveisAgora).toBe(visiveisAgora);
  });

  it('esquecer área já coberta (fora da luz, mas na memória) some só da memória', () => {
    revelarMetadeEsquerda();
    useStore.getState().cobrirAreaFoW({ x: 0, y: 0, w: 0.5, h: 1 }); // apaga toda a luz, mantém memória
    expect(fowAtivo().visiveisAgora).toEqual([]);
    useStore.getState().esquecerAreaFoW({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(fowAtivo().vistas).toEqual([]);
  });
});

describe('definirFoWAtivo', () => {
  it('liga/desliga sem tocar vistas/visiveisAgora', () => {
    revelarMetadeEsquerdaGlobal();
    useStore.getState().definirFoWAtivo(true);
    expect(fowAtivo().ativa).toBe(true);
    const { vistas, visiveisAgora } = fowAtivo();
    useStore.getState().definirFoWAtivo(false);
    expect(fowAtivo().ativa).toBe(false);
    expect(fowAtivo().vistas).toBe(vistas);
    expect(fowAtivo().visiveisAgora).toBe(visiveisAgora);
  });

  function revelarMetadeEsquerdaGlobal() {
    prepararMapaDeTeste({ vistas: [], visiveisAgora: [], zonaAtual: null, ativa: false });
    useStore.getState().adicionarRegiaoFoW({ forma: 'rect', x: 0, y: 0, w: 0.5, h: 1 });
  }
});

describe('definirZonaFoW', () => {
  it('define a atmosfera da cena — não é mais por região', () => {
    prepararMapaDeTeste();
    useStore.getState().definirZonaFoW('rua');
    expect(fowAtivo().zonaAtual).toBe('rua');
    useStore.getState().definirZonaFoW(null);
    expect(fowAtivo().zonaAtual).toBeNull();
  });
});

describe('limparFoW', () => {
  beforeEach(() => {
    prepararMapaDeTeste({ vistas: [], visiveisAgora: [], zonaAtual: null, ativa: true });
    useStore.getState().adicionarRegiaoFoW({ forma: 'rect', x: 0, y: 0, w: 0.5, h: 1 });
    useStore.getState().definirZonaFoW('rua');
  });

  it('zera vistas, visiveisAgora E ativa', () => {
    useStore.getState().limparFoW();
    const fow = fowAtivo();
    expect(fow.vistas).toEqual([]);
    expect(fow.visiveisAgora).toEqual([]);
    expect(fow.ativa).toBe(false);
    expect(fow.zonaAtual).toBeNull();
  });
});

describe('removerRegiaoFoW', () => {
  it('remove de vistas e visiveisAgora pelo id, mantendo outras regiões', () => {
    prepararMapaDeTeste({ vistas: [], visiveisAgora: [], zonaAtual: null, ativa: true });
    const idA = useStore.getState().adicionarRegiaoFoW({ forma: 'rect', x: 0, y: 0, w: 0.5, h: 1 })!;
    const idB = useStore.getState().adicionarRegiaoFoW({ forma: 'rect', x: 0.5, y: 0, w: 0.5, h: 1 })!;
    useStore.getState().removerRegiaoFoW(idA);
    const fow = fowAtivo();
    expect(fow.vistas.map((r) => r.id)).toEqual([idB]);
    expect(fow.visiveisAgora.map((r) => r.id)).toEqual([idB]);
  });
});

describe('cobrirLuzFoW', () => {
  it('remove só de visiveisAgora — a região permanece em vistas', () => {
    prepararMapaDeTeste({ vistas: [], visiveisAgora: [], zonaAtual: null, ativa: true });
    const id = useStore.getState().adicionarRegiaoFoW({ forma: 'rect', x: 0, y: 0, w: 0.5, h: 1 })!;
    useStore.getState().cobrirLuzFoW(id);
    const fow = fowAtivo();
    expect(fow.visiveisAgora).toEqual([]);
    expect(fow.vistas).toHaveLength(1);
    expect(fow.vistas[0].id).toBe(id);
  });
});

describe('adicionarRegiaoFoW', () => {
  it('gera id, entra em vistas E visiveisAgora', () => {
    prepararMapaDeTeste({ vistas: [], visiveisAgora: [], zonaAtual: null, ativa: true });
    const id = useStore.getState().adicionarRegiaoFoW({ forma: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    const fow = fowAtivo();
    expect(fow.vistas).toHaveLength(1);
    expect(fow.visiveisAgora).toHaveLength(1);
    expect(fow.vistas[0].id).toBe(id);
    expect(fow.visiveisAgora[0].id).toBe(id);
    expect(fow.vistas[0]).toMatchObject({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });

  it('sem mapa ativo é no-op (não lança, não gera regiões perdidas)', () => {
    expect(useStore.getState().mapa.mapaAtivoId).toBeNull();
    expect(() => useStore.getState().adicionarRegiaoFoW({ forma: 'rect', x: 0, y: 0, w: 0.5, h: 1 })).not.toThrow();
    expect(useStore.getState().mapa.biblioteca).toEqual([]);
  });
});

// ===== migrate (schema versionado do persist) =====
// Caminho DIFERENTE de importarJSON (acima) — migrate só roda na reidratação do
// localStorage pelo zustand/persist. Cobre as migrações mais recentes/arriscadas, não as
// 23 versões uma por uma.
describe('migrate', () => {
  it('v1 → v2: injeta grade default quando mapa não tem grade (e v34 depois vira o item único da biblioteca)', () => {
    const estado = migrate({ mapa: { imagemDataUrl: 'data:image/jpeg;base64,x', tokens: [] } }, 1);
    expect(estado.mapa.biblioteca[0].grade).toEqual(criarGradeInicial());
  });

  it('v1 → v2: não mexe em mapa que já tem grade', () => {
    const gradeCustom = { ...criarGradeInicial(), colunas: 20 };
    const estado = migrate({ mapa: { imagemDataUrl: 'data:image/jpeg;base64,x', tokens: [], grade: gradeCustom } }, 1);
    expect(estado.mapa.biblioteca[0].grade).toEqual(gradeCustom);
  });

  it('v10 → v11: converte surtoAtivo/surtoEscolha soltos em surtosAtivos (depois zerado pela v30 — ver teste abaixo)', () => {
    const estado = migrate(
      { fichas: [{ id: 'f1', nome: 'Helena', surtoAtivo: 5, surtoEscolha: 'Fuga cega' }] },
      10,
    );
    expect(estado.fichas[0]).not.toHaveProperty('surtoAtivo');
    expect(estado.fichas[0]).not.toHaveProperty('surtoEscolha');
    // v29 → v30 roda na mesma cascata (versaoAnterior=10 < 30) e zera surtosAtivos de novo —
    // dado de Surto tão antigo não tem `modo`, mesmo convertido pela v11 não dá pra confiar.
    expect(estado.fichas[0].surtosAtivos).toEqual([]);
  });

  it('v10 → v11: ficha sem surto ativo (surtoAtivo null) vira array vazio', () => {
    const estado = migrate({ fichas: [{ id: 'f1', nome: 'Pedro', surtoAtivo: null, surtoEscolha: null }] }, 10);
    expect(estado.fichas[0].surtosAtivos).toEqual([]);
  });

  it('v21 → v22: injeta foto null em fichas e silhueta null em npcs', () => {
    const estado = migrate(
      { fichas: [{ id: 'f1', nome: 'Helena' }], npcs: [{ id: 'n1', nome: 'Guarda' }] },
      21,
    );
    expect(estado.fichas[0].foto).toBeNull();
    expect(estado.npcs[0].silhueta).toBeNull();
  });

  it('v22 → v23: injeta foto null em npcs existentes', () => {
    const estado = migrate({ npcs: [{ id: 'n1', nome: 'Guarda', silhueta: 'guarda' }] }, 22);
    expect(estado.npcs[0].foto).toBeNull();
    expect(estado.npcs[0].silhueta).toBe('guarda');
  });

  it('estado já na versão atual passa sem alterações inesperadas', () => {
    const fichaAtual = { id: 'f1', nome: 'Helena', foto: 'data:image/jpeg;base64,x', surtosAtivos: [] };
    const estado = migrate({ fichas: [fichaAtual], npcs: [] }, 23);
    // v33 acrescenta antecedenteCustom (default '') a qualquer ficha vinda de antes dela.
    expect(estado.fichas[0]).toEqual({ ...fichaAtual, antecedenteCustom: '' });
  });

  it('v23 → v24: injeta pistas vazio quando ausente', () => {
    const estado = migrate({ npcs: [] }, 23);
    expect(estado.pistas).toEqual([]);
  });

  it('v24 → v25: injeta soundpad default quando ausente', () => {
    const estado = migrate({ npcs: [] }, 24);
    expect(estado.soundpad).toEqual({ sons: [], volume: 0.8, ultimoDisparo: null });
  });

  it('v25 → v26: injeta fow vazio em mapa pré-FoW (e v34 depois vira o item único da biblioteca)', () => {
    const estado = migrate({ mapa: { imagemDataUrl: 'data:image/jpeg;base64,x', tokens: [], grade: criarGradeInicial() } }, 25);
    expect(estado.mapa.biblioteca[0].fow).toEqual({ vistas: [], visiveisAgora: [], zonaAtual: null, ativa: false });
  });

  it('v25 → v26: preserva fow já existente (via cadeia de migrações até v28)', () => {
    // simula uma linha real de v25: campo ainda se chamava `proximoIdZona` — a cadeia de
    // migrações (chamada inteira num só `migrate()`) deve renomear pro nome atual. `fow` sozinho
    // (sem imagem) já basta pra v34 criar um item — ver comentário do bloco v34 em store.ts.
    const fow = { vistas: [], visiveisAgora: [], proximoIdZona: 'rua' as const, ativa: false };
    const estado = migrate({ mapa: { fow } }, 25);
    expect(estado.mapa.biblioteca[0].fow.zonaAtual).toBe('rua');
  });

  it('v26 → v27: injeta ativa:false em fow existente sem o campo', () => {
    const fow = { vistas: [], visiveisAgora: [], proximoIdZona: null };
    const estado = migrate({ mapa: { fow } }, 26);
    expect(estado.mapa.biblioteca[0].fow.ativa).toBe(false);
  });

  it('v26 → v27: preserva ativa já existente', () => {
    const fow = { vistas: [], visiveisAgora: [], proximoIdZona: null, ativa: true };
    const estado = migrate({ mapa: { fow } }, 26);
    expect(estado.mapa.biblioteca[0].fow.ativa).toBe(true);
  });

  it('v27 → v28: renomeia proximoIdZona pra zonaAtual e derruba zona por região', () => {
    const fow = {
      vistas: [{ id: 'r1', forma: 'rect' as const, x: 0, y: 0, w: 0.5, h: 0.5, zona: 'corporativo' }],
      visiveisAgora: [{ id: 'r1', forma: 'rect' as const, x: 0, y: 0, w: 0.5, h: 0.5, zona: 'corporativo' }],
      proximoIdZona: 'corporativo' as const,
      ativa: true,
    };
    const estado = migrate({ mapa: { fow } }, 27);
    const fowFinal = estado.mapa.biblioteca[0].fow;
    expect(fowFinal.zonaAtual).toBe('corporativo');
    expect(fowFinal).not.toHaveProperty('proximoIdZona');
    expect(fowFinal.vistas[0]).not.toHaveProperty('zona');
    expect(fowFinal.visiveisAgora[0]).not.toHaveProperty('zona');
  });

  it('v27 → v28: fow já em v28 (zonaAtual presente) passa sem alteração', () => {
    const fow = { vistas: [], visiveisAgora: [], zonaAtual: 'rua' as const, ativa: true };
    const estado = migrate({ mapa: { fow } }, 27);
    expect(estado.mapa.biblioteca[0].fow).toEqual(fow);
  });

  it('v28 → v29: injeta 3 tabelas default quando ausente', () => {
    const estado = migrate({ npcs: [] }, 28);
    expect(estado.tabelas).toHaveLength(3);
    expect(estado.tabelas.map((t: { nome: string }) => t.nome).sort()).toEqual([
      'encontros de rua',
      'gancho de surto',
      'ruídos noturnos',
    ]);
  });

  it('v28 → v29: preserva tabelas já existentes', () => {
    const minha = [{ id: 't1', nome: 'minha', lados: 12, entradas: [] }];
    const estado = migrate({ tabelas: minha }, 28);
    expect(estado.tabelas).toEqual(minha);
  });

  it('v29 → v30: zera surtosAtivos sem `modo` (dado antigo, ambíguo — não dá pra saber o relógio certo)', () => {
    const estado = migrate(
      { fichas: [{ id: 'f1', nome: 'Helena', surtosAtivos: [{ id: 's1', expiraEm: 5, escolha: 'Fúria' }] }] },
      29,
    );
    expect(estado.fichas[0].surtosAtivos).toEqual([]);
  });

  it('v29 → v30: ficha sem surtosAtivos não quebra', () => {
    const estado = migrate({ fichas: [{ id: 'f1', nome: 'Helena' }] }, 29);
    expect(estado.fichas[0].surtosAtivos).toEqual([]);
  });

  it('v30 → v31: injeta periciaAtaqueId null em armas existentes', () => {
    const estado = migrate(
      { fichas: [{ id: 'f1', nome: 'Helena', armas: [{ id: 'a1', nome: 'Faca', dano: '1d4' }] }] },
      30,
    );
    expect(estado.fichas[0].armas[0]).toMatchObject({ id: 'a1', nome: 'Faca', periciaAtaqueId: null });
  });

  it('v30 → v31: não fabrica armas em ficha que nunca teve o campo', () => {
    const estado = migrate({ fichas: [{ id: 'f1', nome: 'Helena' }] }, 30);
    expect(estado.fichas[0]).not.toHaveProperty('armas');
  });

  it('v31 → v32: converte indiceAtualTurno num turnoAtualId achando a entrada na mesma posição', () => {
    const estado = migrate(
      {
        sessaoPublica: { modoCombate: true, indiceAtualTurno: 1, rodada: 2 },
        iniciativa: [
          { id: 'e1', participanteId: 'a', tipo: 'npc', nome: 'A', valor: 20 },
          { id: 'e2', participanteId: 'b', tipo: 'npc', nome: 'B', valor: 10 },
        ],
      },
      31,
    );
    expect(estado.sessaoPublica.turnoAtualId).toBe('e2');
    expect(estado.sessaoPublica).not.toHaveProperty('indiceAtualTurno');
  });

  it('v31 → v32: índice fora da lista (ou lista ausente) vira turnoAtualId null', () => {
    const estado = migrate({ sessaoPublica: { modoCombate: false, indiceAtualTurno: 0, rodada: 1 } }, 31);
    expect(estado.sessaoPublica.turnoAtualId).toBeNull();
  });

  it('v32 → v33: injeta antecedenteCustom vazio em fichas existentes', () => {
    const estado = migrate({ fichas: [{ id: 'f1', nome: 'Helena', antecedenteId: 'ex-policial' }] }, 32);
    expect(estado.fichas[0]).toMatchObject({ antecedenteId: 'ex-policial', antecedenteCustom: '' });
  });
});

describe('adicionarPista/atualizarPista/removerPista', () => {
  beforeEach(() => {
    useStore.setState(criarEstadoInicial());
  });

  it('adiciona uma pista vazia em "não descoberta" e permite editar e mover status', () => {
    const id = useStore.getState().adicionarPista();
    const pista = useStore.getState().pistas.find((p) => p.id === id);
    expect(pista?.status).toBe('nao-descoberta');
    expect(pista?.texto).toBe('');

    useStore.getState().atualizarPista(id, { texto: 'sangue no elevador', status: 'descoberta' });
    const atualizada = useStore.getState().pistas.find((p) => p.id === id);
    expect(atualizada?.texto).toBe('sangue no elevador');
    expect(atualizada?.status).toBe('descoberta');

    useStore.getState().removerPista(id);
    expect(useStore.getState().pistas.find((p) => p.id === id)).toBeUndefined();
  });
});

// QuotaExceededError (mapa/mídia grandes) ou localStorage indisponível (Safari privado)
// lançavam não capturados de dentro do setTimeout do debounce — a mesa parava de salvar em
// silêncio. `criarStorageComDebounce` precisa engolir isso e avisar via lib/statusMesa.
describe('criarStorageComDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStatusMesa.setState({ local: 'ok', canaisConectados: new Set(), canaisComErro: new Set() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const criarStorageFalso = (comportamento: { lancaNoSet?: boolean; lancaNoGet?: boolean } = {}) => {
    const dados = new Map<string, string>();
    return {
      getItem: vi.fn((chave: string) => {
        if (comportamento.lancaNoGet) throw new DOMException('SecurityError');
        return dados.get(chave) ?? null;
      }),
      setItem: vi.fn((chave: string, valor: string) => {
        if (comportamento.lancaNoSet) throw new DOMException('QuotaExceededError');
        dados.set(chave, valor);
      }),
      removeItem: vi.fn((chave: string) => {
        dados.delete(chave);
      }),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as Storage;
  };

  it('grava depois do atraso do debounce e marca status local ok', () => {
    const bruto = criarStorageFalso();
    const storage = criarStorageComDebounce(bruto);
    storage.setItem('estatica-mesa', '{"a":1}');
    expect(bruto.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(bruto.setItem).toHaveBeenCalledWith('estatica-mesa', '{"a":1}');
    expect(useStatusMesa.getState().local).toBe('ok');
  });

  it('setItem que lança (quota estourada) não propaga e marca status local erro', () => {
    const bruto = criarStorageFalso({ lancaNoSet: true });
    const storage = criarStorageComDebounce(bruto);
    storage.setItem('estatica-mesa', '{"a":1}');
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    expect(useStatusMesa.getState().local).toBe('erro');
  });

  it('getItem que lança (Safari privado) devolve null em vez de derrubar a app', () => {
    const bruto = criarStorageFalso({ lancaNoGet: true });
    const storage = criarStorageComDebounce(bruto);
    expect(() => storage.getItem('estatica-mesa')).not.toThrow();
    expect(storage.getItem('estatica-mesa')).toBeNull();
  });

  it('escritas repetidas antes do atraso só gravam a última versão', () => {
    const bruto = criarStorageFalso();
    const storage = criarStorageComDebounce(bruto);
    storage.setItem('estatica-mesa', 'v1');
    storage.setItem('estatica-mesa', 'v2');
    storage.setItem('estatica-mesa', 'v3');
    vi.advanceTimersByTime(400);
    expect(bruto.setItem).toHaveBeenCalledTimes(1);
    expect(bruto.setItem).toHaveBeenCalledWith('estatica-mesa', 'v3');
  });
});
