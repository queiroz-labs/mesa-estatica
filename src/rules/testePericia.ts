import type { BasePV } from './data/dificuldades';
import { ATRIBUTOS, type DefinicaoPericia } from './data/pericias';
import { calcularPvMaximo, estaFerido } from './derivados';
import { formatarLogRolagem } from '../dice/useDiceBox';
import { marcarComoProprio, useRolagemAoVivoStore } from '../state/rolagemAoVivoStore';
import type { EntradaRoll, Ficha, TipoLog } from '../state/types';

type RegistrarLog = (tipo: TipoLog, texto: string, personagemId?: string | null, visibilidade?: 'publica' | 'privada') => void;
type RegistrarRoll = (entrada: Omit<EntradaRoll, 'id' | 'timestamp'>) => void;

export interface ResultadoTestePericia {
  texto: string;
  total: number;
}

/**
 * d20 + atributo + perícia (+ penalidade de Ferido) já rolado — mesmo espírito de
 * `rolarDanoArmaFicha` (armasCombate.ts): recebe o `d20` JÁ ROLADO (quem chama decide se veio da
 * bandeja 3D ou de `rolarDadosComForcados`) e cuida do resto (cálculo, log, registro, broadcast).
 * Extraída pra não duplicar a mesma fórmula que já vivia solta em `ArmasSection.tsx`,
 * `PericiasSection.tsx` e `QuickRollOverlay.tsx`.
 *
 * `rotuloArma`, quando presente, rotula o log como ataque de arma (`ArmasCombate.tsx`) em vez de
 * teste de perícia solo (`PericiasSection.tsx`) — mesmo cálculo nos dois casos.
 *
 * Só publica em `rolagemAoVivoStore` quando `visibilidade === 'publica'` — rolagem privada do
 * mestre por um PC não deve animar no header de quem não pode ver o log (mesma regra aplicada a
 * `rolarDanoArmaFicha`).
 */
export function rolarTestePericiaFicha(
  ficha: Ficha,
  pericia: DefinicaoPericia,
  d20: number,
  basePV: BasePV,
  registrarLog: RegistrarLog,
  registrarRoll: RegistrarRoll,
  visibilidade: 'publica' | 'privada',
  rotuloArma?: string,
  rolagemId?: string,
): ResultadoTestePericia {
  const grauPericia = ficha.pericias[pericia.id] ?? 0;
  const pvMaximo = calcularPvMaximo(basePV, ficha.atributos.vigor);
  const ferido = estaFerido(ficha.pvAtual, pvMaximo);
  const penalidadeFerido = ferido && (pericia.atributo === 'vigor' || pericia.atributo === 'agilidade') ? -2 : 0;
  const modificador = ficha.atributos[pericia.atributo] + grauPericia + penalidadeFerido;
  const total = d20 + modificador;
  const modStr = modificador >= 0 ? `+${modificador}` : `${modificador}`;
  const nomePersonagem = ficha.nome || 'Personagem';
  const atributoNome = ATRIBUTOS.find((a) => a.id === pericia.atributo)!.nome;
  const texto = `d20=${d20}${modStr}=${total}`;

  const tipoLog = rotuloArma ? `${rotuloArma}: Ataque` : `Teste de Perícia: ${pericia.nome}(${atributoNome})`;
  registrarLog(
    'teste',
    formatarLogRolagem({ quem: nomePersonagem, tipo: tipoLog, grupos: [{ notacao: '1d20', resultados: [d20] }], bonus: modificador, total }),
    ficha.id,
    visibilidade,
  );
  registrarRoll({ origem: nomePersonagem, personagemId: ficha.id, formula: `d20${modStr}`, total, bruto: d20, visibilidade });

  if (visibilidade === 'publica') {
    const id = rolagemId ?? crypto.randomUUID();
    marcarComoProprio(id);
    useRolagemAoVivoStore.getState().definirAtual({
      id,
      termos: [{ sides: 20, qty: 1 }],
      valores: [d20],
      colorsetBase: 'rede',
      cor: ficha.corVisual,
      origem: nomePersonagem,
      tipo: 'teste',
      bonus: modificador,
    });
  }

  return { texto, total };
}
