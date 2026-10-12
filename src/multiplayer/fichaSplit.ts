import type { Ficha } from '../state/types';
import type { EstadoTokenCombate } from '../rules/combate';

/** Superfície de mesa: o que qualquer participante vê de um PC. */
export interface FichaPublica {
  id: string;
  nome: string;
  corVisual: string;
  foto: string | null;
  /** Indicadores derivados na leitura do servidor; não inclui valores de PV na visão do mapa. */
  estadoCombate?: EstadoTokenCombate;
}

/** Resto da ficha — só o dono (via auth_uid) e o GM leem/escrevem. */
export type FichaPrivadaDados = Omit<Ficha, 'id' | 'nome' | 'corVisual' | 'foto'>;

export function dividirFicha(ficha: Ficha): { publico: FichaPublica; privado: FichaPrivadaDados } {
  const { id, nome, corVisual, foto, ...privado } = ficha;
  return {
    publico: { id, nome, corVisual, foto },
    privado,
  };
}

export function montarFicha(publico: FichaPublica, privado: FichaPrivadaDados): Ficha {
  return {
    id: publico.id,
    nome: publico.nome,
    corVisual: publico.corVisual,
    foto: publico.foto,
    ...privado,
  };
}
