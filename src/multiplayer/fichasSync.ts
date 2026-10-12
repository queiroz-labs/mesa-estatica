import type { BasePV } from '../rules/data/dificuldades';
import { calcularDefesa, calcularPvMaximo } from '../rules/derivados';
import { calcularEstadoTokenCombate } from '../rules/combate';
import type { Ficha } from '../state/types';
import { supabase } from '../lib/supabaseClient';
import { assinarStatusCanalComRefetch, desconectarCanal } from '../lib/statusMesa';
import { useStore } from '../state/store';
import { criarDebouncePorChave } from './debounce';
import { dividirFicha, montarFicha, type FichaPrivadaDados, type FichaPublica } from './fichaSplit';
import { executarComRetentativa, marcarEmVoo, resolverPendencia, retomarPendenciasPersistidas } from './filaPendencias';
import { ehDataUrl } from './imagemPendente';
import { inserirOuAtualizarNaCorrida } from './insercaoConcorrente';
import { mesclar3Vias } from './merge3Vias';
import { eraRemocaoExplicita } from './remocaoExplicita';

const PREFIXO_DELETE = 'delete:';

/** Dado uma chave pendente (id de ficha, ou `delete:${id}`) e as fichas locais atuais, decide
 *  o que reenviar — mesmo padrão de `resolverReplayToken` em `tokensSync.ts`. */
export function resolverReplayFicha(chave: string, fichas: Ficha[]): Ficha | 'apagar' | null {
  if (chave.startsWith(PREFIXO_DELETE)) return 'apagar';
  return fichas.find((f) => f.id === chave) ?? null;
}

const ATRASO_PUSH_MS = 500;

type Cliente = NonNullable<typeof supabase>;

export interface LinhaPublico {
  id: string;
  nome: string;
  cor_visual: string;
  foto: string | null;
  pv_atual: number;
  pv_maximo: number;
  defesa: number;
  surtos_ativos: Ficha['surtosAtivos'];
}

interface LinhaPrivado {
  id: string;
  owner_token: string;
  auth_uid: string | null;
  dados: FichaPrivadaDados;
}

/** Shape do `select('dados')` em `characters_privado` — `buscarEMontar`/`buscarTodas` só leem
 *  essa coluna (owner_token/auth_uid são exclusivos da Edge Function vincular-jogador, via
 *  service_role, fora do RLS do client); pedir só o que se usa evita rebuscar o JSON da ficha
 *  inteira mais dois UUIDs que nunca são lidos aqui. */
type LinhaPrivadoDados = Pick<LinhaPrivado, 'dados'>;

export const paraLinhaPublico = (ficha: Ficha, basePV: BasePV): LinhaPublico => ({
  id: ficha.id,
  nome: ficha.nome,
  cor_visual: ficha.corVisual,
  foto: ficha.foto ?? null,
  pv_atual: ficha.pvAtual,
  pv_maximo: calcularPvMaximo(basePV, ficha.atributos.vigor),
  defesa: calcularDefesa(ficha.atributos.agilidade, ficha.equipamentoModificadorDefesa),
  surtos_ativos: ficha.surtosAtivos,
});

export const paraFichaPublica = (r: LinhaPublico): FichaPublica => ({
  id: r.id,
  nome: r.nome,
  corVisual: r.cor_visual,
  foto: r.foto ?? null,
  estadoCombate: calcularEstadoTokenCombate(r.pv_atual, r.pv_maximo, []),
});

async function buscarEMontar(cliente: Cliente, id: string): Promise<Ficha | null> {
  const [{ data: publico }, { data: privado }] = await Promise.all([
    cliente.from('characters_publico').select('*').eq('id', id).maybeSingle(),
    cliente.from('characters_privado').select('dados').eq('id', id).maybeSingle(),
  ]);
  if (!publico || !privado) return null;
  const linhaPublico = publico as LinhaPublico;
  const dadosPrivados = (privado as LinhaPrivadoDados).dados;
  // Backward-compatibilidade: dados antigos (antes da mudança no FichaPrivadaDados que
  // passou a incluir pvAtual/surtosAtivos em characters_privado.dados) não têm esses
  // campos no JSON de dados — eles só existiam em characters_publico. Para não quebrar,
  // mescla os valores da linha pública por cima; para dados novos o valor é o mesmo,
  // então o override é inócuo.
  return montarFicha(paraFichaPublica(linhaPublico), {
    ...dadosPrivados,
    pvAtual: linhaPublico.pv_atual,
    surtosAtivos: linhaPublico.surtos_ativos,
  });
}

/** Busca inicial (ver comentário em `iniciarSyncFichas`) — só monta fichas que existirem nas
 *  duas tabelas (mesmo critério de `buscarEMontar`); a RLS de `characters_privado` já decide
 *  quantas linhas voltam (dono só a própria, GM todas). */
/** `null` = a query falhou de verdade (não dá pra confiar no resultado); `[]` = consultou
 *  certinho e a mesa está genuinamente vazia (ex.: acabou de rodar `reset-mesa`) — só o
 *  chamador sabe se essa distinção importa (busca inicial trata os dois igual; refetch de
 *  reconexão não pode, ver comentário em `refetchFichas` abaixo). */
async function buscarTodas(cliente: Cliente): Promise<Ficha[] | null> {
  const [{ data: publicos }, { data: privados }] = await Promise.all([
    cliente.from('characters_publico').select('*'),
    cliente.from('characters_privado').select('id, dados'),
  ]);
  if (!publicos || !privados) return null;
  const privadosPorId = new Map((privados as (LinhaPrivadoDados & { id: string })[]).map((p) => [p.id, p]));
  const fichas: Ficha[] = [];
  for (const publico of publicos as LinhaPublico[]) {
    const privado = privadosPorId.get(publico.id);
    if (privado) {
      // Mesma backward-compatibilidade de buscarEMontar — dados antigos em
      // characters_privado.dados não têm pvAtual/surtosAtivos; busca da linha pública.
      fichas.push(
        montarFicha(paraFichaPublica(publico), {
          ...privado.dados,
          pvAtual: publico.pv_atual,
          surtosAtivos: publico.surtos_ativos,
        }),
      );
    }
  }
  return fichas;
}

/** Tentativas de CAS antes de desistir da trava e gravar sem ela (ver comentário em
 *  `empurrarFicha`) — uma corrida tão persistente a ponto de esgotar isso é extremamente
 *  improvável (cada volta é só um select+update); o limite existe só pra nunca travar a
 *  edição do usuário indefinidamente num caso patológico. */
const MAX_TENTATIVAS_CAS = 5;

/**
 * Cria a linha nova (com owner_token fresco, só GM pode) ou atualiza uma existente.
 * Nunca escreve owner_token/auth_uid numa linha já existente — isso é exclusivo
 * da Edge Function vincular-jogador.
 *
 * Update: faz merge de 3 vias (`merge3Vias.ts`) contra o remoto recém-buscado antes de
 * escrever — achado ao vivo em 28/08: sem isso, um push escrevia `dados`/a linha pública
 * INTEIROS a cada edição; dois editores concorrentes na MESMA ficha (mestre ajustando PV
 * em "status do grupo" enquanto o jogador editava armas, ou duas abas do mestre) faziam
 * quem "perdesse a corrida" apagar o campo que o outro tinha acabado de confirmar no
 * servidor — mesmo sem nenhuma queda de canal envolvida. `baselines` (mapa em
 * `iniciarSyncFichas`) guarda a última vez que este cliente sabia que local e remoto
 * coincidiam; sem baseline pra essa ficha ainda (primeiro push desta sessão, ex.: replay
 * de pendência persistida) não tem como saber o que mudou — usa o local inteiro, mesmo
 * comportamento de antes deste fix.
 *
 * `characters_privado.dados` (armas/perícias/atributos/etc.) ganha, além do merge, uma
 * trava de CAS (`.eq('dados', ...)` comparando com o valor exato que acabamos de ler) — o
 * merge sozinho ainda perdia pra uma corrida bem apertada (duas edições na mesma ficha a
 * menos de ~1s uma da outra, confirmado ao vivo: mesmo com o merge, o segundo push podia
 * commitar DEPOIS do primeiro usando um `dados` já obsoleto no momento de escrever). Se o
 * servidor mudou entre o fetch e a escrita, `.eq()` não casa nenhuma linha — refaz o merge
 * contra o dado mais fresco e tenta de novo, em vez de arriscar um last-write-wins cego.
 * PostgREST só aceita esse filtro em jsonb como STRING (`JSON.stringify`), não como objeto
 * — confirmado ao vivo contra o Supabase de dev (objeto solto dá erro 22P02 do Postgres).
 */
async function empurrarFicha(cliente: Cliente, ficha: Ficha, baselines: Map<string, Ficha>) {
  const basePV = useStore.getState().config.basePV;
  const linhaPublicoLocal = paraLinhaPublico(ficha, basePV);
  const { privado: privadoLocal } = dividirFicha(ficha);
  // `foto` ainda em base64 (upload pro Storage em voo) nunca vai pro Postgres/Realtime — ver
  // imagemPendente.ts. Insert usa null (troca pela URL real no próximo push); update OMITE a
  // coluna pra não apagar a URL que já estava lá.
  const fotoPendente = ehDataUrl(linhaPublicoLocal.foto);

  const [{ data: existentePrivado }, { data: existentePublico }] = await Promise.all([
    cliente.from('characters_privado').select('dados').eq('id', ficha.id).maybeSingle(),
    cliente.from('characters_publico').select('*').eq('id', ficha.id).maybeSingle(),
  ]);

  if (!existentePrivado) {
    const ownerToken = crypto.randomUUID();
    // 23505 (chave duplicada) aqui = outro push pra esse mesmo id novo venceu a corrida entre o
    // SELECT acima e este INSERT — cai pra UPDATE em vez de propagar erro (`insercaoConcorrente.ts`).
    // Nunca reescreve owner_token nesse fallback: a linha que já existe já tem o token certo.
    await inserirOuAtualizarNaCorrida(
      () => cliente.from('characters_privado').insert({ id: ficha.id, owner_token: ownerToken, dados: privadoLocal }),
      () => cliente.from('characters_privado').update({ dados: privadoLocal }).eq('id', ficha.id),
    );
    await inserirOuAtualizarNaCorrida(
      () => cliente.from('characters_publico').insert(fotoPendente ? { ...linhaPublicoLocal, foto: null } : linhaPublicoLocal),
      () =>
        cliente
          .from('characters_publico')
          .update(fotoPendente ? { ...linhaPublicoLocal, foto: undefined } : linhaPublicoLocal)
          .eq('id', ficha.id),
    );
    baselines.set(ficha.id, ficha);
    return;
  }

  const baseline = baselines.get(ficha.id);
  let remotoPrivado = (existentePrivado as LinhaPrivadoDados).dados;
  let dadosPrivado = baseline ? mesclar3Vias(dividirFicha(baseline).privado, privadoLocal, remotoPrivado) : privadoLocal;

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS_CAS; tentativa++) {
    const ultimaTentativa = tentativa === MAX_TENTATIVAS_CAS - 1;
    const query = cliente.from('characters_privado').update({ dados: dadosPrivado }).eq('id', ficha.id);
    const { data: gravou, error: erroPrivado } = await (ultimaTentativa
      ? query
      : query.eq('dados', JSON.stringify(remotoPrivado))
    ).select('id');
    if (erroPrivado) throw erroPrivado;
    if (ultimaTentativa || (gravou && gravou.length > 0)) break;

    const { data: fresco } = await cliente.from('characters_privado').select('dados').eq('id', ficha.id).maybeSingle();
    if (!fresco) return; // linha sumiu (apagada por outra aba enquanto isso) — nada a fazer
    remotoPrivado = (fresco as LinhaPrivadoDados).dados;
    dadosPrivado = baseline ? mesclar3Vias(dividirFicha(baseline).privado, privadoLocal, remotoPrivado) : privadoLocal;
  }

  const linhaPublico =
    baseline && existentePublico
      ? mesclar3Vias(paraLinhaPublico(baseline, basePV), linhaPublicoLocal, existentePublico as LinhaPublico)
      : linhaPublicoLocal;
  const patchPublico = fotoPendente ? { ...linhaPublico, foto: undefined } : linhaPublico;
  const { error: erroPublico } = await cliente.from('characters_publico').update(patchPublico).eq('id', ficha.id);
  if (erroPublico) throw erroPublico;

  // baseline vira o que ACABAMOS de escrever — pv_atual/surtos_ativos duplicados em
  // characters_publico sobrepõem a cópia em `dadosPrivado` (mesmo critério de `buscarEMontar`),
  // pra não deixar as duas cópias divergirem dentro do baseline.
  baselines.set(
    ficha.id,
    montarFicha(paraFichaPublica(linhaPublico), {
      ...dadosPrivado,
      pvAtual: linhaPublico.pv_atual,
      surtosAtivos: linhaPublico.surtos_ativos,
    }),
  );
}

/**
 * Fase B (mesa-estatica-multiplayer-completo.md §11, Parte IV §3): sincroniza fichas
 * via characters_publico/characters_privado. Zustand continua a fonte local/otimista.
 *
 * Escopo desta etapa: roda no cliente do GM (que enxerga tudo via is_gm()) — a
 * restrição real de "jogador só a própria" já existe no RLS e foi validada
 * diretamente contra o banco; o cliente do jogador propriamente dito (bundle
 * separado, sem código de mestre) é a Parte IV, ainda não implementada.
 *
 * Busca inicial na primeira assinatura (mesmo motivo do fix em `tokensSync.ts`): sem isso,
 * uma sessão sem `localStorage` prévio pra essa origem (máquina nova, ou — caso real que
 * expôs isso — o domínio do GitHub Pages mudando de dono, que troca a origem e zera o
 * `localStorage` do navegador) mostra a lista de fichas vazia mesmo com fichas já existindo
 * no Supabase. Só adiciona o que falta local (união por id) — nunca sobrescreve uma ficha já
 * carregada, pra não perder uma edição em voo entre o boot e essa resposta.
 *
 * Push debounçado por ficha (`ATRASO_PUSH_MS`, ver `agendarPush` abaixo) — incomodou na
 * prática (lag ao digitar, visto ao vivo em 24/07) e foi corrigido.
 */
export function iniciarSyncFichas(): () => void {
  const cliente = supabase;
  if (!cliente) return () => {};

  // Contador, não boolean: characters_publico e characters_privado disparam DOIS eventos
  // Realtime separados pra um único push local (empurrarFicha escreve nas duas tabelas em
  // sequência), cada um com seu próprio `aplicarRemoto` assíncrono. Com um boolean simples,
  // o primeiro a terminar (finally) zera a flag ENQUANTO o segundo ainda está em voo — o
  // setState do segundo passa pelo guard como se fosse edição local de verdade e reempurra
  // pro servidor, que ecoa de novo, que reempurra nulo... loop exponencial (visto ao vivo:
  // uma escolha de Surto virou milhares de requests em menos de um minuto). Contador só
  // libera quando TODAS as aplicações remotas em voo terminarem.
  let aplicandoRemotoContagem = 0;
  let fichasAnteriores = useStore.getState().fichas;
  const pendencias = new Set<string>();
  // última vez que este cliente sabia que local e remoto coincidiam pra cada ficha — base do
  // merge de 3 vias em `empurrarFicha` (ver `merge3Vias.ts`).
  const baselines = new Map<string, Ficha>();
  // Incrementada SÓ pelo subscriber local abaixo, quando detecta uma edição de VERDADE — usada
  // por `aplicarRemoto` pra saber se uma edição local aconteceu durante o fetch. Achado ao vivo
  // em 28/08: comparar a REFERÊNCIA da ficha (`fichaLocalAgora !== fichaLocalAntes`) direto,
  // como era antes, confundia "edição local" com "o canal IRMÃO já aplicou o remoto" —
  // characters_privado e characters_publico disparam DOIS eventos Realtime separados pra um
  // ÚNICO push (`empurrarFicha` escreve nas duas tabelas), cada um com seu próprio
  // `aplicarRemoto`; se o primeiro terminasse e trocasse a referência antes do segundo
  // comparar, o segundo achava que tinha perdido uma edição local e reempurrava — o que gerava
  // outro par de eventos, que reempurrava de novo... loop exponencial (mesma assinatura do
  // incidente de Surto no comentário de `aplicandoRemotoContagem` acima, só que sem precisar de
  // dois editores: qualquer push sozinho já dispara os dois eventos quase juntos). Geração é
  // imune a isso porque só o subscriber (edição de verdade) a incrementa.
  const geracaoLocal = new Map<string, number>();

  // `characters_publico`/`characters_privado` disparam DOIS eventos Realtime pra um único
  // push, e cada um chama `aplicarRemoto` independente — sem isso, cada par de eventos batia
  // DOIS `buscarEMontar` (4 selects, incluindo o JSON inteiro de `dados` duas vezes) pro MESMO
  // id, achado revisando o egress do PostgREST (28/08: 70% do tráfego do dia). Uma promise em
  // voo por id, compartilhada entre os dois chamadores — cada um ainda faz sua PRÓPRIA checagem
  // de geração/pendência (ver `aplicarRemoto`), só a chamada de rede em si é uma só.
  const buscasEmVoo = new Map<string, Promise<Ficha | null>>();
  const buscarEMontarCompartilhado = (id: string): Promise<Ficha | null> => {
    const emVoo = buscasEmVoo.get(id);
    if (emVoo) return emVoo;
    const promessa = buscarEMontar(cliente, id).finally(() => {
      if (buscasEmVoo.get(id) === promessa) buscasEmVoo.delete(id);
    });
    buscasEmVoo.set(id, promessa);
    return promessa;
  };

  const agendarPush = criarDebouncePorChave<Ficha>(ATRASO_PUSH_MS, (_id, ficha) => {
    pendencias.delete(_id);
    executarComRetentativa('fichas-sync', ficha.id, () =>
      empurrarFicha(cliente, useStore.getState().fichas.find((f) => f.id === ficha.id) ?? ficha, baselines).then(() => ({
        error: null,
      })),
    );
  });

  const unsubscribeLocal = useStore.subscribe((state, prevState) => {
    if (aplicandoRemotoContagem > 0 || state.fichas === prevState.fichas) return;

    const idsAnteriores = new Set(fichasAnteriores.map((f) => f.id));
    const idsAtuais = new Set(state.fichas.map((f) => f.id));

    for (const ficha of state.fichas) {
      const anterior = fichasAnteriores.find((f) => f.id === ficha.id);
      if (anterior !== ficha) {
          pendencias.add(ficha.id);
          geracaoLocal.set(ficha.id, (geracaoLocal.get(ficha.id) ?? 0) + 1);
          // marca ANTES de agendar — sem isso, a janela do próprio debounce (ATRASO_PUSH_MS)
          // fica sem rede de segurança nenhuma: um fechamento de aba nesse meio-tempo perde a
          // edição sem deixar rastro (mesmo achado de 23/08 que motivou `marcarEmVoo`).
          marcarEmVoo('fichas-sync', ficha.id);
          agendarPush(ficha.id, ficha);
        }
    }
    for (const idAntigo of idsAnteriores) {
      // só apaga no servidor se o botão "remover" marcou esse id de propósito — ver
      // remocaoExplicita.ts. Sumir da lista local por qualquer outro motivo (aba
      // desatualizada, etc.) nunca deve virar DELETE pra todo mundo.
      if (!idsAtuais.has(idAntigo) && eraRemocaoExplicita(idAntigo)) {
        executarComRetentativa('fichas-sync', `${PREFIXO_DELETE}${idAntigo}`, () =>
          Promise.all([
            cliente.from('characters_publico').delete().eq('id', idAntigo),
            cliente.from('characters_privado').delete().eq('id', idAntigo),
          ]).then(([rPublico, rPrivado]) => ({ error: rPublico.error ?? rPrivado.error ?? null })),
        );
      }
    }
    fichasAnteriores = state.fichas;
  });

  // reenvia o que ficou pendente de uma sessão anterior — relê a store ATUAL.
  for (const chave of retomarPendenciasPersistidas('fichas-sync')) {
    const replay = resolverReplayFicha(chave, useStore.getState().fichas);
    if (replay === 'apagar') {
      const id = chave.slice(PREFIXO_DELETE.length);
      executarComRetentativa('fichas-sync', chave, () =>
        Promise.all([
          cliente.from('characters_publico').delete().eq('id', id),
          cliente.from('characters_privado').delete().eq('id', id),
        ]).then(([rPublico, rPrivado]) => ({ error: rPublico.error ?? rPrivado.error ?? null })),
      );
    } else if (replay) {
      executarComRetentativa('fichas-sync', chave, () => empurrarFicha(cliente, replay, baselines).then(() => ({ error: null })));
    } else {
      resolverPendencia('fichas-sync', chave);
    }
  }

  const aplicarRemoto = async (id: string) => {
    // Snapshot ANTES do fetch — se uma edição local de VERDADE acontecer enquanto
    // `buscarEMontar` está em voo (rede fora não é instantânea), `geracaoLocal` muda (só o
    // subscriber local, mais abaixo, incrementa) e a gente reagenda o push em vez de deixar o
    // `fichaRemota` (buscado ANTES dessa edição existir) apagá-la. Comparar a REFERÊNCIA da
    // ficha aqui (como era antes) tinha um bug: `characters_privado`/`characters_publico`
    // disparam DOIS eventos Realtime pra um ÚNICO push, cada um com seu próprio
    // `aplicarRemoto` — se o primeiro terminasse e trocasse a referência antes do segundo
    // comparar, o segundo achava (errado) que uma edição local tinha acontecido e reempurrava,
    // o que gerava outro par de eventos e reempurrava de novo — loop exponencial, reproduzido
    // ao vivo em 28/08. `geracaoLocal` não sofre disso: só o subscriber a incrementa, nunca
    // este método.
    const geracaoAntes = geracaoLocal.get(id) ?? 0;
    const fichaRemota = await buscarEMontarCompartilhado(id);
    const geracaoDepois = geracaoLocal.get(id) ?? 0;

    if (geracaoDepois !== geracaoAntes || pendencias.has(id)) {
      // Edição local aconteceu durante o fetch — ela vence (mantém o que está na tela) e
      // agenda o push que o guard engoliu; ficha ausente localmente = o mestre removeu a
      // ficha nesse meio-tempo, então nem re-adiciona `fichaRemota` (evitaria ressuscitar uma
      // ficha recém-apagada).
      const fichaLocalAgora = useStore.getState().fichas.find((f) => f.id === id);
      if (fichaLocalAgora) {
        marcarEmVoo('fichas-sync', id);
        agendarPush(id, fichaLocalAgora);
      }
      return;
    }

    if (!fichaRemota) return;
    baselines.set(id, fichaRemota);
    // `aplicandoRemotoContagem` só sobe/desce em torno do `setState` SÍNCRONO, não do fetch
    // inteiro acima — achado ao vivo em 28/08: com a janela cobrindo o fetch (como era antes),
    // uma edição local de VERDADE em QUALQUER ficha, feita enquanto QUALQUER `aplicarRemoto`
    // (mesmo de outra ficha) ainda estivesse buscando dado, passava pelo guard do subscriber
    // (`aplicandoRemotoContagem > 0`, mais abaixo) como se fosse eco remoto — a edição ficava
    // só na tela, nunca era empurrada pro servidor, e sumia sem aviso na próxima vez que
    // QUALQUER remoto sobrescrevesse aquela ficha (o subscriber nunca reprocessa uma edição que
    // pulou uma vez). Estreitar a janela pro instante síncrono do `setState` resolve isso sem
    // reabrir o loop exponencial que o contador original evitava (comentário logo acima) —
    // chamadas concorrentes de `aplicarRemoto` não compartilham mais janela nenhuma; cada uma
    // só levanta o contador no instante do seu próprio `setState`, que o Zustand notifica de
    // forma síncrona antes de continuar.
    aplicandoRemotoContagem++;
    try {
      const s = useStore.getState();
      const existe = s.fichas.some((f) => f.id === id);
      const fichas = existe ? s.fichas.map((f) => (f.id === id ? fichaRemota : f)) : [...s.fichas, fichaRemota];
      useStore.setState({ fichas });
    } finally {
      fichasAnteriores = useStore.getState().fichas;
      aplicandoRemotoContagem--;
    }
  };

  const idDoPayload = (payload: { new: object; old: object }) =>
    (payload.new as { id?: string }).id ?? (payload.old as { id?: string }).id;

  // busca inicial — só adiciona o que falta (comentário da função `iniciarSyncFichas`).
  (async () => {
    const remotas = await buscarTodas(cliente);
    if (remotas === null) return;
    aplicandoRemotoContagem++;
    try {
      // baseline de TODAS as fichas remotas conhecidas no boot, mesmo as que já estavam
      // carregadas localmente (persist/localStorage) e por isso não entram em `faltando` — dá
      // ao primeiro push de cada ficha, depois do boot, uma base real pro merge de 3 vias em
      // vez de cair no fallback "sem baseline" (empurra o local inteiro, sem merge).
      for (const remota of remotas) baselines.set(remota.id, remota);
      const s = useStore.getState();
      const idsLocais = new Set(s.fichas.map((f) => f.id));
      const faltando = remotas.filter((f) => !idsLocais.has(f.id));
      if (faltando.length > 0) useStore.setState({ fichas: [...s.fichas, ...faltando] });
    } finally {
      fichasAnteriores = useStore.getState().fichas;
      aplicandoRemotoContagem--;
    }
  })();

  /**
   * Refetch de RECONEXÃO (canal caiu e voltou) — diferente da busca inicial acima: o Realtime
   * não reenvia os eventos perdidos durante a queda, então uma ficha já carregada localmente
   * (PV editado pelo mestre nesse meio-tempo, por exemplo) também precisa ser atualizada, não
   * só a que falta. `buscarTodas` devolvendo `null` (erro de query — não dá pra confiar) segue
   * abortando sem tocar em nada; `[]` genuíno (ex.: `reset-mesa` rodou enquanto este cliente
   * estava caído) PRECISA ser aplicado, senão quem reconecta bem nesse instante fica com a
   * mesa antiga na tela pra sempre, sem nenhum aviso de dessincronia (achado em 27/08 — antes
   * de separar `null`/`[]`, os dois caíam no mesmo early-return e o reset nunca chegava em quem
   * tinha acabado de reconectar). Edição local em voo (`pendencias`) sempre vence; ficha
   * ausente no lote remoto E sem push pendente é removida (foi apagada de verdade, por outra
   * aba, pelo próprio mestre ou pelo reset, enquanto este cliente estava desconectado).
   */
  const refetchFichas = async () => {
    const remotas = await buscarTodas(cliente);
    if (remotas === null) return;
    aplicandoRemotoContagem++;
    try {
      // baseline vira o remoto recém-buscado pra TODAS as fichas, mesmo as preservadas por
      // `pendencias` abaixo (ver `empurrarFicha`) — o próximo push dessa ficha precisa comparar
      // contra o QUE O SERVIDOR TEM AGORA, não contra um baseline antigo, senão o merge de 3
      // vias pensaria que campos que outro editor mudou nesse meio-tempo ainda batem com o que
      // este cliente já sabia, e os pisaria de volta com o valor local antigo.
      for (const remota of remotas) baselines.set(remota.id, remota);
      const s = useStore.getState();
      const remotasPorId = new Map(remotas.map((f) => [f.id, f]));
      const fichas: Ficha[] = [];
      for (const local of s.fichas) {
        if (pendencias.has(local.id)) {
          fichas.push(local);
          continue;
        }
        const remota = remotasPorId.get(local.id);
        if (remota) fichas.push(remota);
      }
      for (const remota of remotas) {
        if (!s.fichas.some((f) => f.id === remota.id)) fichas.push(remota);
      }
      useStore.setState({ fichas });
    } finally {
      fichasAnteriores = useStore.getState().fichas;
      aplicandoRemotoContagem--;
    }
  };

  const canalPublico = cliente
    .channel('fichas-publico-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'characters_publico' }, (payload) => {
      const id = idDoPayload(payload);
      if (id) void aplicarRemoto(id);
    })
    .subscribe(assinarStatusCanalComRefetch('fichas-publico-sync', refetchFichas));

  const canalPrivado = cliente
    .channel('fichas-privado-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'characters_privado' }, (payload) => {
      const id = idDoPayload(payload);
      if (id) void aplicarRemoto(id);
    })
    .subscribe(assinarStatusCanalComRefetch('fichas-privado-sync', refetchFichas));

  return () => {
    unsubscribeLocal();
    desconectarCanal('fichas-publico-sync');
    desconectarCanal('fichas-privado-sync');
    cliente.removeChannel(canalPublico);
    cliente.removeChannel(canalPrivado);
  };
}
