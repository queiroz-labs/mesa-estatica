import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../state/store';

export type ResultadoReset = { ok: true } | { ok: false; erro: string };

async function extrairErroFuncao(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const corpo = await error.context.json();
      if (typeof corpo?.erro === 'string') return corpo.erro;
    } catch {
      // corpo não era JSON — cai no fallback abaixo
    }
  }
  return 'falha de rede — confira a conexão';
}

/**
 * "Sessão limpa" — zera a mesa inteira, local E no servidor.
 *
 * Antes disso rodava inteiro no cliente: marcava cada id em `remocaoExplicita.ts`, resetava o
 * estado local (o que fazia cada sync notar o sumiço e propagar DELETE), e limpava à mão o que
 * nenhum diff cobria. Isso só funcionava pra quem fosse `is_gm()` (as policies de delete
 * checavam isso) e nunca apagava os arquivos de mídia de verdade, só as linhas que apontavam
 * pra eles (ROADMAP.md item 2, Parte A).
 *
 * Agora a Edge Function `reset-mesa` (service_role, sem checar is_gm()) faz 100% da limpeza
 * remota — tabelas E arquivos (bucket `midia`, R2 `sfx/`) — antes do cliente tocar no estado
 * local. Por isso a ordem inverteu: se o servidor falhar (token errado, rede), aborta SEM zerar
 * local — apagar o único rascunho local por causa de um token digitado errado seria pior que
 * não fazer nada. Os outros clientes conectados recebem os DELETEs por Realtime normalmente,
 * do jeito que já recebiam quando era o próprio mestre deletando pela UI.
 *
 * Sem `resetToken` (mesa 100% local, sem Supabase configurado): reseta só o estado local.
 */
export async function resetarMesaCompleta(resetToken?: string): Promise<ResultadoReset> {
  const cliente = supabase;
  if (cliente) {
    try {
      const { data, error } = await cliente.functions.invoke('reset-mesa', { body: { reset_token: resetToken } });
      if (error) return { ok: false, erro: await extrairErroFuncao(error) };
      if (data?.ok !== true) return { ok: false, erro: data?.erro ?? 'o servidor não confirmou a limpeza — estado local preservado' };
    } catch (error) {
      return { ok: false, erro: await extrairErroFuncao(error) };
    }
  }

  useStore.getState().resetarEstado();
  return { ok: true };
}
