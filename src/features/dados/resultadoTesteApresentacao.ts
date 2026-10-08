export interface ModificadorTeste {
  rotulo: string;
  valor: number;
}

export interface ResultadoTesteDetalhado {
  quem: string;
  teste: string;
  d20: number;
  modificadores: ModificadorTeste[];
  modificador: number;
  total: number;
}

/** Guarda contexto e modificadores usados; trocar controles depois não reinterpreta a rolagem. */
export function criarResultadoTesteDetalhado(quem: string, teste: string, d20: number, modificadores: ModificadorTeste[]): ResultadoTesteDetalhado {
  const snapshot = modificadores.map((m) => ({ ...m }));
  const modificador = snapshot.reduce((soma, m) => soma + m.valor, 0);
  return { quem, teste, d20, modificadores: snapshot, modificador, total: d20 + modificador };
}

export function textoContaTeste(resultado: ResultadoTesteDetalhado): string {
  const ajustes = resultado.modificadores.filter((m) => m.valor !== 0)
    .map((m) => ` ${m.valor < 0 ? '−' : '+'} ${Math.abs(m.valor)} (${m.rotulo.toLowerCase()})`).join('');
  return `d20: ${resultado.d20}${ajustes}`;
}

/** Só testes com d20 usam esses naturais. Livre e iniciativa não passam por esta função. */
export function textoNaturalTeste(d20: number): string {
  if (d20 === 1) return '1 no d20 — falha com complicação.';
  if (d20 === 20) return '20 no d20 — sucesso com efeito extra.';
  return 'o mestre avalia o resultado.';
}
