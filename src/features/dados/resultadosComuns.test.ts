import { expect, it } from 'vitest';
import { criarResultadoTesteDetalhado, textoContaTeste, textoNaturalTeste } from './resultadoTesteApresentacao';
import { criarResultadoLivreDetalhado, formulaLivreComAjuste, textoDadosLivre } from './resultadoLivreApresentacao';

it('total do teste separa d20, atributo, perícia e Ferido sem depender de DT privada', () => {
  const modificadores = [{ rotulo: 'Agilidade', valor: 2 }, { rotulo: 'Pontaria', valor: 3 }, { rotulo: 'Ferido', valor: -2 }];
  const r = criarResultadoTesteDetalhado('Arthur', 'Pontaria', 14, modificadores);
  modificadores[0].valor = 5;
  expect(r).toMatchObject({ quem: 'Arthur', teste: 'Pontaria', d20: 14, modificador: 3, total: 17 });
  expect(textoContaTeste(r)).toBe('d20: 14 + 2 (agilidade) + 3 (pontaria) − 2 (ferido)');
  expect(textoNaturalTeste(r.d20)).toBe('o mestre avalia o resultado.');
  expect(textoContaTeste(r)).not.toContain('DT');
});
it('somente face 1/20 gera consequência natural; total 20 com outro dado não é crítico', () => {
  expect(textoNaturalTeste(1)).toBe('1 no d20 — falha com complicação.');
  expect(textoNaturalTeste(20)).toBe('20 no d20 — sucesso com efeito extra.');
  const r = criarResultadoTesteDetalhado('Arthur', 'Pontaria', 14, [{ rotulo: 'ajuste', valor: 6 }]);
  expect(r.total).toBe(20);
  expect(textoNaturalTeste(r.d20)).toBe('o mestre avalia o resultado.');
});
it('livre inclui ajuste no total e guarda grupos usados antes de controles ou dados mudarem', () => {
  const grupos = [{ qty: 2, sides: 6, value: 8, rolls: [{ value: 3 }, { value: 5 }] }, { qty: 1, sides: 8, value: 4, rolls: [{ value: 4 }] }];
  const r = criarResultadoLivreDetalhado('NPC', grupos, -2);
  grupos[0].rolls[0].value = 6;
  grupos[0].value = 11;
  expect(r).toMatchObject({ quem: 'NPC', somaDados: 12, total: 10, bonus: -2 });
  expect(textoDadosLivre(r)).toBe('2d6: [3, 5] + 1d8: [4] − 2 (ajuste)');
  expect(textoDadosLivre(r)).not.toMatch(/crítico|sucesso|falha/);
});
it.each([[0, '1d20'], [3, '1d20+3'], [-2, '1d20-2']])('fórmula usa sinal correto no ajuste %s', (bonus, esperado) => {
  expect(formulaLivreComAjuste('1d20', Number(bonus))).toBe(esperado);
});
