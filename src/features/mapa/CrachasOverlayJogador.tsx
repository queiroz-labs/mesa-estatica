import { useCallback, useEffect, useRef, useState } from 'react';
import Icone from '../../components/Icone';
import type { FichaPublica } from '../../multiplayer/fichaSplit';
import type { Ficha } from '../../state/types';
import CrachasLista from './CrachasLista';

interface Props {
  minhaFicha: Ficha;
  outrasFichas: FichaPublica[];
}

/** Espelho de CrachasOverlay.tsx pro app do jogador — mesmas props que MapaJogadorView.tsx já
 *  tem em mãos (sem fetch novo). */
export default function CrachasOverlayJogador({ minhaFicha, outrasFichas }: Props) {
  const [aberto, setAberto] = useState(false);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [arrastando, setArrastando] = useState<{ origemX: number; origemY: number; painelX: number; painelY: number } | null>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  const toggleAberto = () => {
    setPanelPos(null);
    setAberto((a) => !a);
  };

  const iniciarArrasto = (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    const area = document.querySelector('.mapa-area');
    if (!area || !painelRef.current) return;
    const areaRect = area.getBoundingClientRect();
    const painelRect = painelRef.current.getBoundingClientRect();
    const origem = panelPos ?? { x: painelRect.left - areaRect.left, y: painelRect.top - areaRect.top };
    setArrastando({ origemX: ev.clientX, origemY: ev.clientY, painelX: origem.x, painelY: origem.y });
  };

  const moverArrasto = useCallback((ev: PointerEvent) => {
    if (!arrastando) return;
    const area = document.querySelector('.mapa-area');
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const dx = ev.clientX - arrastando.origemX;
    const dy = ev.clientY - arrastando.origemY;
    const alturaPainel = painelRef.current?.parentElement?.offsetHeight ?? 200;
    const larguraPainel = painelRef.current?.offsetWidth ?? 260;
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

  const personagens = [
    { id: minhaFicha.id, nome: minhaFicha.nome, cor: minhaFicha.corVisual, foto: minhaFicha.foto },
    ...outrasFichas.map((f) => ({ id: f.id, nome: f.nome, cor: f.corVisual, foto: f.foto })),
  ];

  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        ...(aberto ? { width: 'min(260px, calc(100% - 16px))', maxHeight: 'calc(100% - 16px)' } : {}),
        ...(panelPos ? { left: panelPos.x, top: panelPos.y } : { right: 8, top: 8 }),
      }}
    >
      {aberto && (
        <div
          ref={painelRef}
          className="secao"
          style={{ width: '100%', maxHeight: '70vh', minHeight: 0, flexShrink: 1, overflowY: 'auto', marginBottom: '0.6rem', padding: '0.75rem 1rem' }}
        >
          <div
            onPointerDown={iniciarArrasto}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', cursor: arrastando ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' }}
          >
            <h3 className="label" style={{ margin: 0, fontSize: 12 }}>crachás</h3>
            <button className="controle-icone" onClick={toggleAberto} title="fechar" aria-label="fechar crachás" onPointerDown={(ev) => ev.stopPropagation()}>
              <Icone nome="fechar" />
            </button>
          </div>
          <CrachasLista personagens={personagens} euId={minhaFicha.id} />
        </div>
      )}
      <button className="mapa-ferramenta" onClick={toggleAberto} title="crachás" aria-label="crachás dos personagens" aria-expanded={aberto}>
        <Icone nome="cracha" size={20} />
      </button>
    </div>
  );
}
