import { calcularPerdaSanidade } from '../../rules/sanidade';

export interface DadosSanidade {
  d20: number;
  vontade: number;
  gatilhoDado: string;
  perdaRolada: number;
}

export function textoTesteSanidade(r: Pick<DadosSanidade, 'd20' | 'vontade'>): string {
  return `teste de Vontade: d20 ${r.d20} + Vontade ${r.vontade} = ${r.d20 + r.vontade}`;
}

export function textoDadoPerda(r: Pick<DadosSanidade, 'gatilhoDado' | 'perdaRolada'>): string {
  return `dado de perda (${r.gatilhoDado}): ${r.perdaRolada}`;
}

export function sucessoNaturalSanidade(d20?: number): boolean | null {
  return d20 === 1 ? false : d20 === 20 ? true : null;
}

export function textoConsequenciasSanidade(perdaRolada: number, d20?: number): string {
  if (d20 === 1) return `1 natural — falha com complicação. Perde ${perdaRolada} de Sanidade (perda inteira).`;
  if (d20 === 20) return `20 natural — sucesso com efeito extra. Perde ${calcularPerdaSanidade(perdaRolada, true)} de Sanidade (metade).`;
  return `sucesso: perde ${calcularPerdaSanidade(perdaRolada, true)} de Sanidade; falha: perde ${perdaRolada}.`;
}

export function textoDadosSurto(d20A: number, d20B: number): string {
  return `2d20: ${d20A} e ${d20B} · ${d20A === d20B ? 'mesmo número — o efeito é obrigatório' : 'o jogador escolhe um dos dois efeitos'}`;
}

export function textoDuracaoSurto(modoCombate: boolean, rodadaInicial: number, expiraEm: number): string {
  return modoCombate
    ? `duração: ${expiraEm - rodadaInicial + 1} rodadas (1d4+1), até o fim da rodada ${expiraEm} inclusive.`
    : 'duração: até o fim da cena.';
}
