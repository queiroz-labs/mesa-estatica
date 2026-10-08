import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { TokenMapa } from '../state/types';
import { lerPosicaoTokenConfirmada, type PosicaoTokenConfirmada } from './posicaoToken';

const ATRASO_RECONSULTA_MS = 25;

/** Recepção opcional, sem SEND. O servidor só emite depois do UPDATE autorizado.
 *  NPCs e backends legados continuam exclusivamente no transporte Postgres existente. */
export function criarRecepcaoPosicoesTokens(
  cliente: SupabaseClient,
  receber: (posicao: PosicaoTokenConfirmada) => void,
  reconsultar: () => void | PromiseLike<unknown>,
): { atualizar: (tokens: TokenMapa[]) => void; parar: () => void } {
  const canais = new Map<string, RealtimeChannel>();
  let encerrado = false;
  let timerReconsulta: ReturnType<typeof setTimeout> | null = null;
  let consultaEmVoo = false;
  let consultaPendente = false;
  const agendarReconsulta = () => {
    if (encerrado) return;
    consultaPendente = true;
    if (timerReconsulta || consultaEmVoo) return;
    timerReconsulta = setTimeout(() => {
      timerReconsulta = null;
      if (encerrado) return;
      consultaPendente = false;
      consultaEmVoo = true;
      // Cobre o intervalo consulta inicial → join, juntando a rajada dos canais de PC.
      // Um join posterior ao início da consulta exige mais uma leitura após ela terminar.
      void Promise.resolve().then(reconsultar).catch(() => {
        // A consulta é complementar; o canal Postgres continua cobrindo queda do Broadcast.
      }).finally(() => {
        consultaEmVoo = false;
        if (consultaPendente) agendarReconsulta();
      });
    }, ATRASO_RECONSULTA_MS);
  };
  return {
    atualizar: (tokens) => {
      if (encerrado) return;
      const ids = new Set(tokens.filter((t) => t.tipo === 'pc' && t.versaoPosicao !== undefined).map((t) => t.id));
      for (const [id, canal] of canais) {
        if (!ids.has(id)) { canais.delete(id); void cliente.removeChannel(canal); }
      }
      for (const id of ids) {
        if (canais.has(id)) continue;
        const canal = cliente.channel(`token-pc:${id}`, { config: { private: true } })
          .on('broadcast', { event: 'posicao' }, ({ payload }) => {
            if (encerrado || canais.get(id) !== canal) return;
            const posicao = lerPosicaoTokenConfirmada(payload, id);
            if (posicao) receber(posicao);
          });
        canais.set(id, canal);
        canal.subscribe((status) => {
          if (encerrado || canais.get(id) !== canal) return;
          if (status === 'SUBSCRIBED') agendarReconsulta();
        });
      }
    },
    parar: () => {
      encerrado = true;
      if (timerReconsulta) clearTimeout(timerReconsulta);
      timerReconsulta = null;
      consultaPendente = false;
      for (const canal of canais.values()) void cliente.removeChannel(canal);
      canais.clear();
    },
  };
}
