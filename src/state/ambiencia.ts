import { criarEstadoAmbiencia } from './factories';
import type { EstadoAmbiencia, FaixaMidia } from './types';

const registro = (valor: unknown): valor is Record<string, unknown> =>
  !!valor && typeof valor === 'object' && !Array.isArray(valor);

/** Dados do banco e backups antigos nunca deixam um transporte órfão ou volume inválido. */
export function normalizarAmbiencia(valor: unknown): EstadoAmbiencia {
  const base = criarEstadoAmbiencia();
  if (!registro(valor)) return base;
  const faixas: FaixaMidia[] = Array.isArray(valor.faixas) ? valor.faixas.filter(registro).flatMap((f, ordem) =>
    typeof f.id === 'string' && typeof f.url === 'string' && typeof f.nome === 'string'
      ? [{ id: f.id, nome: f.nome, url: f.url, path: typeof f.path === 'string' ? f.path : '',
          ordem, criadoEm: typeof f.criadoEm === 'string' ? f.criadoEm : base.atualizadoEm }]
      : [],
  ) : [];
  const faixaAtualId = faixas.find((f) => f.id === valor.faixaAtualId)?.id ?? null;
  return {
    faixas, faixaAtualId, tocando: !!faixaAtualId && valor.tocando === true,
    posicaoSegundos: typeof valor.posicaoSegundos === 'number' && Number.isFinite(valor.posicaoSegundos) ? Math.max(0, valor.posicaoSegundos) : 0,
    atualizadoEm: typeof valor.atualizadoEm === 'string' && Number.isFinite(Date.parse(valor.atualizadoEm)) ? valor.atualizadoEm : base.atualizadoEm,
    volume: typeof valor.volume === 'number' && Number.isFinite(valor.volume) ? Math.max(0, Math.min(1, valor.volume)) : base.volume,
  };
}
