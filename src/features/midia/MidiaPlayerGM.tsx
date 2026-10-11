import { useEffect, useRef, useState } from 'react';
import { fadeVolume } from '../../lib/audioFade';
import { posicionarMidia } from '../../lib/midiaPlayback';
import { TransporteMusica } from '../../lib/transporteMusica';
import { useMidiaUiStore } from '../../state/midiaUiStore';
import { useSoundpadUiStore } from '../../state/soundpadUiStore';
import { useStore } from '../../state/store';

const FATOR_DUCK = 0.35;
const FADE_TROCA_MS = 700;
const FADE_DUCK_MS = 250;

/**
 * Motor de playback do lado do mestre — renderizado dentro do `<header>` do `App.tsx` (não
 * dentro da aba Mídia). Prender o `<audio>` ao componente de UMA aba seria frágil (um refactor
 * futuro que desmonte a aba mataria o áudio sem aviso) e o auto-avanço (`onEnded`) precisa
 * rodar mesmo com o mestre em outra aba. Sem UI de transporte visível — isso é `MidiaTab.tsx`,
 * que só despacha ações no store; este componente só espelha `s.midia` no `<audio>` de verdade.
 *
 * O aviso de bloqueio/erro já foi `position: fixed` no canto inferior esquerdo — cobria o fim
 * de listas longas em outras abas (mesmo bug do lado do jogador, `MidiaPlayerJogador.tsx`).
 * Morar no header evita colidir com o conteúdo rolável de qualquer aba.
 */
export default function MidiaPlayerGM() {
  const midia = useStore((s) => s.midia);
  const definirDuracao = useMidiaUiStore((s) => s.definirDuracao);
  const efeitoTocando = useSoundpadUiStore((s) => s.slotsTocando.size > 0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const motorRef = useRef<TransporteMusica | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [erroAudio, setErroAudio] = useState<string | null>(null);
  const [loopPadrao, setLoopPadrao] = useState(false);

  // refs (não deps de efeito) — usados só pra decidir se um fade deve disparar, sem forçar o
  // efeito de troca de faixa a reagir a `efeitoTocando` (esse é assunto do outro efeito, do duck).
  const fadeTokenRef = useRef(0);
  const tentativaRef = useRef(0);
  const prevFaixaIdRef = useRef<string | null>(null);
  const prevTocandoRef = useRef(false);
  const efeitoTocandoRef = useRef(efeitoTocando);
  efeitoTocandoRef.current = efeitoTocando;

  const faixaAtual = midia.faixas.find((f) => f.id === midia.faixaAtualId) ?? null;
  const url = faixaAtual?.url;

  useEffect(() => {
    if (!audioRef.current) return;
    const motor = new TransporteMusica(audioRef.current, {
      fallback: setLoopPadrao,
      avancou: (id, posicao, duracao) => {
        const s = useStore.getState();
        if (!s.midia.tocando) return;
        definirDuracao(Number.isFinite(duracao) ? duracao : 0);
        s.atualizarEstadoMidia({ faixaAtualId: id, posicaoSegundos: posicao, tocando: true });
      },
      terminou: () => {
        if (useStore.getState().midia.tocando) useStore.getState().atualizarEstadoMidia({ tocando: false, posicaoSegundos: 0 });
      },
    });
    motorRef.current = motor;
    return () => { motor.dispose(); motorRef.current = null; };
  }, [definirDuracao]);

  useEffect(() => { motorRef.current?.configurar(midia.faixas, midia.modoLoop); }, [midia.faixas, midia.modoLoop]);

  useEffect(() => {
    const audio = motorRef.current;
    const tentativa = tentativaRef;
    const fade = fadeTokenRef;
    return () => {
      tentativa.current++;
      fade.current++;
      audio?.pause();
    };
  }, []);

  useEffect(() => {
    const audio = motorRef.current;
    if (!audio) return;
    if (!audio.aceitarEstado(midia)) return;
    audio.selecionar(midia.faixaAtualId);
    const tentativa = ++tentativaRef.current;
    // Uma retomada durante o fade de pausa cancela a pausa pendente imediatamente.
    fadeTokenRef.current++;

    if (audio.getAttribute('src') !== (url ?? null)) {
      definirDuracao(0);
      audio.pause();
      if (url) audio.src = url;
      else { audio.removeAttribute('src'); audio.load(); }
      setErroAudio(null);
    }
    if (!url) { audio.pause(); setBloqueado(false); return; }
    posicionarMidia(audio, midia, true);

    // fade só entra numa troca de faixa/início/fim de verdade — não num resync puro de posição
    // (que também passa por aqui, via `atualizadoEm` nas deps).
    const continua = audio.consumirTransicao(url);
    const trocou = (prevFaixaIdRef.current !== midia.faixaAtualId || prevTocandoRef.current !== midia.tocando) && !continua;
    prevFaixaIdRef.current = midia.faixaAtualId;
    prevTocandoRef.current = midia.tocando;
    const volumeAlvo = midia.volume * (efeitoTocandoRef.current ? FATOR_DUCK : 1);

    if (midia.tocando) {
      if (trocou) audio.volume = 0;
      // A fonte seguinte pode já estar tocando pelo relógio de áudio. O eco do
      // avanço só confirma o transporte e não reinicia nem aplica fade na emenda.
      if (audio.paused) {
        audio.play().then(
          () => {
            if (tentativa !== tentativaRef.current) return;
            setBloqueado(false);
            fadeVolume(audio, useStore.getState().midia.volume * (efeitoTocandoRef.current ? FATOR_DUCK : 1), trocou ? FADE_TROCA_MS : 0, fadeTokenRef);
          },
          (erro) => {
            if (tentativa !== tentativaRef.current) return;
            if (erro?.name === 'NotAllowedError') setBloqueado(true);
          },
        );
      } else fadeVolume(audio, volumeAlvo, trocou ? FADE_TROCA_MS : 0, fadeTokenRef);
    } else if (trocou) {
      fadeVolume(audio, 0, FADE_TROCA_MS, fadeTokenRef, () => audio.pause());
    } else {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, midia.faixaAtualId, midia.tocando, midia.posicaoSegundos, midia.atualizadoEm]);

  // volume "de verdade" (slider do mestre) e duck automático (soundpad tocando) — os dois
  // convergem pro mesmo alvo, animado só quando é o duck entrando/saindo (o slider já dispara
  // muitos eventos sozinho ao arrastar; fade aí ficaria atrasado em vez de suave).
  useEffect(() => {
    const audio = motorRef.current;
    if (!audio) return;
    // Mudança no duck/volume não deve cancelar a rampa que vai concluir a pausa.
    if (!useStore.getState().midia.tocando) return;
    const volumeAlvo = midia.volume * (efeitoTocando ? FATOR_DUCK : 1);
    fadeVolume(audio, volumeAlvo, efeitoTocando ? FADE_DUCK_MS : 0, fadeTokenRef);
  }, [midia.volume, efeitoTocando]);

  const retomar = () => {
    const audio = motorRef.current;
    const atual = useStore.getState().midia;
    if (!audio || !atual.tocando) return;
    const tentativa = ++tentativaRef.current;
    fadeTokenRef.current++;
    audio.play()
      .then(() => {
        if (tentativa !== tentativaRef.current) return;
        setBloqueado(false);
        fadeVolume(audio, useStore.getState().midia.volume * (efeitoTocandoRef.current ? FATOR_DUCK : 1), FADE_TROCA_MS, fadeTokenRef);
      })
      .catch(() => {});
  };

  return (
    <>
      <audio
        ref={audioRef}
        loop={midia.modoLoop === 'faixa'}
        onLoadedMetadata={() => {
          const audio = motorRef.current;
          if (!audio) return;
          definirDuracao(audio.duration);
          if (audio.aceitarEstado(useStore.getState().midia)) posicionarMidia(audio, useStore.getState().midia, true);
        }}
        onError={() => faixaAtual && setErroAudio(`não consegui tocar "${faixaAtual.nome}" — formato não suportado neste navegador.`)}
      />
      {loopPadrao && <span role="status" className="mono" style={{ fontSize: 11, color: 'var(--ink-dim)' }}>música: reprodução padrão; a emenda pode ter pausa.</span>}
      {(bloqueado || erroAudio) && (
        <div
          className="mono"
          style={{
            background: 'var(--concrete-1)',
            border: '1px solid var(--ruido-dim)',
            borderRadius: '2px',
            padding: '0.3em 0.6em',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            maxWidth: '260px',
          }}
        >
          {bloqueado ? (
            <>
              <span style={{ color: 'var(--ruido)' }}>áudio bloqueado pelo navegador</span>
              <button onClick={retomar}>retomar áudio</button>
            </>
          ) : (
            <span style={{ color: 'var(--ruido)' }}>{erroAudio}</span>
          )}
        </div>
      )}
    </>
  );
}
