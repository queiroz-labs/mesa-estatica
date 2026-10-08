import { describe, expect, it } from 'vitest';
import { textoResultadoRolagem } from './textoRolagem';

describe('resultado com papéis claros para cada dado', () => {
  it('Sanidade não soma o dado de perda ao teste de Vontade', () => {
    const texto = textoResultadoRolagem({ tipo: 'sanidade', grupos: [{ notacao: '1d20', resultados: [12] }, { notacao: '1d8', resultados: [7] }], bonus: 2, total: 21 });
    expect(texto).toContain('Vontade: 14');
    expect(texto).toContain('perda rolada: 7');
    expect(texto).not.toContain('21');
  });
  it('Surto mostra duas opções, sem somar nem chamar isso de teste', () => {
    const texto = textoResultadoRolagem({ tipo: 'surto', grupos: [{ notacao: '2d20', resultados: [5, 18] }], total: 23 });
    expect(texto).toContain('5 e 18');
    expect(texto).toContain('escolhe');
    expect(texto).not.toContain('23');
  });
  it('Trauma de d20 compara a DT fixa; perda de d4 não vira novo teste', () => {
    const teste = textoResultadoRolagem({ tipo: 'trauma', grupos: [{ notacao: '1d20', resultados: [10] }], bonus: 2, total: 12 });
    expect(teste).toContain('DT 12: sucesso');
    expect(teste).toContain('sem custo');
    const perda = textoResultadoRolagem({ tipo: 'trauma', grupos: [{ notacao: '1d4', resultados: [3] }], total: 3 });
    expect(perda).toContain('perda rolada de Sanidade: 3');
    expect(perda).not.toContain('DT');
  });
  it('1 e 20 naturais só classificam um teste real, nunca livre', () => {
    const dados = { grupos: [{ notacao: '1d20', resultados: [20] }], bonus: -30, total: -10 };
    expect(textoResultadoRolagem({ ...dados, tipo: 'teste' })).toContain('sucesso com efeito extra');
    expect(textoResultadoRolagem({ ...dados, tipo: 'qualquer' })).not.toContain('sucesso');
    expect(textoResultadoRolagem({ ...dados, tipo: 'qualquer' })).not.toContain('+ -');
  });
});
