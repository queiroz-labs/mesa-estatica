import { useEffect, useState } from 'react';
import type { EntradaIniciativa } from '../state/types';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanalComRefetch, desconectarCanal } from '../lib/statusMesa';
import { useStore } from '../state/store';
import { paraFichaPublica, type LinhaPublico as LinhaFichaPublico } from './fichasSync';
import type { FichaPublica } from './fichaSplit';
import { paraEntrada, type LinhaIniciativa } from './iniciativaSync';
import { paraEstadoMidia, type Linha as LinhaMidiaEstado } from './midiaEstadoSync';
import { normalizarAmbiencia } from '../state/ambiencia';
import { paraFaixa, type LinhaFaixa } from './midiaFaixasSync';
import { paraNpcPublico, type LinhaPublico as LinhaNpcPublico, type NpcPublico } from './npcsSync';
import { paraSessaoPublica, type Linha as LinhaSessaoPublica } from './sessaoPublicaSync';
import { observarVisibilidadeNpcs } from './visibilidadeNpcsSync';

/**
 * Hidratação read-only do `PlayerApp` (mesa-estatica-multiplayer-completo.md Parte IV §4,
 * §6.4): busca inicial + assinatura Realtime nas tabelas que a RLS já deixa o jogador ler
 * (`characters_publico`, `npcs_publico` — `visivel` filtrado no servidor, nunca no
 * client —, `sessao_publica`). Nunca escreve nada de volta — isso é a Fase 5 (própria
 * ficha editável + `resolver-rolagem`), ainda não implementada.
 *
 * `fichas`/`npcs` ficam em estado local do componente, não no `useStore` compartilhado —
 * o tipo público (`FichaPublica`/`Omit<Npc,'notasMestre'>`) não é um `Ficha`/`Npc` completo
 * e forçar isso no store do mestre seria inventar campos privados falsos. `sessaoPublica` é
 * a exceção: `FichaPublicaView`/`SessaoPublicaView` já leem `useStore().sessaoPublica`
 * diretamente (reuso do mesmo componente entre os dois bundles), então ela precisa mesmo
 * viver no store compartilhado.
 */

export function useHidratarSessaoPublica(): void {
  useEffect(() => {
    const cliente = supabase;
    if (!cliente) return;

    let cancelado = false;

    // busca inicial E refetch de reconexão (canal caiu e voltou) — o Realtime não reenvia o
    // evento perdido durante a queda, então sem isso quem reconecta fica com cena/rodada/
    // ameaça desatualizada até um reload manual (achado em 24/08, auditoria pré-sessão).
    const refetch = () =>
      cliente
        .from('sessao_publica')
        .select('*')
        .eq('id', 'sessao')
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelado) return;
          if (error) console.error('[hidratacaoJogador] busca de sessao_publica falhou', error);
          else if (data) useStore.setState({ sessaoPublica: paraSessaoPublica(data as LinhaSessaoPublica) });
        });
    void refetch();

    const canal = cliente
      .channel('jogador-sessao-publica')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessao_publica' }, (payload) => {
        if (payload.eventType !== 'DELETE') {
          useStore.setState({ sessaoPublica: paraSessaoPublica(payload.new as LinhaSessaoPublica) });
        }
      })
      .subscribe(assinarStatusCanalComRefetch('jogador-sessao-publica', refetch));

    return () => {
      cancelado = true;
      desconectarCanal('jogador-sessao-publica');
      cliente.removeChannel(canal);
    };
  }, []);
}

/**
 * Playlist + estado de playback do jukebox (`midia_faixas`/`midia_estado`) — vai pro
 * `useStore` compartilhado pelo mesmo motivo do mapa: `MidiaPlayerJogador.tsx`/
 * `MidiaJogadorView.tsx` leem `s.midia` direto, mesmo tipo usado pelo mestre (sem split
 * público/privado — faixas de áudio não têm campo nenhum que precise ficar escondido do
 * jogador). Nunca escreve de volta.
 */
export function useHidratarMidia(): void {
  useEffect(() => {
    const cliente = supabase;
    if (!cliente) return;

    let cancelado = false;

    // busca inicial E refetch de reconexão — mesmo motivo de `useHidratarSessaoPublica`.
    const refetchFaixas = () =>
      cliente
        .from('midia_faixas')
        .select('*')
        .order('ordem', { ascending: true })
        .then(({ data, error }) => {
          if (cancelado) return;
          if (error) return console.error('[hidratacaoJogador] busca de midia_faixas falhou', error);
          if (data) useStore.setState((s) => ({ midia: { ...s.midia, faixas: (data as LinhaFaixa[]).map(paraFaixa) } }));
        });
    void refetchFaixas();

    const refetchEstado = () =>
      cliente
        .from('midia_estado')
        .select('*')
        .eq('id', 'midia')
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelado) return;
          if (error) return console.error('[hidratacaoJogador] busca de midia_estado falhou', error);
          if (data) useStore.setState((s) => ({ midia: { ...s.midia, ...paraEstadoMidia(data as LinhaMidiaEstado) }, ambiencia: normalizarAmbiencia((data as LinhaMidiaEstado).ambiencia) }));
        });
    void refetchEstado();

    const canalFaixas = cliente
      .channel('jogador-midia-faixas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'midia_faixas' }, (payload) => {
        const s = useStore.getState();
        if (payload.eventType === 'DELETE') {
          const idRemovido = (payload.old as { id: string }).id;
          useStore.setState({ midia: { ...s.midia, faixas: s.midia.faixas.filter((f) => f.id !== idRemovido) } });
        } else {
          const faixa = paraFaixa(payload.new as LinhaFaixa);
          const existe = s.midia.faixas.some((f) => f.id === faixa.id);
          const faixas = existe
            ? s.midia.faixas.map((f) => (f.id === faixa.id ? faixa : f))
            : [...s.midia.faixas, faixa];
          useStore.setState({ midia: { ...s.midia, faixas } });
        }
      })
      .subscribe(assinarStatusCanalComRefetch('jogador-midia-faixas', refetchFaixas));

    const canalEstado = cliente
      .channel('jogador-midia-estado')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'midia_estado' }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const patch = paraEstadoMidia(payload.new as LinhaMidiaEstado);
        useStore.setState((s) => ({ midia: { ...s.midia, ...patch }, ambiencia: normalizarAmbiencia((payload.new as LinhaMidiaEstado).ambiencia) }));
      })
      .subscribe(assinarStatusCanalComRefetch('jogador-midia-estado', refetchEstado));

    return () => {
      cancelado = true;
      desconectarCanal('jogador-midia-faixas');
      desconectarCanal('jogador-midia-estado');
      cliente.removeChannel(canalFaixas);
      cliente.removeChannel(canalEstado);
    };
  }, []);
}

export function useFichasPublicas(): FichaPublica[] {
  const [fichas, setFichas] = useState<FichaPublica[]>([]);

  useEffect(() => {
    const cliente = supabase;
    if (!cliente) return;

    let cancelado = false;

    // busca inicial E refetch de reconexão — substituição total (mesmo padrão de
    // `tokensSync.ts`): read-only, sem push local pra proteger, então não precisa de merge
    // fino, só refazer a busca de novo. Mesmo motivo de `useHidratarSessaoPublica`.
    const refetch = () =>
      cliente
        .from('characters_publico')
        .select('*')
        .then(({ data, error }) => {
          if (cancelado) return;
          if (error) console.error('[hidratacaoJogador] busca de characters_publico falhou', error);
          else if (data) setFichas((data as LinhaFichaPublico[]).map(paraFichaPublica));
        });
    void refetch();

    const canal = cliente
      .channel('jogador-fichas-publico')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters_publico' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const idRemovido = (payload.old as { id: string }).id;
          setFichas((atual) => atual.filter((f) => f.id !== idRemovido));
        } else {
          const ficha = paraFichaPublica(payload.new as LinhaFichaPublico);
          setFichas((atual) => (atual.some((f) => f.id === ficha.id) ? atual.map((f) => (f.id === ficha.id ? ficha : f)) : [...atual, ficha]));
        }
      })
      .subscribe(assinarStatusCanalComRefetch('jogador-fichas-publico', refetch));

    return () => {
      cancelado = true;
      desconectarCanal('jogador-fichas-publico');
      cliente.removeChannel(canal);
    };
  }, []);

  return fichas;
}

export function useNpcsPublicos(): NpcPublico[] {
  const [npcs, setNpcs] = useState<NpcPublico[]>([]);

  useEffect(() => {
    const cliente = supabase;
    if (!cliente) return;

    let cancelado = false;
    let buscando = false;
    let buscarNovamente = false;

    // busca inicial E refetch de reconexão — mesmo motivo de `useHidratarSessaoPublica`. RLS
    // da migração 0003 já filtra visivel = true pro jogador — o que chega aqui é exatamente o
    // que ele pode ver, sem filtro extra no client.
    const refetch = () => {
      if (buscando) {
        buscarNovamente = true;
        return Promise.resolve();
      }
      buscando = true;
      return cliente
        .from('npcs_publico')
        .select('*')
        .then(({ data, error }) => {
          if (cancelado) return;
          buscando = false;
          if (buscarNovamente) {
            buscarNovamente = false;
            void refetch();
            return;
          }
          if (error) console.error('[hidratacaoJogador] busca de npcs_publico falhou', error);
          else if (data) setNpcs((data as LinhaNpcPublico[]).map(paraNpcPublico));
        });
    };
    void refetch();
    const pararVisibilidade = observarVisibilidadeNpcs(refetch);

    const canal = cliente
      .channel('jogador-npcs-publico')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'npcs_publico' }, (payload) => {
        if (cancelado) return;
        // Um UPDATE de outro NPC pode chegar enquanto o snapshot que vai remover um NPC
        // ocultado está em voo. Renova a busca em vez de descartar e perder a invalidação.
        if (buscando) void refetch();
        if (payload.eventType === 'DELETE') {
          const idRemovido = (payload.old as { id: string }).id;
          setNpcs((atual) => atual.filter((n) => n.id !== idRemovido));
        } else {
          const npc = paraNpcPublico(payload.new as LinhaNpcPublico);
          setNpcs((atual) => (atual.some((n) => n.id === npc.id) ? atual.map((n) => (n.id === npc.id ? npc : n)) : [...atual, npc]));
        }
      })
      .subscribe(assinarStatusCanalComRefetch('jogador-npcs-publico', refetch));

    return () => {
      cancelado = true;
      pararVisibilidade();
      desconectarCanal('jogador-npcs-publico');
      cliente.removeChannel(canal);
    };
  }, []);

  return npcs;
}

export function useIniciativaPublica(): EntradaIniciativa[] {
  const [iniciativa, setIniciativa] = useState<EntradaIniciativa[]>([]);

  useEffect(() => {
    const cliente = supabase;
    if (!cliente) return;

    let cancelado = false;
    let buscando = false;
    let buscarNovamente = false;
    // Ordem importa (quem joga antes de quem) — `EntradaIniciativa` não guarda `posicao`
    // (a ordem do array É a posição), então mantém a última `posicao` conhecida por id pra
    // reordenar sem precisar reconsultar a tabela inteira a cada evento (mesmo padrão de
    // `iniciativaSync.ts`, lado GM, só que sem o lado de escrita).
    const posicoesConhecidas = new Map<string, number>();
    const ordenarPorPosicao = (entradas: EntradaIniciativa[]): EntradaIniciativa[] =>
      [...entradas].sort((a, b) => (posicoesConhecidas.get(a.id) ?? 0) - (posicoesConhecidas.get(b.id) ?? 0));

    // busca inicial E refetch de reconexão — a ordem de turno é exatamente o caso que motivou
    // esta auditoria (mesmo motivo de `useHidratarSessaoPublica`): sem isso, um jogador que
    // reconecta no meio do combate fica com o turno parado até um reload manual.
    const refetch = () => {
      if (buscando) {
        buscarNovamente = true;
        return Promise.resolve();
      }
      buscando = true;
      return cliente
        .from('iniciativa')
        .select('*')
        .order('posicao', { ascending: true })
        .then(({ data, error }) => {
          if (cancelado) return;
          buscando = false;
          if (buscarNovamente) {
            buscarNovamente = false;
            void refetch();
            return;
          }
          if (error) return console.error('[hidratacaoJogador] busca de iniciativa falhou', error);
          if (!data) return;
          const linhas = data as LinhaIniciativa[];
          for (const linha of linhas) posicoesConhecidas.set(linha.id, linha.posicao);
          setIniciativa(linhas.map(paraEntrada));
        });
    };
    void refetch();
    const pararVisibilidade = observarVisibilidadeNpcs(refetch);

    const canal = cliente
      .channel('jogador-iniciativa')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iniciativa' }, (payload) => {
        if (cancelado) return;
        if (buscando) void refetch();
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (!id) return;
          posicoesConhecidas.delete(id);
          setIniciativa((atual) => atual.filter((e) => e.id !== id));
        } else {
          const linha = payload.new as LinhaIniciativa;
          posicoesConhecidas.set(linha.id, linha.posicao);
          const entrada = paraEntrada(linha);
          setIniciativa((atual) => {
            const existe = atual.some((e) => e.id === entrada.id);
            const atualizada = existe ? atual.map((e) => (e.id === entrada.id ? entrada : e)) : [...atual, entrada];
            return ordenarPorPosicao(atualizada);
          });
        }
      })
      .subscribe(assinarStatusCanalComRefetch('jogador-iniciativa', refetch));

    return () => {
      cancelado = true;
      pararVisibilidade();
      desconectarCanal('jogador-iniciativa');
      cliente.removeChannel(canal);
    };
  }, []);

  return iniciativa;
}
