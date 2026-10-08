import { useEffect, useRef } from 'react';
import { fadeVolume } from '../../lib/audioFade';
import { posicionarMidia } from '../../lib/midiaPlayback';
import { useSoundpadUiStore } from '../../state/soundpadUiStore';
import { useStore } from '../../state/store';
import { habilitarAudioJogador, useAudioJogadorStore } from '../../state/audioJogadorStore';

const FATOR_DUCK = 0.35;
const FADE_TROCA_MS = 700;
const FADE_DUCK_MS = 250;

/** Preferência por navegador (não por sessão da mesa) — mesmo padrão de `CHAVE_TOKEN_MESTRE`
 *  (multiplayer/auth.ts): localStorage direto, fora da store principal. Precisa ser assim porque
 *  o `persist` de `useStore` é um no-op no bundle do jogador de propósito (store.ts) — reter
 *  aqui o estado da MESA anterior seria o bug errado a evitar. */

/**
 * Motor de playback do lado do jogador — renderizado dentro do `<header>` do `PlayerApp.tsx`
 * (não dentro de uma aba), mesmo raciocínio de `MidiaPlayerGM.tsx` (não desmonta trocando de
 * aba). Nunca escreve em `s.midia` — só espelha o que o mestre manda, sempre com o limiar de
 * desvio (não existe "ação local" aqui pra pular a checagem, diferente do lado do mestre).
 *
 * Já foi `position: fixed` no canto inferior esquerdo da tela — cobria o fim de listas longas
 * (ficha de outros jogadores na aba Personagens, achado ao vivo). Como header não faz parte da
 * área rolável de nenhuma aba, morar ali resolve pra qualquer aba, não só a que reportou o bug.
 *
 * Volume é controlado só pelo GM (`midia.volume`, sincronizado — slider em `MidiaTab.tsx`) —
 * decisão do usuário, todo mundo ouve no mesmo nível. Mudo continua local (cada jogador
 * silencia só pra si, sem afetar os outros nem precisar de permissão do mestre).
 */
export default function MidiaPlayerJogador() {
  const midia = useStore((s) => s.midia);
  const efeitoTocando = useSoundpadUiStore((s) => s.slotsTocando.size > 0);
  const mudo = useSoundpadUiStore((s) => s.mudo);
  const definirMudo = useSoundpadUiStore((s) => s.definirMudo);
  const audioRef = useRef<HTMLAudioElement>(null);
  const desbloqueado = useAudioJogadorStore((s) => s.habilitado);
  const setDesbloqueado = useAudioJogadorStore((s) => s.definirHabilitado);

  // reverte a preferência salva se o autoplay "herdado" (sem gesto novo nesta carga de página)
  // for negado de verdade pelo navegador — sem isso, quem salvou a preferência antes do
  // navegador acumular engajamento suficiente (1ª sessão, Firefox/Safari sem a heurística do
  // Chrome) fica com o botão escondido e nenhum som, sem nenhum caminho de retry visível.
  const desbloquearFalhou = () => {
    setDesbloqueado(false);
  };

  const fadeTokenRef = useRef(0);
  const tentativaRef = useRef(0);
  const prevFaixaIdRef = useRef<string | null>(null);
  const prevTocandoRef = useRef(false);
  const efeitoTocandoRef = useRef(efeitoTocando);
  efeitoTocandoRef.current = efeitoTocando;

  const faixaAtual = midia.faixas.find((f) => f.id === midia.faixaAtualId) ?? null;
  const url = faixaAtual?.url;

  useEffect(() => {
    const audio = audioRef.current;
    const tentativa = tentativaRef;
    const fade = fadeTokenRef;
    return () => {
      tentativa.current++;
      fade.current++;
      audio?.pause();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const tentativa = ++tentativaRef.current;
    fadeTokenRef.current++;

    if (audio.getAttribute('src') !== (url ?? null)) {
      audio.pause();
      if (url) audio.src = url;
      else { audio.removeAttribute('src'); audio.load(); }
    }
    if (!url) { audio.pause(); return; }
    posicionarMidia(audio, midia);

    // fade só entra numa troca de faixa/início/fim de verdade — não num resync puro de posição.
    const trocou = prevFaixaIdRef.current !== midia.faixaAtualId || prevTocandoRef.current !== midia.tocando;
    prevFaixaIdRef.current = midia.faixaAtualId;
    prevTocandoRef.current = midia.tocando;

    if (!desbloqueado) { audio.pause(); return; }

    const volumeAlvo = midia.volume * (efeitoTocandoRef.current ? FATOR_DUCK : 1);
    if (midia.tocando) {
      if (trocou) audio.volume = 0;
      // só chama play() se ainda não estiver tocando — sem isso, todo resync remoto (ex.: o
      // próprio eco do restart de loop do mestre chegando via Realtime) reemitia play() de novo
      // em cima de uma reprodução já em andamento.
      if (audio.paused) {
        audio
          .play()
          .then(() => {
            if (tentativa !== tentativaRef.current) return;
            fadeVolume(audio, useStore.getState().midia.volume * (efeitoTocandoRef.current ? FATOR_DUCK : 1), trocou ? FADE_TROCA_MS : 0, fadeTokenRef);
          })
          .catch((erro) => {
            if (tentativa !== tentativaRef.current) return;
            if (erro?.name === 'NotAllowedError') desbloquearFalhou();
          });
      } else fadeVolume(audio, volumeAlvo, trocou ? FADE_TROCA_MS : 0, fadeTokenRef);
    } else if (trocou) {
      fadeVolume(audio, 0, FADE_TROCA_MS, fadeTokenRef, () => audio.pause());
    } else {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, midia.faixaAtualId, midia.tocando, midia.posicaoSegundos, midia.atualizadoEm, desbloqueado]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!useStore.getState().midia.tocando) return;
    const volumeAlvo = midia.volume * (efeitoTocando ? FATOR_DUCK : 1);
    fadeVolume(audio, volumeAlvo, efeitoTocando ? FADE_DUCK_MS : 0, fadeTokenRef);
  }, [midia.volume, efeitoTocando]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = mudo;
  }, [mudo]);

  const habilitar = () => {
    habilitarAudioJogador();
    const audio = audioRef.current;
    if (audio && midia.tocando) {
      const tentativa = ++tentativaRef.current;
      fadeTokenRef.current++;
      audio.play().then(() => {
        if (tentativa !== tentativaRef.current) return;
        fadeVolume(audio, useStore.getState().midia.volume * (efeitoTocandoRef.current ? FATOR_DUCK : 1), FADE_TROCA_MS, fadeTokenRef);
      }, (erro) => {
        if (tentativa === tentativaRef.current && erro?.name === 'NotAllowedError') desbloquearFalhou();
      });
    }
  };

  return (
    <>
      <audio ref={audioRef} onLoadedMetadata={(e) => posicionarMidia(e.currentTarget, useStore.getState().midia)} />
      <div
        className="mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '11px',
          maxWidth: '200px',
        }}
      >
        {!desbloqueado ? (
          <button onClick={habilitar} style={{ fontSize: '11px', padding: '0.3em 0.6em' }}>
            habilitar áudio
          </button>
        ) : (
          <>
            <span style={{ color: 'var(--rede)' }}>♪</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {faixaAtual ? faixaAtual.nome : 'sem áudio tocando'}
            </span>
            <button className="icone-botao" onClick={() => definirMudo(!mudo)} title={mudo ? 'ativar som' : 'mudo (só pra você)'} style={{ fontSize: '10px' }}>
              {mudo ? 'mudo' : 'som'}
            </button>
          </>
        )}
      </div>
    </>
  );
}
