import { useEffect, useId, useRef } from 'react';
import { elementoVisivel } from '../mapa/atalhosFerramentasMapa';

interface Props {
  acao: 'encerrar' | 'resetar';
  combateAtivo: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export default function ConfirmacaoCombate({ acao, combateAtivo, onCancelar, onConfirmar }: Props) {
  const tituloId = useId();
  const painelRef = useRef<HTMLDivElement>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const focoAnterior = document.activeElement as HTMLElement | null;
    cancelarRef.current?.focus();
    const handler = (evento: KeyboardEvent) => {
      if (!elementoVisivel(painelRef.current)) return;
      if (evento.key === 'Escape') {
        evento.preventDefault(); evento.stopImmediatePropagation(); onCancelar();
      } else if (evento.key === 'Tab') {
        const botoes = painelRef.current?.querySelectorAll<HTMLButtonElement>('button');
        const primeiro = botoes?.[0];
        const ultimo = botoes?.[botoes.length - 1];
        if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo?.focus(); }
        else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro?.focus(); }
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => {
      document.removeEventListener('keydown', handler, true);
      if (focoAnterior?.isConnected) focoAnterior.focus();
    };
  }, [onCancelar]);

  const texto = acao === 'encerrar'
    ? 'encerra o combate e limpa as condições e os Surtos criados em combate.'
    : combateAtivo
      ? 'encerra o combate e limpa a ordem de iniciativa, as condições e os Surtos criados em combate.'
      : 'limpa a ordem de iniciativa e as seleções do combate.';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-backdrop)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancelar}>
      <div ref={painelRef} className="secao" role="dialog" aria-modal="true" aria-labelledby={tituloId}
        style={{ width: 420, maxWidth: '90vw', borderColor: 'var(--ruido)', boxShadow: '0 8px 32px var(--void)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
        onClick={(evento) => evento.stopPropagation()} onKeyDown={(evento) => evento.stopPropagation()}>
        <h3 id={tituloId} style={{ margin: 0, color: 'var(--ruido)' }}>{acao === 'encerrar' ? 'encerrar combate?' : 'resetar combate?'}</h3>
        <p className="vazio" style={{ margin: 0 }}>{texto}</p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button ref={cancelarRef} autoFocus onClick={onCancelar}>cancelar</button>
          <button className="perigo" onClick={onConfirmar}>{acao === 'encerrar' ? 'encerrar combate' : 'resetar combate'}</button>
        </div>
      </div>
    </div>
  );
}
