import { useCallback, useEffect, useRef, useState } from 'react';
import Icone from '../../components/Icone';
import CombateJogadorView from '../iniciativa/CombateJogadorView';
import type { NpcPublico } from '../../multiplayer/npcsSync';
import { useStore } from '../../state/store';
import type { EntradaIniciativa, Ficha } from '../../state/types';

interface Props {
  iniciativa: EntradaIniciativa[];
  minhaFicha: Ficha;
  corMap: Record<string, string>;
  npcs: NpcPublico[];
}

export default function CombatOverlayJogador({ iniciativa, minhaFicha, corMap, npcs }: Props) {
  const { modoCombate, rodada, turnoAtualId } = useStore((s) => s.sessaoPublica);

  const [aberto, setAberto] = useState(false);
  // por id da entrada — ver comentário equivalente em CombateJogadorView.tsx (RLS de
  // `iniciativa` pode omitir a linha de um NPC oculto, então nem sempre há uma entrada com
  // `turnoAtualId` pra achar aqui, e é isso mesmo).
  const minhaVez = modoCombate && iniciativa.some((e) => e.id === turnoAtualId && e.participanteId === minhaFicha.id);

  // o painel se abre sozinho quando o turno vira pro jogador — ele não precisa lembrar de
  // clicar em "ATK" pra ver que é a vez dele. Só dispara na TRANSIÇÃO (deps: [minhaVez]) — se
  // o jogador fechar o painel de novo durante o próprio turno, não volta a abrir sozinho.
  useEffect(() => {
    if (minhaVez) setAberto(true);
  }, [minhaVez]);
  const [panelPos, setPanelPos] = useState({ x: 8, y: 8 });
  const [arrastando, setArrastando] = useState<{ origemX: number; origemY: number; painelX: number; painelY: number } | null>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  const toggleAberto = () => {
    setPanelPos({ x: 8, y: 8 });
    setAberto((a) => !a);
  };

  useEffect(() => {
    if (!aberto) return;
    const area = document.querySelector('.mapa-area');
    if (!area || !painelRef.current) return;
    const rect = area.getBoundingClientRect();
    const larguraPainel = painelRef.current.offsetWidth;
    const maxX = rect.width - larguraPainel - 8;
    setPanelPos((prev) => ({ x: Math.max(0, Math.min(prev.x, maxX)), y: prev.y }));
  }, [aberto, modoCombate]);

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
          style={{ width: '100%', maxHeight: '70vh', minHeight: 0, flexShrink: 1, overflowY: 'auto', marginBottom: '0.6rem', padding: '0.5rem 0.75rem' }}
        >
          <div
            onPointerDown={iniciarArrasto}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', cursor: arrastando ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' }}
          >
            <h3 className="label" style={{ margin: 0, fontSize: 12 }}>
              combate{modoCombate ? ` · rodada ${rodada}` : ''}
            </h3>
            <button className="controle-icone" onClick={() => { setPanelPos({ x: 8, y: 8 }); setAberto(false); }} title="fechar" aria-label="fechar painel de combate" onPointerDown={(ev) => ev.stopPropagation()}>
              <Icone nome="fechar" />
            </button>
          </div>
          <CombateJogadorView iniciativa={iniciativa} minhaFicha={minhaFicha} corMap={corMap} npcs={npcs} semMoldura />
        </div>
      )}
      <button
        className="mapa-ferramenta"
        onClick={toggleAberto}
        title="combate"
        aria-label="painel de combate"
        aria-expanded={aberto}
        data-ativo={modoCombate}
      >
        ATK
      </button>
    </div>
  );
}
