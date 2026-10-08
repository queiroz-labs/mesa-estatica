import { calcularPvMaximo, calcularSanidadeMaxima, calcularTierRuido } from '../../../rules/derivados';
import { surtosAtivosNaSessao } from '../../../rules/surto';
import { descricaoSurto } from '../../../rules/data/surto';
import { corPv } from '../../../hooks/useIniciativa';
import { NOME_TIER_RUIDO } from '../../ruido/RuidoOverlay';
import { useStore } from '../../../state/store';
import BarraSegmentada from '../../fichas/BarraSegmentada';

const COR_TIER_RUIDO: Record<0 | 1 | 2 | 3, string> = {
  0: 'var(--ink)',
  1: 'var(--ink)',
  2: 'var(--real)',
  3: 'var(--ruido)',
};

/** Card compacto do próprio status pro jogador: PV/Sanidade/Determinação/Trauma/Surto da
 *  PRÓPRIA ficha, sem trocar pra aba Personagens. `s.fichas` no bundle do jogador só contém a
 *  própria ficha (useMinhaFicha) — sem risco de expor dados de outros PCs. `SessaoPublicaView`
 *  é montada sempre, mesmo sem ficha vinculada ainda, então este componente se defende sozinho.
 *
 *  Layout espelha os `.derivado-card`/`.alerta-banner`/`.badge` já usados no editor de ficha
 *  (`AtributosDerivadosSection.tsx`) em vez de inventar visual novo — vida/sanidade viram tiles
 *  com rótulo+barra juntos (antes eram uma sigla solta numa linha e a barra sem legenda embaixo,
 *  sem nada ligando as duas), surto ativo vira banner destacado em vez de um badge fácil de
 *  não notar, e determinação/trauma ficam em badges com o nome por extenso. */
export default function MeuStatusSection() {
  const fichaAtivaId = useStore((s) => s.fichaAtivaId);
  const ficha = useStore((s) => s.fichas.find((f) => f.id === s.fichaAtivaId) ?? null);
  const basePV = useStore((s) => s.config.basePV);
  const modoCombate = useStore((s) => s.sessaoPublica.modoCombate);
  const contadorCena = useStore((s) => s.sessaoPublica.contadorCena);
  const rodada = useStore((s) => s.sessaoPublica.rodada);

  if (!fichaAtivaId || !ficha) return null;

  const pvMaximo = calcularPvMaximo(basePV, ficha.atributos.vigor);
  const sanidadeMaxima = calcularSanidadeMaxima(ficha.atributos.vontade);
  const tierRuido = calcularTierRuido(ficha.sanidadeAtual, sanidadeMaxima);
  const traumasAtivos = ficha.traumas.filter((t) => !t.virouCicatriz).length;
  const surtosVisiveis = surtosAtivosNaSessao(ficha.surtosAtivos, { modoCombate, contadorCena, rodada });
  const abeiraDeSePerder = traumasAtivos >= 3;

  return (
    <section className="secao">
      <h3>meu status</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <div className="derivado-card" data-ferido={ficha.pvAtual < pvMaximo / 2}>
          <div className="derivado-card__label">vida</div>
          <div className="derivado-card__valor">
            {ficha.pvAtual}/{pvMaximo}
          </div>
          <BarraSegmentada
            atual={ficha.pvAtual}
            maximo={pvMaximo}
            variante="pv"
            corPreenchimento={corPv(ficha.pvAtual, pvMaximo)}
            compacta
          />
        </div>

        <div className="derivado-card">
          <div className="derivado-card__label">sanidade</div>
          <div className="derivado-card__valor" style={{ color: COR_TIER_RUIDO[tierRuido] }}>
            {ficha.sanidadeAtual}/{sanidadeMaxima}
          </div>
          <BarraSegmentada atual={ficha.sanidadeAtual} maximo={sanidadeMaxima} variante="sanidade" tier={tierRuido} compacta />
          <div className="vazio" style={{ marginTop: '0.3rem' }}>
            {NOME_TIER_RUIDO[tierRuido]}
          </div>
        </div>
      </div>

      {surtosVisiveis.length > 0 && (
        <div className="alerta-banner mono" style={{ marginTop: '0.6rem', justifyContent: 'flex-start', gap: '0.4rem' }}>
          {surtosVisiveis.map((s) => (
            <span key={s.id} title={s.escolha ? descricaoSurto(s.escolha) : undefined}>
              surto{s.escolha ? `: ${s.escolha}` : ' ativo'}
            </span>
          ))}
        </div>
      )}

      <div className="badges-linha">
        <span className="badge" title="Determinação — gasta pra rerolar um teste ou segurar um Surto até o fim da cena">
          determinação {ficha.determinacao}/2
        </span>
        <span
          className={`badge${abeiraDeSePerder ? ' badge--perigo' : ''}`}
          title={
            abeiraDeSePerder
              ? 'traumas ativos: 3 ou mais — à beira de se perder'
              : `traumas ativos: ${traumasAtivos} (com 3+, à beira de se perder)`
          }
        >
          trauma {traumasAtivos}/3{abeiraDeSePerder ? ' — à beira de se perder' : ''}
        </span>
      </div>
    </section>
  );
}
