import type { ResultadoTeste } from '../../rules/teste';

export function resultadoGatilhoTrauma(teste: ResultadoTeste): string {
  if (teste.natural1) return 'Falha automática: 1 natural — há também uma complicação.';
  if (teste.natural20) return 'Sucesso automático: 20 natural — com efeito de margem.';
  if (teste.margem10Mais) return 'Sucesso com margem de 10 ou mais — efeito extra.';
  return teste.sucesso ? 'Sucesso: segurou o gatilho.' : 'Falha: o gatilho não foi contido.';
}

export function consequenciaGatilhoTrauma(teste: ResultadoTeste): string {
  return teste.sucesso
    ? 'Nenhuma perda de Sanidade ou ganho de Determinação por este gatilho.'
    : 'Escolha: perder 1d4 de Sanidade, direto e sem outro teste, ou interpretar a Resposta até o fim da cena e ganhar 1 Determinação (máximo 2).';
}

export function perdaTraumaAplicada(dado: number, antes: number, depois: number): string {
  return `Dado de perda: 1d4 = ${dado}. Perda aplicada: ${antes - depois} Sanidade (${antes} → ${depois}), sem outro teste. Determinação não mudou.`;
}

export function respostaTraumaAplicada(antes: number, depois: number): string {
  const ganho = depois - antes;
  return ganho > 0
    ? `Interprete a Resposta até o fim da cena. Determinação: ${antes} → ${depois} (+${ganho}). Sem perda de Sanidade.`
    : `Interprete a Resposta até o fim da cena. Determinação permanece ${depois}: limite de 2 atingido, nenhum ponto adicional. Sem perda de Sanidade.`;
}

export const rotuloInterpretarTrauma = (determinacao: number): string => determinacao >= 2
  ? 'interpretar a Resposta (Determinação já no limite de 2)'
  : 'interpretar a Resposta (+1 Determinação, máximo 2)';
