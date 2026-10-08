import { useEffect, useId, useRef, useState } from 'react';
import { calcularPosicaoMidia } from '../../multiplayer/posicaoMidia';
import { useAmbienciaUiStore } from '../../state/ambienciaUiStore';
import { useMidiaUiStore } from '../../state/midiaUiStore';
import { useStore } from '../../state/store';
import { IconeMegafone, IconePause, IconePlay } from '../combate/icones';
import './controleAudioRapido.css';
import './midia.css';
import Icone from '../../components/Icone';

/** Controles do mestre; os players permanentes continuam sendo os únicos donos do áudio. */
export default function ControleAudioRapido() {
  const midia = useStore((s) => s.midia);
  const ambiencia = useStore((s) => s.ambiencia);
  const definirVolumeMidia = useStore((s) => s.definirVolumeMidia);
  const definirVolumeAmbiencia = useStore((s) => s.definirVolumeAmbiencia);
  const [aberto, setAberto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    painelRef.current?.focus();
    const fecharFora = (e: Event) => {
      if (e.target instanceof Node && !raizRef.current?.contains(e.target)) setAberto(false);
    };
    const fecharEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
      botaoRef.current?.focus();
    };
    document.addEventListener('pointerdown', fecharFora);
    document.addEventListener('focusin', fecharFora);
    document.addEventListener('keydown', fecharEsc);
    return () => {
      document.removeEventListener('pointerdown', fecharFora);
      document.removeEventListener('focusin', fecharFora);
      document.removeEventListener('keydown', fecharEsc);
    };
  }, [aberto]);

  const alternarMusica = () => {
    const atual = useStore.getState().midia;
    if (!atual.faixas.some((f) => f.id === atual.faixaAtualId)) return;
    useStore.getState().atualizarEstadoMidia({
      tocando: !atual.tocando,
      posicaoSegundos: calcularPosicaoMidia(atual, useMidiaUiStore.getState().duracaoSegundos),
    });
  };
  const alternarAmbiencia = () => {
    const atual = useStore.getState().ambiencia;
    if (!atual.faixas.some((f) => f.id === atual.faixaAtualId)) return;
    useStore.getState().atualizarEstadoAmbiencia({
      tocando: !atual.tocando,
      posicaoSegundos: calcularPosicaoMidia({ ...atual, modoLoop: 'faixa' }, useAmbienciaUiStore.getState().duracaoSegundos),
    });
  };
  const canais = [
    { chave: 'musica', nome: 'música', estado: midia, alternar: alternarMusica, definirVolume: definirVolumeMidia },
    { chave: 'ambiencia', nome: 'ambiência', estado: ambiencia, alternar: alternarAmbiencia, definirVolume: definirVolumeAmbiencia },
  ];

  return <div className="audio-rapido" ref={raizRef}>
    <button ref={botaoRef} className={`audio-rapido-abrir${aberto ? ' acento' : ''}`}
      type="button" aria-haspopup="dialog" aria-expanded={aberto} aria-controls={`${id}-painel`}
      title="música e ambiência — pausa e volume para todos"
      onClick={() => setAberto((valor) => !valor)}>
      <IconeMegafone size={13} /> áudio
      <span className="audio-rapido-sinal" data-tocando={midia.tocando || ambiencia.tocando} aria-hidden="true" />
    </button>
    {aberto && <div className="audio-rapido-painel" ref={painelRef} id={`${id}-painel`}
      role="dialog" aria-label="controle de áudio" tabIndex={-1}
      onKeyDown={(e) => {
        // Atalhos de rolagem, abas e turnos não devem atuar enquanto se ajusta o áudio.
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          setAberto(false);
          botaoRef.current?.focus();
        }
      }}>
      <div className="audio-rapido-cabecalho">
        <h2 className="label">áudio</h2>
        <button type="button" className="audio-rapido-fechar" aria-label="fechar controle de áudio" title="fechar (Esc)"
          onClick={() => { setAberto(false); botaoRef.current?.focus(); }}><Icone nome="fechar" /></button>
      </div>
      <p className="audio-rapido-ajuda">pausa e volume valem para todos.</p>
      {canais.map(({ chave, nome, estado, alternar, definirVolume }) => {
        const faixa = estado.faixas.find((f) => f.id === estado.faixaAtualId);
        return <section className="audio-rapido-canal" key={chave} aria-label={nome}>
          <div className="audio-rapido-cabecalho">
            <h3 className="label">{nome}</h3>
            <span className="mono audio-rapido-estado" data-tocando={!!faixa && estado.tocando}>
              {faixa ? estado.tocando ? 'tocando' : 'pausada' : 'sem seleção'}
            </span>
          </div>
          <p className="audio-rapido-faixa" title={faixa?.nome}>{faixa?.nome ?? 'selecione um áudio na aba Mídia.'}</p>
          <button type="button" className="audio-rapido-transporte" disabled={!faixa} onClick={alternar}
            aria-label={`${estado.tocando ? 'pausar' : 'retomar'} ${nome}`}>
            {estado.tocando ? <IconePause size={12} /> : <IconePlay size={12} />}
            {estado.tocando ? 'pausar' : 'retomar'}
          </button>
          <div className="midia-volume midia-volume--compacto">
            <label htmlFor={`${id}-${chave}`}>volume {nome}</label>
            <input id={`${id}-${chave}`} type="range" min={0} max={1} step={0.05} value={estado.volume}
              onChange={(e) => definirVolume(Number(e.target.value))} />
            <span className="mono midia-volume-valor">{Math.round(estado.volume * 100)}%</span>
          </div>
        </section>;
      })}
    </div>}
  </div>;
}
