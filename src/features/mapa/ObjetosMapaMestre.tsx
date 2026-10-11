import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icone from '../../components/Icone';
import { useStore } from '../../state/store';
import type { ObjetoMapa } from '../../state/types';
import { MAX_OBJETOS_MAPA } from '../../state/objetosMapa';
import { supabase } from '../../lib/supabaseClient';
import { prepararImagemObjeto, enviarImagemObjeto } from '../../lib/imagemObjetoMapa';
import { recarregarObjetosMapa, tentarObjetosMapa, useObjetosSyncUi } from '../../multiplayer/objetosMapaSync';
import { useMapaAtivo } from './useMapaAtivo';
import { estiloObjeto, posicaoAcoesObjeto, posicaoAlcaObjeto, type RetanguloObjetos } from './objetosMapaGeometria';
import './objetosMapa.css';

export function AdicionarImagemMapa({ aspectoMapa }: { aspectoMapa: number }) {
  const mapa = useMapaAtivo();
  const [ocupado, setOcupado] = useState(false), [erro, setErro] = useState('');
  const envio = useRef<AbortController | null>(null);
  const aviso = useObjetosSyncUi(s => mapa ? s.avisos[mapa.id] : '');
  useEffect(() => {
    setErro(''); setOcupado(false); envio.current = null;
    return () => { envio.current?.abort(); envio.current = null; };
  }, [mapa?.id]);
  const adicionar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]; e.target.value = '';
    if (!arquivo || !mapa || ocupado) return;
    const idMapa = mapa.id, abortar = new AbortController(); envio.current = abortar;
    setOcupado(true); setErro('');
    try {
      const imagem = await prepararImagemObjeto(arquivo, abortar.signal);
      let largura = .2, altura = largura * aspectoMapa * imagem.altura / imagem.largura;
      const escala = Math.min(1, .4 / altura); largura *= escala; altura *= escala;
      if (Math.min(largura, altura) < .01) throw new Error('essa imagem é alongada demais para este mapa.');
      const { url, path } = await enviarImagemObjeto(idMapa, imagem.blob, abortar.signal);
      const atual = useStore.getState().mapa;
      if (abortar.signal.aborted || atual.mapaAtivoId !== idMapa || !atual.biblioteca.some(m => m.id === idMapa)) return;
      if ((atual.biblioteca.find(m => m.id === idMapa)?.objetos?.length ?? 0) >= MAX_OBJETOS_MAPA) throw new Error('limite de 40 imagens por mapa.');
      useStore.getState().adicionarObjetoMapa(idMapa, { id: crypto.randomUUID(), nome: arquivo.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'imagem', imagemUrl: url, imagemPath: path, x: .5 - largura / 2, y: .5 - altura / 2, largura, altura, visivel: false });
    } catch (e) { if (!abortar.signal.aborted) setErro(e instanceof Error ? e.message : 'não foi possível adicionar a imagem.'); }
    finally { if (envio.current === abortar) { envio.current = null; setOcupado(false); } }
  };
  return <div className="mapa-imagem-controles">
    <label className="mapa-upload-botao" aria-disabled={!mapa || ocupado}>
      {ocupado ? 'preparando imagem…' : '+ Símbolos'}
      <input aria-label="adicionar imagem ao mapa" type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={!mapa || ocupado || (mapa.objetos?.length ?? 0) >= MAX_OBJETOS_MAPA} onChange={e => void adicionar(e)} />
    </label>
    {ocupado && <button onClick={() => { envio.current?.abort(); envio.current = null; setOcupado(false); }}>cancelar imagem</button>}
    {erro && <span role="alert">{erro}</span>}
    {mapa && aviso && <div role="status" className="mapa-imagem-aviso">{aviso}
      {aviso !== 'salvando objetos…' && <>
        <button onClick={() => tentarObjetosMapa(mapa.id)}>tentar novamente</button>
        <button onClick={() => { if (window.confirm('descartar o rascunho local dos objetos deste mapa e carregar os do servidor? exporte antes se quiser guardar sua versão.')) void recarregarObjetosMapa(mapa.id); }}>recarregar objetos</button>
      </>}
    </div>}
    {mapa?.objetosPendentes && supabase && !aviso && <span role="status">objetos aguardando envio</span>}
  </div>;
}

export default function ObjetosMapaMestre({ rect, active = true }: { rect: RetanguloObjetos | null; active?: boolean }) {
  const mapa = useMapaAtivo();
  const camada = useRef<HTMLDivElement>(null);
  const mapaId = mapa?.id;
  const temRetangulo = rect !== null;
  const [origem, setOrigem] = useState({ left: 0, top: 0, width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!active || !temRetangulo || !mapaId) return;
    const medir = () => {
      const r = camada.current?.getBoundingClientRect();
      if (r) setOrigem(anterior => anterior.left === r.left && anterior.top === r.top && anterior.width === window.innerWidth && anterior.height === window.innerHeight
        ? anterior : { left: r.left, top: r.top, width: window.innerWidth, height: window.innerHeight });
    };
    const observer = new ResizeObserver(medir);
    if (camada.current) observer.observe(camada.current);
    medir(); window.addEventListener('resize', medir); window.addEventListener('scroll', medir, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [active, temRetangulo, mapaId]);
  if (!mapa || !rect) return null;
  return <div ref={camada} className="mapa-objetos" aria-label="imagens do mapa">
    {mapa.objetos?.map(o => <ObjetoMestre key={`${mapa.id}/${o.id}`} objeto={o} mapaId={mapa.id} rect={rect} origem={origem} active={active} />)}
  </div>;
}

function ObjetoMestre({ objeto, mapaId, rect, origem, active }: { objeto: ObjetoMapa; mapaId: string; rect: RetanguloObjetos; origem: { left: number; top: number; width: number; height: number }; active: boolean }) {
  const [rascunho, setRascunho] = useState<ObjetoMapa | null>(null);
  const arrasto = useRef<{ x: number; y: number; inicial: ObjetoMapa; redimensionar: boolean } | null>(null);
  const atual = rascunho ?? objeto;
  const cancelar = () => { arrasto.current = null; setRascunho(null); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelar(); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, []);
  const iniciar = (e: React.PointerEvent, redimensionar = false) => {
    if (e.button !== 0 || e.shiftKey || e.altKey) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = { x: e.clientX, y: e.clientY, inicial: objeto, redimensionar };
    setRascunho(objeto);
  };
  const mover = (e: React.PointerEvent) => {
    const a = arrasto.current; if (!a) return;
    e.stopPropagation(); const dx = (e.clientX - a.x) / rect.renderW, dy = (e.clientY - a.y) / rect.renderH;
    if (a.redimensionar) {
      const fator = Math.max(Math.max(.01 / a.inicial.largura, .01 / a.inicial.altura), Math.min(1 + dx / a.inicial.largura,
        (1 - a.inicial.x) / a.inicial.largura, (1 - a.inicial.y) / a.inicial.altura));
      setRascunho({ ...a.inicial, largura: a.inicial.largura * fator, altura: a.inicial.altura * fator });
    } else setRascunho({ ...a.inicial, x: Math.max(0, Math.min(1 - a.inicial.largura, a.inicial.x + dx)), y: Math.max(0, Math.min(1 - a.inicial.altura, a.inicial.y + dy)) });
  };
  const soltar = (e: React.PointerEvent) => {
    if (!arrasto.current) return;
    e.stopPropagation();
    if (rascunho) { const { x, y, largura, altura } = rascunho; useStore.getState().atualizarObjetoMapa(mapaId, objeto.id, { x, y, largura, altura }); }
    cancelar();
  };
  const geometria = estiloObjeto(atual, rect);
  const imagemNaTela = { ...geometria, left: geometria.left + origem.left, top: geometria.top + origem.top };
  const acoes = posicaoAcoesObjeto(imagemNaTela, origem);
  const alca = posicaoAlcaObjeto(imagemNaTela, origem);
  return <div className="mapa-objeto mapa-objeto--mestre" data-objeto={objeto.id} data-visivel={objeto.visivel} style={geometria}
    onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={cancelar} onLostPointerCapture={cancelar}>
    <img src={objeto.imagemUrl} alt={objeto.nome} draggable={false} />
    {active && origem.width > 0 && createPortal(<><div className="mapa-objeto__acoes" style={acoes} role="group" aria-label={`imagem ${objeto.nome}: ${objeto.visivel ? 'revelada' : 'oculta'}`} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <button aria-label={`${objeto.visivel ? 'ocultar' : 'revelar'} imagem ${objeto.nome}`} title={objeto.visivel ? 'ocultar dos jogadores' : 'revelar aos jogadores'} aria-pressed={objeto.visivel}
        onClick={() => useStore.getState().atualizarObjetoMapa(mapaId, objeto.id, { visivel: !objeto.visivel })}><Icone nome={objeto.visivel ? 'olho' : 'olho-fechado'} /></button>
      <button aria-label={`remover imagem ${objeto.nome}`} title="remover imagem do mapa" onClick={() => useStore.getState().removerObjetoMapa(mapaId, objeto.id)}><Icone nome="fechar" /></button>
    </div>
    <button className="mapa-objeto__alca" style={alca} aria-label={`redimensionar imagem ${objeto.nome}`} title="arraste ou use as setas para redimensionar"
      onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || arrasto.current) return;
        e.preventDefault(); e.stopPropagation();
        const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? .01 : -.01;
        const fator = Math.max(Math.max(.01 / objeto.largura, .01 / objeto.altura), Math.min(1 + delta / objeto.largura, (1 - objeto.x) / objeto.largura, (1 - objeto.y) / objeto.altura));
        useStore.getState().atualizarObjetoMapa(mapaId, objeto.id, { largura: objeto.largura * fator, altura: objeto.altura * fator });
      }}
      onPointerDown={e => iniciar(e, true)} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={cancelar} onLostPointerCapture={cancelar}>↘</button>
    </>, document.body)}
  </div>;
}
