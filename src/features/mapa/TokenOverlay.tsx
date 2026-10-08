import { useEffect, useState } from 'react';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';
import InputNumeroDraft from '../../components/InputNumeroDraft';
import { comprimirImagemAvatar } from '../../lib/comprimirImagem';
import { uploadImagemStorage } from '../../multiplayer/uploadImagemStorage';
import { calcularEstadoTokenCombate } from '../../rules/combate';
import { calcularDefesa, calcularPvMaximo, calcularSanidadeMaxima } from '../../rules/derivados';
import { PERICIAS } from '../../rules/data/pericias';
import { descricaoSurto } from '../../rules/data/surto';
import { surtosAtivosNaSessao } from '../../rules/surto';
import { useStore } from '../../state/store';
import type { Ficha } from '../../state/types';
import { NOMES_TIPO_REGULADOR } from '../fichas/sections/ReguladoresSection';
import { CONDICOES_COMBATE } from '../../rules/data/condicoesCombate';
import ArmasCombateNpc from '../combate/ArmasCombateNpc';
import { IconeLamina } from '../combate/icones';

const EMPTY_CONDICOES: string[] = [];
const EMPTY_DURACAO: Record<string, number> = {};

interface Props {
  tipo: 'pc' | 'npc';
  id: string;
  onFechar: () => void;
}

interface StepperProps {
  label: string;
  atual: number;
  maximo: number;
  onAjustar: (delta: number) => void;
}

function StepperLinha({ label, atual, maximo, onAjustar }: StepperProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
      <span className="vazio">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <button className="controle-icone" onClick={() => onAjustar(-1)} aria-label={`reduzir ${label}`} title={`reduzir ${label}`}>
          −
        </button>
        <span className="mono">
          {atual} / {maximo}
        </span>
        <button className="controle-icone" onClick={() => onAjustar(1)} aria-label={`aumentar ${label}`} title={`aumentar ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

const Separador = () => <div style={{ borderTop: '1px solid var(--concrete-2)', margin: '0.6rem 0' }} />;

function truncar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}


function resumoProtecao(ficha: Ficha): string {
  if (ficha.equipamentoModificadorDefesa === 0) return 'nenhuma';
  if (ficha.equipamentoProtecaoNome) return `${ficha.equipamentoProtecaoNome} (+${ficha.equipamentoModificadorDefesa} defesa)`;
  return `+${ficha.equipamentoModificadorDefesa} defesa`;
}

function resumoRegulador(ficha: Ficha): string {
  if (ficha.anestesiaAte !== null) return 'anestesia ativa';
  if (ficha.reguladores.length === 0) return 'nenhum';
  const ultima = ficha.reguladores[0];
  return `ativo — ${NOMES_TIPO_REGULADOR[ultima.tipo]} (cena ${ultima.sessao})`;
}

/** Perícias treinadas (grau 3) e veteranas (grau 6) — pra decidir um teste rápido sem abrir a
 *  ficha inteira. */
function resumoPericias(pericias: Ficha['pericias']): { treinadas: string; veteranas: string } {
  const nomesPorGrau = (grau: 3 | 6) =>
    PERICIAS.filter((p) => pericias[p.id] === grau)
      .map((p) => p.nome)
      .join(', ');
  return { treinadas: nomesPorGrau(3), veteranas: nomesPorGrau(6) };
}

/** Overlay de detalhes/ajuste rápido — abre ao CLICAR num token (não arrastar, ver MapaTab),
 *  fecha por X, clique fora, ou Esc. Escreve direto no Zustand — reflete na aba Personagens/NPCs
 *  e vice-versa (mesa-estatica-multiplayer-completo.md Parte II §1). PC ganha um resumo compacto
 *  (surto/trauma ativos, acessos, neuro-regulador, itens, armas, proteção) pra não precisar abrir
 *  a ficha inteira no meio da cena (correcoes-parte2.md item 12). */
export default function TokenOverlay({ tipo, id, onFechar }: Props) {
  const ficha = useStore((s) => (tipo === 'pc' ? s.fichas.find((f) => f.id === id) : undefined));
  const npc = useStore((s) => (tipo === 'npc' ? s.npcs.find((n) => n.id === id) : undefined));
  const basePV = useStore((s) => s.config.basePV);
  const ajustarPvAtual = useStore((s) => s.ajustarPvAtual);
  const ajustarSanidadeAtual = useStore((s) => s.ajustarSanidadeAtual);
  const ajustarDeterminacao = useStore((s) => s.ajustarDeterminacao);
  const atualizarNpc = useStore((s) => s.atualizarNpc);
  const modoCombate = useStore((s) => s.sessaoPublica.modoCombate);
  const contadorCena = useStore((s) => s.sessaoPublica.contadorCena);
  const rodada = useStore((s) => s.sessaoPublica.rodada);
  const turnoAtualId = useStore((s) => s.sessaoPublica.turnoAtualId);
  const iniciativa = useStore((s) => s.iniciativa);
  const condicoesAtivas = useStore((s) => s.sessaoPublica.condicoesCombate[id] ?? EMPTY_CONDICOES);
  const condicaoDuracao = useStore((s) => s.sessaoPublica.condicaoDuracao?.[id] ?? EMPTY_DURACAO);
  const alternarCondicaoCombate = useStore((s) => s.alternarCondicaoCombate);
  const definirDuracaoCondicao = useStore((s) => s.definirDuracaoCondicao);
  const atualizarFicha = useStore((s) => s.atualizarFicha);
  const [comprimindoFoto, setComprimindoFoto] = useState(false);

  // mesmo fluxo de NpcsTab.tsx (handleFoto) — pinta local otimista com a dataUrl comprimida,
  // depois sobe pro Storage e substitui pela URL real quando disponível. Só 1 NPC por vez aqui
  // (o popover é modal), então um boolean simples basta — NpcsTab precisa de um Set de ids
  // porque lida com vários cards ao mesmo tempo.
  const handleFotoNpc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo || !npc) return;
    setComprimindoFoto(true);
    try {
      const { dataUrl, blob } = await comprimirImagemAvatar(arquivo);
      atualizarNpc(npc.id, { foto: dataUrl });
      const { url } = await uploadImagemStorage(`npcs/${npc.id}`, blob);
      if (url) atualizarNpc(npc.id, { foto: url });
    } catch {
      window.alert('sinal corrompido — não foi possível ler essa imagem.');
    } finally {
      setComprimindoFoto(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onFechar]);

  if (tipo === 'pc' && !ficha) return null;
  if (tipo === 'npc' && !npc) return null;

  const traumasAtivos = ficha?.traumas.filter((t) => !t.virouCicatriz) ?? [];
  const surtosVisiveis = surtosAtivosNaSessao(ficha?.surtosAtivos ?? [], { modoCombate, contadorCena, rodada });
  const emSurto = surtosVisiveis.length > 0;
  const turnoAtivo = modoCombate && iniciativa.find((e) => e.id === turnoAtualId)?.participanteId === id;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-backdrop)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onFechar}
    >
      <div className="secao" style={{ width: 'min(320px, calc(100vw - 2rem))', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
            <Avatar
              nome={tipo === 'pc' ? ficha!.nome : npc!.nome}
              cor={tipo === 'pc' ? ficha!.corVisual : npc!.corVisual}
              foto={tipo === 'pc' ? ficha!.foto : npc!.foto}
              silhueta={tipo === 'npc' ? npc!.silhueta : null}
              bordaCor={tipo === 'pc' ? ficha!.corVisual : npc!.corVisual}
              tamanho={52}
              ampliavel
            />
            <h3 style={{ margin: 0 }}>{(tipo === 'pc' ? ficha!.nome : npc!.nome) || 'sem nome'}</h3>
          </div>
          <button className="controle-icone" onClick={onFechar} title="fechar (Esc)" aria-label="fechar detalhes do token">
            <Icone nome="fechar" />
          </button>
        </div>

        {tipo === 'pc' && ficha && (
          <>
            <StepperLinha
              label="PV"
              atual={ficha.pvAtual}
              maximo={calcularPvMaximo(basePV, ficha.atributos.vigor)}
              onAjustar={(d) => ajustarPvAtual(ficha.id, ficha.pvAtual + d)}
            />
            {(() => {
              const { morto, desacordado } = calcularEstadoTokenCombate(
                ficha.pvAtual,
                calcularPvMaximo(basePV, ficha.atributos.vigor),
                condicoesAtivas,
              );
              if (morto) {
                return (
                  <div className="mono" style={{ color: 'var(--ruido)', marginTop: '-0.3rem', marginBottom: '0.5rem' }}>
                    morto
                  </div>
                );
              }
              if (desacordado) {
                return (
                  <div className="mono" style={{ color: 'var(--ruido)', marginTop: '-0.3rem', marginBottom: '0.5rem' }}>
                    desacordado
                  </div>
                );
              }
              return null;
            })()}
            <StepperLinha
              label="Sanidade"
              atual={ficha.sanidadeAtual}
              maximo={calcularSanidadeMaxima(ficha.atributos.vontade)}
              onAjustar={(d) => ajustarSanidadeAtual(ficha.id, ficha.sanidadeAtual + d)}
            />
            <div style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className="label" style={{ fontSize: '12px' }}>
                Determinação
              </span>
              {[1, 2].map((n) => (
                <label key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={ficha.determinacao >= n}
                    onChange={() => ajustarDeterminacao(ficha.id, ficha.determinacao >= n ? n - 1 : n)}
                  />
                  <span>nível {n}</span>
                </label>
              ))}
            </div>

            <div className="vazio" style={{ fontSize: 12, textAlign: 'center', marginTop: '0.5rem', color: 'var(--real)' }}>
              <Icone nome="escudo" /> defesa: <span className="mono">{calcularDefesa(ficha.atributos.agilidade, ficha.equipamentoModificadorDefesa)}</span>
            </div>

            <div style={{ marginTop: '0.6rem' }}>
              <label className="vazio" style={{ fontSize: 11, display: 'block', marginBottom: '0.25rem' }}>
                observações de combate
              </label>
              <textarea
                rows={2}
                placeholder="ex.: tiro no pé direito, proteção danificada…"
                value={ficha.observacaoCombate ?? ''}
                onChange={(e) => atualizarFicha(ficha.id, { observacaoCombate: e.target.value })}
                style={{ width: '100%', minHeight: '2.5em', fontSize: 12 }}
              />
            </div>

            {(emSurto || traumasAtivos.length > 0) && (
              <>
                <Separador />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {surtosVisiveis.map((s) => (
                    <span
                      key={s.id}
                      className="badge"
                      style={{ borderColor: 'var(--ruido)', color: 'var(--ruido)', alignSelf: 'flex-start' }}
                      title={s.escolha ? descricaoSurto(s.escolha) : undefined}
                    >
                      surto{s.escolha ? `: ${s.escolha}` : ' ativo — aguardando escolha'}
                    </span>
                  ))}
                  {traumasAtivos.map((t) => (
                    <span key={t.id} className="badge" style={{ alignSelf: 'flex-start' }} title={t.resposta}>
                      trauma: {t.nome || 'sem nome'}
                      {t.gatilho ? ` — ${t.gatilho}` : ''}
                    </span>
                  ))}
                </div>
              </>
            )}

            <Separador />
            <div className="vazio mono" style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {(() => {
                const { treinadas, veteranas } = resumoPericias(ficha.pericias);
                if (!treinadas && !veteranas) return <span>perícias: nenhuma treinada</span>;
                return (
                  <>
                    {treinadas && <span>treinado: {treinadas}</span>}
                    {veteranas && <span>veterano: {veteranas}</span>}
                  </>
                );
              })()}
              <span>
                acessos: {ficha.acessos} · neuro-regulador: {resumoRegulador(ficha)}
              </span>
              <span>itens: {ficha.outrosItens ? truncar(ficha.outrosItens, 60) : 'nenhum'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                armas:
                {ficha.armas.length === 0 ? ' nenhuma' : ficha.armas.map((a) => (
                  <span
                    key={a.id}
                    className="badge"
                    style={{ fontSize: 12 }}
                    title={`${a.nome || 'sem nome'}${a.bonusAtaque ? ` · bônus: ${a.bonusAtaque}` : ''}${a.dano ? ` · dano: ${a.dano}` : ''}${a.alcance ? ` · alcance: ${a.alcance}` : ''}${a.nota ? ` · ${a.nota}` : ''}`}
                  >
                    <IconeLamina /> {a.nome || 'sem nome'}
                  </span>
                ))}
              </span>
              <span>proteção: {resumoProtecao(ficha)}</span>
            </div>
          </>
        )}

          {tipo === 'npc' && npc && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <label className="mapa-upload-botao" style={{ fontSize: 12 }}>
                {comprimindoFoto ? 'comprimindo…' : npc.foto ? 'trocar foto' : 'carregar foto'}
                <input type="file" accept="image/*" hidden onChange={handleFotoNpc} disabled={comprimindoFoto} />
              </label>
              {npc.foto && (
                <button className="controle-icone" onClick={() => atualizarNpc(npc.id, { foto: null })} title="remover foto" aria-label="remover foto do NPC">
                  <Icone nome="lixeira" />
                </button>
              )}
              <button
                className="controle-icone"
                onClick={() => atualizarNpc(npc.id, { visivel: !npc.visivel })}
                aria-label={npc.visivel ? 'ocultar dos jogadores' : 'revelar aos jogadores'}
                aria-pressed={npc.visivel}
                title={npc.visivel ? 'ocultar dos jogadores' : 'revelar aos jogadores'}
                style={{ color: npc.visivel ? 'var(--rede)' : 'var(--ink-dim)', marginLeft: 'auto' }}
              >
                <Icone nome={npc.visivel ? 'olho' : 'olho-fechado'} />
              </button>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
            <span className="vazio" style={{ fontSize: 12, color: 'var(--real)' }}><Icone nome="escudo" /> defesa: <span className="mono">{npc.defesa}</span></span>
            </div>
            {(() => {
              const { morto, desacordado } = calcularEstadoTokenCombate(npc.pvAtual, npc.pvMaximo, condicoesAtivas);
              if (morto) {
                return (
                  <div className="mono" style={{ color: 'var(--ruido)', marginBottom: '0.5rem' }}>
                    morto
                  </div>
                );
              }
              if (desacordado) {
                return (
                  <div className="mono" style={{ color: 'var(--ruido)', marginBottom: '0.5rem' }}>
                    desacordado
                  </div>
                );
              }
              return null;
            })()}
            <ArmasCombateNpc npc={npc} />
            <div className="campos-grid">
              <div>
                <label htmlFor="ov-npc-pv">PV atual</label>
                <InputNumeroDraft id="ov-npc-pv" value={npc.pvAtual} onCommit={(valor) => atualizarNpc(npc.id, { pvAtual: valor })} />
              </div>
              <div>
                <label htmlFor="ov-npc-pvmax">PV máximo</label>
                <InputNumeroDraft id="ov-npc-pvmax" value={npc.pvMaximo} onCommit={(valor) => atualizarNpc(npc.id, { pvMaximo: valor })} />
              </div>
              <div>
                <label htmlFor="ov-npc-defesa">Defesa</label>
                <InputNumeroDraft id="ov-npc-defesa" value={npc.defesa} onCommit={(valor) => atualizarNpc(npc.id, { defesa: valor })} />
              </div>
              <div>
                <label htmlFor="ov-npc-agi">Agilidade</label>
                <InputNumeroDraft id="ov-npc-agi" value={npc.agilidade} onCommit={(valor) => atualizarNpc(npc.id, { agilidade: valor })} />
              </div>
            </div>
            <textarea
              placeholder="notas — comportamento, gatilho, o que ele quer"
              value={npc.notas}
              onChange={(e) => atualizarNpc(npc.id, { notas: e.target.value })}
              style={{ marginTop: '0.4rem', minHeight: '3em' }}
            />
          </>
        )}

        {modoCombate && (
          <>
            <Separador />
            {turnoAtivo && (
              <span className="badge" style={{ borderColor: 'var(--rede)', color: 'var(--rede)', alignSelf: 'flex-start', marginBottom: '0.35rem' }}>
                ▶ vez dele
              </span>
            )}
            <div className="combate-condicoes">
              {CONDICOES_COMBATE.map((c) => {
                const ligada = condicoesAtivas.includes(c.id);
                const rodadasRestantes = condicaoDuracao[c.id];
                return (
                  <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                    <button
                      className={`combate-chip${ligada ? ' combate-chip--ativa' : ''}`}
                      title={rodadasRestantes !== undefined ? `${c.efeito} (${rodadasRestantes} rodada${rodadasRestantes === 1 ? '' : 's'} restante${rodadasRestantes === 1 ? '' : 's'})` : c.efeito}
                      onClick={() => alternarCondicaoCombate(id, c.id)}
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
                            aria-label={`reduzir duração de ${c.nome}`}
                            onClick={() => definirDuracaoCondicao(id, c.id, rodadasRestantes - 1)}
                            style={{ fontSize: 12 }}
                          >
                            −
                          </button>
                        )}
                        <button
                          className="icone-botao"
                          title="duração em rodadas — desliga sozinha quando chegar a 0 no fim do turno dela (mesmo mecanismo de Aguardando)"
                          aria-label={`aumentar duração de ${c.nome}`}
                          onClick={() => definirDuracaoCondicao(id, c.id, (rodadasRestantes ?? 0) + 1)}
                          style={{ fontSize: 12 }}
                        >
                          +
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
