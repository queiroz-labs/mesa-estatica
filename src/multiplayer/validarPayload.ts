import type { Ponto } from '../features/mapa/mapaUtils';
import type { ReguaViva } from '../state/reguasStore';
import type { AoeVivo } from '../state/aoeStore';
import type { PingVivo } from '../state/pingsStore';
import type { InicioRolagemAoVivo, RolagemAoVivo } from '../state/rolagemAoVivoStore';

/**
 * Confere o shape mínimo de payloads de broadcast (`reguasSync.ts`, `aoeSync.ts`) antes de
 * tocar no estado. A anon key do Supabase é pública por design — qualquer um com o link pode
 * abrir o devtools e mandar um broadcast malformado no canal `reguas`/`aoe`; sem essa checagem,
 * `{ ...payload.regua }` com campo faltando vira `pontos: undefined`, e o primeiro
 * `regua.pontos.map(...)` no Overlay derruba a tela de TODO cliente conectado (DoS barato).
 * Mesmo princípio de `validarImportacao.ts` — nunca confiar em dado externo sem checar o
 * formato antes de tocar no estado.
 */

function ehPonto(v: unknown): v is Ponto {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function ehReguaViva(v: unknown): v is ReguaViva {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.autorId === 'string' &&
    typeof r.cor === 'string' &&
    typeof r.ativa === 'boolean' &&
    Array.isArray(r.pontos) &&
    r.pontos.every(ehPonto)
  );
}

export function ehAoeVivo(v: unknown): v is AoeVivo {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    (t.forma === 'circulo' || t.forma === 'quadrado') &&
    typeof t.ativa === 'boolean' &&
    ehPonto(t.origem) &&
    ehPonto(t.alvo)
  );
}

export function ehPingVivo(v: unknown): v is PingVivo {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.autorId === 'string' && typeof p.cor === 'string' && ehPonto(p.ponto);
}

function ehRollTermo(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return Number.isFinite(t.sides) && Number.isFinite(t.qty);
}

export function ehRolagemAoVivo(v: unknown): v is RolagemAoVivo {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.cor === 'string' &&
    typeof r.origem === 'string' &&
    typeof r.tipo === 'string' &&
    (r.colorsetBase === 'rede' || r.colorsetBase === 'ruido') &&
    Array.isArray(r.termos) &&
    r.termos.length > 0 &&
    r.termos.every(ehRollTermo) &&
    Array.isArray(r.valores) &&
    r.valores.every((x) => Number.isFinite(x)) &&
    (r.bonus === undefined || Number.isFinite(r.bonus)) &&
    (r.contexto === undefined || r.contexto === 'livre' || r.contexto === 'trauma')
  );
}

export function ehInicioRolagemAoVivo(v: unknown): v is InicioRolagemAoVivo {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 100
    && typeof r.origem === 'string' && r.origem.length <= 200
    && typeof r.cor === 'string' && r.cor.length <= 100
    && typeof r.tipo === 'string' && ['teste', 'iniciativa', 'dano', 'sanidade', 'surto', 'qualquer'].includes(r.tipo);
}
