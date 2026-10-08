import { calcularPvMaximo, calcularSanidadeMaxima, calcularTierRuido } from '../../../rules/derivados';
import { personagemEstaEmSurto } from '../../../rules/surto';
import { corPv } from '../../../hooks/useIniciativa';
import { NOME_TIER_RUIDO } from '../../ruido/RuidoOverlay';
import { useStore } from '../../../state/store';
import BarraSegmentada from '../../fichas/BarraSegmentada';
import BadgePrivado from '../../../components/BadgePrivado';

const COR_TIER_RUIDO: Record<0 | 1 | 2 | 3, string> = {
  0: 'var(--ink)',
  1: 'var(--ink)',
  2: 'var(--real)',
  3: 'var(--ruido)',
};

/** Status do grupo [Privado]: leitura rápida de PV/Sanidade/Determinação/Trauma/Surto de cada
 *  ficha da mesa, sem precisar abrir a aba Personagens uma a uma. Tudo derivado — nenhum campo
 *  novo no store, mesmos cálculos de AtributosDerivadosSection.tsx.
 *
 *  Layout segue o mesmo princípio que `MeuStatusSection.tsx` já validou pro jogador: rótulo
 *  colado na própria barra, não numa linha solta separada (antes "PV"/"SAN" ficavam num resumo
 *  em cima e as duas barras embaixo, sem nada ligando visualmente qual sigla era qual barra).
 *  Aqui não dá pra usar os `.derivado-card` cheios (density baixa demais pra uma lista de vários
 *  personagens, arte.md pede painel denso) — cada barra vira uma linha própria com rótulo+valor
 *  ao lado, compacto o bastante pra continuar sendo "leitura rápida". */
export default function StatusGrupoSection() {
  const fichas = useStore((s) => s.fichas);
  const basePV = useStore((s) => s.config.basePV);
  const modoCombate = useStore((s) => s.sessaoPublica.modoCombate);
  const contadorCena = useStore((s) => s.sessaoPublica.contadorCena);
  const rodada = useStore((s) => s.sessaoPublica.rodada);

  return (
    <section className="secao">
      <h3>
        status do grupo <BadgePrivado />
      </h3>
      {fichas.length === 0 ? (
        <p className="vazio">nenhum personagem na mesa ainda.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {fichas.map((ficha, i) => {
            const pvMaximo = calcularPvMaximo(basePV, ficha.atributos.vigor);
            const sanidadeMaxima = calcularSanidadeMaxima(ficha.atributos.vontade);
            const tierRuido = calcularTierRuido(ficha.sanidadeAtual, sanidadeMaxima);
            const traumasAtivos = ficha.traumas.filter((t) => !t.virouCicatriz).length;
            const abeiraDeSePerder = traumasAtivos >= 3;
            const emSurto = personagemEstaEmSurto(ficha.surtosAtivos, { modoCombate, contadorCena, rodada });

            return (
              <div
                key={ficha.id}
                className="mono"
                style={{
                  fontSize: '13px',
                  padding: '0.6rem 0',
                  borderTop: i > 0 ? '1px solid var(--concrete-2)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span
                      aria-hidden
                      style={{ background: ficha.corVisual, width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }}
                    />
                    {ficha.nome || 'sem nome'}
                  </span>
                  <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge" title="Determinação — gasta pra rerolar um teste ou segurar um Surto até o fim da cena">
                      det {ficha.determinacao}/2
                    </span>
                    <span
                      className={`badge${abeiraDeSePerder ? ' badge--perigo' : ''}`}
                      title={
                        abeiraDeSePerder
                          ? 'traumas ativos: 3 ou mais — à beira de se perder'
                          : `traumas ativos: ${traumasAtivos} de 3 (3+ é "à beira de se perder")`
                      }
                    >
                      trm {traumasAtivos}/3
                    </span>
                    {emSurto && (
                      <span
                        className="badge badge--perigo"
                        title="surto ativo agora — efeito especial em jogo"
                      >
                        surto
                      </span>
                    )}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <span className="label" style={{ fontSize: '12px', width: '2.4em', flexShrink: 0 }}>
                    pv
                  </span>
                  <div style={{ flex: 1 }} title={`Pontos de Vida: ${ficha.pvAtual} de ${pvMaximo}`}>
                    <BarraSegmentada
                      atual={ficha.pvAtual}
                      maximo={pvMaximo}
                      variante="pv"
                      corPreenchimento={corPv(ficha.pvAtual, pvMaximo)}
                      compacta
                    />
                  </div>
                  <span style={{ flexShrink: 0, minWidth: '3.6em', textAlign: 'right' }}>
                    {ficha.pvAtual}/{pvMaximo}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                  <span className="label" style={{ fontSize: '12px', width: '2.4em', flexShrink: 0 }}>
                    san
                  </span>
                  <div
                    style={{ flex: 1 }}
                    title={`Sanidade: ${ficha.sanidadeAtual} de ${sanidadeMaxima} — ${NOME_TIER_RUIDO[tierRuido]}`}
                  >
                    <BarraSegmentada atual={ficha.sanidadeAtual} maximo={sanidadeMaxima} variante="sanidade" tier={tierRuido} compacta />
                  </div>
                  <span style={{ flexShrink: 0, textAlign: 'right', color: COR_TIER_RUIDO[tierRuido] }}>
                    {ficha.sanidadeAtual}/{sanidadeMaxima}{' '}
                    <span style={{ fontSize: '12px', color: 'var(--ink-dim)' }}>{NOME_TIER_RUIDO[tierRuido]}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
