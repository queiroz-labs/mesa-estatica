import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatarHeaderRolagem, formatarLogRolagem, montarNotacao, normalizarTermos, rolarFallback2D } from './useDiceBox';
import { consumirForcados, enfileirarForcado, limparForcados } from './forcarRolagem';
import { extrairResultadosSanidade, parseDado } from '../features/dados/RoladorSanidade';

// `consumirForcadosFn` (4º argumento) é injetável de propósito — useDiceBox.ts não importa mais
// forcarRolagem.ts direto (ver comentário em useDiceBox.ts), pra esse módulo não vazar pro bundle
// do jogador. Os testes abaixo passam `consumirForcados` explicitamente pra continuar exercitando
// o comportamento real do mestre.

describe('montarNotacao', () => {
  afterEach(() => limparForcados());

  it('rolagem honesta: nenhum @ na notação', async () => {
    expect(await montarNotacao([{ sides: 20, qty: 1 }], null, undefined, consumirForcados)).toBe('1d20');
  });

  it('honesta com múltiplos termos combinados', async () => {
    expect(
      await montarNotacao([{ sides: 20, qty: 1 }, { sides: 8, qty: 1 }], null, undefined, consumirForcados),
    ).toBe('1d20+1d8');
  });

  it('sem consumirForcadosFn (default do jogador): nunca força, mesmo com fila cheia', async () => {
    enfileirarForcado([5], null, 'qualquer');
    expect(await montarNotacao([{ sides: 20, qty: 1 }])).toBe('1d20');
  });

  /**
   * O parser da lib (`Qr.parseNotation`, dice-box-threejs.es.js) faz `notacao.split("@")` sem
   * limite: tudo depois do PRIMEIRO "@" vira a lista de valores forçados, nada depois disso é
   * lido como dado. Um "@" por termo ("1d20@5+1d8@1") faz o "+1d8" inteiro ser absorvido como
   * texto de valor forçado — o segundo dado nunca é criado na cena (é o bug que fez o dado de
   * Sanidade sumir da bandeja ao forçar valores múltiplos). Correto é UM único "@" no final,
   * com todos os valores na ordem dos termos.
   */
  it('forçado: um único @ no final da notação combinada', async () => {
    enfileirarForcado([5, 1], null, 'qualquer');
    expect(
      await montarNotacao([{ sides: 20, qty: 1 }, { sides: 8, qty: 1 }], null, undefined, consumirForcados),
    ).toBe('1d20+1d8@5,1');
  });

  it('nunca gera mais de um "@" — isso quebra o parser da lib', async () => {
    enfileirarForcado([5, 1], null, 'qualquer');
    const notacao = await montarNotacao([{ sides: 20, qty: 1 }, { sides: 8, qty: 1 }], null, undefined, consumirForcados);
    expect(notacao.split('@').length - 1).toBe(1);
  });

  it('forçado com múltiplos dados no mesmo termo (ex: surto 2d20)', async () => {
    enfileirarForcado([10, 20], null, 'qualquer');
    expect(await montarNotacao([{ sides: 20, qty: 2 }], null, undefined, consumirForcados)).toBe('2d20@10,20');
  });

  it('reaproveita o último valor se a fila tiver menos itens do que o total de dados', async () => {
    enfileirarForcado([4], null, 'qualquer');
    expect(
      await montarNotacao([{ sides: 20, qty: 1 }, { sides: 8, qty: 2 }], null, undefined, consumirForcados),
    ).toBe('1d20+2d8@4,4,4');
  });

  it('consome a entrada — a próxima montagem já volta a ser honesta', async () => {
    enfileirarForcado([5, 1], null, 'qualquer');
    await montarNotacao([{ sides: 20, qty: 1 }, { sides: 8, qty: 1 }], null, undefined, consumirForcados);
    expect(
      await montarNotacao([{ sides: 20, qty: 1 }, { sides: 8, qty: 1 }], null, undefined, consumirForcados),
    ).toBe('1d20+1d8');
  });

  it('filtro por personagem: só cai quando o personagem-alvo rola', async () => {
    enfileirarForcado([20], 'helena', 'Helena');
    // outro personagem rola: entrada da Helena não é consumida, sai honesto
    expect(await montarNotacao([{ sides: 20, qty: 1 }], 'joao', undefined, consumirForcados)).toBe('1d20');
    // a Helena rola: agora sim
    expect(await montarNotacao([{ sides: 20, qty: 1 }], 'helena', undefined, consumirForcados)).toBe('1d20@20');
  });

  it('entrada "qualquer" cai na próxima rolagem de quem for', async () => {
    enfileirarForcado([7], null, 'qualquer');
    expect(await montarNotacao([{ sides: 20, qty: 1 }], 'joao', undefined, consumirForcados)).toBe('1d20@7');
  });
});

describe('normalizarTermos', () => {
  // usada pelo wrapper `rolarEBroadcast` (DadosTabJogador.tsx/QuickRollOverlayJogador.tsx) pra
  // reconstruir os termos a partir da notação e publicar no rolagemAoVivoStore — a ordem aqui
  // precisa bater com a ordem dos valores em `grupos`, senão o broadcast reproduz o dado errado.
  it('um termo só', () => {
    expect(normalizarTermos('1d20')).toEqual([{ qty: 1, sides: 20 }]);
  });

  it('múltiplos termos combinados, na mesma ordem da notação', () => {
    expect(normalizarTermos('1d20+2d8')).toEqual([
      { qty: 1, sides: 20 },
      { qty: 2, sides: 8 },
    ]);
  });

  it('objeto ou lista de RollTermo passam direto', () => {
    expect(normalizarTermos({ sides: 6, qty: 3 })).toEqual([{ sides: 6, qty: 3 }]);
    expect(normalizarTermos([{ sides: 6, qty: 3 }])).toEqual([{ sides: 6, qty: 3 }]);
  });
});

describe('formatarLogRolagem', () => {
  it('um grupo, sem bônus', () => {
    expect(
      formatarLogRolagem({ quem: 'Arthur', tipo: 'Ataque: Faca', grupos: [{ notacao: '1d20', resultados: [11] }], total: 11 }),
    ).toBe('Arthur - Ataque: Faca - total 11 · 1d20 [11]');
  });

  it('um grupo, com bônus positivo', () => {
    expect(
      formatarLogRolagem({
        quem: 'Arthur', tipo: 'Teste de Perícia: Atletismo', grupos: [{ notacao: '1d20', resultados: [14] }], bonus: 2, total: 16,
      }),
    ).toBe('Arthur - Teste de Perícia: Atletismo - total 16 · 1d20 [14] + modificador 2');
  });

  it('bônus negativo', () => {
    expect(
      formatarLogRolagem({ quem: 'Arthur', tipo: 'Teste', grupos: [{ notacao: '1d20', resultados: [10] }], bonus: -3, total: 7 }),
    ).toBe('Arthur - Teste - total 7 · 1d20 [10] − modificador 3');
  });

  it('bônus 0 explícito: omite o "+ 0", igual a bônus ausente', () => {
    expect(
      formatarLogRolagem({ quem: 'Arthur', tipo: 'Teste', grupos: [{ notacao: '1d20', resultados: [14] }], bonus: 0, total: 14 }),
    ).toBe('Arthur - Teste - total 14 · 1d20 [14]');
  });

  it('múltiplos dados no mesmo grupo (dano 2d6)', () => {
    expect(
      formatarLogRolagem({ quem: 'Arthur', tipo: 'Dano: Machado', grupos: [{ notacao: '2d6', resultados: [4, 6] }], total: 10 }),
    ).toBe('Arthur - Dano: Machado - total 10 · 2d6 [4, 6]');
  });

  it('múltiplos grupos (combo — ex.: Sanidade)', () => {
    expect(
      formatarLogRolagem({
        quem: 'Arthur', tipo: 'Sanidade: Perturbador',
        grupos: [{ notacao: '1d20', resultados: [14] }, { notacao: '1d4', resultados: [3] }],
        total: 14,
      }),
    ).toBe('Arthur - Sanidade: Perturbador - teste de Vontade: 14 (d20 14) · perda rolada: 3 · o mestre confirma a perda');
  });

  it('múltiplos grupos com bônus (dano corpo a corpo + Vigor)', () => {
    expect(
      formatarLogRolagem({
        quem: 'Arthur', tipo: 'Dano: Faca',
        grupos: [{ notacao: '1d6', resultados: [4] }, { notacao: 'Vigor', resultados: [5] }],
        total: 9,
      }),
    ).toBe('Arthur - Dano: Faca - total 9 · 1d6 [4] + Vigor 5');
  });

  it('sufixo narrativo, com espaçamento correto', () => {
    expect(
      formatarLogRolagem({
        quem: 'Arthur', tipo: 'Trauma: Ruína', grupos: [{ notacao: '1d20', resultados: [16] }], total: 16, sufixo: '· segura',
      }),
    ).toBe('Arthur - Trauma: Ruína - total 16 · 1d20 [16] · segura');
  });

  it('sem sufixo: nenhum espaço sobrando no final', () => {
    const texto = formatarLogRolagem({ quem: 'Arthur', tipo: 'Teste', grupos: [{ notacao: '1d20', resultados: [11] }], total: 11 });
    expect(texto.endsWith(' ')).toBe(false);
  });
});

describe('formatarHeaderRolagem', () => {
  // usado pelo aviso de rolagem ao vivo (RolagemAoVivoPlayer.tsx) pra mostrar o resultado
  // depois que o dado assenta — ex.: "Helena está rolando…" → "Helena: 1d20 → [4] = 4".
  it('um grupo, sem bônus', () => {
    expect(formatarHeaderRolagem({ quem: 'Helena', grupos: [{ notacao: '1d20', resultados: [4] }], total: 4 })).toBe(
      'Helena: total 4 · 1d20 [4]',
    );
  });

  it('um grupo, com bônus', () => {
    expect(
      formatarHeaderRolagem({ quem: 'Helena', grupos: [{ notacao: '1d20', resultados: [5] }], bonus: 2, total: 7 }),
    ).toBe('Helena: total 7 · 1d20 [5] + modificador 2');
  });

  it('rolagem livre de 2d20 pode somar os dados quando não é Surto', () => {
    expect(
      formatarHeaderRolagem({ quem: 'Helena', grupos: [{ notacao: '2d20', resultados: [10, 15] }], total: 25 }),
    ).toBe('Helena: total 25 · 2d20 [10, 15]');
  });

  it('múltiplos grupos com bônus', () => {
    expect(
      formatarHeaderRolagem({
        quem: 'Helena', grupos: [{ notacao: '1d20', resultados: [12] }, { notacao: '1d4', resultados: [3] }], bonus: 1, total: 16,
      }),
    ).toBe('Helena: total 16 · 1d20 [12] + 1d4 [3] + modificador 1');
  });
});

describe('rolarFallback2D', () => {
  afterEach(() => limparForcados());

  it('honesta: valores caem dentro da faixa do dado', async () => {
    for (let i = 0; i < 50; i++) {
      const [grupo] = await rolarFallback2D([{ sides: 6, qty: 1 }]);
      expect(grupo.rolls[0].value).toBeGreaterThanOrEqual(1);
      expect(grupo.rolls[0].value).toBeLessThanOrEqual(6);
    }
  });

  it('mantém o mesmo shape de GrupoResultado que a rolagem física (qty, sides, value, rolls)', async () => {
    const grupos = await rolarFallback2D([{ sides: 20, qty: 1 }, { sides: 4, qty: 1 }]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({ qty: 1, sides: 20 });
    expect(grupos[1]).toMatchObject({ qty: 1, sides: 4 });
    expect(grupos[0].value).toBe(grupos[0].rolls[0].value);
  });

  it('respeita valores forçados, na ordem dos termos — mesmo sem física', async () => {
    enfileirarForcado([5, 1], null, 'qualquer');
    const [d20, d4] = await rolarFallback2D(
      [{ sides: 20, qty: 1 }, { sides: 4, qty: 1 }],
      null,
      undefined,
      consumirForcados,
    );
    expect(d20.rolls[0].value).toBe(5);
    expect(d4.rolls[0].value).toBe(1);
  });

  it('soma corretamente múltiplos dados do mesmo termo (ex: surto 2d20)', async () => {
    enfileirarForcado([10, 20], null, 'qualquer');
    const [grupo] = await rolarFallback2D([{ sides: 20, qty: 2 }], null, undefined, consumirForcados);
    expect(grupo.rolls.map((r) => r.value)).toEqual([10, 20]);
    expect(grupo.value).toBe(30);
  });

  it('sem consumirForcadosFn (default do jogador): nunca força, mesmo com fila cheia', async () => {
    enfileirarForcado([5], null, 'qualquer');
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // honesto daria 6, forçado daria 5 — distingue os dois
    const [grupo] = await rolarFallback2D([{ sides: 6, qty: 1 }]);
    vi.restoreAllMocks();
    expect(grupo.rolls[0].value).toBe(6);
  });
});

describe('extrairResultadosSanidade', () => {
  it('lê d20 e perda mesmo quando o agrupamento da lib vem em ordem diferente', () => {
    const grupos = [
      { qty: 1, sides: 8, value: 3, rolls: [{ value: 3 }] },
      { qty: 1, sides: 20, value: 18, rolls: [{ value: 18 }] },
    ];

    const perdaTermo = parseDado('1d8');
    expect(extrairResultadosSanidade(grupos, perdaTermo)).toEqual({ d20: 18, perdaRolada: 3 });
  });

  it('não confunde os dois grupos se a perda também for 1d20 (landmine de tabela futura)', () => {
    const grupos = [
      { qty: 1, sides: 20, value: 15, rolls: [{ value: 15 }] }, // d20 do teste de Vontade
      { qty: 1, sides: 20, value: 4, rolls: [{ value: 4 }] }, // perda, hipotética 1d20
    ];

    const perdaTermo = parseDado('1d20');
    expect(extrairResultadosSanidade(grupos, perdaTermo)).toEqual({ d20: 15, perdaRolada: 4 });
  });
});
