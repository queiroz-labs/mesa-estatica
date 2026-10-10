import { criarEstadoAmbiencia } from './factories';
import type { CamadaAmbiencia, EstadoAmbiencia, FaixaMidia } from './types';

export const CAMADA_PRINCIPAL = 'principal';
export function obterCamadaAmbiencia(estado: EstadoAmbiencia, id: string): CamadaAmbiencia | undefined {
  if (id !== CAMADA_PRINCIPAL) return estado.camadas?.find((c) => c.id === id);
  const { faixaAtualId, tocando, posicaoSegundos, atualizadoEm, volume } = estado;
  return { id, faixaAtualId, tocando, posicaoSegundos, atualizadoEm, volume };
}

export function listarCamadasAmbiencia(estado: EstadoAmbiencia): CamadaAmbiencia[] {
  return [obterCamadaAmbiencia(estado, CAMADA_PRINCIPAL)!, ...(estado.camadas ?? [])];
}

export function alterarCamadaAmbiencia(estado: EstadoAmbiencia, id: string, patch: Partial<Omit<CamadaAmbiencia, 'id'>>): EstadoAmbiencia {
  const atual = obterCamadaAmbiencia(estado, id);
  if (!atual || (patch.volume !== undefined && !Number.isFinite(patch.volume))) return estado;
  const transporte = 'faixaAtualId' in patch || 'tocando' in patch || 'posicaoSegundos' in patch;
  const nova = { ...atual, ...patch, id, atualizadoEm: transporte ? new Date().toISOString() : atual.atualizadoEm };
  if (!estado.faixas.some((f) => f.id === nova.faixaAtualId)) { nova.faixaAtualId = null; nova.tocando = false; }
  nova.posicaoSegundos = Number.isFinite(nova.posicaoSegundos) ? Math.max(0, nova.posicaoSegundos) : 0;
  nova.volume = Math.max(0, Math.min(1, nova.volume));
  if (id === CAMADA_PRINCIPAL) {
    const { id: _id, ...transportePrincipal } = nova;
    return { ...estado, ...transportePrincipal };
  }
  return { ...estado, camadas: estado.camadas?.map((c) => c.id === id ? nova : c) };
}

export function pararAmbienciasImportadas(valor: unknown): EstadoAmbiencia {
  const estado = normalizarAmbiencia(valor);
  const parado = { tocando: false, posicaoSegundos: 0, atualizadoEm: new Date(0).toISOString() };
  return { ...estado, ...parado, camadas: estado.camadas?.map((c) => ({ ...c, ...parado })) };
}

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
  const ids = new Set([CAMADA_PRINCIPAL]);
  const camadas: CamadaAmbiencia[] = Array.isArray(valor.camadas) ? valor.camadas.filter(registro).flatMap((c) => {
    if (typeof c.id !== 'string' || !c.id || ids.has(c.id)) return [];
    ids.add(c.id);
    const faixa = faixas.find((f) => f.id === c.faixaAtualId);
    return [{ id: c.id, faixaAtualId: faixa?.id ?? null, tocando: !!faixa && c.tocando === true,
      posicaoSegundos: typeof c.posicaoSegundos === 'number' && Number.isFinite(c.posicaoSegundos) ? Math.max(0, c.posicaoSegundos) : 0,
      atualizadoEm: typeof c.atualizadoEm === 'string' && Number.isFinite(Date.parse(c.atualizadoEm)) ? c.atualizadoEm : base.atualizadoEm,
      volume: typeof c.volume === 'number' && Number.isFinite(c.volume) ? Math.max(0, Math.min(1, c.volume)) : 0.5 }];
  }) : [];
  return {
    camadas,
    faixas, faixaAtualId, tocando: !!faixaAtualId && valor.tocando === true,
    posicaoSegundos: typeof valor.posicaoSegundos === 'number' && Number.isFinite(valor.posicaoSegundos) ? Math.max(0, valor.posicaoSegundos) : 0,
    atualizadoEm: typeof valor.atualizadoEm === 'string' && Number.isFinite(Date.parse(valor.atualizadoEm)) ? valor.atualizadoEm : base.atualizadoEm,
    volume: typeof valor.volume === 'number' && Number.isFinite(valor.volume) ? Math.max(0, Math.min(1, valor.volume)) : base.volume,
  };
}
