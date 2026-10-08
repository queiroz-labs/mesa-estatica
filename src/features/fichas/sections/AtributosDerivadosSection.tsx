import { useState } from 'react';
import {
  calcularAlerta,
  calcularDefesa,
  calcularPvMaximo,
  calcularSanidadeMaxima,
  calcularTierRuido,
  estaFerido,
  metade,
} from '../../../rules/derivados';
import { personagemEstaEmSurto, surtosAtivosNaSessao } from '../../../rules/surto';
import { descricaoSurto } from '../../../rules/data/surto';
import { ATRIBUTOS } from '../../../rules/data/pericias';
import { NOME_TIER_RUIDO } from '../../ruido/RuidoOverlay';
import { useStore } from '../../../state/store';
import BarraSegmentada from '../BarraSegmentada';
import InputNumeroDraft from '../../../components/InputNumeroDraft';
import type { SecaoFichaProps } from '../tipos';

export default function AtributosDerivadosSection({ ficha, onChange, souMestre }: SecaoFichaProps) {
  const basePV = useStore((s) => s.config.basePV);
  const ajustarPvAtual = useStore((s) => s.ajustarPvAtual);
  const ajustarSanidadeAtual = useStore((s) => s.ajustarSanidadeAtual);
  const ajustarDeterminacao = useStore((s) => s.ajustarDeterminacao);
  const modoCombate = useStore((s) => s.sessaoPublica.modoCombate);
  const contadorCena = useStore((s) => s.sessaoPublica.contadorCena);
  const rodada = useStore((s) => s.sessaoPublica.rodada);
  const escolhaSurtoPendente = ficha.surtoPendente ?? null;
  const resolverEscolhaSurtoPendente = useStore((s) => s.resolverEscolhaSurtoPendente);
  const removerSurtoAtivo = useStore((s) => s.removerSurtoAtivo);
  // entrada de `surtosAtivos` correspondente à pendência acima — mesma busca (última com
  // `escolha === null`) que a action `removerSurtoAtivo`/`resolverEscolhaSurtoPendente` já fazem
  // internamente; só precisamos do id aqui pra dar pro botão "remover" do mestre.
  const surtoPendenteId = escolhaSurtoPendente
    ? [...(ficha.surtosAtivos ?? [])].reverse().find((s) => s.escolha === null)?.id ?? null
    : null;
  const [alertas, setAlertas] = useState<string[]>([]);

  const pvMaximo = calcularPvMaximo(basePV, ficha.atributos.vigor);
  const sanidadeMaxima = calcularSanidadeMaxima(ficha.atributos.vontade);
  const defesa = calcularDefesa(ficha.atributos.agilidade, ficha.equipamentoModificadorDefesa);
  const alertaCalc = calcularAlerta(ficha.atributos.percepcao);
  const ferido = estaFerido(ficha.pvAtual, pvMaximo);
  const linhaSanidade = metade(sanidadeMaxima);
  const traumasAtivos = ficha.traumas.filter((t) => !t.virouCicatriz).length;
  const tierRuido = calcularTierRuido(ficha.sanidadeAtual, sanidadeMaxima);
  const surtoAtivoAgora = personagemEstaEmSurto(ficha.surtosAtivos, { modoCombate, contadorCena, rodada });

  const handleSanidade = (valor: number) => {
    const resultado = ajustarSanidadeAtual(ficha.id, valor);
    const novosAlertas: string[] = [];
    if (resultado.cruzouLinhaSanidade) novosAlertas.push('a garoa chia — Sanidade cruzou a metade, marque um Trauma.');
    if (resultado.surtoDisparado) novosAlertas.push('SURTO — role duas vezes; escolha o efeito abaixo.');
    if (novosAlertas.length > 0) setAlertas(novosAlertas);
  };

  return (
    <section className="secao">
      <h3 className="label">Atributos</h3>
      <div className="atributos-grid">
        {ATRIBUTOS.map((a) => (
          <div key={a.id}>
            <label htmlFor={`atr-${a.id}`}>{a.nome}</label>
            <InputNumeroDraft
              id={`atr-${a.id}`}
              min={0}
              max={5}
              value={ficha.atributos[a.id]}
              onCommit={(valor) =>
                onChange({
                  atributos: {
                    ...ficha.atributos,
                    [a.id]: Math.max(0, Math.min(5, valor)),
                  },
                })
              }
            />
          </div>
        ))}
      </div>

      <div className="derivados-grid">
        <div className="derivado-card" data-ferido={ferido}>
          <div className="derivado-card__label">PV</div>
          <div className="derivado-card__valor">{pvMaximo}</div>
          <div className="derivado-card__atual">
            <span className="vazio">atual</span>
            <InputNumeroDraft value={ficha.pvAtual} onCommit={(valor) => ajustarPvAtual(ficha.id, valor)} />
          </div>
          <BarraSegmentada atual={ficha.pvAtual} maximo={pvMaximo} variante="pv" />
          {ferido && <span className="badge badge--perigo" style={{ marginTop: '0.4rem' }}>ferido</span>}
        </div>

        <div className="derivado-card">
          <div className="derivado-card__label">Sanidade (linha: {linhaSanidade})</div>
          <div className="derivado-card__valor">{sanidadeMaxima}</div>
          <div className="derivado-card__atual">
            <span className="vazio">atual</span>
            <InputNumeroDraft value={ficha.sanidadeAtual} onCommit={handleSanidade} />
          </div>
          <BarraSegmentada atual={ficha.sanidadeAtual} maximo={sanidadeMaxima} variante="sanidade" tier={tierRuido} />
          <div className="vazio" style={{ marginTop: '0.3rem' }}>
            sanidade: {NOME_TIER_RUIDO[tierRuido]}
          </div>
        </div>

        <div className="derivado-card">
          <div className="derivado-card__label">Defesa</div>
          <div className="derivado-card__valor">{defesa}</div>
          <div className="derivado-card__atual">
            <span className="vazio">equip.</span>
            <InputNumeroDraft
              value={ficha.equipamentoModificadorDefesa}
              onCommit={(valor) => onChange({ equipamentoModificadorDefesa: valor })}
            />
          </div>
        </div>

        <div className="derivado-card">
          <div className="derivado-card__label">Alerta</div>
          <div className="derivado-card__valor">{alertaCalc}</div>
        </div>
      </div>

      {alertas.map((texto, i) => (
        <div key={i} className="alerta-banner" style={{ marginTop: '0.6rem' }}>
          <span>{texto}</span>
          <button className="icone-botao" onClick={() => setAlertas((prev) => prev.filter((_, j) => j !== i))}>
            ok
          </button>
        </div>
      ))}

      {escolhaSurtoPendente && (
        <div style={{ marginTop: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span className="label" style={{ fontSize: '12px' }}>
              Surto — role duas vezes; escolha qual acontece
            </span>
            {souMestre && surtoPendenteId && (
              <button
                className="icone-botao"
                title="remover este Surto sem aplicar nenhum dos dois lados"
                onClick={() => removerSurtoAtivo(ficha.id, surtoPendenteId)}
              >
                remover
              </button>
            )}
          </div>
          <div className="campos-grid" style={{ marginTop: '0.4rem' }}>
            {(['A', 'B'] as const).map((lado) => {
              const entrada = lado === 'A' ? escolhaSurtoPendente.entradaA : escolhaSurtoPendente.entradaB;
              return (
                <div
                  key={lado}
                  className="alerta-banner mono"
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}
                >
                  <span>
                    d20={entrada.d20} — <strong>{entrada.nome}</strong>
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)' }}>{entrada.descricao}</span>
                  <button className="acento" onClick={() => resolverEscolhaSurtoPendente(ficha.id, lado)}>
                    escolher este
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(traumasAtivos >= 3 || (surtoAtivoAgora && !escolhaSurtoPendente)) && (
        <div className="badges-linha">
          {surtoAtivoAgora && !escolhaSurtoPendente && surtosAtivosNaSessao(ficha.surtosAtivos, { modoCombate, contadorCena, rodada }).map((s) => (
            <span
              key={s.id}
              className="badge"
              style={{ borderColor: 'var(--ruido)', color: 'var(--ruido)' }}
              title={s.escolha ? descricaoSurto(s.escolha) : undefined}
            >
              surto{s.escolha ? `: ${s.escolha}` : ' ativo'}
              {souMestre && (
                <button
                  className="icone-botao"
                  title="remover este Surto"
                  onClick={() => removerSurtoAtivo(ficha.id, s.id)}
                  style={{ marginLeft: '0.3rem' }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {traumasAtivos >= 3 && <span className="badge badge--perigo">à beira de se perder — 3+ traumas</span>}
        </div>
      )}

      <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
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
    </section>
  );
}
