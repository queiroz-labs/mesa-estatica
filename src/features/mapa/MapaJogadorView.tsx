import { useCallback, useEffect, useRef, useState } from 'react';
import type { FichaPublica } from '../../multiplayer/fichaSplit';
import type { NpcPublico } from '../../multiplayer/npcsSync';
import { calcularPvMaximo, calcularSanidadeMaxima } from '../../rules/derivados';
import { calcularEstadoTokenCombate, condicoesExtrasToken } from '../../rules/combate';
import { badgeCondicoes, nomeCondicao } from '../../rules/data/condicoesCombate';
import { surtosAtivosNaSessao } from '../../rules/surto';
import { COR_NPC_PADRAO } from '../../state/factories';
import { useStore } from '../../state/store';
import type { EntradaIniciativa, Ficha } from '../../state/types';
import { desmarcarTokenEmArrasto, marcarTokenEmArrasto } from '../../multiplayer/tokensSync';
import TokenScene from '../../tokens3d/TokenScene';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';
import AoEViewOverlay from './AoEViewOverlay';
import CombatOverlayJogador from './CombatOverlayJogador';
import CrachasOverlayJogador from './CrachasOverlayJogador';
import FoWViewOverlay from './FoWViewOverlay';
import { podeMoverTokenParaFoW } from './fowGeometria';
import PingOverlay from './PingOverlay';
import ReguaOverlay from './ReguaOverlay';
import TokenOverlayJogador from './TokenOverlayJogador';
import { criarFoWVazio, criarGradeInicial } from '../../state/factories';
import './mapa.css';
import { getImgRenderRect, retanguloConteudo, retanguloGradeEmPx } from './mapaUtils';
import { useMapaAtivo } from './useMapaAtivo';
import { useRegua } from './useRegua';

/** Defaults quando o mestre ainda não escolheu um mapa — constantes por fora do componente
 *  (mesmo motivo de `EMPTY_CONDICOES`/`GRADE_PADRAO` em `MapaTab.tsx`). */
const GRADE_PADRAO = criarGradeInicial();
const FOW_PADRAO = criarFoWVazio();

const LIMIAR_CLIQUE = 5; // px — abaixo disso, pointerdown+pointerup no próprio token conta como clique, não arrasto

interface Props {
  minhaFicha: Ficha;
  outrasFichas: FichaPublica[];
  npcs: NpcPublico[];
  iniciativa: EntradaIniciativa[];
}

export default function MapaJogadorView({ minhaFicha, outrasFichas, npcs, iniciativa }: Props) {
  const mapaAtivo = useMapaAtivo();
  const tokens = useStore((s) => s.mapa.tokens);
  const moverTokenMapa = useStore((s) => s.moverTokenMapa);
  const basePV = useStore((s) => s.config.basePV);
  const modoCombate = useStore((s) => s.sessaoPublica.modoCombate);
  const contadorCena = useStore((s) => s.sessaoPublica.contadorCena);
  const rodada = useStore((s) => s.sessaoPublica.rodada);
  const turnoAtualId = useStore((s) => s.sessaoPublica.turnoAtualId);
  const condicoesCombate = useStore((s) => s.sessaoPublica.condicoesCombate);

  const imagemUrl = mapaAtivo?.imagemUrl ?? null;
  const grade = mapaAtivo?.grade ?? GRADE_PADRAO;
  const fow = mapaAtivo?.fow ?? FOW_PADRAO;

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [tamanho, setTamanho] = useState({ width: 0, height: 0 });
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const arrastandoRef = useRef(false);
  const inicioCliqueRef = useRef<{ x: number; y: number } | null>(null);
  const [overlay, setOverlay] = useState<{ tipo: 'pc' | 'npc'; participanteId: string } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setTamanho({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setImgNatural(null);
  }, [imagemUrl]);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, [imagemUrl]);

  const meuToken = tokens.find((t) => t.participanteId === minhaFicha.id);
  const participanteNaVez = modoCombate ? iniciativa.find((e) => e.id === turnoAtualId)?.participanteId ?? null : null;

  const corMap: Record<string, string> = {};
  corMap[minhaFicha.id] = minhaFicha.corVisual;
  for (const f of outrasFichas) corMap[f.id] = f.corVisual;
  for (const n of npcs) corMap[n.id] = n.corVisual ?? COR_NPC_PADRAO;

  const participantePorId = (id: string) => {
    if (id === minhaFicha.id) {
      const sanidadeCritica = minhaFicha.sanidadeAtual <= calcularSanidadeMaxima(minhaFicha.atributos.vontade) * 0.25;
      return {
        nome: minhaFicha.nome || 'sem nome',
        cor: minhaFicha.corVisual,
        foto: minhaFicha.foto,
        silhueta: null as string | null,
        sanidadeCritica,
        surtosAtivos: minhaFicha.surtosAtivos,
        tipo: 'pc' as const,
        notas: undefined as string | undefined,
        // PV é privado (fichaSplit.ts) — só dá pra calcular automático na PRÓPRIA ficha;
        // outro PC só mostra "morto"/"desacordado" se o mestre marcar manualmente.
        pvAtual: minhaFicha.pvAtual as number | undefined,
        pvMaximo: calcularPvMaximo(basePV, minhaFicha.atributos.vigor) as number | undefined,
      };
    }
    const ficha = outrasFichas.find((f) => f.id === id);
    if (ficha) {
      return { nome: ficha.nome || 'sem nome', cor: ficha.corVisual, foto: ficha.foto, silhueta: null as string | null, sanidadeCritica: false, surtosAtivos: [], tipo: 'pc' as const, notas: undefined as string | undefined, pvAtual: undefined as number | undefined, pvMaximo: undefined as number | undefined };
    }
    const npc = npcs.find((n) => n.id === id);
    if (npc) {
      // PV de NPC é privado (`npcs_publico` não expõe — npcsSync.ts) — "morto"/"desacordado"
      // de NPC no mapa do jogador só existe via marcação manual do mestre (condicoesCombate).
      return { nome: npc.nome || 'sem nome', cor: npc.corVisual ?? COR_NPC_PADRAO, foto: npc.foto, silhueta: npc.silhueta, sanidadeCritica: false, surtosAtivos: [], tipo: 'npc' as const, notas: npc.notas as string | undefined, pvAtual: undefined as number | undefined, pvMaximo: undefined as number | undefined };
    }
    return null;
  };

  const tokensVisuais = tokens
    .map((t) => {
      const p = participantePorId(t.participanteId);
      if (!p) return null;
      const surtosVisiveis = surtosAtivosNaSessao(p.surtosAtivos, { modoCombate, contadorCena, rodada });
      const surtoAtivo = surtosVisiveis.length > 0;
      const surtoEscolha = surtosVisiveis.find((s) => s.escolha !== null)?.escolha ?? null;
      const turnoAtivo = participanteNaVez === t.participanteId;
      const condicoes = (condicoesCombate ?? {})[t.participanteId] ?? [];
      const podeMover = t.participanteId === minhaFicha.id;
      const { desacordado, morto } = calcularEstadoTokenCombate(p.pvAtual, p.pvMaximo, condicoes);
      return {
        id: t.id,
        participanteId: t.participanteId,
        tipo: p.tipo,
        x: t.x,
        y: t.y,
        cor: p.cor,
        foto: p.foto,
        silhueta: p.silhueta,
        sanidadeCritica: p.sanidadeCritica,
        surtoAtivo,
        surtoEscolha,
        turnoAtivo,
        condicoes,
        desacordado,
        morto,
        nome: p.nome,
        podeMover,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const imgRenderRect = imgNatural && tamanho.width > 0
    ? getImgRenderRect(tamanho.width, tamanho.height, imgNatural.w, imgNatural.h)
    : null;

  // getter, não valor — lido no momento do pointerdown da régua, nunca congelado num render
  // (ver comentário de `UseReguaOpts.bloqueado` em useRegua.ts). `arrastandoRef` é estável,
  // então deps vazias bastam.
  const reguaBloqueada = useCallback(() => arrastandoRef.current, []);

  const regua = useRegua({
    autorId: minhaFicha.id,
    cor: minhaFicha.corVisual,
    grade,
    containerRef,
    imgRef,
    bloqueado: reguaBloqueada,
  });

  const posicaoDoPonteiro = (e: React.PointerEvent) => {
    const rect = retanguloConteudo(containerRef.current!);
    const imgEl = imgRef.current;
    if (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
      const imgR = getImgRenderRect(rect.width, rect.height, imgEl.naturalWidth, imgEl.naturalHeight);
      return { x: (e.clientX - rect.left - imgR.offsetX) / imgR.renderW, y: (e.clientY - rect.top - imgR.offsetY) / imgR.renderH };
    }
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const iniciarArrasto = (e: React.PointerEvent) => {
    if (!meuToken) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    arrastandoRef.current = true;
    inicioCliqueRef.current = { x: e.clientX, y: e.clientY };
    marcarTokenEmArrasto(meuToken.id);
  };

  const mover = (e: React.PointerEvent) => {
    if (!arrastandoRef.current || !meuToken || !containerRef.current) return;
    const { x, y } = posicaoDoPonteiro(e);
    if (!podeMoverTokenParaFoW(fow, { x, y })) return;
    moverTokenMapa(meuToken.id, x, y);
  };

  const soltar = (e: React.PointerEvent) => {
    const inicioClique = inicioCliqueRef.current;
    if (arrastandoRef.current && meuToken && inicioClique) {
      const dist = Math.hypot(e.clientX - inicioClique.x, e.clientY - inicioClique.y);
      if (dist < LIMIAR_CLIQUE) setOverlay({ tipo: 'pc', participanteId: minhaFicha.id });
    }
    if (meuToken) desmarcarTokenEmArrasto(meuToken.id);
    arrastandoRef.current = false;
    inicioCliqueRef.current = null;
  };

  return (
    <div className="mapa-tab">
      <div
        ref={containerRef}
        className="mapa-area"
        onPointerDown={regua.onPointerDown}
        onPointerMove={(e) => { mover(e); regua.onPointerMove(e); }}
        onPointerUp={(e) => { soltar(e); regua.onPointerUp(); }}
        onPointerCancel={(e) => { soltar(e); regua.onPointerCancel(); }}
        onContextMenu={regua.onContextMenu}
      >
        {imagemUrl ? (
          <img
            ref={imgRef}
            src={imagemUrl}
            alt="mapa da cena"
            className="mapa-imagem"
            draggable={false}
            onLoad={() => {
              if (imgRef.current) setImgNatural({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
            }}
          />
        ) : (
          <p className="vazio mapa-vazio">o mestre ainda não escolheu um mapa.</p>
        )}

        {grade.ativa && (
          <>
            <div
              className="mapa-grade"
              style={
                {
                  ...retanguloGradeEmPx(imgRenderRect, grade),
                  '--grade-colunas': grade.colunas,
                  '--grade-linhas': grade.linhas,
                } as React.CSSProperties
              }
            />
            <div className="mapa-grade-caixa" style={retanguloGradeEmPx(imgRenderRect, grade)} />
          </>
        )}

        {tamanho.width > 0 && (
          <TokenScene tokens={tokensVisuais} width={tamanho.width} height={tamanho.height} active imgRenderRect={imgRenderRect} />
        )}

        {tokensVisuais.map((t) => {
          const partesTitulo = [t.nome];
          if (t.morto) partesTitulo.push('morto');
          else if (t.desacordado) partesTitulo.push('desacordado');
          if (t.podeMover) partesTitulo.push('seu token — arraste pra mover');
          if (t.surtoAtivo) partesTitulo.push(`surto${t.surtoEscolha ? `: ${t.surtoEscolha}` : ' ativo'}`);
          const condicoesExtras = condicoesExtrasToken(t.condicoes);
          if (condicoesExtras.length > 0) partesTitulo.push(condicoesExtras.map(nomeCondicao).join(', '));
          const esq = imgRenderRect ? `${imgRenderRect.offsetX + t.x * imgRenderRect.renderW}px` : `${t.x * 100}%`;
          const topo = imgRenderRect ? `${imgRenderRect.offsetY + t.y * imgRenderRect.renderH}px` : `${t.y * 100}%`;
          return (
            <div
              key={t.id}
              className="mapa-token"
              data-surto={t.surtoAtivo}
              data-turno={t.turnoAtivo}
              data-morto={t.morto}
              data-desacordado={!t.morto && t.desacordado}
              style={{ left: esq, top: topo, borderColor: t.cor, cursor: t.podeMover ? 'grab' : 'pointer' }}
              onPointerDown={t.podeMover ? iniciarArrasto : undefined}
              onClick={t.podeMover ? undefined : () => setOverlay({ tipo: t.tipo, participanteId: t.participanteId })}
              title={partesTitulo.join(' — ')}
            >
              <Avatar nome={t.nome} cor={t.cor} foto={t.foto} silhueta={t.silhueta} tamanho={36} />
              {(t.morto || t.desacordado) && (
                <span className="mapa-token__estado" role="img" aria-label={t.morto ? 'morto' : 'desacordado'}>
                  <Icone nome={t.morto ? 'caveira' : 'lua'} size={26} />
                </span>
              )}
              {condicoesExtras.length > 0 && <span className="mapa-token__condicoes">{badgeCondicoes(condicoesExtras)}</span>}
            </div>
          );
        })}
        <ReguaOverlay imgRenderRect={imgRenderRect} tamanho={tamanho} grade={grade} />
        <PingOverlay imgRenderRect={imgRenderRect} tamanho={tamanho} />
        <AoEViewOverlay imgRenderRect={imgRenderRect} tamanho={tamanho} grade={grade} />
        <FoWViewOverlay imgRenderRect={imgRenderRect} tamanho={tamanho} />
        <CombatOverlayJogador iniciativa={iniciativa} minhaFicha={minhaFicha} corMap={corMap} npcs={npcs} />
        <CrachasOverlayJogador minhaFicha={minhaFicha} outrasFichas={outrasFichas} />
      </div>

      {overlay && (() => {
        const souEu = overlay.tipo === 'pc' && overlay.participanteId === minhaFicha.id;
        const p = participantePorId(overlay.participanteId);
        if (!p) return null;
        return (
          <TokenOverlayJogador
            minhaFicha={minhaFicha}
            nome={p.nome}
            cor={p.cor}
            foto={p.foto}
            silhueta={p.silhueta}
            tipo={p.tipo}
            notas={p.notas}
            idFora={souEu ? null : overlay.participanteId}
            onFechar={() => setOverlay(null)}
          />
        );
      })()}
    </div>
  );
}
