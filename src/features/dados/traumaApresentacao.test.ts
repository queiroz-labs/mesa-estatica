import { expect, it } from 'vitest';
import { resolverTeste } from '../../rules/teste';
import { consequenciaGatilhoTrauma, perdaTraumaAplicada, respostaTraumaAplicada, resultadoGatilhoTrauma } from './traumaApresentacao';

const teste = (d20: number) => resolverTeste({ d20, atributoId: 'vontade', valorAtributo: 2, grauPericia: 0, personagemFerido: false, dt: 12 });

it('resultado distingue naturais de comparação numérica e explicita escolha só na falha', () => {
  expect(resultadoGatilhoTrauma(teste(1))).toContain('Falha automática: 1 natural');
  expect(resultadoGatilhoTrauma(teste(20))).toContain('Sucesso automático: 20 natural');
  expect(consequenciaGatilhoTrauma(teste(9))).toContain('direto e sem outro teste');
  expect(consequenciaGatilhoTrauma(teste(10))).toContain('Nenhuma perda de Sanidade ou ganho de Determinação');
});

it('consequência diferencia d4 bruto de perda aplicada ao atingir Sanidade zero', () => {
  expect(perdaTraumaAplicada(4, 1, 0)).toBe('Dado de perda: 1d4 = 4. Perda aplicada: 1 Sanidade (1 → 0), sem outro teste. Determinação não mudou.');
});

it('resposta informa ganho efetivo de Determinação ou limite sem prometer ponto extra', () => {
  expect(respostaTraumaAplicada(1, 2)).toContain('Determinação: 1 → 2 (+1)');
  expect(respostaTraumaAplicada(2, 2)).toContain('nenhum ponto adicional');
});
