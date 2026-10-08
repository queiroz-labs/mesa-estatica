import { useCallback, useEffect, useRef, useState } from 'react';
import Icone from '../../components/Icone';
import { useIniciativa } from '../../hooks/useIniciativa';
import { gerarResumoCombate } from '../../rules/combate';
import { useStore } from '../../state/store';
import { IconeCheck, IconePrancheta, IconeSeta } from '../combate/icones';
import CombatLogView from '../iniciativa/CombatLogView';
import IniciativaPanel from '../iniciativa/IniciativaPanel';

export default function CombatOverlay() {
  const iniciativa = useIniciativa();
  const { modoCombate, turnoAtualId, avancarTurno, voltarTurno } = iniciativa;
  const numeroSessao = useStore((s) => s.sessaoPublica.numeroSessao);

  const [aberto, setAberto] = useState(false);
  const [vista, setVista] = useState<'iniciativa' | 'log'>('iniciativa');
  const [copiado, setCopiado] = useState(false);

  const toggleAberto = () => {
    setPanelPos({ x: 8, y: 8 });
    setAberto(!aberto);
  };
  const [panelPos, setPanelPos] = useState({ x: 8, y: 8 });
  const [arrastando, setArrastando] = useState<{ origemX: number; origemY: number; painelX: number; painelY: number } | null>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const area = document.querySelector('.mapa-area');
    if (!area || !painelRef.current) return;
    const rect = area.getBoundingClientRect();
    const larguraPainel = painelRef.current.offsetWidth;
    const maxX = rect.width - larguraPainel - 8;
    setPanelPos((prev) => ({ x: Math.max(0, Math.min(prev.x, maxX)), y: prev.y }));
  }, [aberto, iniciativa.modoCombate]);

  const iniciarArrasto = (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    setArrastando({ origemX: ev.clientX, origemY: ev.clientY, painelX: panelPos.x, painelY: panelPos.y });
  };

  const moverArrasto = useCallback((ev: PointerEvent) => {
    if (!arrastando) return;
    const area = document.querySelector('.mapa-area');
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const dx = ev.clientX - arrastando.origemX;
    const dy = ev.clientY - arrastando.origemY;
    const alturaPainel = painelRef.current?.parentElement?.offsetHeight ?? 200;
    const larguraPainel = painelRef.current?.offsetWidth ?? 380;
    const maxX = rect.width - larguraPainel - 8;
    const maxY = rect.height - Math.min(alturaPainel + 8, rect.height - 8);
    setPanelPos({
      x: Math.max(0, Math.min(arrastando.painelX + dx, maxX)),
      y: Math.max(8, Math.min(arrastando.painelY + dy, maxY)),
    });
  }, [arrastando]);

  const soltarArrasto = useCallback(() => {
    setArrastando(null);
  }, []);

  useEffect(() => {
    if (!arrastando) return;
    window.addEventListener('pointermove', moverArrasto);
    window.addEventListener('pointerup', soltarArrasto);
    return () => {
      window.removeEventListener('pointermove', moverArrasto);
      window.removeEventListener('pointerup', soltarArrasto);
    };
  }, [arrastando, moverArrasto, soltarArrasto]);

  // auto-scroll pro card de quem está na vez ao avançar turno — sem isso, o card ativo (já
  // expandido sozinho, ver IniciativaPanel.tsx) some da vista em listas de combate longas.
  useEffect(() => {
    if (!aberto || !modoCombate) return;
    const el = painelRef.current?.querySelector('[data-ativo="true"]');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [aberto, modoCombate, turnoAtualId]);

  // espaço/n avançam o turno — o GM decide rápido sem precisar mirar o botão "próximo" com o
  // mouse; ignorado enquanto o foco está num campo de texto (mesmo remédio de App.tsx).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!modoCombate) return;
      const alvo = e.target as HTMLElement | null;
      const digitando =
        alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable);
      if (digitando || e.ctrlKey || e.altKey || e.metaKey) return;
      // espaço num <button> focado já ativa esse botão nativamente (Enter/Espaço = clique) —
      // sem essa guarda, clicar em "▶ próximo" (que fica com foco) e depois apertar espaço
      // avança o turno DUAS vezes numa tecla só: uma nativa, outra aqui.
      if (e.key === ' ' && alvo?.tagName === 'BUTTON') return;
      if (e.key === ' ' || e.key.toLowerCase() === 'n') {
        e.preventDefault();
        avancarTurno();
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        voltarTurno();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modoCombate, avancarTurno, voltarTurno]);

  const indiceAtual = iniciativa.iniciativa.findIndex((e) => e.id === turnoAtualId);
  const combatenteAtual = modoCombate && indiceAtual >= 0 ? iniciativa.iniciativa[indiceAtual] : null;
  const proximoIndice =
    indiceAtual >= 0 && iniciativa.iniciativa.length > 0 ? (indiceAtual + 1) % iniciativa.iniciativa.length : -1;
  const proximoCombatente = modoCombate && proximoIndice >= 0 ? iniciativa.iniciativa[proximoIndice] ?? null : null;

  // resumo markdown só com o que o app sabe de verdade (iniciativa, PV, condições) — sem
  // "recursos gastos"/"XP", que o app não rastreia (ver rules/combate.ts).
  const copiarResumo = async () => {
    const combatentes = iniciativa.iniciativa.map((e) => {
      const pv = iniciativa.pvDoCombatente(e.participanteId, e.tipo);
      const condicoes = (iniciativa.condicoesCombate ?? {})[e.participanteId] ?? [];
      return { nome: e.nome, valor: e.valor, pvAtual: pv?.atual ?? 0, pvMaximo: pv?.maximo ?? 0, condicoes };
    });
    const md = gerarResumoCombate({ numeroSessao, contadorCena: iniciativa.contadorCena, rodada: iniciativa.rodada, combatentes });
    try {
      await navigator.clipboard.writeText(md);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // clipboard indisponível (contexto não-seguro, permissão negada) — sem fallback, só não marca "copiado"
    }
  };

  const headerConteudo = (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 1, background: 'var(--concrete-1)',
        marginBottom: '0.6rem', marginLeft: '-1rem', marginRight: '-1rem',
        padding: '0 1rem 0.6rem',
      }}
    >
      <div
        onPointerDown={iniciarArrasto}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: arrastando ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' }}
      >
        <h3 className="label" style={{ margin: 0, fontSize: 13 }}>
          combate {modoCombate ? `· rodada ${iniciativa.rodada}` : ''}
        </h3>
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          <button
            className="icone-botao"
            onClick={() => setVista((v) => (v === 'iniciativa' ? 'log' : 'iniciativa'))}
            title={vista === 'iniciativa' ? 'ver log de combate' : 'ver iniciativa'}
            onPointerDown={(ev) => ev.stopPropagation()}
            style={{ fontSize: 11 }}
          >
            {vista === 'iniciativa' ? 'log' : 'iniciativa'}
          </button>
          <button
            className="controle-icone"
            onClick={copiarResumo}
            title="copiar resumo do combate (markdown)"
            aria-label={copiado ? 'resumo copiado' : 'copiar resumo do combate'}
            onPointerDown={(ev) => ev.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', color: copiado ? 'var(--rede)' : undefined }}
          >
            {copiado ? <IconeCheck /> : <IconePrancheta />}
          </button>
          <button className="controle-icone" onClick={() => { setPanelPos({ x: 8, y: 8 }); setAberto(false); }} title="fechar" aria-label="fechar painel de combate" onPointerDown={(ev) => ev.stopPropagation()}>
            <Icone nome="fechar" />
          </button>
        </div>
      </div>
      {vista === 'iniciativa' && modoCombate && combatenteAtual && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
          <div className="mono" style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
            <span style={{ color: 'var(--rede)' }}>vez de {combatenteAtual.nome}</span>
            {proximoCombatente && (
              <span className="vazio"> · próximo: {proximoCombatente.nome}</span>
            )}
          </div>
          <button
            className="icone-botao"
            onClick={voltarTurno}
            title="turno anterior (p)"
            style={{ fontSize: 13, padding: '0.3em 0.7em', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <IconeSeta size={13} style={{ transform: 'rotate(180deg)' }} /> anterior
          </button>
          <button
            className="icone-botao acento"
            onClick={avancarTurno}
            title="próximo turno (espaço ou n)"
            style={{
              fontSize: 13, padding: '0.3em 0.7em', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            }}
          >
            próximo <IconeSeta size={13} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: panelPos.x,
        top: panelPos.y,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        ...(aberto ? { width: 'min(480px, calc(100% - 16px))', maxHeight: 'calc(100% - 16px)' } : {}),
      }}
    >
      {aberto && (
        <div
          ref={painelRef}
          className="secao"
          style={{ width: '100%', maxHeight: '70vh', minHeight: 0, flexShrink: 1, overflowY: 'auto', marginBottom: '0.6rem', padding: '0.75rem 1rem' }}
        >
          {vista === 'iniciativa' ? (
            <IniciativaPanel
              hook={iniciativa}
              podeArrastar={true}
              header={headerConteudo}
              ocultarBotaoProximo={modoCombate && !!combatenteAtual}
            />
          ) : (
            <>
              {headerConteudo}
              <CombatLogView iniciativa={iniciativa.iniciativa} />
            </>
          )}
        </div>
      )}
      <button
        className="mapa-ferramenta"
        onClick={toggleAberto}
        title="abrir painel de combate"
        aria-label="painel de combate"
        aria-expanded={aberto}
        data-ativo={iniciativa.modoCombate}
      >
        ATK
      </button>
    </div>
  );
}
