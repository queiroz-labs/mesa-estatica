import { formatarLogRolagem, type RollTermo } from '../dice/useDiceBox';
import { marcarComoProprio, useRolagemAoVivoStore } from '../state/rolagemAoVivoStore';
import type { ArmaFicha, EntradaRoll, Ficha, TipoLog } from '../state/types';
import { resolverDanoArma, type ResultadoDanoArma } from './teste';

type RegistrarLog = (tipo: TipoLog, texto: string, personagemId?: string | null, visibilidade?: 'publica' | 'privada') => void;
type RegistrarRoll = (entrada: Omit<EntradaRoll, 'id' | 'timestamp'>) => void;

/**
 * Rolagem de dano de arma de PC feita pela aba Combate (`ArmasCombate.tsx`) — mesmo espírito de
 * `rolarDanoNpcArma` em `npcAcoes.ts`: recebe os dados JÁ ROLADOS (quem chama decide se foi
 * `rolar()`/`reproduzir()` do `useDiceBox`) e cuida do resto (cálculo, log, registro).
 *
 * `visibilidade` vem de quem chama: `ArmasCombate.tsx` calcula com base no `souMestre` que
 * recebeu — jogador rolando a própria arma continua sempre público (comportamento inalterado);
 * mestre rolando por um PC nasce privado por padrão, com checkbox pra tornar público.
 *
 * Só publica em `rolagemAoVivoStore` quando `visibilidade === 'publica'` — antes publicava
 * incondicionalmente (mestre incluído), premissa de que "ação de PC é sempre pública" que não
 * vale mais desde que existe o checkbox "privado" em `ArmasCombate.tsx`: sem esse guard, uma
 * rolagem privada ainda animava no header de todo mundo com nome e resultado, mesmo com o log
 * oculto. O mestre continua vendo o dado cair normalmente — a física roda local na bandeja do
 * `QuickRollOverlay`, independente do broadcast.
 */
export function rolarDanoArmaFicha(
  ficha: Ficha,
  arma: ArmaFicha,
  termos: RollTermo[],
  valoresDados: number[],
  critico: boolean,
  registrarLog: RegistrarLog,
  registrarRoll: RegistrarRoll,
  visibilidade: 'publica' | 'privada',
  rolagemId?: string,
): ResultadoDanoArma {
  const resultado = resolverDanoArma(arma, valoresDados, ficha.atributos.vigor, critico);
  const nomePersonagem = ficha.nome || 'Personagem';
  const nomeArma = arma.nome || 'arma';

  const textoLog = resultado.erro
    ? `${nomePersonagem} - Dano: ${nomeArma} - ${resultado.texto}`
    : formatarLogRolagem({ quem: nomePersonagem, tipo: `Dano: ${nomeArma}`, grupos: resultado.grupos, bonus: resultado.bonus, total: resultado.total });
  registrarLog('dano', textoLog, ficha.id, visibilidade);
  registrarRoll({
    origem: nomePersonagem,
    personagemId: ficha.id,
    formula: arma.dano,
    total: resultado.total,
    bruto: resultado.bruto,
    visibilidade,
  });

  if (!resultado.erro && visibilidade === 'publica') {
    const id = rolagemId ?? crypto.randomUUID();
    marcarComoProprio(id);
    useRolagemAoVivoStore.getState().definirAtual({
      id,
      termos,
      valores: valoresDados,
      colorsetBase: 'rede',
      cor: ficha.corVisual,
      origem: nomePersonagem,
      tipo: 'dano',
      // modificador da arma + Vigor (corpo a corpo) já embutidos em `resultado.total` — sem
      // isso o header animava só a soma bruta dos dados, divergindo do total real do log.
      bonus: resultado.total - valoresDados.reduce((a, b) => a + b, 0),
    });
  }

  return resultado;
}
