import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { resetarMesaCompleta } from '../../multiplayer/resetMesa';
import { useStore } from '../../state/store';

/**
 * Botão de "sessão limpa" — mora ao lado de "limpar log", no header do `LogView`, mas entra lá
 * como slot vindo do `LogTab.tsx` (GM-only). O `LogView` é compartilhado com o app do jogador:
 * importar este componente lá dentro arrastaria `resetMesa` pro bundle dele.
 *
 * Destrutivo e irreversível (apaga no servidor também, ver `resetMesa.ts`), então a confirmação
 * é um modal — mesmo padrão de `VinculoMestre.tsx` — com o backup oferecido no meio do caminho,
 * enquanto ainda existe o que salvar.
 *
 * Pede um `RESET_TOKEN` quando o multiplayer está configurado (ROADMAP.md item 2, Parte A) — a
 * Edge Function `reset-mesa` não checa is_gm() nem depende do token de mestre, então quem roda o
 * reset (tipicamente o dev, antes/depois de uma sessão) não precisa estar logado como mestre.
 */
export default function ResetSessao() {
  const [modalAberto, setModalAberto] = useState(false);
  const [resetando, setResetando] = useState(false);
  const [token, setToken] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const precisaToken = supabase !== null;
  const painelRef = useRef<HTMLDivElement>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!modalAberto) return;
    const focoAnterior = document.activeElement as HTMLElement | null;
    cancelarRef.current?.focus();
    return () => { if (focoAnterior?.isConnected) focoAnterior.focus(); };
  }, [modalAberto]);

  useEffect(() => {
    if (!modalAberto) return;
    const handler = (e: KeyboardEvent) => {
      // Captura antes dos atalhos globais, mesmo se o foco escapar do diálogo.
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!resetando) setModalAberto(false);
      }
      if (e.key === 'Tab') {
        const focaveis = painelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
        const primeiro = focaveis?.[0];
        const ultimo = focaveis?.[focaveis.length - 1];
        if (!primeiro) { e.preventDefault(); painelRef.current?.focus(); }
        else if (!painelRef.current?.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
        else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo?.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [modalAberto, resetando]);

  const baixarBackup = () => {
    const blob = new Blob([useStore.getState().exportarJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estatica-mesa-antes-do-reset-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmar = async () => {
    setResetando(true);
    setErro(null);
    try {
      const resultado = await resetarMesaCompleta(token.trim() || undefined);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setModalAberto(false);
      setToken('');
    } finally {
      setResetando(false);
    }
  };

  return (
    <>
      <button className="perigo" onClick={() => setModalAberto(true)}>
        iniciar sessão limpa
      </button>

      {modalAberto && (
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
          onClick={() => !resetando && setModalAberto(false)}
        >
          <div
            ref={painelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-sessao-titulo"
            tabIndex={-1}
            className="secao"
            style={{
              width: 460,
              maxWidth: '90vw',
              borderColor: 'var(--ruido)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reset-sessao-titulo" style={{ margin: 0, color: 'var(--ruido)' }}>sessão limpa</h3>
            <p className="vazio" style={{ margin: 0 }}>
              apaga personagens, NPCs, iniciativa, mapa, pistas, mídia, log e rolagens — aqui e no
              servidor, pra todo mundo. não dá pra desfazer.
            </p>
            <p className="vazio" style={{ margin: 0 }}>
              os links de jogador atuais param de valer (as fichas somem junto). imagens e áudio
              também são apagados do armazenamento, não só as referências.
            </p>
            {precisaToken && (
              <>
                <label className="label" htmlFor="reset-sessao-token">
                  reset token
                </label>
                <input
                  id="reset-sessao-token"
                  type="password"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setErro(null);
                  }}
                  disabled={resetando}
                  style={{ width: '100%' }}
                />
              </>
            )}
            {erro && <span style={{ color: 'var(--ruido)', fontSize: '12px' }}>{erro}</span>}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
              <button className="acento" onClick={baixarBackup} disabled={resetando}>
                baixar backup antes
              </button>
              <button className="perigo" onClick={confirmar} disabled={resetando || (precisaToken && !token.trim())}>
                {resetando ? 'apagando…' : 'confirmar — apaga tudo'}
              </button>
              <button ref={cancelarRef} onClick={() => setModalAberto(false)} disabled={resetando}>
                cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
