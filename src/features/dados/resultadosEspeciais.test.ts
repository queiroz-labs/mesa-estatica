import { describe, expect, it } from 'vitest';
import { sucessoNaturalSanidade, textoConsequenciasSanidade, textoDadoPerda, textoDadosSurto, textoDuracaoSurto, textoTesteSanidade } from './resultadosEspeciais';

describe('apresentação de Sanidade', () => {
  it('separa o teste com Vontade do dado de perda', () => {
    expect(textoTesteSanidade({ d20: 12, vontade: 2 })).toBe('teste de Vontade: d20 12 + Vontade 2 = 14');
    expect(textoDadoPerda({ gatilhoDado: '1d8', perdaRolada: 7 })).toBe('dado de perda (1d8): 7');
    expect(textoConsequenciasSanidade(7)).toBe('sucesso: perde 3 de Sanidade; falha: perde 7.');
  });

  it('1 natural admite só perda inteira; 20 natural admite só metade', () => {
    expect(textoConsequenciasSanidade(7, 1)).toBe('1 natural — falha com complicação. Perde 7 de Sanidade (perda inteira).');
    expect(textoConsequenciasSanidade(7, 20)).toBe('20 natural — sucesso com efeito extra. Perde 3 de Sanidade (metade).');
    expect(sucessoNaturalSanidade(1)).toBe(false);
    expect(sucessoNaturalSanidade(20)).toBe(true);
    expect(sucessoNaturalSanidade(12)).toBeNull();
    expect(textoConsequenciasSanidade(7, 12)).toBe(textoConsequenciasSanidade(7));
  });
});

describe('apresentação de Surto', () => {
  it('números diferentes descrevem opções sem apresentar soma', () => {
    expect(textoDadosSurto(5, 18)).toBe('2d20: 5 e 18 · o jogador escolhe um dos dois efeitos');
  });

  it('números iguais indicam efeito obrigatório', () => {
    expect(textoDadosSurto(5, 5)).toBe('2d20: 5 e 5 · mesmo número — o efeito é obrigatório');
  });

  it('duração inclui a rodada em que foi rolado e explicita o fim da cena', () => {
    expect(textoDuracaoSurto(true, 3, 5)).toBe('duração: 3 rodadas (1d4+1), até o fim da rodada 5 inclusive.');
    expect(textoDuracaoSurto(false, 3, 2)).toBe('duração: até o fim da cena.');
  });
});
