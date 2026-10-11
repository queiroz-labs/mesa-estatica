import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../state/store';
import { normalizarObjetosMapa } from '../state/objetosMapa';

export const useObjetosSyncUi = create<{ avisos: Record<string, string> }>(() => ({ avisos: {} }));
const aviso = (id: string, texto: string) => useObjetosSyncUi.setState(s => ({ avisos: { ...s.avisos, [id]: texto } }));
let tentar: ((id: string) => void) | undefined;
let recarregar: ((id: string) => Promise<void>) | undefined;
export const tentarObjetosMapa = (id: string) => tentar?.(id);

export async function recarregarObjetosMapa(id: string) {
  await recarregar?.(id);
}

/** Uma gravação CAS por mapa. O rascunho persiste; conflitos nunca forçam overwrite. */
export function iniciarSyncObjetosMapa(aguardandoMapa: (id: string) => boolean) {
  const cliente = supabase;
  if (!cliente) return () => {};
  let encerrado = false;
  const emVoo = new Set<string>(), bloqueados = new Set<string>();
  const recargas = new Map<string, { valida: boolean }>();
  const enviar = async (id: string) => {
    const mapa = useStore.getState().mapa.biblioteca.find(m => m.id === id);
    if (encerrado || !mapa?.objetosPendentes || emVoo.has(id) || recargas.has(id) || bloqueados.has(id) || aguardandoMapa(id) || mapa.imagemUrl.startsWith('data:')) return;
    const objetos = mapa.objetos ?? [];
    if (objetos.some(o => o.imagemUrl.startsWith('data:'))) { aviso(id, 'objetos locais: envie as imagens antes de sincronizar.'); return; }
    emVoo.add(id); aviso(id, 'salvando objetos…');
    try {
      const { data, error } = await cliente.rpc('salvar_objetos_mapa', { p_mapa_id: id, p_revisao: mapa.objetosRevisao ?? 0, p_objetos: objetos });
      if (encerrado) return;
      if (error) throw new Error('não foi possível salvar os objetos. confira a conexão e a migration do recurso; o rascunho continua neste navegador.');
      if (!data?.ok) throw new Error(data?.motivo === 'conflito'
        ? 'outra aba alterou os objetos. seu rascunho foi mantido apenas aqui; exporte uma cópia antes de recarregar os objetos.'
        : 'o mapa não está disponível no servidor; o rascunho continua neste navegador.');
      useStore.setState(s => ({ mapa: { ...s.mapa, biblioteca: s.mapa.biblioteca.map(m => m.id === id ? {
        ...m, objetosRevisao: data.revisao, objetosPendentes: m.objetos !== objetos,
      } : m) } }));
      aviso(id, '');
    } catch (e) {
      if (!encerrado) { bloqueados.add(id); aviso(id, e instanceof Error ? e.message : 'não foi possível salvar os objetos.'); }
    } finally {
      emVoo.delete(id);
      if (!encerrado && !bloqueados.has(id)) void enviar(id);
    }
  };
  const retomar = () => { for (const m of useStore.getState().mapa.biblioteca) void enviar(m.id); };
  const retry = (id: string) => { bloqueados.delete(id); void enviar(id); };
  const reload = async (id: string) => {
    if (encerrado || emVoo.has(id) || !useStore.getState().mapa.biblioteca.some(m => m.id === id)) return;
    const recarga = { valida: true };
    recargas.set(id, recarga);
    try {
      const { data, error } = await cliente.from('mapas_biblioteca').select('objetos,objetos_revisao').eq('id', id).maybeSingle();
      if (encerrado || recargas.get(id) !== recarga) return;
      if (!recarga.valida) { aviso(id, 'recarga cancelada: o mapa mudou durante a espera; seu rascunho foi preservado.'); return; }
      if (error || !data) throw new Error('recarga indisponível');
      useStore.setState(s => ({ mapa: { ...s.mapa, biblioteca: s.mapa.biblioteca.map(m => m.id === id
        ? { ...m, objetos: normalizarObjetosMapa(data.objetos), objetosRevisao: data.objetos_revisao ?? 0, objetosPendentes: false } : m) } }));
      bloqueados.delete(id);
      aviso(id, '');
    } catch {
      if (!encerrado && recargas.get(id) === recarga) aviso(id, 'não foi possível recarregar os objetos; seu rascunho foi preservado.');
    } finally {
      if (recargas.get(id) === recarga) {
        recargas.delete(id);
        if (!encerrado) void enviar(id);
      }
    }
  };
  tentar = retry;
  recarregar = reload;
  const unsubscribe = useStore.subscribe((s, prev) => {
    // Invalidação permanece mesmo se o usuário voltar à cena/posição anterior.
    for (const [id, recarga] of recargas) {
      const antes = prev.mapa.biblioteca.find(m => m.id === id), atual = s.mapa.biblioteca.find(m => m.id === id);
      if (!atual || s.mapa.mapaAtivoId !== prev.mapa.mapaAtivoId || atual.objetos !== antes?.objetos || atual.objetosRevisao !== antes?.objetosRevisao) recarga.valida = false;
    }
    if (s.mapa.biblioteca !== prev.mapa.biblioteca) retomar();
  });
  const online = () => { bloqueados.clear(); retomar(); };
  if (typeof window !== 'undefined') window.addEventListener('online', online);
  retomar();
  return () => { encerrado = true; recargas.clear(); unsubscribe(); if (typeof window !== 'undefined') window.removeEventListener('online', online); if (tentar === retry) tentar = undefined; if (recarregar === reload) recarregar = undefined; };
}
