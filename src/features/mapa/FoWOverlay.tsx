import { useCallback, useEffect, useRef, useState } from 'react';
import { useFowStore } from '../../state/fowStore';
import { useStore } from '../../state/store';
import type { ZonaFoW } from '../../state/types';
import FoWViewOverlay from './FoWViewOverlay';
import { retanguloConteudo, getImgRenderRect, type Ponto } from './mapaUtils';
import { useMapaAtivo } from './useMapaAtivo';
import { liberarCapturaMapa, registrarEscFerramentaMapa, type CapturaMapa } from './atalhosFerramentasMapa';

type Modo = 'revelar' | 'cobrirLuz' | 'esquecer' | 'desligado';

interface Props {
  imgRenderRect: { offsetX: number; offsetY: number; renderW: number; renderH: number } | null;
  tamanho: { width: number; height: number };
  containerRef: React.RefObject<HTMLElement | null>;
  imgRef: React.RefObject<HTMLImageElement | null>;
}

/**
 * Ferramenta GM-only de FoW — toolbar (`revelar` / `cobrir luz`), seletor de zona (`rua` /
 * `corp` / `P&B`), `limpar tudo`. Nunca entra no bundle do jogador (mesmo padrão de
 * `AoEOverlay.tsx` — a UI exclusiva do mestre fica isolada da árvore compartilhada).
 *
 * Renderiza:
 *   1. a toolbar (canto superior direito do mapa);
 *   2. uma camada de captura de ponteiro (pointer-events auto só quando um modo está ativo);
 *   3. o `FoWViewOverlay` (compartilhado) com as três camadas — mestre VÊ o que jogador vê;
 *   4. o rascunho do retângulo que está arrastando (espelho visual, lido do `useFowStore`).
 *
 * `up` (soltou o ponteiro) comita o rascunho:
 *   `modo: 'revelar'` → `adicionarRegiaoFoW` (entra em `vistas ∪ visiveisAgora`).
 *   `modo: 'cobrirLuz'` → `cobrirAreaFoW` recorta o retângulo desenhado das regiões de
 *     `visiveisAgora` que ele toca (`subtrairCaixa`), sobrando as bordas de fora. O pedaço
 *     coberto continua em `vistas`, então vira memória. Cobrir é apagar a luz exatamente ali,
 *     não descartar a região inteira que o retângulo encostou.
 *   `modo: 'esquecer'` → `esquecerAreaFoW` faz o mesmo recorte em `vistas` E `visiveisAgora`
 *     juntas — a área desenhada volta pro nunca-visto. Único jeito de reverter uma área
 *     específica sem usar o `×`, que zera o mapa inteiro.
 *
 * Pegadinhas:
 *  - Coords em 0–1 da IMAGEM, não do container (`getImgRenderRect` + `retanguloConteudo`,
 *    invariante #3 do ROADMAP). Usar `e.currentTarget.getBoundingClientRect()` direto daria
 *    delta de borda/padding — mestre e jogador desalinhariam.
 *  - `limparFoW` zera tudo — `vistas`, `visiveisAgora`, `zonaAtual` E `ativa` (desliga o FoW do
 *    mapa, não só limpa o histórico) — e `fowSync.ts` propaga o estado vazio pro jogador.
 *    Irreversível, então pede confirmação num modal (mesmo padrão de `ResetSessao.tsx`), não
 *    `window.confirm` nativo — destoava do resto da UI.
 *  - Escolher `revelar`/`cobrirLuz`/`esquecer` LIGA o `fow` sozinho se estiver desligado — sem
 *    isso, desenhar com a névoa desligada grava a região (sincroniza pro Supabase) mas não
 *    aparece nada na tela, parecendo quebrado.
 *  - `rua`/`corp` tingem a CENA inteira (`fow.zonaAtual`), não a região desenhada — aparecem
 *    sempre que `fow` está ligado, não só durante `revelar`.
 */
export default function FoWOverlay(props: Props) {
  const mapaAtivoId = useStore((s) => s.mapa.mapaAtivoId);
  // Ferramenta/modal pertencem ao mapa em que foram abertos. A troca cancela a interação,
  // sem herdar "revelar" num mapa cuja névoa ainda está desligada.
  return <FerramentasFoW key={mapaAtivoId ?? 'sem-mapa'} {...props} />;
}

function FerramentasFoW({ imgRenderRect, tamanho, containerRef, imgRef }: Props) {
  const mapaAtivo = useMapaAtivo();
  const adicionarRegiaoFoW = useStore((s) => s.adicionarRegiaoFoW);
  const cobrirAreaFoW = useStore((s) => s.cobrirAreaFoW);
  const esquecerAreaFoW = useStore((s) => s.esquecerAreaFoW);
  const limparFoW = useStore((s) => s.limparFoW);
  const definirZonaFoW = useStore((s) => s.definirZonaFoW);
  const definirFoWAtivo = useStore((s) => s.definirFoWAtivo);

  const definirRascunho = useFowStore((s) => s.definirRascunho);

  const [modo, setModo] = useState<Modo>('desligado');
  const [modalApagarAberto, setModalApagarAberto] = useState(false);
  const desenhandoRef = useRef(false);
  const origemRef = useRef<Ponto | null>(null);
  const capturaRef = useRef<CapturaMapa | null>(null);

  const sairDoDesenho = useCallback(() => {
    desenhandoRef.current = false;
    origemRef.current = null;
    definirRascunho(null);
    setModo('desligado');
    const captura = capturaRef.current;
    capturaRef.current = null;
    liberarCapturaMapa(captura);
  }, [definirRascunho]);

  useEffect(() => {
    if (modo === 'desligado') return;
    return registrarEscFerramentaMapa(() => containerRef.current, sairDoDesenho);
  }, [modo, containerRef, sairDoDesenho]);

  useEffect(() => () => definirRascunho(null), [definirRascunho]);

  useEffect(() => {
    if (!modalApagarAberto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalApagarAberto(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalApagarAberto]);

  const posicaoNormalizada = useCallback(
    (e: { clientX: number; clientY: number }): Ponto | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = retanguloConteudo(container);
      if (rect.width <= 0 || rect.height <= 0) return null;
      const imgEl = imgRef.current;
      if (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
        const imgR = getImgRenderRect(rect.width, rect.height, imgEl.naturalWidth, imgEl.naturalHeight);
        return {
          x: (e.clientX - rect.left - imgR.offsetX) / imgR.renderW,
          y: (e.clientY - rect.top - imgR.offsetY) / imgR.renderH,
        };
      }
      return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    },
    [containerRef, imgRef],
  );

  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (modo === 'desligado' || e.button !== 0) return;
      const p = posicaoNormalizada(e);
      if (!p) return;
      e.preventDefault();
      e.stopPropagation(); // impede o handler da régua/tokens no `.mapa-area` parent de interferir
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      capturaRef.current = { alvo: e.currentTarget as Element, ponteiroId: e.pointerId };
      origemRef.current = p;
      desenhandoRef.current = true;
      definirRascunho({
        forma: 'rect',
        x: clamp01(p.x),
        y: clamp01(p.y),
        w: 0.001,
        h: 0.001,
        modo,
        ativa: true,
      });
    },
    [modo, posicaoNormalizada, definirRascunho],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!desenhandoRef.current || !origemRef.current) return;
      e.stopPropagation(); // mesma razão do Down — `.mapa-area` tem onPointerMove pra arrasto de token/grade
      const p = posicaoNormalizada(e);
      if (!p) return;
      const o = origemRef.current;
      const x = Math.min(o.x, clamp01(p.x));
      const y = Math.min(o.y, clamp01(p.y));
      const w = Math.abs(clamp01(p.x) - o.x);
      const h = Math.abs(clamp01(p.y) - o.y);
      // Lê `rascunho` via getState, não por selector, pra não precisar dele como dep do callback
      // (recriar a função a cada frame de arrasto seria desperdício — mesmo remédio de AoEOverlay).
      const atual = useFowStore.getState().rascunho;
      if (!atual) return;
      definirRascunho({ ...atual, x, y, w, h, ativa: true });
    },
    [posicaoNormalizada, definirRascunho],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    desenhandoRef.current = false;
    capturaRef.current = null;
    const r = useFowStore.getState().rascunho;
    origemRef.current = null;
    definirRascunho(null);
    if (!r || r.w < 0.005 || r.h < 0.005) return; // clique sem arrasto (acidental) → ignora
    if (r.modo === 'revelar') {
      // Filtrar RegiaoFoW só os campos persistentes: 'forma','x','y','w','h'.
      adicionarRegiaoFoW({ forma: r.forma, x: r.x, y: r.y, w: r.w, h: r.h });
    } else if (r.modo === 'cobrirLuz') {
      // cobrir luz: apaga EXATAMENTE o retângulo desenhado, recortando as regiões visíveis que
      // ele toca (o pedaço coberto continua em `vistas`, então vira memória). Antes isto removia
      // a região inteira por interseção — cobrir um canto apagava o cômodo todo.
      cobrirAreaFoW({ x: r.x, y: r.y, w: r.w, h: r.h });
    } else {
      // esquecer: some com a área desenhada de `vistas` E `visiveisAgora` — volta a ser
      // nunca-visto.
      esquecerAreaFoW({ x: r.x, y: r.y, w: r.w, h: r.h });
    }
  }, [adicionarRegiaoFoW, cobrirAreaFoW, esquecerAreaFoW, definirRascunho]);

  // nada pra revelar sem um mapa selecionado — evita mostrar uma ferramenta que não faz nada.
  // Depois de todos os hooks acima (rules-of-hooks): early return é seguro aqui.
  if (!mapaAtivo) return null;
  const fow = mapaAtivo.fow;

  const trocarModo = (m: 'revelar' | 'cobrirLuz' | 'esquecer') => {
    const proximo = modo === m ? 'desligado' : m;
    if (proximo !== 'desligado' && !fow.ativa) definirFoWAtivo(true); // desenhar liga a névoa sozinho
    setModo(proximo);
  };

  const trocarZona = (z: ZonaFoW | null) => definirZonaFoW(fow.zonaAtual === z ? null : z);

  const temFoW = fow.vistas.length > 0 || fow.visiveisAgora.length > 0;

  return (
    <>
      <div className="fow-toolbar">
        <button
          className="icone-botao"
          data-ativo={fow.ativa ? 'true' : undefined}
          onClick={() => definirFoWAtivo(!fow.ativa)}
          title="ligar/desligar fog of war neste mapa (não apaga o que já foi revelado)"
        >
          fow
        </button>
        <span style={{ width: 1, background: 'var(--concrete-2)', alignSelf: 'stretch', margin: '0 0.2rem' }} />
        <button
          className="icone-botao"
          data-ativo={modo === 'revelar' ? 'true' : undefined}
          onClick={() => trocarModo('revelar')}
          title="revelar (entra em vistas e luz atual) — Esc sai do desenho"
        >
          revelar
        </button>
        <button
          className="icone-botao"
          data-ativo={modo === 'cobrirLuz' ? 'true' : undefined}
          onClick={() => trocarModo('cobrirLuz')}
          title="cobrir luz (mantém memória) — Esc sai do desenho"
        >
          cobrir luz
        </button>
        <button
          className="icone-botao"
          data-ativo={modo === 'esquecer' ? 'true' : undefined}
          onClick={() => trocarModo('esquecer')}
          title="esquecer (some com a área — volta a nunca-visto) — Esc sai do desenho"
        >
          esquecer
        </button>
        {fow.ativa && (
          <>
            <span style={{ width: 1, background: 'var(--concrete-2)', alignSelf: 'stretch', margin: '0 0.2rem' }} />
            <button
              className="icone-botao"
              data-ativo={fow.zonaAtual === 'rua' ? 'true' : undefined}
              onClick={() => trocarZona('rua')}
              title="atmosfera da cena: rua (âmbar — analógico/humano)"
              style={{ color: 'var(--real)' }}
            >
              rua
            </button>
            <button
              className="icone-botao"
              data-ativo={fow.zonaAtual === 'corporativo' ? 'true' : undefined}
              onClick={() => trocarZona('corporativo')}
              title="atmosfera da cena: corporativo (ciano — rede/sistema)"
              style={{ color: 'var(--rede)' }}
            >
              corp
            </button>
          </>
        )}
        {temFoW && (
          <button
            className="icone-botao"
            onClick={() => setModalApagarAberto(true)}
            title="apagar toda a memória do FoW neste mapa (revelado e coberto) e desligar — não dá pra desfazer"
            style={{ color: 'var(--ruido)' }}
          >
            ×
          </button>
        )}
      </div>

      {modalApagarAberto && (
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
          onClick={() => setModalApagarAberto(false)}
        >
          <div
            className="secao"
            style={{
              width: 400,
              maxWidth: '90vw',
              borderColor: 'var(--ruido)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, color: 'var(--ruido)' }}>apagar memória do FoW</h3>
            <p className="vazio" style={{ margin: 0 }}>
              apaga tudo que foi revelado e coberto neste mapa, e desliga o FoW. o papel não
              esquece — não dá pra desfazer.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
              <button
                className="perigo"
                onClick={() => {
                  limparFoW();
                  setModalApagarAberto(false);
                }}
              >
                apagar memória
              </button>
              <button onClick={() => setModalApagarAberto(false)}>cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fow-camada-captura"
        style={{
          pointerEvents: modo !== 'desligado' ? 'auto' : 'none',
          // com o modo ligado, precisa ficar acima da captura do AoE (z-index 34): não há
          // ferramenta ativa única no mapa, então uma forma de AoE esquecida selecionada
          // interceptava o pointerdown e o modo FoW parecia morto.
          zIndex: modo !== 'desligado' ? 35 : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <FoWViewOverlay imgRenderRect={imgRenderRect} tamanho={tamanho} visaoMestre />

      {/* marca visual do rascunho durante o arrasto está dentro de FoWViewOverlay (RascunhoVisual),
          porque tem as coords relativas à imagem — assim não duplica lógica de letterbox. */}
    </>
  );
}
