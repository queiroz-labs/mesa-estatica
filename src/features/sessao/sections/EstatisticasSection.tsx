import { useStore } from '../../../state/store';
import BadgePrivado from '../../../components/BadgePrivado';

/** §6 — Estatísticas da sessão [Privado]. Personagens/NPCs/rolagens/surtos são derivados
 *  (contagem de arrays e contadores já mantidos pelo store); mortes não tem gatilho automático
 *  (sem regra de morte em regras.md) — é ajustada manualmente. */
export default function EstatisticasSection() {
  const totalFichas = useStore((s) => s.fichas.length);
  const totalNpcs = useStore((s) => s.npcs.length);
  const estatisticas = useStore((s) => s.sessaoPrivada.estatisticas);
  const ajustarMortes = useStore((s) => s.ajustarMortes);

  return (
    <section className="secao">
      <h3>
        estatísticas da sessão <BadgePrivado />
      </h3>
      <div className="campos-grid mono" style={{ fontSize: '13px' }}>
        <span>Personagens: {totalFichas}</span>
        <span>NPCs: {totalNpcs}</span>
        <span>Rolagens: {estatisticas?.rolagens ?? 0}</span>
        <span>Surtos: {estatisticas?.surtos ?? 0}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          Mortes: {estatisticas?.mortes ?? 0}
          <button className="icone-botao" onClick={() => ajustarMortes(-1)}>
            −
          </button>
          <button className="icone-botao" onClick={() => ajustarMortes(1)}>
            +
          </button>
        </span>
      </div>
    </section>
  );
}
