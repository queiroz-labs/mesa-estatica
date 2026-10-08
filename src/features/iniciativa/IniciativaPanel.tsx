import { useCallback, useState, type ReactNode } from 'react';
import { estaMorto } from '../../rules/combate';
import { CONDICOES_COMBATE, REGRAS_GERAIS_COMBATE } from '../../rules/data/condicoesCombate';
import { TABELA_SURTO } from '../../rules/data/surto';
import { surtosAtivosNaSessao, type EstadoSessaoParaSurto } from '../../rules/surto';
import { corPv, type useIniciativa } from '../../hooks/useIniciativa';
import BarraSegmentada from '../fichas/BarraSegmentada';
import ArmasCombate from '../combate/ArmasCombate';
import ArmasCombateNpc from '../combate/ArmasCombateNpc';
import { IconeAdiar, IconeChevron, IconeDado, IconeEscudo, IconeMais } from '../combate/icones';
import ConfirmacaoCombate from './ConfirmacaoCombate';

interface IniciativaPanelProps {
  hook: ReturnType<typeof useIniciativa>;
  header: ReactNode;
  banner?: ReactNode;
  estiloItem?: React.CSSProperties;
  podeArrastar?: boolean;
  /** `CombatOverlay.tsx` já tem um "▶ próximo" fixo e maior no próprio header (C2 — sempre à
   *  mão, não some ao rolar a lista) — sem isso, o botão "próximo" daqui embaixo duplicava o
   *  mesmo comando. `NpcsTab.tsx` (header simples, sem essa duplicata) continua mostrando. */
  ocultarBotaoProximo?: boolean;
}

export default function IniciativaPanel({ hook, header, banner, estiloItem, podeArrastar = true, ocultarBotaoProximo = false }: IniciativaPanelProps) {
  const {
    iniciativa, modoCombate, turnoAtualId, rodada, contadorCena,
    condicoesCombate, condicaoDuracao, fichas, npcs,
    selecionadosIniciativa,
    removerDaIniciativa, reordenarIniciativa, rerolarIniciativaDe,
    adiarIniciativa,
    iniciarModoCombate, avancarTurno, voltarTurno, encerrarModoCombate,
    alternarCondicaoCombate, definirDuracaoCondicao,
    disponiveis, todosSelecionados, nenhumSelecionado, adicionarDisponiveis,
    expandidos, adicionarAberto, dragIndex, dropIndex,
    setDragIndex, setDropIndex, setAdicionarAberto,
    toggleSelecionado, toggleTodos, rolarSelecionados, resetar, toggleExpandido,
    pvDoCombatente, defesaDoCombatente,
    selecionadosAplicar, toggleSelecionadoAplicar, limparSelecaoAplicar,
    aplicarDanoEmMassa, aplicarCondicaoEmMassa,
    socorristaPorAlvo, definirSocorrista, tentarEstabilizar,
    podePrimeirosSocorros, tentarPrimeirosSocorros,
    agruparNpcs, setAgruparNpcs,
  } = hook;

  const [danoEmMassa, setDanoEmMassa] = useState('');
  const [condicaoEmMassa, setCondicaoEmMassa] = useState('');
  const [mostrarRegras, setMostrarRegras] = useState(false);
  const [mostrarCondicoes, setMostrarCondicoes] = useState(false);
  const [confirmacao, setConfirmacao] = useState<'encerrar' | 'resetar' | null>(null);
  const cancelarConfirmacao = useCallback(() => setConfirmacao(null), []);
  const confirmar = () => {
    if (confirmacao === 'encerrar') encerrarModoCombate();
    else if (confirmacao === 'resetar') resetar();
    setConfirmacao(null);
  };
  const nomesSelecionados = iniciativa.filter((entrada) => selecionadosAplicar.has(entrada.participanteId)).map((entrada) => entrada.nome || 'sem nome');

  return (
    <>
      {header}
      {confirmacao && <ConfirmacaoCombate acao={confirmacao} combateAtivo={modoCombate} onCancelar={cancelarConfirmacao} onConfirmar={confirmar} />}

      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {selecionadosIniciativa.length > 0 && (
          <button className="icone-botao acento" onClick={rolarSelecionados} disabled={nenhumSelecionado && disponiveis.length > 0}>
            rolar inic.
          </button>
        )}
        {modoCombate ? (
          <>
            {!ocultarBotaoProximo && (
              <>
                <button className="icone-botao" onClick={voltarTurno} title="voltar pro turno anterior — não restaura condições que já expiraram">
                  anterior
                </button>
                <button className="icone-botao acento" onClick={avancarTurno}>
                  próximo
                </button>
              </>
            )}
            <button className="icone-botao perigo" onClick={() => setConfirmacao('encerrar')}>
              encerrar
            </button>
          </>
        ) : (
          <button className="icone-botao acento" onClick={iniciarModoCombate} disabled={iniciativa.length === 0}>
            iniciar
          </button>
        )}
        <button className="icone-botao perigo" onClick={() => { if (modoCombate || iniciativa.length > 0) setConfirmacao('resetar'); else resetar(); }}>
          resetar
        </button>
        <button
          className="icone-botao"
          onClick={() => setMostrarRegras((v) => !v)}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-dim)' }}
        >
          regras <IconeChevron aberto={mostrarRegras} />
        </button>
        <button
          className="icone-botao"
          onClick={() => setMostrarCondicoes((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-dim)' }}
        >
          condições <IconeChevron aberto={mostrarCondicoes} />
        </button>
      </div>

      {mostrarRegras && (
        <div className="secao" style={{ marginBottom: '0.5rem', background: 'var(--concrete-0)' }}>
          {REGRAS_GERAIS_COMBATE.map((r) => (
            <p key={r.id} className="vazio" style={{ margin: '0.2rem 0', fontSize: 12 }}>
              <strong style={{ color: 'var(--ink)' }}>{r.titulo}</strong> — {r.texto}
            </p>
          ))}
        </div>
      )}

      {mostrarCondicoes && (
        <div className="secao" style={{ marginBottom: '0.5rem', background: 'var(--concrete-0)' }}>
          {CONDICOES_COMBATE.map((c) => (
            <p key={c.id} className="vazio" style={{ margin: '0.2rem 0', fontSize: 12 }}>
              <strong style={{ color: 'var(--ink)' }}>{c.nome}</strong> — {c.efeito}
            </p>
          ))}
        </div>
      )}

      {banner}

      {iniciativa.length === 0 ? (
        <>
          {disponiveis.length === 0 ? (
            <p className="vazio" style={{ fontSize: 12, margin: '0.25rem 0' }}>nenhum combatente disponível.</p>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: 12, marginBottom: '0.3rem', color: 'var(--ink-dim)' }}>
                <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} />
                selecionar todos
              </label>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: 12, marginBottom: '0.3rem', color: 'var(--ink-dim)' }}
                title="1 d20 + a maior Agilidade entre os NPCs selecionados — todos com o mesmo valor de iniciativa"
              >
                <input type="checkbox" checked={agruparNpcs} onChange={(e) => setAgruparNpcs(e.target.checked)} />
                agrupar NPCs selecionados
              </label>
              {disponiveis.map((p) => {
                const marcado = selecionadosIniciativa.includes(p.id);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: 13,
                      marginBottom: '0.2rem', opacity: marcado ? 1 : 0.5,
                    }}
                  >
                    <input type="checkbox" checked={marcado} onChange={() => toggleSelecionado(p.id)} />
                    <span className="mono">{p.nome}</span>
                    <span className="vazio" style={{ fontSize: 11 }}>({p.tipo === 'pc' ? 'PC' : 'NPC'})</span>
                  </label>
                );
              })}
            </>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {iniciativa.map((e, i) => {
            const naVez = modoCombate && e.id === turnoAtualId;
            const exp = expandidos.has(e.id) || naVez;
            const pv = pvDoCombatente(e.participanteId, e.tipo);
            const defesa = defesaDoCombatente(e.participanteId, e.tipo);
            const ativas = (condicoesCombate ?? {})[e.participanteId] ?? [];
            const duracoes = (condicaoDuracao ?? {})[e.participanteId] ?? {};
            const pvPct = pv ? pv.atual / pv.maximo : 0;
            const sessaoSurto: EstadoSessaoParaSurto = { modoCombate, contadorCena, rodada };
            const fichaSurtos = e.tipo === 'pc' ? fichas.find((f) => f.id === e.participanteId)?.surtosAtivos ?? [] : [];
            const surtosVisiveis = surtosAtivosNaSessao(fichaSurtos, sessaoSurto);
            const emSurto = surtosVisiveis.length > 0;
            const sendoArrastado = dragIndex === i;
            const alvoDrop = dropIndex === i;
            const npcDoCombatente = e.tipo === 'npc' ? npcs.find((n) => n.id === e.participanteId) ?? null : null;
            const podeAdiar = iniciativa.length > 1 && i < iniciativa.length - 1;
            const critico = !!pv && pv.atual > 0 && pvPct <= 0.25;
            // "desacordado"/"morto" também podem ser marcados manualmente pelo mestre
            // (CONDICOES_COMBATE), independente do PV bater com a regra — union, não substitui.
            const foraDeCombate = (!!pv && pv.atual <= 0) || ativas.includes('desacordado');
            const morto = (!!pv && estaMorto(pv.atual, pv.maximo)) || ativas.includes('morto');
            return (
              <div
                key={e.id}
                className="combate-linha"
                data-ativo={naVez}
                style={{
                  marginBottom: '0.3rem',
                  opacity: sendoArrastado ? 0.3 : 1,
                  borderTopColor: alvoDrop ? 'var(--rede)' : undefined,
                  ...estiloItem,
                }}
              >
                <div
                  draggable={podeArrastar}
                  onDragStart={() => { setDragIndex(i); setDropIndex(null); }}
                  onDragOver={(ev) => { ev.preventDefault(); setDropIndex(i); }}
                  onDragLeave={() => setDropIndex(null)}
                  onDrop={() => { if (dragIndex !== null && dragIndex !== i) { reordenarIniciativa(dragIndex, i); } setDragIndex(null); setDropIndex(null); }}
                  onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                  onClick={() => toggleExpandido(e.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: podeArrastar ? 'grab' : 'pointer', fontSize: 13,
                    padding: '0.1rem 0',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selecionadosAplicar.has(e.participanteId)}
                    onChange={() => toggleSelecionadoAplicar(e.participanteId)}
                    onClick={(ev) => ev.stopPropagation()}
                    title="selecionar pra aplicar dano/condição em área"
                    style={{ flexShrink: 0 }}
                  />
                  <button
                    type="button"
                    className="icone-botao"
                    onClick={(ev) => { ev.stopPropagation(); removerDaIniciativa(e.id); }}
                    title="remover"
                    style={{ color: 'var(--ruido)', padding: '0.1em 0.3em', fontSize: 11, lineHeight: 1, flexShrink: 0 }}
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    className="icone-botao"
                    onClick={(ev) => { ev.stopPropagation(); rerolarIniciativaDe(e.participanteId); }}
                    title="rerrolar iniciativa (d20+Agilidade)"
                    style={{ padding: '0.1em 0.3em', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <IconeDado />
                  </button>
                  <button
                    type="button"
                    className="icone-botao"
                    disabled={!podeAdiar}
                    onClick={podeAdiar ? (ev) => {
                      ev.stopPropagation();
                      adiarIniciativa(e.id);
                    } : undefined}
                    title={podeAdiar ? 'adiar — vai pro fim da ordem desta rodada' : undefined}
                    style={{
                      padding: '0.1em 0.3em', display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                      // `undefined` (não 'visible') quando podeAdiar: um valor explícito aqui
                      // teria especificidade de inline style e VENCERIA o `visibility: hidden`
                      // da aba inteira quando o mestre troca de aba com o combate aberto (era
                      // o bug — a seta "adiar" continuava aparecendo por cima de outras abas).
                      // Deixando undefined, herda normalmente do ancestral (aba ativa = visível,
                      // aba escondida = escondido); só força 'hidden' quando !podeAdiar mesmo.
                      visibility: podeAdiar ? undefined : 'hidden', border: podeAdiar ? undefined : 'none',
                    }}
                  >
                    <IconeAdiar />
                  </button>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', minWidth: 16, flexShrink: 0 }} title="posição na ordem de turno">
                    {i + 1}
                  </span>
                  <span className="mono" style={{ color: 'var(--rede)', fontSize: 12, minWidth: 12, flexShrink: 0 }}>
                    {naVez ? '▶' : ''}
                  </span>
                  <span
                    className="mono"
                    style={{
                      flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 44,
                      color: naVez ? 'var(--rede)' : undefined,
                    }}
                    title={e.nome}
                  >
                    {e.nome}
                  </span>
                  {(morto || foraDeCombate || critico) && (
                    <span
                      className="badge"
                      title={
                        morto
                          ? (pv && estaMorto(pv.atual, pv.maximo)
                            ? 'morto — PV chegou à metade negativa do máximo (regras.md).'
                            : 'morto — condição marcada pelo mestre, independente do PV.')
                          : foraDeCombate
                            ? (ativas.includes('estavel')
                              ? 'estabilizado (Medicina DT 15) — acorda com 1 PV no fim da cena'
                              : (pv && pv.atual <= 0
                                ? '0 PV ou menos — caído, não morto. Sem socorro, morre em minutos (regras.md).'
                                : 'desacordado — condição marcada pelo mestre, independente do PV.'))
                            : 'PV em 25% ou menos do máximo'
                      }
                      style={{ borderColor: 'var(--ruido)', color: 'var(--ruido)', fontSize: 10, padding: '0.1em 0.35em', flexShrink: 0 }}
                    >
                      {morto ? 'morto' : foraDeCombate ? (ativas.includes('estavel') ? 'estável' : 'fora de combate') : 'crítico'}
                    </span>
                  )}
                  {emSurto && (
                    <span title={surtosVisiveis.filter((s) => s.escolha).map((s) => s.escolha).join(', ') || 'surto ativo'} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', color: 'var(--ruido)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    </span>
                  )}
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: 'var(--ink-faint)', flexShrink: 0, minWidth: 26, textAlign: 'right' }}
                    title={
                      e.d20 !== undefined && e.agilidade !== undefined
                        ? `iniciativa ${e.valor}: d20 ${e.d20} + agilidade aplicada ${e.agilidade}`
                        : `iniciativa ${e.valor}`
                    }
                  >
                    {`inic. ${e.valor}`}
                  </span>
                  {pv && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                      <div style={{ width: 36 }}>
                        <BarraSegmentada atual={pv.atual} maximo={pv.maximo} variante="pv" corPreenchimento={corPv(pv.atual, pv.maximo)} compacta />
                      </div>
                      <span className="mono" style={{ fontSize: 11, minWidth: 32, textAlign: 'right' }}>
                        {pv.atual}/{pv.maximo}
                      </span>
                    </div>
                  )}
                  {defesa && (
                    <span className="mono" style={{ fontSize: 12, color: 'var(--real)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.15rem', minWidth: 24, justifyContent: 'flex-end' }} title="defesa">
                      <IconeEscudo size={12} />{defesa.valor}
                    </span>
                  )}
                  <span style={{ color: 'var(--ink-faint)', flexShrink: 0, display: 'inline-flex' }}>
                    <IconeChevron aberto={exp} />
                  </span>
                </div>
                {exp && (
                  <div style={{ padding: '0.25rem 0 0.1rem 1.1rem' }}>
                    {surtosVisiveis.filter((s) => s.escolha).map((s) => (
                      <span
                        key={s.id}
                        className="badge"
                        style={{ borderColor: 'var(--ruido)', color: 'var(--ruido)', alignSelf: 'flex-start', marginBottom: '0.25rem', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        title={TABELA_SURTO.find((e) => e.nome === s.escolha)?.descricao ?? ''}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        {s.escolha}
                      </span>
                    ))}
                    {e.tipo === 'pc' && (() => {
                      const ficha = fichas.find((f) => f.id === e.participanteId);
                      if (!ficha || ficha.armas.length === 0) return null;
                      return (
                        <ArmasCombate ficha={ficha} souMestre />
                      );
                    })()}
                    {npcDoCombatente && <ArmasCombateNpc npc={npcDoCombatente} />}
                    <div style={{ marginBottom: '0.4rem' }}>
                      <span className="combate-rotulo">condições</span>
                      <div className="combate-condicoes">
                        {CONDICOES_COMBATE.map((c) => {
                          const ligada = ativas.includes(c.id);
                          const rodadasRestantes = duracoes[c.id];
                          return (
                            <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                              <button
                                className={`combate-chip${ligada ? ' combate-chip--ativa' : ''}`}
                                title={rodadasRestantes !== undefined ? `${c.efeito} (${rodadasRestantes} rodada${rodadasRestantes === 1 ? '' : 's'} restante${rodadasRestantes === 1 ? '' : 's'})` : c.efeito}
                                onClick={() => alternarCondicaoCombate(e.participanteId, c.id)}
                              >
                                {c.nome}
                                {rodadasRestantes !== undefined && ` (${rodadasRestantes})`}
                              </button>
                              {ligada && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.05rem' }}>
                                  {rodadasRestantes !== undefined && (
                                    <button
                                      className="icone-botao"
                                      title="reduzir duração — 0 volta a manual/persistente (sem prazo)"
                                      onClick={() => definirDuracaoCondicao(e.participanteId, c.id, rodadasRestantes - 1)}
                                      style={{ fontSize: 11, padding: '0.05em 0.3em' }}
                                    >
                                      −
                                    </button>
                                  )}
                                  <button
                                    className="icone-botao"
                                    title="duração em rodadas — desliga sozinha quando chegar a 0 no fim do turno dela (mesmo mecanismo de Aguardando)"
                                    onClick={() => definirDuracaoCondicao(e.participanteId, c.id, (rodadasRestantes ?? 0) + 1)}
                                    style={{ fontSize: 11, padding: '0.05em 0.3em' }}
                                  >
                                    +
                                  </button>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {pv && (
                        <div>
                          <span className="combate-rotulo">pv</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexWrap: 'wrap' }}>
                            <button className="icone-botao" onClick={() => pv.aplicar(-1)} title="−1 PV" style={{ fontSize: 11, padding: '0.1em 0.35em' }}>−1</button>
                            <span className="mono" style={{ fontSize: 12, minWidth: 32, textAlign: 'center' }}>{pv.atual}</span>
                            <button className="icone-botao" onClick={() => pv.aplicar(1)} title="+1 (ajuste — não é cura, regras.md)" style={{ fontSize: 11, padding: '0.1em 0.35em' }}>+1</button>
                            <input
                              type="number"
                              placeholder="dano"
                              title="dano livre — Enter aplica"
                              style={{ width: 44, fontSize: 11, padding: '0.1em 0.25em' }}
                              onKeyDown={(ev) => {
                                if (ev.key !== 'Enter') return;
                                const alvo = ev.target as HTMLInputElement;
                                const valor = Number(alvo.value);
                                if (valor) pv.aplicar(-Math.abs(valor));
                                alvo.value = '';
                              }}
                            />
                          </div>
                        </div>
                      )}
                      {defesa && (
                        <div>
                          <span className="combate-rotulo">defesa</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{ color: 'var(--real)', display: 'inline-flex' }}><IconeEscudo size={12} /></span>
                            <button className="icone-botao" onClick={() => defesa.ajustar(-1)} style={{ fontSize: 11, padding: '0.1em 0.35em' }}>−</button>
                            <span className="mono" style={{ fontSize: 12, minWidth: 20, textAlign: 'center' }}>{defesa.valor}</span>
                            <button className="icone-botao" onClick={() => defesa.ajustar(1)} style={{ fontSize: 11, padding: '0.1em 0.35em' }}>+</button>
                          </div>
                        </div>
                      )}
                    </div>
                    {pv && pv.atual <= 0 && !morto && !ativas.includes('estavel') && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                        <span className="vazio" style={{ fontSize: 11 }}>socorro:</span>
                        <select
                          value={socorristaPorAlvo[e.participanteId] ?? ''}
                          onChange={(ev) => definirSocorrista(e.participanteId, ev.target.value)}
                          style={{ fontSize: 11 }}
                        >
                          <option value="">quem tenta?</option>
                          {fichas
                            .filter((f) => f.id !== e.participanteId && (pvDoCombatente(f.id, 'pc')?.atual ?? 1) > 0)
                            .map((f) => (
                              <option key={f.id} value={f.id}>{f.nome || 'sem nome'}</option>
                            ))}
                        </select>
                        <button
                          className="icone-botao"
                          disabled={!socorristaPorAlvo[e.participanteId]}
                          onClick={() => tentarEstabilizar(e.participanteId)}
                          title="Medicina (Intelecto) DT 15 — estabiliza a 0 PV (regras.md)"
                          style={{ fontSize: 11 }}
                        >
                          estabilizar
                        </button>
                      </div>
                    )}
                    {pv && pv.atual > 0 && pv.atual < pv.maximo && !morto && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                        <span className="vazio" style={{ fontSize: 11 }}>socorro:</span>
                        <select
                          value={socorristaPorAlvo[e.participanteId] ?? ''}
                          onChange={(ev) => definirSocorrista(e.participanteId, ev.target.value)}
                          style={{ fontSize: 11 }}
                        >
                          <option value="">quem tenta?</option>
                          {fichas
                            .filter((f) => f.id !== e.participanteId && (pvDoCombatente(f.id, 'pc')?.atual ?? 1) > 0)
                            .map((f) => (
                              <option key={f.id} value={f.id}>{f.nome || 'sem nome'}</option>
                            ))}
                        </select>
                        <button
                          className="icone-botao"
                          disabled={!socorristaPorAlvo[e.participanteId] || !podePrimeirosSocorros(e.participanteId)}
                          onClick={() => tentarPrimeirosSocorros(e.participanteId)}
                          title={
                            podePrimeirosSocorros(e.participanteId)
                              ? 'Medicina (Intelecto) DT 15 — recupera 1d4 PV, 1×/pessoa/cena (regras.md)'
                              : 'já tentado nesta cena'
                          }
                          style={{ fontSize: 11 }}
                        >
                          primeiros socorros
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {selecionadosAplicar.size > 0 && (
            <div>
            <p className="vazio" style={{ margin: '0.3rem 0 0.15rem', fontSize: 11 }}>alvos selecionados: {nomesSelecionados.join(', ')}</p>
            <div
              style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem',
                borderTop: '1px solid var(--rede-dim)', padding: '0.4rem 0', marginTop: '0.15rem',
              }}
            >
              <span className="mono" style={{ fontSize: 12, color: 'var(--rede)' }}>
                aplicar a {selecionadosAplicar.size}:
              </span>
              <input
                type="number"
                placeholder="dano"
                value={danoEmMassa}
                onChange={(ev) => setDanoEmMassa(ev.target.value)}
                style={{ width: 52, fontSize: 12, padding: '0.1em 0.3em' }}
              />
              <button
                className="icone-botao"
                title="aplica como dano (negativo) nos selecionados"
                onClick={() => {
                  const valor = Number(danoEmMassa);
                  if (valor) aplicarDanoEmMassa(-Math.abs(valor));
                  setDanoEmMassa('');
                }}
                style={{ fontSize: 11 }}
              >
                dano
              </button>
              <button
                className="icone-botao"
                title="ajuste — não é cura (regras.md: não existe cura em combate)"
                onClick={() => {
                  const valor = Number(danoEmMassa);
                  if (valor) aplicarDanoEmMassa(Math.abs(valor));
                  setDanoEmMassa('');
                }}
                style={{ fontSize: 11 }}
              >
                ajuste
              </button>
              <select
                value={condicaoEmMassa}
                onChange={(ev) => setCondicaoEmMassa(ev.target.value)}
                style={{ fontSize: 11 }}
              >
                <option value="">condição…</option>
                {CONDICOES_COMBATE.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <button
                className="icone-botao"
                disabled={!condicaoEmMassa}
                onClick={() => { if (condicaoEmMassa) aplicarCondicaoEmMassa(condicaoEmMassa); }}
                style={{ fontSize: 11 }}
              >
                aplicar
              </button>
              <button
                className="icone-botao"
                onClick={limparSelecaoAplicar}
                style={{ fontSize: 11, marginLeft: 'auto', color: 'var(--ink-dim)' }}
              >
                limpar seleção
              </button>
            </div>
            </div>
          )}
          {/* também disponível COM o combate em andamento: o retardatário entra na posição do
              valor rolado e a vez continua de quem estava (store: `comIniciativaInserida`).
              Ficava escondido durante o combate porque a inserção antiga jogava todo mundo
              pro fim da lista. */}
          {(
            <div style={{ borderTop: '1px solid var(--concrete-2)', paddingTop: '0.3rem', marginTop: '0.15rem' }}>
              <button
                className="icone-botao"
                onClick={() => setAdicionarAberto(!adicionarAberto)}
                style={{ fontSize: 12, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
              >
                {adicionarAberto ? <IconeChevron aberto /> : <IconeMais size={12} />}
                {adicionarAberto ? 'recolher' : 'adicionar combatente'}
              </button>
              {adicionarAberto && (
                <div style={{ marginTop: '0.3rem' }}>
                  {disponiveis.length === 0 ? (
                    <p className="vazio" style={{ fontSize: 11, margin: 0 }}>nenhum disponível.</p>
                  ) : (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: 11, marginBottom: '0.2rem', color: 'var(--ink-dim)' }}>
                        <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} />
                        selecionar todos
                      </label>
                      <label
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: 11, marginBottom: '0.2rem', color: 'var(--ink-dim)' }}
                        title="1 d20 + a maior Agilidade entre os NPCs selecionados — todos com o mesmo valor de iniciativa"
                      >
                        <input type="checkbox" checked={agruparNpcs} onChange={(e) => setAgruparNpcs(e.target.checked)} />
                        agrupar NPCs selecionados
                      </label>
                      {disponiveis.map((p) => {
                        const marcado = selecionadosIniciativa.includes(p.id);
                        return (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: 12, marginBottom: '0.15rem', opacity: marcado ? 1 : 0.5 }}>
                            <input type="checkbox" checked={marcado} onChange={() => toggleSelecionado(p.id)} />
                            <span className="mono">{p.nome}</span>
                          </label>
                        );
                      })}
                      {adicionarDisponiveis.length > 0 && (
                        <button className="icone-botao acento" onClick={rolarSelecionados} style={{ marginTop: '0.2rem', fontSize: 11 }}>
                          + adicionar e rolar
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
