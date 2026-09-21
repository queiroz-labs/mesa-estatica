import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { IconeStop } from '../combate/icones';
import { marcarRemocaoExplicita } from '../../multiplayer/remocaoExplicita';
import { deletarR2, extrairMensagemErro, isUrlSupabaseStorage, uploadR2 } from '../../multiplayer/uploadR2';
import { useSoundpadUiStore } from '../../state/soundpadUiStore';
import { useStore } from '../../state/store';
import { QUANTIDADE_SLOTS_SOUNDPAD } from '../../state/soundpad';
import type { SomSoundpad } from '../../state/types';

const SLOTS = Array.from({ length: QUANTIDADE_SLOTS_SOUNDPAD }, (_, i) => i);

interface ResultadoBusca {
  id: number;
  nome: string;
  duracao: number;
  previewUrl: string;
}

const formatarDuracao = (segundos: number): string => {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Soundpad do mestre — 12 botões de efeito. Clicar num slot parado dispara pra todo mundo;
 * clicar de novo enquanto ele está tocando (neste cliente) para só esse efeito — não mexe nos
 * outros slots nem na jukebox, que tem seus próprios controles de transporte. O áudio em si
 * toca no `SoundpadPlayer` (montado no header), por cima da música, sem tocar no player dela.
 *
 * "Tocando" vem do `soundpadUiStore` (fato local deste cliente, não sincronizado — cada
 * cliente tem seu próprio `<audio>`), não do `ultimoDisparo` do store principal (que só diz
 * qual foi o ÚLTIMO comando, não se o áudio ainda está de fato tocando ou já terminou).
 *
 * Volume é separado do da música e também vale pra todos — o mestre equilibra efeito e trilha
 * de forma independente.
 */
export default function SoundpadGrid() {
  const sons = useStore((s) => s.soundpad.sons);
  const volume = useStore((s) => s.soundpad.volume);
  const definirSomSoundpad = useStore((s) => s.definirSomSoundpad);
  const removerSomSoundpad = useStore((s) => s.removerSomSoundpad);
  const definirVolumeSoundpad = useStore((s) => s.definirVolumeSoundpad);
  const dispararSoundpad = useStore((s) => s.dispararSoundpad);
  const pararSoundpad = useStore((s) => s.pararSoundpad);
  const slotsTocando = useSoundpadUiStore((s) => s.slotsTocando);

  const [enviandoSlot, setEnviandoSlot] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const slotAlvo = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [slotBusca, setSlotBusca] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [usandoId, setUsandoId] = useState<number | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  useEffect(() => {
    if (slotBusca === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && usandoId === null) setSlotBusca(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slotBusca, usandoId]);

  const escolherArquivo = (slot: number) => {
    slotAlvo.current = slot;
    inputRef.current?.click();
  };

  const abrirBusca = (slot: number) => {
    setSlotBusca(slot);
    setQuery('');
    setResultados([]);
    setErroBusca(null);
  };

  const buscar = async () => {
    if (!supabase || !query.trim()) return;
    setBuscando(true);
    setErroBusca(null);
    try {
      const { data, error } = await supabase.functions.invoke<{ resultados: ResultadoBusca[] }>('buscar-freesound', {
        body: { acao: 'buscar', query },
      });
      if (error || !data) throw new Error();
      setResultados(data.resultados);
    } catch {
      setErroBusca('busca falhou — confira sua conexão e tente de novo.');
    } finally {
      setBuscando(false);
    }
  };

  const usar = async (resultado: ResultadoBusca) => {
    if (!supabase || slotBusca === null) return;
    setUsandoId(resultado.id);
    setErroBusca(null);
    try {
      const { data, error } = await supabase.functions.invoke<{ path: string; url: string }>('buscar-freesound', {
        body: { acao: 'usar', slot: slotBusca, previewUrl: resultado.previewUrl, nome: resultado.nome },
      });
      if (error || !data) {
        setErroBusca((await extrairMensagemErro(error)) ?? 'não deu pra usar esse som — tenta outro ou de novo em instantes.');
        return;
      }
      definirSomSoundpad(slotBusca, resultado.nome, data.path, data.url);
      setSlotBusca(null);
    } catch {
      setErroBusca('não deu pra usar esse som — tenta outro ou de novo em instantes.');
    } finally {
      setUsandoId(null);
    }
  };

  const enviar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    const slot = slotAlvo.current;
    slotAlvo.current = null;
    if (!arquivo || slot === null || !supabase) return;
    if (arquivo.size > 100 * 1024 * 1024) { setErro('arquivo excede 100MB — comprima ou divida em partes menores.'); return; }
    setErro(null);
    setEnviandoSlot(slot);
    try {
      const path = `sfx/${crypto.randomUUID()}-${arquivo.name}`;
      const { url, erro: mensagemErro } = await uploadR2(path, arquivo, arquivo.type || 'application/octet-stream');
      if (!url) {
        setErro(mensagemErro ?? 'upload falhou — confira o formato/tamanho e tente de novo.');
        return;
      }
      definirSomSoundpad(slot, arquivo.name, path, url);
    } catch {
      setErro('upload falhou — confira o formato/tamanho e tente de novo.');
    } finally {
      setEnviandoSlot(null);
    }
  };

  const limpar = async (som: SomSoundpad) => {
    marcarRemocaoExplicita(som.id);
    removerSomSoundpad(som.slot);
    // sons de antes da migração pro R2 ainda estão no Supabase Storage — decide o backend
    // pela URL guardada em vez de assumir que todo som já está no R2.
    if (isUrlSupabaseStorage(som.url)) {
      if (supabase) {
        const { error } = await supabase.storage.from('midia').remove([som.path]);
        if (error) console.error('[SoundpadGrid] remoção do Storage falhou (linha já removida)', error);
      }
    } else {
      const ok = await deletarR2(som.path);
      if (!ok) console.error('[SoundpadGrid] remoção do R2 falhou (linha já removida)');
    }
  };

  return (
    <div className="secao" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 className="label" style={{ margin: 0 }}>
          soundpad
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="vazio" style={{ fontSize: 12 }} title="volume dos efeitos — independente do volume da música, vale pra todo mundo">
            volume efeitos (todos)
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => definirVolumeSoundpad(Number(e.target.value))}
            style={{ width: '260px' }}
          />
        </div>
      </div>

      {!supabase ? (
        <p className="vazio">
          soundpad indisponível — precisa de conexão configurada (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`).
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
            {SLOTS.map((slot) => {
              const som = sons.find((x) => x.slot === slot) ?? null;
              const enviando = enviandoSlot === slot;
              const tocando = slotsTocando.has(slot);
              return (
                <div
                  key={slot}
                  style={{
                    border: '1px solid var(--concrete-2)',
                    background: 'var(--concrete-0)',
                    borderRadius: 2,
                    padding: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    minHeight: 78,
                  }}
                >
                  {som ? (
                    <>
                      <button
                        className="acento"
                        onClick={() => {
                          if (tocando) pararSoundpad(slot);
                          else dispararSoundpad(slot);
                        }}
                        title={tocando ? `parar "${som.nome}"` : `disparar "${som.nome}" pra todos`}
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.3em',
                          outline: tocando ? '2px solid var(--rede)' : undefined,
                        }}
                      >
                        {tocando && <IconeStop size={10} style={{ flexShrink: 0 }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{som.nome}</span>
                      </button>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button
                          className="icone-botao"
                          onClick={() => escolherArquivo(slot)}
                          disabled={enviando}
                          title="substituir o som deste botão"
                          style={{ fontSize: 10, flex: 1 }}
                        >
                          {enviando ? 'enviando…' : 'trocar'}
                        </button>
                        <button
                          className="icone-botao"
                          onClick={() => abrirBusca(slot)}
                          disabled={enviando}
                          title="buscar efeito no Freesound"
                          style={{ fontSize: 10, flex: 1 }}
                        >
                          buscar
                        </button>
                        <button className="icone-botao perigo" onClick={() => limpar(som)} title="remover" style={{ fontSize: 10 }}>
                          ×
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
                      <button
                        onClick={() => escolherArquivo(slot)}
                        disabled={enviando}
                        title={`escolher um efeito pro botão ${slot + 1}`}
                        style={{ flex: 1, color: 'var(--ink-dim)' }}
                      >
                        {enviando ? 'enviando…' : '+ som'}
                      </button>
                      <button
                        className="icone-botao"
                        onClick={() => abrirBusca(slot)}
                        disabled={enviando}
                        title="buscar efeito no Freesound"
                        style={{ fontSize: 10 }}
                      >
                        buscar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {erro && <span style={{ color: 'var(--ruido)', fontSize: '12px' }}>{erro}</span>}
          <p className="vazio">o efeito toca por cima da música, sem interromper a faixa.</p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.m4a,.aac,.flac,.ogg,.wav,.mp3"
        hidden
        onChange={enviar}
      />

      {slotBusca !== null && (
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
          onClick={() => usandoId === null && setSlotBusca(null)}
        >
          <div
            className="secao"
            style={{
              width: 720,
              maxWidth: '90vw',
              maxHeight: '80vh',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0 }}>buscar som no Freesound (botão {slotBusca + 1})</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !buscando && buscar()}
                placeholder='ex.: "estática", "passos concreto", "rádio distorcido"'
                style={{ flex: 1 }}
                autoFocus
              />
              <button className="acento" onClick={buscar} disabled={buscando || !query.trim()}>
                {buscando ? 'buscando…' : 'buscar'}
              </button>
            </div>
            {erroBusca && <span style={{ color: 'var(--ruido)', fontSize: '12px' }}>{erroBusca}</span>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto' }}>
              {resultados.length === 0 && !buscando && (
                <p className="vazio">nenhum resultado ainda — busca um termo acima (só efeitos CC0).</p>
              )}
              {resultados.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4rem 0.5rem',
                    border: '1px solid var(--concrete-2)',
                    borderRadius: '2px',
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.nome}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
                    {formatarDuracao(r.duracao)}
                  </span>
                  <audio controls src={r.previewUrl} style={{ height: 28, maxWidth: 220 }} />
                  <button
                    className="acento"
                    onClick={() => usar(r)}
                    disabled={usandoId !== null}
                    style={{ fontSize: 12 }}
                  >
                    {usandoId === r.id ? 'usando…' : 'usar'}
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setSlotBusca(null)} disabled={usandoId !== null}>
              fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
