import { useEffect, useRef, useState } from 'react';
import { posicionarAmbiencia } from '../../lib/ambienciaPlayback';
import { registrarRetomadaAudio, useAudioJogadorStore } from '../../state/audioJogadorStore';
import { useAmbienciaUiStore } from '../../state/ambienciaUiStore';
import { useSoundpadUiStore } from '../../state/soundpadUiStore';
import { useStore } from '../../state/store';

/** Fora das abas. Não participa dos slots do soundpad nem do duck da música. */
export default function AmbienciaPlayer({ jogador = false }: { jogador?: boolean }) {
  const estado = useStore((s) => s.ambiencia);
  const habilitado = useAudioJogadorStore((s) => s.habilitado);
  const mudo = useSoundpadUiStore((s) => s.mudo);
  const audioRef = useRef<HTMLAudioElement>(null);
  const tentativa = useRef(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const faixa = estado.faixas.find((f) => f.id === estado.faixaAtualId);
  const url = faixa?.url;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const contador = tentativa;
    const tocar = () => {
      const atual = useStore.getState().ambiencia;
      if (!atual.tocando || !audio.paused || !atual.faixas.some((f) => f.id === atual.faixaAtualId) || (jogador && !useAudioJogadorStore.getState().habilitado)) return;
      const token = tentativa.current;
      void audio.play().then(() => {
        if (token === tentativa.current) setAviso(null);
      }, (erro: { name?: string }) => {
        if (token !== tentativa.current || erro?.name === 'AbortError') return;
        if (erro?.name === 'NotAllowedError') {
          if (jogador) useAudioJogadorStore.getState().definirHabilitado(false);
          else setAviso('ambiência bloqueada pelo navegador');
        } else setAviso('não consegui tocar a ambiência — confira o arquivo de áudio.');
      });
    };
    const carregar = () => {
      posicionarAmbiencia(audio, useStore.getState().ambiencia);
      if (!jogador) useAmbienciaUiStore.getState().atualizar(audio.duration, audio.currentTime);
      tocar();
    };
    audio.addEventListener('loadedmetadata', carregar);
    const removerRetomada = jogador ? registrarRetomadaAudio(tocar) : () => {};
    return () => {
      contador.current++;
      audio.pause();
      audio.removeEventListener('loadedmetadata', carregar);
      removerRetomada();
    };
  }, [jogador]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = ++tentativa.current;
    setAviso(null);
    if (audio.getAttribute('src') !== (url ?? null)) {
      if (!jogador) useAmbienciaUiStore.getState().atualizar(0, 0);
      audio.pause();
      if (url) audio.src = url;
      else { audio.removeAttribute('src'); audio.load(); }
    }
    if (!url) { audio.pause(); return; }
    posicionarAmbiencia(audio, useStore.getState().ambiencia);
    if (!estado.tocando || (jogador && !habilitado)) { audio.pause(); return; }
    if (!audio.paused) return;
    void audio.play().then(() => {
      if (token === tentativa.current) setAviso(null);
    }, (erro: { name?: string }) => {
      if (token !== tentativa.current || erro?.name === 'AbortError') return;
      if (erro?.name === 'NotAllowedError') {
        if (jogador) useAudioJogadorStore.getState().definirHabilitado(false);
        else setAviso('ambiência bloqueada pelo navegador');
      } else setAviso('não consegui tocar a ambiência — confira o arquivo de áudio.');
    });
  }, [url, estado.faixaAtualId, estado.tocando, estado.posicaoSegundos, estado.atualizadoEm, jogador, habilitado]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { audio.volume = estado.volume; audio.muted = jogador && mudo; }
  }, [estado.volume, jogador, mudo]);

  return <>
    <audio ref={audioRef} loop data-canal="ambiencia"
      onTimeUpdate={(e) => { if (!jogador) useAmbienciaUiStore.getState().atualizar(e.currentTarget.duration, e.currentTarget.currentTime); }}
      onError={() => { if (useStore.getState().ambiencia.faixaAtualId) setAviso('não consegui tocar a ambiência — confira o arquivo de áudio.'); }} />
    {aviso && <div className="mono" role="status" style={{ fontSize: 11, color: 'var(--ruido)', maxWidth: 260 }}>
      {aviso}
      {aviso.includes('bloqueada') && <button onClick={() => {
        const audio = audioRef.current;
        if (audio && useStore.getState().ambiencia.tocando) void audio.play().then(() => setAviso(null), () => {});
      }}>retomar ambiência</button>}
    </div>}
  </>;
}
