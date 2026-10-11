import { PERICIAS, type GrauPericia } from '../rules/data/pericias';
import type { Ficha } from './types';

const GRAUS: Record<GrauPericia, string> = { 0: 'sem treino', 3: 'treinado', 6: 'veterano' };

const valorNoLog = (valor: string) => valor === '' ? '(vazio)' : JSON.stringify(valor);
const nomePericia = (id: string | null) => PERICIAS.find((p) => p.id === id)?.nome ?? id ?? '';

function descreverLista<T extends { id: string }>(
  anteriores: T[], atuais: T[], tipo: string,
  nome: (item: T) => string, campos: (item: T) => Record<string, string>,
): string[] {
  const alteracoes: string[] = [];
  const antesPorId = new Map(anteriores.map((item) => [item.id, item]));
  const idsAtuais = new Set(atuais.map((item) => item.id));
  for (const item of atuais) {
    const anterior = antesPorId.get(item.id);
    if (!anterior) {
      alteracoes.push(`adicionou ${tipo}: ${nome(item)}`);
      continue;
    }
    const antes = campos(anterior);
    const depois = campos(item);
    const diferencas = Object.keys(depois)
      .filter((campo) => antes[campo] !== depois[campo])
      .map((campo) => `${campo}: ${valorNoLog(antes[campo])} → ${valorNoLog(depois[campo])}`);
    if (diferencas.length) alteracoes.push(`editou ${tipo}: ${nome(anterior)} · ${diferencas.join('; ')}`);
  }
  for (const anterior of anteriores) {
    if (idsAtuais.has(anterior.id)) continue;
    const detalhes = Object.entries(campos(anterior))
      .filter(([, valor]) => valor !== '')
      .map(([campo, valor]) => `${campo}: ${valorNoLog(valor)}`);
    alteracoes.push(`removeu ${tipo}: ${nome(anterior)}${detalhes.length ? ` · ${detalhes.join('; ')}` : ''}`);
  }
  return alteracoes;
}

/** Compara alterações locais. Hidratação e Realtime usam setState e não geram outro log.
 * Compara por id e campo, sem avisar por reordenação ou por valores idênticos. */
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

  alteracoes.push(...descreverLista(
    anterior.kitInvestigacao ?? [], atual.kitInvestigacao ?? [], 'item de investigação',
    (item) => item.nome.trim() || 'item livre (sem nome)',
    (item) => ({ nome: item.nome, 'nota / acesso': item.nota }),
  ));
  alteracoes.push(...descreverLista(
    anterior.armas, atual.armas, 'arma',
    (arma) => arma.nome.trim() || 'arma livre (sem nome)',
    (arma) => ({ nome: arma.nome, ataque: arma.bonusAtaque, dano: arma.dano, alcance: arma.alcance, nota: arma.nota, 'perícia de ataque': nomePericia(arma.periciaAtaqueId) }),
  ));
  alteracoes.push(...descreverLista(
    anterior.vinculos, atual.vinculos, 'vínculo',
    (vinculo) => vinculo.quemOuOque.trim() || 'vínculo (sem descrição)',
    (vinculo) => ({ 'quem ou o quê': vinculo.quemOuOque, frase: vinculo.frase }),
  ));
  return alteracoes;
}
