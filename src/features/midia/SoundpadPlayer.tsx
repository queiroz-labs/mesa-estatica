import { useEffect, useRef } from 'react';
import { useSoundpadUiStore } from '../../state/soundpadUiStore';
import { useStore } from '../../state/store';

/**
 * Toca os efeitos do soundpad — montado no `<header>` de `App.tsx`/`PlayerApp.tsx`, fora das
 * abas, mesmo motivo dos players de música (não desmonta ao trocar de aba). Não renderiza nada.
 *
 * Um `Audio` por SLOT (`audiosPorSlot`, não um único `audioAtual`) — é o que permite dois
 * slots diferentes se sobreporem sem um cortar o outro, e também é o que faz `pararSoundpad`
 * conseguir interromper só a instância certa. Um novo 'tocar' no mesmo slot para a instância
 * anterior antes de criar a nova (não faz sentido dois efeitos do mesmo botão ao mesmo tempo).
 *
 * Dedupe pelo carimbo `em`, comparado como instante (epoch ms via `Date`, não string crua): o
 * mesmo disparo chega aqui mais de uma vez (a ação local do GM e depois o eco do Realtime, que
 * devolve `disparo_em` reformatado pelo Postgres — mesmo instante, string diferente — e um
 * refetch de reconexão pode repetir o último). Guardar o instante já tocado garante uma ação
 * por clique.
 *
 * Autoplay: o navegador só libera `play()` depois de algum gesto do usuário na página. No lado
 * do jogador isso já acontece no botão "habilitar áudio" do `MidiaPlayerJogador`; antes disso o
 * efeito falha em silêncio, que é o comportamento correto (nada de erro no meio da cena).
 *
 * `sons` e `volume` vão pra refs (atualizados por subscriber) pra que o efeito principal
 * reaja **só** a `ultimoDisparo`. O subscriber também ajusta o volume de todo áudio tocando.
 *
 * `useSoundpadUiStore` é quem `SoundpadGrid.tsx` lê pra saber se um slot está tocando NESTE
 * cliente agora (fato local — cada cliente toca seu próprio `<audio>`, não é estado
 * compartilhado) e decidir se o clique no botão deve tocar ou parar.
 */
export default function SoundpadPlayer() {
  const ultimoDisparo = useStore((s) => s.soundpad.ultimoDisparo);
  const mudo = useSoundpadUiStore((s) => s.mudo);
  const jaTocado = useRef<number | null>(null);
  const audiosPorSlot = useRef<Map<number, HTMLAudioElement>>(new Map());

  const sonsRef = useRef(useStore.getState().soundpad.sons);
  const volumeRef = useRef(useStore.getState().soundpad.volume);
  useEffect(() => {
    const audios = audiosPorSlot.current;
    return () => {
      for (const [slot, audio] of audios) {
        audio.pause();
        useSoundpadUiStore.getState().marcarParado(slot);
      }
      audios.clear();
    };
  }, []);
  useEffect(
    () =>
      useStore.subscribe((s) => {
        sonsRef.current = s.soundpad.sons;
        volumeRef.current = s.soundpad.volume;
        for (const audio of audiosPorSlot.current.values()) audio.volume = s.soundpad.volume;
      }),
    [],
  );

  // Mudo é compartilhado com o player de música via soundpadUiStore — efeitos criados antes do
  // toggle também precisam refletir a mudança sem esperar o próximo disparo.
  useEffect(() => {
    for (const audio of audiosPorSlot.current.values()) audio.muted = mudo;
  }, [mudo]);

  useEffect(() => {
    if (!ultimoDisparo) return;
    // Compara pelo instante (epoch ms), não pela string crua: o eco do Realtime devolve
    // `disparo_em` reformatado pelo Postgres (timestamptz troca o "Z" por "+00:00", por
    // exemplo) — mesmo carimbo, string diferente. Comparar string batia igual só na ação
    // local e falhava no eco, tocando o efeito duas vezes (reinicia quando o eco chega).
    const carimbo = new Date(ultimoDisparo.em).getTime();
    if (carimbo === jaTocado.current) return;
    jaTocado.current = carimbo;
    const { slot, tipo } = ultimoDisparo;

    if (tipo === 'parar') {
      audiosPorSlot.current.get(slot)?.pause();
      audiosPorSlot.current.delete(slot);
      useSoundpadUiStore.getState().marcarParado(slot);
      return;
    }

    const som = sonsRef.current.find((s) => s.slot === slot);
    if (!som?.url) return;

    audiosPorSlot.current.get(slot)?.pause();

    const audio = new Audio(som.url);
    audio.volume = volumeRef.current;
    audio.muted = useSoundpadUiStore.getState().mudo;
    const encerrar = () => {
      // Repetir um slot pode rejeitar o play anterior por AbortError. Essa instância
      // antiga não pode retirar a nova do mapa nem desfazer o duck da música.
      if (audiosPorSlot.current.get(slot) !== audio) return;
      audiosPorSlot.current.delete(slot);
      useSoundpadUiStore.getState().marcarParado(slot);
    };
    audio.addEventListener('ended', encerrar);
    audiosPorSlot.current.set(slot, audio);
    useSoundpadUiStore.getState().marcarTocando(slot);
    audio.play().catch(encerrar);
  }, [ultimoDisparo]);

  return null;
}
