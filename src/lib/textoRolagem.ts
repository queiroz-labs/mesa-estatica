import type { TipoRolagemForcada } from '../dice/registroForcados';

interface Grupo { notacao: string; resultados: number[] }
/** Contexto de apresentação; não acrescenta uma categoria à resolução/fila de dados. */
export type TipoTextoRolagem = TipoRolagemForcada | 'trauma';
export interface DadosTextoRolagem {
  grupos: Grupo[];
  bonus?: number;
  total: number;
  tipo?: TipoTextoRolagem;
}

const soma = (valores: number[]) => valores.reduce((s, v) => s + v, 0);
const ajuste = (valor: number, nome: string) => valor === 0 ? '' : ` ${valor < 0 ? '−' : '+'} ${nome} ${Math.abs(valor)}`;

/** Dado, modificador e total têm papéis distintos; perda/opções nunca entram numa soma falsa. */
export function textoResultadoRolagem({ grupos, bonus = 0, total, tipo }: DadosTextoRolagem): string {
  const d20 = grupos[0]?.resultados[0];
  const testeD20 = grupos[0]?.notacao.toLowerCase() === '1d20' && grupos[0].resultados.length === 1;
  if (tipo === 'surto' && grupos.flatMap((g) => g.resultados).length === 2) {
    const [a, b] = grupos.flatMap((g) => g.resultados);
    return `surto · 2d20: ${a} e ${b} · ${a === b ? 'efeito obrigatório' : 'o jogador escolhe um dos dois efeitos'}`;
  }
  if (tipo === 'sanidade' && testeD20 && grupos.length > 1) {
    const perda = soma(grupos.slice(1).flatMap((g) => g.resultados));
    return `sanidade · teste de Vontade: ${d20 + bonus} (d20 ${d20}${ajuste(bonus, 'Vontade')}) · perda rolada: ${perda} · o mestre confirma a perda`;
  }
  if (tipo === 'trauma' && testeD20) {
    const sucesso = d20 === 20 || (d20 !== 1 && total >= 12);
    const resultado = d20 === 1 ? 'falha com complicação (1 no d20)' : d20 === 20 ? 'sucesso com efeito extra (20 no d20)' : sucesso ? 'sucesso' : 'falha';
    return `trauma · total ${total} contra DT 12: ${resultado} — ${sucesso ? 'segura o gatilho, sem custo' : 'o jogador escolhe a consequência'} (d20 ${d20}${ajuste(bonus, 'Vontade')})`;
  }
  if (!grupos.length) return `total ${total} · sem dados`;
  const detalhes = grupos.map((g) => /^\d+d\d+$/i.test(g.notacao)
    ? `${g.notacao} [${g.resultados.join(', ')}]` : `${g.notacao} ${soma(g.resultados)}`).join(' + ');
  let texto = `total ${total} · ${detalhes}${ajuste(bonus, 'modificador')}`;
  if (tipo === 'trauma' && !testeD20) return `trauma · perda rolada de Sanidade: ${total} · ${detalhes} · sem outro teste`;
  if (tipo === 'teste' && testeD20) {
    if (d20 === 1) texto += ' · 1 no d20: falha com complicação';
    else if (d20 === 20) texto += ' · 20 no d20: sucesso com efeito extra';
    else texto += ' · o mestre avalia o resultado';
  }
  return texto;
}
