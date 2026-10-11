import { PERICIAS, type GrauPericia } from '../rules/data/pericias';
import type { Ficha } from './types';

const GRAUS: Record<GrauPericia, string> = { 0: 'sem treino', 3: 'treinado', 6: 'veterano' };

/** Compara alterações locais. Hidratação e Realtime usam setState e não geram outro log.
 * Inclusões são identificadas por id: digitar o nome ou reordenar não repete o aviso. */
export function descreverAlteracoesFicha(anterior: Ficha, atual: Ficha): string[] {
  const alteracoes: string[] = [];
  const pericias = new Set([...Object.keys(anterior.pericias), ...Object.keys(atual.pericias)]);
  for (const id of pericias) {
    const antes = anterior.pericias[id] ?? 0;
    const depois = atual.pericias[id] ?? 0;
    if (antes === depois) continue;
    const nome = PERICIAS.find((p) => p.id === id)?.nome ?? id;
    alteracoes.push(`alterou perícia ${nome}: ${GRAUS[antes]} → ${GRAUS[depois]}`);
  }

  for (const item of atual.kitInvestigacao ?? []) {
    if (!(anterior.kitInvestigacao ?? []).some((a) => a.id === item.id)) {
      alteracoes.push(`adicionou item de investigação: ${item.nome.trim() || 'item livre (sem nome)'}`);
    }
  }
  for (const arma of atual.armas) {
    if (!anterior.armas.some((a) => a.id === arma.id)) {
      alteracoes.push(`adicionou arma: ${arma.nome.trim() || 'arma livre (sem nome)'}`);
    }
  }
  for (const vinculo of atual.vinculos) {
    if (!anterior.vinculos.some((v) => v.id === vinculo.id)) {
      alteracoes.push(`adicionou vínculo: ${vinculo.quemOuOque.trim() || 'vínculo (sem descrição)'}`);
    }
  }
  return alteracoes;
}
