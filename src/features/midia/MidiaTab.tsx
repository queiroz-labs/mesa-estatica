import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { IconePause, IconePlay } from '../combate/icones';
import { calcularPosicaoMidia } from '../../multiplayer/posicaoMidia';
import { marcarRemocaoExplicita } from '../../multiplayer/remocaoExplicita';
import { deletarR2, isUrlSupabaseStorage, uploadR2 } from '../../multiplayer/uploadR2';
import { useMidiaUiStore } from '../../state/midiaUiStore';
import { useStore } from '../../state/store';
import type { FaixaMidia } from '../../state/types';
import SoundpadGrid from './SoundpadGrid';
import AmbienciaPanel from './AmbienciaPanel';
import ControleVolume from './ControleVolume';
import Icone from '../../components/Icone';

const formatarTempo = (segundos: number): string => {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Aba Mídia do mestre — upload, playlist (reordenar por ↑/↓, excluir) e transporte
 * (tocar/pausar/próxima/anterior/±10s/loop/barra de progresso). Só despacha ações no store —
 * não tem `<audio>` próprio (isso é `MidiaPlayerGM.tsx`, montado na raiz do App, pra não ter
 * duas fontes de verdade tocando ao mesmo tempo). A duração da faixa vem de `midiaUiStore`
 * (fato local do cliente, lido do `<audio>` de verdade em `MidiaPlayerGM.tsx`) — este
 * componente não tem como saber a duração sozinho.
 */
export default function MidiaTab() {
  const midia = useStore((s) => s.midia);
  const duracao = useMidiaUiStore((s) => s.duracaoSegundos);
  const adicionarFaixaMidia = useStore((s) => s.adicionarFaixaMidia);
  const removerFaixaMidia = useStore((s) => s.removerFaixaMidia);
  const moverFaixaMidia = useStore((s) => s.moverFaixaMidia);
  const atualizarEstadoMidia = useStore((s) => s.atualizarEstadoMidia);
  const definirVolumeMidia = useStore((s) => s.definirVolumeMidia);
  const definirModoLoopMidia = useStore((s) => s.definirModoLoopMidia);
  const definirTagFaixaMidia = useStore((s) => s.definirTagFaixaMidia);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [posicaoExibida, setPosicaoExibida] = useState(midia.posicaoSegundos);
  const [filtro, setFiltro] = useState('');

  const ordenadas = [...midia.faixas].sort((a, b) => a.ordem - b.ordem);
  const faixaAtual = midia.faixas.find((f) => f.id === midia.faixaAtualId) ?? null;

  const filtroNormalizado = filtro.trim().toLowerCase();
  const ordenadasFiltradas = filtroNormalizado
    ? ordenadas.filter(
        (f) => f.nome.toLowerCase().includes(filtroNormalizado) || (f.tag ?? '').toLowerCase().includes(filtroNormalizado),
      )
    : ordenadas;

  // relógio local só pra exibição do tempo decorrido — a posição real vive em midia.posicaoSegundos.
  useEffect(() => {
    if (!midia.tocando) {
      setPosicaoExibida(calcularPosicaoMidia(midia, duracao));
      return;
    }
    const atualizar = () => setPosicaoExibida(calcularPosicaoMidia(midia, duracao));
    atualizar();
    const intervalo = setInterval(atualizar, 500);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midia.tocando, midia.posicaoSegundos, midia.atualizadoEm, midia.modoLoop, duracao]);

  const importarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo || !supabase) return;
    if (arquivo.size > 100 * 1024 * 1024) { setErro('arquivo excede 100MB — comprima ou divida em partes menores.'); return; }
    setErro(null);
    setEnviando(true);
    try {
      const path = `sfx/${crypto.randomUUID()}-${arquivo.name}`;
      const { url, erro: mensagemErro } = await uploadR2(path, arquivo, arquivo.type || 'application/octet-stream');
      if (!url) {
        setErro(mensagemErro ?? 'upload falhou — confira o formato/tamanho e tente de novo.');
        return;
      }
      adicionarFaixaMidia(arquivo.name, path, url);
    } catch {
      setErro('upload falhou — confira o formato/tamanho e tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  const excluir = async (faixa: FaixaMidia) => {
    if (!window.confirm(`excluir "${faixa.nome}"?`)) return;
    marcarRemocaoExplicita(faixa.id);
    removerFaixaMidia(faixa.id);
    // faixas de antes da migração pro R2 ainda estão no Supabase Storage — decide o backend
    // pela URL guardada em vez de assumir que toda faixa já está no R2.
    if (isUrlSupabaseStorage(faixa.url)) {
      if (supabase) {
        const { error } = await supabase.storage.from('midia').remove([faixa.path]);
        if (error) console.error('[MidiaTab] remoção do Storage falhou (linha já removida)', error);
      }
    } else {
      const ok = await deletarR2(faixa.path);
      if (!ok) console.error('[MidiaTab] remoção do R2 falhou (linha já removida)');
    }
  };

  const selecionar = (id: string) => atualizarEstadoMidia({ faixaAtualId: id, posicaoSegundos: 0, tocando: true });

  const alternarTocar = () => {
    if (!faixaAtual) {
      if (ordenadas.length > 0) selecionar(ordenadas[0].id);
      return;
    }
    // manda a posição real junto — sem isso, `atualizadoEm` recarimba e `MidiaPlayerGM`
    // resincroniza `audio.currentTime` pro `posicaoSegundos` velho (parado desde o último
    // seek), fazendo a faixa voltar pro início ao pausar.
    atualizarEstadoMidia({ tocando: !midia.tocando, posicaoSegundos: calcularPosicaoMidia(midia, duracao) });
  };

  const ir = (direcao: 'proxima' | 'anterior') => {
    if (ordenadas.length === 0) return;
    const idxAtual = ordenadas.findIndex((f) => f.id === midia.faixaAtualId);
    const base = idxAtual === -1 ? 0 : idxAtual;
    const proximoIdx = (base + (direcao === 'proxima' ? 1 : -1) + ordenadas.length) % ordenadas.length;
    selecionar(ordenadas[proximoIdx].id);
  };

  const pular = (deltaSegundos: number) => {
    const novaPosicao = Math.min(duracao, Math.max(0, calcularPosicaoMidia(midia, duracao) + deltaSegundos));
    setPosicaoExibida(novaPosicao);
    atualizarEstadoMidia({ posicaoSegundos: novaPosicao });
  };

  const proximoModoLoop = () => (midia.modoLoop === 'nenhum' ? 'faixa' : midia.modoLoop === 'faixa' ? 'lista' : 'nenhum');
  const rotuloLoop = midia.modoLoop === 'nenhum' ? 'desligado' : midia.modoLoop === 'faixa' ? 'faixa atual' : 'playlist';

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <label className="mapa-upload-botao">
          {enviando ? 'enviando…' : 'enviar áudio'}
          <input
            type="file"
            accept="audio/*,video/mp4,.m4a,.aac,.flac,.ogg,.wav,.mp3"
            hidden
            onChange={importarArquivo}
            disabled={enviando}
          />
        </label>
        {erro && <span style={{ color: 'var(--ruido)', fontSize: '12px' }}>{erro}</span>}
      </div>

      <div className="secao" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="mono" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{faixaAtual ? faixaAtual.nome : 'nenhuma faixa selecionada'}</span>
          <span className="mono" style={{ fontSize: '12px', color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>
            {formatarTempo(posicaoExibida)} / {formatarTempo(duracao)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={duracao || 0}
          step={0.1}
          value={Math.min(posicaoExibida, duracao || 0)}
          onChange={(e) => {
            const novaPosicao = Number(e.target.value);
            setPosicaoExibida(novaPosicao);
            atualizarEstadoMidia({ posicaoSegundos: novaPosicao });
          }}
          disabled={!faixaAtual || duracao === 0}
          aria-label="posição da música"
          title="arrastar pra outro ponto da faixa"
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => ir('anterior')} disabled={ordenadas.length === 0}>
            <Icone nome="seta-esquerda" /> anterior
          </button>
          <button className="acento" onClick={alternarTocar} disabled={ordenadas.length === 0}>
            {midia.tocando ? 'pausar' : 'tocar'}
          </button>
          <button onClick={() => ir('proxima')} disabled={ordenadas.length === 0}>
            próxima <Icone nome="seta-direita" />
          </button>
          <button onClick={() => pular(-10)} disabled={!faixaAtual || duracao === 0} title="voltar 10s">
            −10s
          </button>
          <button onClick={() => pular(10)} disabled={!faixaAtual || duracao === 0} title="avançar 10s">
            +10s
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => definirModoLoopMidia(proximoModoLoop())} title="alternar modo de repetição">
            loop: {rotuloLoop}
          </button>
        </div>
        <ControleVolume id="midia-volume" nome="música (todos)" volume={midia.volume} onChange={definirVolumeMidia}
          title="volume da música — vale pra todo mundo, mestre e jogadores" />
      </div>

      <AmbienciaPanel />
      <SoundpadGrid />

      <div className="secao" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 className="label" style={{ margin: 0 }}>
            playlist
          </h3>
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="buscar por nome ou tag…"
            aria-label="buscar na playlist"
            style={{ fontSize: 12, flex: '1 1 200px', minWidth: 0, maxWidth: 260 }}
          />
        </div>
        {ordenadas.length === 0 ? (
          <p className="vazio">nenhuma faixa ainda — envie um áudio acima.</p>
        ) : ordenadasFiltradas.length === 0 ? (
          <p className="vazio">nenhuma faixa bate com a busca.</p>
        ) : (
          ordenadasFiltradas.map((faixa) => {
            const idx = ordenadas.findIndex((f) => f.id === faixa.id);
            return (
              <div
                key={faixa.id}
                className="midia-playlist-linha"
                onClick={() => selecionar(faixa.id)}
                style={{
                  background: faixa.id === midia.faixaAtualId ? 'var(--concrete-1)' : undefined,
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '0.3em' }}>
                  {faixa.id === midia.faixaAtualId && (midia.tocando ? <IconePlay size={11} style={{ flexShrink: 0 }} /> : <IconePause size={11} style={{ flexShrink: 0 }} />)}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{faixa.nome}</span>
                </span>
                <input
                  type="text"
                  value={faixa.tag ?? ''}
                  placeholder="tag"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => definirTagFaixaMidia(faixa.id, e.target.value)}
                  style={{ fontSize: 11, width: 90, flexShrink: 0 }}
                />
                <button
                  className="icone-botao"
                  onClick={(e) => {
                    e.stopPropagation();
                    moverFaixaMidia(faixa.id, 'cima');
                  }}
                  disabled={idx === 0}
                  title="mover pra cima"
                  aria-label={`mover ${faixa.nome} para cima`}
                >
                  <Icone nome="seta-cima" />
                </button>
                <button
                  className="icone-botao"
                  onClick={(e) => {
                    e.stopPropagation();
                    moverFaixaMidia(faixa.id, 'baixo');
                  }}
                  disabled={idx === ordenadas.length - 1}
                  title="mover pra baixo"
                  aria-label={`mover ${faixa.nome} para baixo`}
                >
                  <Icone nome="seta-baixo" />
                </button>
                <button
                  type="button"
                  className="icone-botao"
                  onClick={(e) => {
                    e.stopPropagation();
                    void excluir(faixa);
                  }}
                  title={`excluir música ${faixa.nome}`}
                  aria-label={`excluir música ${faixa.nome}`}
                >
                  <Icone nome="lixeira" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
