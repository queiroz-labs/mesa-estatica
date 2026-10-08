import type { RollGroupResult } from '../../dice/useDiceBox';

export interface ResultadoLivreDetalhado {
  quem: string;
  grupos: RollGroupResult[];
  bonus: number;
  somaDados: number;
  total: number;
}

export function criarResultadoLivreDetalhado(quem: string, grupos: RollGroupResult[], bonus: number): ResultadoLivreDetalhado {
  const snapshot = grupos.map((g) => ({ ...g, rolls: g.rolls.map((r) => ({ ...r })) }));
  const somaDados = snapshot.reduce((soma, g) => soma + g.value, 0);
  return { quem, grupos: snapshot, bonus, somaDados, total: somaDados + bonus };
}

export function textoDadosLivre(resultado: ResultadoLivreDetalhado): string {
  const dados = resultado.grupos.map((g) => `${g.qty}d${g.sides}: [${g.rolls.map((r) => r.value).join(', ')}]`).join(' + ');
  return `${dados}${resultado.bonus !== 0 ? ` ${resultado.bonus < 0 ? '−' : '+'} ${Math.abs(resultado.bonus)} (ajuste)` : ''}`;
}

export function formulaLivreComAjuste(notacao: string, bonus: number): string {
  return `${notacao}${bonus === 0 ? '' : `${bonus < 0 ? '-' : '+'}${Math.abs(bonus)}`}`;
}
