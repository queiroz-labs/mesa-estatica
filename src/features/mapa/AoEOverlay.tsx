import { useCallback, useEffect, useRef, useState } from 'react';
import { useIniciativa } from '../../hooks/useIniciativa';
import { CONDICOES_COMBATE } from '../../rules/data/condicoesCombate';
import { useAoeStore, type AoeVivo } from '../../state/aoeStore';
import { useStore } from '../../state/store';
import type { GradeMapa } from '../../state/types';
import AoEViewOverlay from './AoEViewOverlay';
import { pontoDentroTemplate, tamanhoTemplateEmCelulas, type FormaAoE } from './aoeGeometria';
import { centroDaCelula, formatarDistancia, getImgRenderRect, retanguloConteudo, type Ponto } from './mapaUtils';
import { liberarCapturaMapa, registrarEscFerramentaMapa, type CapturaMapa } from './atalhosFerramentasMapa';

interface Props {
  imgRenderRect: { offsetX: number; offsetY: number; renderW: number; renderH: number } | null;
  tamanho: { width: number; height: number };
  grade: GradeMapa;
  containerRef: React.RefObject<HTMLElement | null>;
  imgRef: React.RefObject<HTMLImageElement | null>;
}

/**
 * Template de área de efeito — Círculo e Quadrado só (Cone e Linha exigem matemática de
 * ângulo/segmento que não coube neste corte, ver aoeGeometria.ts). Só o mestre desenha (esta
 * ferramenta, toolbar/captura/painel, é GM-only — nunca entra no bundle do jogador), mas os
 * jogadores VEEM a área via `useAoeStore` + `aoeSync.ts` (broadcast, mesmo padrão da régua) —
 * o desenho em si é `AoEViewOverlay.tsx`, compartilhado. Reusa a mesma noção de "célula" da
 * régua (`mapaUtils.ts`/`aoeGeometria.ts`).
 *
 * Renderiza sua própria camada de captura de ponteiro (pointer-events só liga quando uma forma
 * está selecionada) — assim não precisa compor com os handlers de arrasto de token/grade/régua
 * já existentes em `.mapa-area`; a ferramenta "assume" o mapa só enquanto ativa.
 */
export default function AoEOverlay({ imgRenderRect, tamanho, grade, containerRef, imgRef }: Props) {
  const mapa = useStore((s) => s.mapa);
  const fichas = useStore((s) => s.fichas);
  const npcs = useStore((s) => s.npcs);
  const registrarLog = useStore((s) => s.registrarLog);
  const condicoesCombate = useStore((s) => s.sessaoPublica.condicoesCombate);
  const alternarCondicaoCombate = useStore((s) => s.alternarCondicaoCombate);
  const { pvDoCombatente } = useIniciativa();

  const template = useAoeStore((s) => s.template);
  const definirTemplate = useAoeStore((s) => s.definirTemplate);

  const [forma, setForma] = useState<FormaAoE | null>(null);
  const [danoInput, setDanoInput] = useState('');
  const [condicaoInput, setCondicaoInput] = useState('');
  const desenhandoRef = useRef(false);
  const templateAnteriorRef = useRef<AoeVivo | null>(null);
  const capturaRef = useRef<CapturaMapa | null>(null);

  const sairDoDesenho = useCallback(() => {
    const estavaDesenhando = desenhandoRef.current;
    desenhandoRef.current = false;
    setForma(null);
    if (estavaDesenhando) definirTemplate(templateAnteriorRef.current);
    templateAnteriorRef.current = null;
    const captura = capturaRef.current;
    capturaRef.current = null;
    liberarCapturaMapa(captura);
  }, [definirTemplate]);

  useEffect(() => {
    if (!forma) return;
    return registrarEscFerramentaMapa(() => containerRef.current, sairDoDesenho);
  }, [forma, containerRef, sairDoDesenho]);

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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!forma || e.button !== 0) return;
      const p = posicaoNormalizada(e);
      if (!p) return;
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      capturaRef.current = { alvo: e.currentTarget as Element, ponteiroId: e.pointerId };
      const anterior = useAoeStore.getState().template;
      templateAnteriorRef.current = anterior && !anterior.ativa ? anterior : null;
      const snap = centroDaCelula(p.x, p.y, grade);
      desenhandoRef.current = true;
      definirTemplate({ forma, origem: snap, alvo: snap, ativa: true });
    },
    [forma, grade, posicaoNormalizada, definirTemplate],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!desenhandoRef.current) return;
      const p = posicaoNormalizada(e);
      if (!p) return;
      const snap = centroDaCelula(p.x, p.y, grade);
      // lê pelo getState (não pela variável `template` do render) pra não precisar dela como
      // dependência do callback — recriar a função a cada frame de arrasto seria desperdício.
      const atual = useAoeStore.getState().template;
      if (!atual) return;
      definirTemplate({ ...atual, alvo: snap, ativa: true });
    },
    [grade, posicaoNormalizada, definirTemplate],
  );

  const onPointerUp = useCallback(() => {
    if (!desenhandoRef.current) return;
    desenhandoRef.current = false;
    capturaRef.current = null;
    templateAnteriorRef.current = null;
    const atual = useAoeStore.getState().template;
    // ativa:false — sinal pro aoeSync.ts mandar a posição final na hora, fora do debounce.
    if (atual) definirTemplate({ ...atual, ativa: false });
  }, [definirTemplate]);

  const alvosDentro = template
    ? mapa.tokens
        .filter((tk) => pontoDentroTemplate({ x: tk.x, y: tk.y }, template, grade))
        .map((tk) => {
          const ficha = fichas.find((f) => f.id === tk.participanteId);
          const npc = npcs.find((n) => n.id === tk.participanteId);
          return { participanteId: tk.participanteId, tipo: (ficha ? 'pc' : 'npc') as 'pc' | 'npc', nome: ficha?.nome || npc?.nome || 'sem nome' };
        })
    : [];

  const aplicarDanoAosAlvos = () => {
    const valor = Number(danoInput);
    if (!valor || alvosDentro.length === 0) return;
    const nomesPublicos: string[] = [];
    const nomesOcultos: string[] = [];
    for (const alvo of alvosDentro) {
      const pv = pvDoCombatente(alvo.participanteId, alvo.tipo);
      if (!pv) continue;
      pv.aplicar(-Math.abs(valor));
      const oculto = alvo.tipo === 'npc' && !npcs.find((npc) => npc.id === alvo.participanteId)?.visivel;
      (oculto ? nomesOcultos : nomesPublicos).push(alvo.nome);
    }
    if (nomesPublicos.length > 0) registrarLog('dano', `área de efeito (${template?.forma}) — ${nomesPublicos.join(', ')}: -${Math.abs(valor)} PV`, null, 'publica');
    if (nomesOcultos.length > 0) registrarLog('dano', `área de efeito (${template?.forma}) — ${nomesOcultos.join(', ')}: -${Math.abs(valor)} PV`, null, 'privada');
    setDanoInput('');
  };

  // sem log — mesma decisão já tomada em `aplicarCondicaoEmMassa` (useIniciativa.ts): é um
  // lembrete visual pro mestre, não um evento narrativo. Pula quem já tem a condição, mesmo
  // critério do toggle individual.
  const aplicarCondicaoAosAlvos = () => {
    if (!condicaoInput || alvosDentro.length === 0) return;
    for (const alvo of alvosDentro) {
      const ativas = (condicoesCombate ?? {})[alvo.participanteId] ?? [];
      if (ativas.includes(condicaoInput)) continue;
      alternarCondicaoCombate(alvo.participanteId, condicaoInput);
    }
    setCondicaoInput('');
  };

  const limpar = () => {
    desenhandoRef.current = false;
    templateAnteriorRef.current = null;
    const captura = capturaRef.current;
    capturaRef.current = null;
    liberarCapturaMapa(captura);
    definirTemplate(null);
    setForma(null);
    setDanoInput('');
    setCondicaoInput('');
  };

  return (
    <>
      <div className="mapa-aoe-toolbar">
        <button
          className={forma === 'circulo' ? 'icone-botao acento' : 'icone-botao'}
          onClick={() => setForma((f) => (f === 'circulo' ? null : 'circulo'))}
          title="área de efeito — círculo (Esc sai do desenho)"
        >
          ○
        </button>
        <button
          className={forma === 'quadrado' ? 'icone-botao acento' : 'icone-botao'}
          onClick={() => setForma((f) => (f === 'quadrado' ? null : 'quadrado'))}
          title="área de efeito — quadrado (Esc sai do desenho)"
        >
          □
        </button>
        {template && (
          <button className="icone-botao" onClick={limpar} title="limpar área">
            ×
          </button>
        )}
      </div>

      <div
        className="mapa-aoe-captura"
        style={{ pointerEvents: forma ? 'auto' : 'none', cursor: forma ? 'crosshair' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <AoEViewOverlay imgRenderRect={imgRenderRect} tamanho={tamanho} grade={grade} />

      {template && (
        <div className="mapa-aoe-painel">
          <p className="mono" style={{ margin: 0, fontSize: 11 }}>
            {template.forma === 'circulo' ? 'raio' : 'metade do lado'} {formatarDistancia(tamanhoTemplateEmCelulas(template, grade) * grade.escala, grade.unidade)} · {alvosDentro.length} dentro
          </p>
          {alvosDentro.length > 0 && (
            <p className="vazio" style={{ margin: '0.2rem 0', fontSize: 10 }}>
              {alvosDentro.map((a) => a.nome).join(', ')}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginTop: '0.3rem' }}>
            <input
              type="number"
              placeholder="dano"
              value={danoInput}
              onChange={(ev) => setDanoInput(ev.target.value)}
              style={{ width: 52, fontSize: 11 }}
            />
            <button className="icone-botao acento" onClick={aplicarDanoAosAlvos} disabled={alvosDentro.length === 0} style={{ fontSize: 10 }}>
              aplicar a {alvosDentro.length}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginTop: '0.3rem' }}>
            <select value={condicaoInput} onChange={(ev) => setCondicaoInput(ev.target.value)} style={{ fontSize: 10 }}>
              <option value="">condição…</option>
              {CONDICOES_COMBATE.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <button
              className="icone-botao acento"
              onClick={aplicarCondicaoAosAlvos}
              disabled={!condicaoInput || alvosDentro.length === 0}
              style={{ fontSize: 10 }}
            >
              aplicar a {alvosDentro.length}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
