import { useState } from 'react';
import { rolarDadoComForcados } from '../dice/registroForcados';
import { formatarLogRolagem } from '../dice/useDiceBox';
import { calcularEstadoTokenCombate, podeUsarPrimeirosSocorros, registrarUsoPrimeirosSocorros, resolverEstabilizar } from '../rules/combate';
import { calcularDefesa, calcularPvMaximo, estaFerido } from '../rules/derivados';
import { useCombateUiStore } from '../state/combateUiStore';
import { useStore } from '../state/store';

export interface PvCombatente {
  atual: number;
  maximo: number;
  aplicar: (delta: number) => void;
}

export interface DefesaCombatente {
  valor: number;
  ajustar: (delta: number) => void;
}

export function corPv(atual: number, maximo: number): string {
  if (atual <= maximo * 0.25) return 'var(--ruido)';
  if (atual <= maximo * 0.5) return 'var(--real)';
  return 'var(--rede)';
}

export function useIniciativa() {
  const iniciativa = useStore((s) => s.iniciativa);
  const modoCombate = useStore((s) => s.sessaoPublica.modoCombate);
  const turnoAtualId = useStore((s) => s.sessaoPublica.turnoAtualId);
  const rodada = useStore((s) => s.sessaoPublica.rodada);
  const contadorCena = useStore((s) => s.sessaoPublica.contadorCena);
  const condicoesCombate = useStore((s) => s.sessaoPublica.condicoesCombate);
  const condicaoDuracao = useStore((s) => s.sessaoPublica.condicaoDuracao);
  const definirDuracaoCondicao = useStore((s) => s.definirDuracaoCondicao);
  const fichas = useStore((s) => s.fichas);
  const npcs = useStore((s) => s.npcs);
  const basePV = useStore((s) => s.config.basePV);
  const selecionadosIniciativa = useStore((s) => s.sessaoPrivada.selecionadosIniciativa);
  const primeirosSocorrosCena = useStore((s) => s.sessaoPrivada.primeirosSocorrosCena) ?? {};
  const atualizarSessaoPrivada = useStore((s) => s.atualizarSessaoPrivada);
  const rolarIniciativaTodos = useStore((s) => s.rolarIniciativaTodos);
  const rolarIniciativa = useStore((s) => s.rolarIniciativa);
  const rolarIniciativaGrupo = useStore((s) => s.rolarIniciativaGrupo);
  const rerolarIniciativaDe = useStore((s) => s.rerolarIniciativaDe);
  const limparIniciativa = useStore((s) => s.limparIniciativa);
  const removerDaIniciativa = useStore((s) => s.removerDaIniciativa);
  const reordenarIniciativa = useStore((s) => s.reordenarIniciativa);
  const iniciarModoCombate = useStore((s) => s.iniciarModoCombate);
  const avancarTurno = useStore((s) => s.avancarTurno);
  const voltarTurno = useStore((s) => s.voltarTurno);
  const encerrarModoCombate = useStore((s) => s.encerrarModoCombate);
  const ajustarPvAtual = useStore((s) => s.ajustarPvAtual);
  const atualizarNpc = useStore((s) => s.atualizarNpc);
  const atualizarFicha = useStore((s) => s.atualizarFicha);
  const alternarCondicaoCombate = useStore((s) => s.alternarCondicaoCombate);
  const registrarLog = useStore((s) => s.registrarLog);
  const registrarRoll = useStore((s) => s.registrarRoll);

  const participantesDisponiveis = [
    ...fichas.map((f) => ({ id: f.id, tipo: 'pc' as const, nome: f.nome || 'sem nome' })),
    ...npcs.map((n) => ({ id: n.id, tipo: 'npc' as const, nome: n.nome || 'sem nome' })),
  ];

  const jaNaIniciativa = new Set(iniciativa.map((e) => e.participanteId));
  const disponiveis = participantesDisponiveis.filter((p) => !jaNaIniciativa.has(p.id));
  const todosSelecionados = disponiveis.length > 0 && disponiveis.every((p) => selecionadosIniciativa.includes(p.id));
  const nenhumSelecionado = disponiveis.length > 0 && disponiveis.every((p) => !selecionadosIniciativa.includes(p.id));
  const adicionarDisponiveis = disponiveis.filter((p) => selecionadosIniciativa.includes(p.id));

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // Compartilhado via combateUiStore (não useState local) — NpcsTab e CombatOverlay podem estar
  // montados ao mesmo tempo sobre a MESMA iniciativa, e precisam ver a mesma seleção/estado de
  // combate ao vivo, não cópias independentes (ver combateUiStore.ts).
  const selecionadosAplicar = useCombateUiStore((s) => s.selecionadosAplicar);
  const toggleSelecionadoAplicarUi = useCombateUiStore((s) => s.toggleSelecionadoAplicar);
  const limparSelecaoAplicarUi = useCombateUiStore((s) => s.limparSelecaoAplicar);
  const agruparNpcs = useCombateUiStore((s) => s.agruparNpcs);
  const setAgruparNpcs = useCombateUiStore((s) => s.setAgruparNpcs);
  const socorristaPorAlvo = useCombateUiStore((s) => s.socorristaPorAlvo);
  const definirSocorristaUi = useCombateUiStore((s) => s.definirSocorrista);

  const toggleSelecionado = (id: string) => {
    const novo = selecionadosIniciativa.includes(id)
      ? selecionadosIniciativa.filter((s) => s !== id)
      : [...selecionadosIniciativa, id];
    atualizarSessaoPrivada({ selecionadosIniciativa: novo });
  };

  const toggleTodos = () => {
    if (todosSelecionados) {
      const ids = new Set(disponiveis.map((p) => p.id));
      atualizarSessaoPrivada({ selecionadosIniciativa: selecionadosIniciativa.filter((s) => !ids.has(s)) });
    } else {
      const ids = disponiveis.map((p) => p.id);
      const existentes = new Set(selecionadosIniciativa);
      const novos = ids.filter((id) => !existentes.has(id));
      atualizarSessaoPrivada({ selecionadosIniciativa: [...selecionadosIniciativa, ...novos] });
    }
  };

  const rolarSelecionados = () => {
    const ids = [...new Set(selecionadosIniciativa)];
    if (ids.length === 0) { rolarIniciativaTodos(); return; }
    if (agruparNpcs) {
      const idsNpc = ids.filter((id) => npcs.some((n) => n.id === id));
      const idsResto = ids.filter((id) => !idsNpc.includes(id));
      // 1 NPC só não é "grupo" — rola normal, junto do resto, pra não virar um caso especial
      // silencioso (mesmo d20, mas sem o log "em grupo" confuso pra um único alvo).
      if (idsNpc.length >= 2) rolarIniciativaGrupo(idsNpc);
      else if (idsNpc.length === 1) idsResto.push(idsNpc[0]);
      if (idsResto.length > 0) rolarIniciativa(idsResto);
    } else {
      rolarIniciativa(ids);
    }
    const idsDisponiveis = new Set(disponiveis.map((p) => p.id));
    atualizarSessaoPrivada({ selecionadosIniciativa: selecionadosIniciativa.filter((s) => !idsDisponiveis.has(s)) });
  };

  const resetar = () => {
    atualizarSessaoPrivada({ selecionadosIniciativa: [] });
    setExpandidos(new Set());
    setAdicionarAberto(false);
    limparSelecaoAplicarUi();
    setAgruparNpcs(false);
    if (modoCombate) encerrarModoCombate();
    if (iniciativa.length > 0) limparIniciativa();
  };

  const toggleExpandido = (id: string) => {
    setExpandidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const pvDoCombatente = (participanteId: string, tipo: 'pc' | 'npc'): PvCombatente | null => {
    if (tipo === 'pc') {
      const ficha = fichas.find((f) => f.id === participanteId);
      if (!ficha) return null;
      return {
        atual: ficha.pvAtual,
        maximo: calcularPvMaximo(basePV, ficha.atributos.vigor),
        aplicar: (delta) => {
          // "Ver aliado cair a 0 PV" — teste de Sanidade (Vontade, 1d4), regras.md §Sanidade.
          // Lembrete, não rolagem automática: cada PC rola a própria Vontade quando o mestre
          // decidir quem estava vendo.
          if (ficha.pvAtual > 0 && ficha.pvAtual + delta <= 0) {
            registrarLog(
              'sanidade',
              `${ficha.nome || 'personagem'} caiu a 0 PV — lembrar teste de Sanidade (Vontade, 1d4) pros PCs que viram.`,
              null,
            );
          }
          ajustarPvAtual(ficha.id, ficha.pvAtual + delta);
        },
      };
    }
    const npc = npcs.find((n) => n.id === participanteId);
    if (!npc) return null;
    return {
      atual: npc.pvAtual,
      maximo: npc.pvMaximo,
      aplicar: (delta) => atualizarNpc(npc.id, { pvAtual: npc.pvAtual + delta }),
    };
  };

  const defesaDoCombatente = (participanteId: string, tipo: 'pc' | 'npc'): DefesaCombatente | null => {
    if (tipo === 'pc') {
      const ficha = fichas.find((f) => f.id === participanteId);
      if (!ficha) return null;
      return {
        valor: calcularDefesa(ficha.atributos.agilidade, ficha.equipamentoModificadorDefesa),
        ajustar: (delta) => atualizarFicha(ficha.id, { equipamentoModificadorDefesa: ficha.equipamentoModificadorDefesa + delta }),
      };
    }
    const npc = npcs.find((n) => n.id === participanteId);
    if (!npc) return null;
    return {
      valor: npc.defesa,
      ajustar: (delta) => atualizarNpc(npc.id, { defesa: npc.defesa + delta }),
    };
  };

  const toggleSelecionadoAplicar = toggleSelecionadoAplicarUi;
  const limparSelecaoAplicar = limparSelecaoAplicarUi;

  const adiarIniciativa = (entradaId: string) => {
    const atual = useStore.getState();
    const indice = atual.iniciativa.findIndex((e) => e.id === entradaId);
    if (indice < 0 || indice === atual.iniciativa.length - 1) return;
    const entrada = atual.iniciativa[indice];
    const proximoId = atual.iniciativa[indice + 1].id;
    atual.reordenarIniciativa(indice, atual.iniciativa.length - 1);
    // Adiar a própria vez não encerra sua ação: os demais continuam nesta rodada e quem
    // adiou age no fim. O próximo normal decrementa as condições só depois dessa ação.
    if (atual.sessaoPublica.modoCombate && atual.sessaoPublica.turnoAtualId === entradaId) {
      atual.atualizarSessaoPublica({ turnoAtualId: proximoId });
    }
    if (!(atual.sessaoPublica.condicoesCombate[entrada.participanteId] ?? []).includes('aguardando')) {
      atual.alternarCondicaoCombate(entrada.participanteId, 'aguardando');
    }
    atual.definirDuracaoCondicao(entrada.participanteId, 'aguardando', 1);
  };

  /** Dano (delta negativo) ou ajuste (delta positivo — nunca "cura": regras.md "não existe
   *  cura em combate", o app só corrige erro de digitação; a única exceção sancionada é
   *  Primeiros Socorros — `tentarPrimeirosSocorros`, ação própria com teste e trava
   *  1×/pessoa/cena) em todos os selecionados de uma vez.
   *  1 clique em vez de 1 por alvo — é a granada em 4 combatentes virando 1 ação, não 40. */
  const aplicarDanoEmMassa = (delta: number) => {
    if (selecionadosAplicar.size === 0 || delta === 0) return;
    const nomesPublicos: string[] = [];
    const nomesOcultos: string[] = [];
    for (const e of iniciativa) {
      if (!selecionadosAplicar.has(e.participanteId)) continue;
      const pv = pvDoCombatente(e.participanteId, e.tipo);
      if (!pv) continue;
      pv.aplicar(delta);
      const oculto = e.tipo === 'npc' && !npcs.find((n) => n.id === e.participanteId)?.visivel;
      (oculto ? nomesOcultos : nomesPublicos).push(e.nome);
    }
    const sinal = delta > 0 ? '+' : '';
    if (nomesPublicos.length > 0) registrarLog('dano', `dano em área — ${nomesPublicos.join(', ')}: ${sinal}${delta} PV`, null, 'publica');
    if (nomesOcultos.length > 0) registrarLog('dano', `dano em área — ${nomesOcultos.join(', ')}: ${sinal}${delta} PV`, null, 'privada');
  };

  // sem log — mesmo comportamento do toggle individual (`alternarCondicaoCombate`): lembrete
  // visual pro mestre, não um evento narrativo (condicoesCombate.ts).
  const aplicarCondicaoEmMassa = (condicaoId: string) => {
    if (selecionadosAplicar.size === 0) return;
    for (const e of iniciativa) {
      if (!selecionadosAplicar.has(e.participanteId)) continue;
      const ativas = (condicoesCombate ?? {})[e.participanteId] ?? [];
      if (ativas.includes(condicaoId)) continue;
      alternarCondicaoCombate(e.participanteId, condicaoId);
    }
  };

  const definirSocorrista = definirSocorristaUi;

  /** Medicina (Intelecto) DT 15 estabiliza quem está a 0 PV (regras.md). Sucesso liga a
   *  condição 'estavel' (lembrete visual — acorda com 1 PV no fim da cena, o mestre aplica na
   *  hora certa); falha só fica no log, o jogador tenta de novo depois. */
  const tentarEstabilizar = (alvoId: string) => {
    const alvo = iniciativa.find((e) => e.participanteId === alvoId);
    const pv = alvo && pvDoCombatente(alvoId, alvo.tipo);
    const condicoes = useStore.getState().sessaoPublica.condicoesCombate[alvoId] ?? [];
    if (!pv || pv.atual > 0 || condicoes.includes('estavel') || calcularEstadoTokenCombate(pv.atual, pv.maximo, condicoes).morto) return;
    const socorristaId = socorristaPorAlvo[alvoId];
    const socorrista = fichas.find((f) => f.id === socorristaId);
    if (!socorrista) return;
    const pvMaximoSocorrista = calcularPvMaximo(basePV, socorrista.atributos.vigor);
    const ferido = estaFerido(socorrista.pvAtual, pvMaximoSocorrista);
    const grauMedicina = socorrista.pericias['medicina'] ?? 0;
    const d20 = rolarDadoComForcados(20, socorrista.id, 'teste');
    const resultado = resolverEstabilizar({ d20, intelecto: socorrista.atributos.intelecto, grauMedicina, socorristaFerido: ferido });
    const alvoNome = iniciativa.find((e) => e.participanteId === alvoId)?.nome ?? '?';
    const nomeSocorrista = socorrista.nome || 'personagem';
    const { teste, estabilizou } = resultado;
    registrarLog(
      'teste',
      formatarLogRolagem({
        quem: nomeSocorrista,
        tipo: `Estabilizar (Medicina): ${alvoNome}`,
        grupos: [{ notacao: '1d20', resultados: [teste.d20] }],
        bonus: teste.modificador,
        total: teste.total,
        sufixo: `· ${estabilizou ? 'estabilizou' : 'falhou'}`,
      }),
      socorrista.id,
      'privada',
    );
    registrarRoll({
      origem: nomeSocorrista,
      personagemId: socorrista.id,
      formula: `d20${teste.modificador >= 0 ? '+' : ''}${teste.modificador}`,
      total: teste.total,
      bruto: d20,
      visibilidade: 'privada',
    });
    if (estabilizou) alternarCondicaoCombate(alvoId, 'estavel');
  };

  const podePrimeirosSocorros = (alvoId: string) => podeUsarPrimeirosSocorros(primeirosSocorrosCena, alvoId, contadorCena);

  /** Medicina (Intelecto) DT 15 recupera 1d4 PV de quem NÃO está a 0 PV (regras.md, tabela de
   *  ações — "Primeiros socorros"). Exceção sancionada a "não existe cura em combate": trava
   *  1×/pessoa/cena, mesmo em falha (a tentativa consome a chance, não só o sucesso). */
  const tentarPrimeirosSocorros = (alvoId: string) => {
    if (!podePrimeirosSocorros(alvoId)) return;
    const socorristaId = socorristaPorAlvo[alvoId];
    const socorrista = fichas.find((f) => f.id === socorristaId);
    if (!socorrista) return;
    const alvo = iniciativa.find((e) => e.participanteId === alvoId);
    if (!alvo) return;
    const pv = pvDoCombatente(alvoId, alvo.tipo);
    const condicoes = useStore.getState().sessaoPublica.condicoesCombate[alvoId] ?? [];
    if (!pv || pv.atual <= 0 || calcularEstadoTokenCombate(pv.atual, pv.maximo, condicoes).morto) return;
    const pvMaximoSocorrista = calcularPvMaximo(basePV, socorrista.atributos.vigor);
    const ferido = estaFerido(socorrista.pvAtual, pvMaximoSocorrista);
    const grauMedicina = socorrista.pericias['medicina'] ?? 0;
    const d20 = rolarDadoComForcados(20, socorrista.id, 'teste');
    const { teste, estabilizou: sucesso } = resolverEstabilizar({ d20, intelecto: socorrista.atributos.intelecto, grauMedicina, socorristaFerido: ferido });
    const nomeSocorrista = socorrista.nome || 'personagem';
    let resultadoTexto = 'falhou';
    if (sucesso) {
      const curado = rolarDadoComForcados(4, alvoId, 'teste');
      pvDoCombatente(alvoId, alvo.tipo)?.aplicar(curado);
      resultadoTexto = `recuperou ${curado} PV`;
    }
    registrarLog(
      'teste',
      formatarLogRolagem({
        quem: nomeSocorrista,
        tipo: `Primeiros Socorros (Medicina): ${alvo.nome}`,
        grupos: [{ notacao: '1d20', resultados: [teste.d20] }],
        bonus: teste.modificador,
        total: teste.total,
        sufixo: `· ${resultadoTexto}`,
      }),
      socorrista.id,
      'privada',
    );
    registrarRoll({
      origem: nomeSocorrista,
      personagemId: socorrista.id,
      formula: `d20${teste.modificador >= 0 ? '+' : ''}${teste.modificador}`,
      total: teste.total,
      bruto: d20,
      visibilidade: 'privada',
    });
    atualizarSessaoPrivada({ primeirosSocorrosCena: registrarUsoPrimeirosSocorros(primeirosSocorrosCena, alvoId, contadorCena) });
  };

  return {
    iniciativa, modoCombate, turnoAtualId, rodada, contadorCena,
    condicoesCombate, condicaoDuracao, definirDuracaoCondicao, fichas, npcs, basePV,
    selecionadosIniciativa,
    removerDaIniciativa, reordenarIniciativa, rerolarIniciativaDe,
    adiarIniciativa,
    iniciarModoCombate, avancarTurno, voltarTurno, encerrarModoCombate,
    alternarCondicaoCombate,
    participantesDisponiveis, disponiveis, todosSelecionados, nenhumSelecionado, adicionarDisponiveis,
    expandidos, adicionarAberto, dragIndex, dropIndex,
    setDragIndex, setDropIndex, setAdicionarAberto,
    toggleSelecionado, toggleTodos, rolarSelecionados, resetar, toggleExpandido,
    pvDoCombatente, defesaDoCombatente, registrarLog, registrarRoll,
    selecionadosAplicar, toggleSelecionadoAplicar, limparSelecaoAplicar,
    aplicarDanoEmMassa, aplicarCondicaoEmMassa,
    socorristaPorAlvo, definirSocorrista, tentarEstabilizar,
    podePrimeirosSocorros, tentarPrimeirosSocorros,
    agruparNpcs, setAgruparNpcs,
  };
}
