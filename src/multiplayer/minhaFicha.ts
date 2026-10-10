import { useEffect, useState } from 'react';
import { BASES_PV, type BasePV } from '../rules/data/dificuldades';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../state/store';
import { iniciarAuthMultiplayer } from './auth';
import { montarFicha, type FichaPrivadaDados } from './fichaSplit';
import { iniciarSyncFichas, paraFichaPublica, type LinhaPublico } from './fichasSync';

interface LinhaPrivado {
  id: string;
  dados: FichaPrivadaDados;
}

/**
 * Bootstrap da "minha ficha" no `PlayerApp` (mesa-estatica-multiplayer-completo.md Parte IV
 * §4, Fase 5 do plano §6.5). `characters_privado` filtrado por `auth_uid = <meu auth.uid()>`
 * — nunca precisa saber o próprio `character_id` de antemão.
 *
 * **Bug real, achado em 24/07** (reproduzido direto contra o banco): a policy de select de
 * `characters_privado` é `auth_uid = auth.uid() OR is_gm()` — pra uma sessão vinculada como
 * mestre (a nova tela `VinculoMestre` tornou isso trivial e persistente), um `select` SEM
 * filtro devolve TODAS as fichas, não só a própria. Com 2+ fichas no banco, `.maybeSingle()`
 * lança `PGRST116` ("Cannot coerce the result to a single JSON object") em vez de devolver
 * `null` — o jogador via "link inválido ou ficha ainda não vinculada" com um link
 * perfeitamente válido, só porque o navegador também tava vinculado como mestre. O filtro
 * explícito por `auth_uid` deixa a query determinística nos dois casos.
 *
 * **Segundo bug real, achado em 25/07 (dia da sessão)**: `vincular-jogador` faz
 * `UPDATE ... SET auth_uid WHERE owner_token = X` — nunca limpa o `auth_uid` de nenhuma
 * OUTRA linha. Se o mesmo navegador/identidade anônima já vinculou a uma ficha antes (ex.:
 * o próprio mestre testando o link, ou o jogador clicando em mais de um link de teste) e
 * depois vincula a uma ficha diferente, DUAS linhas de `characters_privado` acabam com o
 * mesmo `auth_uid` — o filtro por `auth_uid` vira ambíguo e `.maybeSingle()` lança
 * `PGRST116` de novo, mesmo com o link certo. `owner_token` tem `unique` no banco
 * (`0002_fase_b_fichas.sql`), então filtrar por ele (quando a URL trouxer `?t=`) é
 * deterministico independente de quantas fichas aquele `auth_uid` acabou vinculado — cai
 * pro filtro por `auth_uid` só quando não há `?t=` na URL (revisita sem o link, sessão já
 * vinculada antes).
 *
 * Depois do bootstrap, popula o `useStore` compartilhado com essa ÚNICA ficha e liga
 * `iniciarSyncFichas` — o MESMO módulo que o `GmApp` usa. Não existe lógica "sou jogador,
 * então..." aqui: a RLS decide o que a escrita de fato alcança (só a própria linha), então
 * reusar o módulo do mestre sem modificação é seguro e evita duplicar o clamp de
 * PV/Sanidade, a lógica de Surto/Trauma etc. que já vive nas actions do store
 * (`atualizarFicha`, `ajustarPvAtual`, `ajustarSanidadeAtual` — ver `AtributosDerivadosSection`,
 * que chama essas actions direto, não via prop `onChange`).
 *
 * `basePV` é derivado do próprio `pv_maximo`/`vigor` já sincronizados
 * (`pvMaximo = basePV + 5*vigor`) em vez de sincronizar `config.basePV` numa tabela nova —
 * não há UI de mestre pra mudar esse valor depois da criação da ficha.
 */
export function useMinhaFicha(): { carregando: boolean; possuiFicha: boolean } {
  const [carregando, setCarregando] = useState(true);
  const [possuiFicha, setPossuiFicha] = useState(false);

  useEffect(() => {
    const cliente = supabase;
    if (!cliente) {
      setCarregando(false);
      return;
    }

    // `iniciarSyncFichas()` liga SÍNCRONO, antes de qualquer await — StrictMode roda
    // mount→cleanup→mount em dev, e cleanup1 dispara SÍNCRONO logo depois do mount1 (sem
    // esperar nenhuma promise). Chamar isso depois de um `await` deixava uma janela onde o
    // cleanup do primeiro mount já tinha rodado (com `pararSync` ainda no placeholder
    // no-op) antes do `iniciarSyncFichas()` da PRIMEIRA instância terminar de subir —
    // vazava uma assinatura órfã que nunca era parada. Sintoma real observado: duas
    // assinaturas empurrando a mesma ficha em paralelo — a órfã, com seu próprio
    // `aplicandoRemoto` nunca setado, reage ao eco Realtime da instância viva como se
    // fosse edição local e reempurra dados velhos (centenas de requests, sem parar).
    // Chamando aqui, síncrono, cleanup1 sempre alcança a instância certa: zero janela.
    const pararSync = iniciarSyncFichas();
    let cancelado = false;
    let buscando = false;
    let concluido = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const tentarNovamente = () => {
      if (cancelado) return;
      clearTimeout(retry);
      retry = setTimeout(() => { void carregar(); }, 5000);
    };

    const carregar = async () => {
      if (cancelado || buscando || concluido) return;
      buscando = true;
      clearTimeout(retry);
      try {
        const autenticado = await iniciarAuthMultiplayer();
        if (cancelado) return;
        if (!autenticado) { tentarNovamente(); return; }

        const { data: userData } = await cliente.auth.getUser();
        if (cancelado) return;
        if (!userData.user) { tentarNovamente(); return; }

        const ownerToken = new URLSearchParams(window.location.search).get('t');
        const consultaPrivado = cliente.from('characters_privado').select('id, dados');
        const { data: privado, error: erroPrivado } = ownerToken
          ? await consultaPrivado.eq('owner_token', ownerToken).maybeSingle()
          : await consultaPrivado.eq('auth_uid', userData.user.id).maybeSingle();
        if (cancelado) return;
        if (erroPrivado) { tentarNovamente(); return; }
        if (!privado) {
          setCarregando(false);
          return;
        }

        const { id, dados } = privado as LinhaPrivado;
        const { data: publico, error: erroPublico } = await cliente.from('characters_publico').select('*').eq('id', id).maybeSingle();
        if (cancelado) return;
        if (erroPublico || !publico) { tentarNovamente(); return; }

        const linhaPublico = publico as LinhaPublico;
        const basePVImplicito = linhaPublico.pv_maximo - 5 * dados.atributos.vigor;
        const basePV: BasePV = (BASES_PV as readonly number[]).includes(basePVImplicito)
          ? (basePVImplicito as BasePV)
          : 20;

        // Backward-compatibilidade com dados antigos em characters_privado.dados que não
        // têm pvAtual/surtosAtivos (antes da mudança em FichaPrivadaDados): mescla da
        // linha pública. Mesmo padrão de fichasSync.ts.
        const ficha = montarFicha(paraFichaPublica(linhaPublico), {
          ...dados,
          pvAtual: linhaPublico.pv_atual,
          surtosAtivos: linhaPublico.surtos_ativos,
        });
        useStore.setState((s) => ({
          fichas: [ficha],
          fichaAtivaId: ficha.id,
          config: { ...s.config, basePV },
        }));
        setPossuiFicha(true);
        concluido = true;
      } catch (erro) {
        console.error('[multiplayer] carregar ficha falhou', erro);
        tentarNovamente();
      } finally {
        buscando = false;
        if (!cancelado) setCarregando(false);
      }
    };
    const aoReconectar = () => { void carregar(); };
    window.addEventListener('online', aoReconectar);
    void carregar();

    return () => {
      cancelado = true;
      clearTimeout(retry);
      window.removeEventListener('online', aoReconectar);
      pararSync();
    };
  }, []);

  return { carregando, possuiFicha };
}
