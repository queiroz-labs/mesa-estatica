import { useEffect, useState } from 'react';
import { useStore } from '../../../state/store';
import BarraSegmentada from '../../fichas/BarraSegmentada';
import { tierDeGauge } from '../AlertaOverlay';
import BadgePrivado from '../../../components/BadgePrivado';

function formatarDuracao(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}

/** §3 — Estado da mesa [Privado]: indicadores de ritmo — mostrar a jogadores seria metagame. */
export default function EstadoMesaSection() {
  const sessaoPrivada = useStore((s) => s.sessaoPrivada);
  const atualizarSessaoPrivada = useStore((s) => s.atualizarSessaoPrivada);
  const iniciarSessaoTimer = useStore((s) => s.iniciarSessaoTimer);
  const encerrarSessaoTimer = useStore((s) => s.encerrarSessaoTimer);

  const { iniciadaEm } = sessaoPrivada.estatisticas ?? {};
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    if (!iniciadaEm) return;
    const tick = () => {
      if (document.visibilityState === 'visible') setAgora(Date.now());
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iniciadaEm]);

  const TIER_GAUGE_NOME: Record<0 | 1 | 2 | 3, { label: string; icone: string }> = {
    0: { label: 'normal', icone: '○' },
    1: { label: 'atenção', icone: '◔' },
    2: { label: 'crítico', icone: '◕' },
    3: { label: 'colapso', icone: '●' },
  };

  // Tensão fica sem reflexo (decisão do usuário) — só Ruído narrativo/Ameaça acionam o
  // AlertaOverlay no site inteiro; `comReflexo` reforça o mesmo tier localmente na barra.
  const gauges: { label: string; campo: 'tensao' | 'ruidoNarrativo' | 'ameaca'; comReflexo: boolean }[] = [
    { label: 'Tensão', campo: 'tensao', comReflexo: false },
    { label: 'Ruído narrativo', campo: 'ruidoNarrativo', comReflexo: true },
    { label: 'Ameaça', campo: 'ameaca', comReflexo: true },
  ];

  return (
    <section className="secao">
      <h3>
        estado da mesa <BadgePrivado />
      </h3>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span className="mono" style={{ fontSize: '13px' }}>
          {iniciadaEm ? `sessão em andamento — ${formatarDuracao(agora - new Date(iniciadaEm).getTime())}` : 'sessão não iniciada'}
        </span>
        {iniciadaEm ? (
          <button className="icone-botao perigo" onClick={encerrarSessaoTimer}>
            encerrar
          </button>
        ) : (
          <button className="icone-botao acento" onClick={iniciarSessaoTimer}>
            iniciar sessão
          </button>
        )}
      </div>

      {gauges.map(({ label, campo, comReflexo }) => {
        const valor = sessaoPrivada[campo];
        const tier = comReflexo ? tierDeGauge(valor) : 0;
        const nomeTier = TIER_GAUGE_NOME[tier];
        return (
          <div key={campo} style={{ marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor={`gauge-${campo}`}>
                {label} — {valor}%
              </label>
              {comReflexo && (
                <span
                  className="mono"
                  style={{
                    fontSize: '11px',
                    color: tier >= 2 ? 'var(--ruido)' : tier >= 1 ? 'var(--real)' : 'var(--ink-faint)',
                  }}
                >
                  {nomeTier.icone} {nomeTier.label}
                </span>
              )}
            </div>
            <input
              id={`gauge-${campo}`}
              type="range"
              min={0}
              max={100}
              value={valor}
              onChange={(e) => atualizarSessaoPrivada({ [campo]: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <BarraSegmentada atual={valor} maximo={100} variante="gauge" passoTick={25} tier={tier} />
          </div>
        );
      })}
    </section>
  );
}
