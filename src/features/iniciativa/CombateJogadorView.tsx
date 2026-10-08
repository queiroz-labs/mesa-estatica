import { useState } from 'react';
import { calcularDefesa, calcularPvMaximo } from '../../rules/derivados';
import { surtosAtivosNaSessao } from '../../rules/surto';
import { CONDICOES_COMBATE, REGRAS_GERAIS_COMBATE, nomeCondicao } from '../../rules/data/condicoesCombate';
import type { NpcPublico } from '../../multiplayer/npcsSync';
import { useStore } from '../../state/store';
import type { EntradaIniciativa, Ficha } from '../../state/types';
import ArmasCombate from '../combate/ArmasCombate';
import CombatenteResumo from '../combate/CombatenteResumo';
import { IconeEscudo, IconeSeta } from '../combate/icones';

interface Props {
  iniciativa: EntradaIniciativa[];
  minhaFicha: Ficha;
  /** Quando true, omite o <section className="secao"> externo — usado dentro de CombatOverlayJogador que já tem .secao no painel. */
  semMoldura?: boolean;
  /** Mapa participanteId → corVisual, usado pra mostrar bolinha colorida antes do nome. Opcional — omitido no uso standalone (NPCs tab). */
  corMap?: Record<string, string>;
  /** NPCs visíveis pro jogador (já filtrados por `visivel` — RLS de `npcs_publico`, migração
   *  0003). Uma entrada de iniciativa tipo 'npc' cujo participanteId não está aqui é um NPC
   *  ainda não revelado: o nome real fica escondido (mostra "???") pra não estragar reveals/
   *  sustos. Opcional — sem a lista, mostra tudo (uso standalone fora do app do jogador). */
  npcs?: NpcPublico[];
}

export default function CombateJogadorView({ iniciativa, minhaFicha, semMoldura, corMap, npcs }: Props) {
  const sessaoPublica = useStore((s) => s.sessaoPublica);
  const basePV = useStore((s) => s.config.basePV);
  const ajustarPvAtual = useStore((s) => s.ajustarPvAtual);
  const atualizarFicha = useStore((s) => s.atualizarFicha);
  const { modoCombate, turnoAtualId, rodada, contadorCena, condicoesCombate, condicaoDuracao } = sessaoPublica;

  const [mostrarRegras, setMostrarRegras] = useState(false);
  const [mostrarCondicoes, setMostrarCondicoes] = useState(false);

  const ehMeuTurno = (id: string) => id === minhaFicha.id;
  // por id da entrada, não índice: se for a vez de um NPC oculto, a RLS de `iniciativa` nem
  // devolve essa linha pro jogador — `turnoAtualId` não bate com nenhum item deste array (e
  // ninguém marca "sua vez" à toa), em vez de um índice desalinhado apontar pra outra pessoa.
  const minhaVez = modoCombate && iniciativa.some((e) => e.id === turnoAtualId && e.participanteId === minhaFicha.id);

  const conteudo = !modoCombate ? (
    semMoldura ? (
      <p className="vazio">fora de combate.</p>
    ) : (
      <>
        <h3 className="label" style={{ marginBottom: '0.3rem' }}>Combate</h3>
        <p className="vazio">fora de combate.</p>
      </>
    )
  ) : (
    <>
      {!semMoldura && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <h3 className="label" style={{ margin: 0 }}>
            Combate
          </h3>
          <span className="vazio mono">rodada {rodada}</span>
        </div>
      )}

      {minhaVez && (
        <div
          className="mono"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem',
            padding: '0.4rem 0.6rem', border: '1px solid var(--rede)', background: 'var(--rede-glow)',
            color: 'var(--rede)', fontSize: 12, fontWeight: 600, boxShadow: '0 0 12px var(--rede-glow)',
          }}
        >
          <IconeSeta size={13} /> sua vez
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginBottom: '0.4rem' }}>
        <button
          className="icone-botao"
          onClick={() => setMostrarRegras((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-dim)', fontSize: 11 }}
        >
          regras {mostrarRegras ? '▾' : '▸'}
        </button>
        <button
          className="icone-botao"
          onClick={() => setMostrarCondicoes((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-dim)', fontSize: 11 }}
        >
          condições {mostrarCondicoes ? '▾' : '▸'}
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

      {iniciativa.length === 0 ? (
        <p className="vazio">aguardando o mestre rolar iniciativa.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {iniciativa.map((e) => {
            const ativo = e.id === turnoAtualId;
            const souEu = ehMeuTurno(e.participanteId);
            const oculto = e.tipo === 'npc' && npcs !== undefined && !npcs.some((n) => n.id === e.participanteId);
            const pvMaximo = calcularPvMaximo(basePV, minhaFicha.atributos.vigor);
            const defesa = calcularDefesa(minhaFicha.atributos.agilidade, minhaFicha.equipamentoModificadorDefesa);
            const surtosVisiveis = surtosAtivosNaSessao(minhaFicha.surtosAtivos, { modoCombate, contadorCena, rodada });
            const surtoAtivo = surtosVisiveis.length > 0;
            const surtoEscolha = surtosVisiveis.find((s) => s.escolha !== null)?.escolha ?? null;
            return (
              <div key={e.id} className="combate-linha" data-ativo={ativo} style={{ padding: '0.4rem 0.6rem' }}>
                <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: souEu ? '0.4rem' : 0 }}>
                  <span style={{ width: '1.2em', textAlign: 'center', color: 'var(--rede)' }}>{ativo ? '▶' : ''}</span>
                  <span
                    style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: corMap?.[e.participanteId] ?? 'var(--ink-faint)',
                      display: 'inline-block', flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {oculto ? '???' : e.nome || 'sem nome'}
                    {souEu && <span className="badge" style={{ marginLeft: '0.4rem' }}>você</span>}
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: 'var(--ink-faint)', flexShrink: 0 }}
                    title={
                      e.d20 !== undefined && e.agilidade !== undefined
                        ? `rolagem iniciativa: d20 ${e.d20} + agilidade ${e.agilidade} = ${e.valor}`
                        : 'rolagem iniciativa'
                    }
                  >
                    {e.d20 !== undefined && e.agilidade !== undefined ? `${e.d20}+${e.agilidade}` : e.valor}
                  </span>
                </div>
                {souEu && (
                  <div style={{ paddingLeft: '1.1rem' }}>
                    {minhaFicha.armas.length > 0 && <ArmasCombate ficha={minhaFicha} />}
                    <CombatenteResumo
                      nome=""
                      cor={minhaFicha.corVisual}
                      pvAtual={minhaFicha.pvAtual}
                      pvMaximo={pvMaximo}
                      defesa={defesa}
                      surtoAtivo={surtoAtivo}
                      surtoEscolha={surtoEscolha}
                      editavel
                      hideDot
                      onAjustarPv={(d) => ajustarPvAtual(minhaFicha.id, minhaFicha.pvAtual + d)}
                    />
                    <div style={{ marginTop: '0.5rem' }}>
                      <span className="combate-rotulo">condições</span>
                      <div className="combate-condicoes">
                        {CONDICOES_COMBATE.filter((c) => condicoesCombate?.[minhaFicha.id]?.includes(c.id)).map((c) => {
                          const restantes = condicaoDuracao?.[minhaFicha.id]?.[c.id];
                          return (
                            <span
                              key={c.id}
                              className="combate-chip combate-chip--ativa"
                              title={restantes === undefined ? c.efeito : `${c.efeito} (${restantes} rodada${restantes === 1 ? '' : 's'} restante${restantes === 1 ? '' : 's'})`}
                              style={{ cursor: 'default' }}
                            >
                              {nomeCondicao(c.id)}
                              {restantes !== undefined && ` (${restantes})`}
                            </span>
                          );
                        })}
                        {(condicoesCombate?.[minhaFicha.id]?.length ?? 0) === 0 && <span className="vazio">nenhuma condição ativa.</span>}
                      </div>
                    </div>
                    <div style={{ marginTop: '0.4rem' }}>
                      <span className="combate-rotulo">defesa</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ color: 'var(--real)', display: 'inline-flex' }}><IconeEscudo size={12} /></span>
                        <button
                          className="icone-botao"
                          onClick={() => atualizarFicha(minhaFicha.id, { equipamentoModificadorDefesa: (minhaFicha.equipamentoModificadorDefesa ?? 0) - 1 })}
                          style={{ minWidth: 34, minHeight: 34, padding: 0, fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          −
                        </button>
                        <span className="mono" style={{ fontSize: 11, minWidth: 20, textAlign: 'center' }}>{defesa}</span>
                        <button
                          className="icone-botao"
                          onClick={() => atualizarFicha(minhaFicha.id, { equipamentoModificadorDefesa: (minhaFicha.equipamentoModificadorDefesa ?? 0) + 1 })}
                          style={{ minWidth: 34, minHeight: 34, padding: 0, fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  if (semMoldura) return conteudo;
  return <section className="secao">{conteudo}</section>;
}
