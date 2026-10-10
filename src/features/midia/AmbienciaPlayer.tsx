import { useEffect, useRef, useState } from 'react';
import { posicionarAmbiencia } from '../../lib/ambienciaPlayback';
import { registrarRetomadaAudio, useAudioJogadorStore } from '../../state/audioJogadorStore';
import { useAmbienciaUiStore } from '../../state/ambienciaUiStore';
import { useSoundpadUiStore } from '../../state/soundpadUiStore';
import { useStore } from '../../state/store';
import { CAMADA_PRINCIPAL, obterCamadaAmbiencia } from '../../state/ambiencia';

function atualizarTempo(id: string, duracao: number, posicao: number) {
  const ui = useAmbienciaUiStore.getState();
  if (id === CAMADA_PRINCIPAL) ui.atualizar(duracao, posicao);
  else ui.atualizarCamada(id, duracao, posicao);
}

const vazio = { id: '', faixaAtualId: null, tocando: false, posicaoSegundos: 0, atualizadoEm: '', volume: 0.5 };

/** Fora das abas. Não participa dos slots do soundpad nem do duck da música. */
export default function AmbienciaPlayer({ jogador = false }: { jogador?: boolean }) {
  const camadas = useStore((s) => s.ambiencia.camadas);
  return <>
    <CamadaAmbienciaPlayer jogador={jogador} camadaId={CAMADA_PRINCIPAL} />
    {camadas?.map((c) => <CamadaAmbienciaPlayer key={c.id} jogador={jogador} camadaId={c.id} />)}
  </>;
}

export function CamadaAmbienciaPlayer({ jogador = false, camadaId }: { jogador?: boolean; camadaId: string }) {
  const ambiencia = useStore((s) => s.ambiencia);
  const estado = obterCamadaAmbiencia(ambiencia, camadaId) ?? vazio;
  const habilitado = useAudioJogadorStore((s) => s.habilitado);
  const mudo = useSoundpadUiStore((s) => s.mudo);
  const audioRef = useRef<HTMLAudioElement>(null);
  const tentativa = useRef(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const faixa = ambiencia.faixas.find((f) => f.id === estado.faixaAtualId);
  const url = faixa?.url;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const contador = tentativa;
    const tocar = () => {
      const atual = obterCamadaAmbiencia(useStore.getState().ambiencia, camadaId);
      if (!atual?.tocando || !audio.paused || !atual.faixaAtualId || (jogador && !useAudioJogadorStore.getState().habilitado)) return;
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
      const atual = obterCamadaAmbiencia(useStore.getState().ambiencia, camadaId);
      if (!atual) return;
      posicionarAmbiencia(audio, atual);
      if (!jogador) atualizarTempo(camadaId, audio.duration, audio.currentTime);
      tocar();
    };
    audio.addEventListener('loadedmetadata', carregar);
    const removerRetomada = jogador ? registrarRetomadaAudio(tocar) : () => {};
    return () => {
      contador.current++;
      audio.pause();
      audio.removeEventListener('loadedmetadata', carregar);
      removerRetomada();
      audio.removeAttribute('src');
      audio.load();
      if (!jogador && camadaId !== CAMADA_PRINCIPAL) useAmbienciaUiStore.getState().removerCamada(camadaId);
    };
  }, [jogador, camadaId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = ++tentativa.current;
    setAviso(null);
    if (audio.getAttribute('src') !== (url ?? null)) {
      if (!jogador) atualizarTempo(camadaId, 0, 0);
      audio.pause();
      if (url) audio.src = url;
      else { audio.removeAttribute('src'); audio.load(); }
    }
    if (!url) { audio.pause(); return; }
    const atual = obterCamadaAmbiencia(useStore.getState().ambiencia, camadaId);
    if (!atual) { audio.pause(); return; }
    posicionarAmbiencia(audio, atual);
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
  }, [url, estado.faixaAtualId, estado.tocando, estado.posicaoSegundos, estado.atualizadoEm, jogador, habilitado, camadaId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { audio.volume = estado.volume; audio.muted = jogador && mudo; }
  }, [estado.volume, jogador, mudo]);

  return <>
    <audio ref={audioRef} loop data-canal="ambiencia" data-camada={camadaId}
      onTimeUpdate={(e) => { if (!jogador) atualizarTempo(camadaId, e.currentTarget.duration, e.currentTarget.currentTime); }}
      onError={() => { if (obterCamadaAmbiencia(useStore.getState().ambiencia, camadaId)?.faixaAtualId) setAviso('não consegui tocar uma camada de ambiência — confira o arquivo de áudio.'); }} />
    {aviso && <div className="mono" role="status" style={{ fontSize: 11, color: 'var(--ruido)', maxWidth: 260 }}>
      {aviso}
      {aviso.includes('bloqueada') && <button onClick={() => {
        const audio = audioRef.current;
        if (audio && obterCamadaAmbiencia(useStore.getState().ambiencia, camadaId)?.tocando) void audio.play().then(() => setAviso(null), () => {});
      }}>retomar ambiência</button>}
    </div>}
  </>;
}
