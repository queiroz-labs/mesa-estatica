import { useEffect, useRef, useState } from 'react';
import { CHAVE_TOKEN_MESTRE, trocarTokenMestre, verificarVinculoMestre, vincularComoMestre } from '../../multiplayer/auth';
import { useVinculoMestreStore } from '../../multiplayer/vinculoMestreStore';
import Icone from '../../components/Icone';
import '../../app/statusIndicadores.css';

const CHAVE_TOKEN = CHAVE_TOKEN_MESTRE;

type StatusModal = 'idle' | 'vinculando' | 'sucesso';
type StatusTroca = 'idle' | 'trocando' | 'sucesso';

/**
 * Indicador + tela de vínculo de mestre (mesa-estatica-multiplayer-completo.md §6, §V.2) —
 * hoje o único jeito de virar `is_gm()` era editar a URL (`?gm=<token>`), sem retorno visual
 * nenhum se deu certo. Foi exatamente essa lacuna que causou a confusão de 24/07 ("vincular
 * jogador falhou" — na real, a sessão do MESTRE que tinha perdido o vínculo depois do rename
 * do domínio do Pages, sem nenhum jeito de perceber isso pela tela).
 *
 * GM-only por construção: só `App.tsx` importa este componente, que é a raiz da árvore do
 * `GmApp` — o bundle do jogador nunca importa nada daqui (mesmo tree-shaking por entrada que
 * já mantém `#controle`/`forcarRolagem` fora do chunk do jogador).
 */
export default function VinculoMestre() {
  const vinculo = useVinculoMestreStore((s) => s.status);
  const [modalAberto, setModalAberto] = useState(false);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const dialogoRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(CHAVE_TOKEN) ?? ''; }
    catch { return ''; }
  });
  const [statusModal, setStatusModal] = useState<StatusModal>('idle');
  const [erro, setErro] = useState<string | null>(null);
  const [trocaAberta, setTrocaAberta] = useState(false);
  const [tokenAtual, setTokenAtual] = useState('');
  const [tokenNovo, setTokenNovo] = useState('');
  const [statusTroca, setStatusTroca] = useState<StatusTroca>('idle');
  const [erroTroca, setErroTroca] = useState<string | null>(null);

  // Autocura (já tinha um token salvo nesta máquina mas a sessão atual não está vinculada —
  // cenário de 24/07, origem nova/sessão anônima nova/vínculo antigo órfão) e a checagem de
  // token revogado vivem em `verificarVinculoMestre()`, compartilhada com `GateOverlay.tsx`
  // (mesmo mount, mesma pergunta — evita gastar duas tentativas contra o rate limit de
  // `vincular-mestre` só pra confirmar o mesmo fato duas vezes). Ela mesma escreve o resultado
  // em `useVinculoMestreStore` — não precisa de `setVinculo` local aqui: isso é o que mantém o
  // pill sincronizado mesmo quando é o `GateOverlay` (não este efeito) que vincula com sucesso
  // (achado ao vivo em 28/08 — sem estado compartilhado, o pill ficava preso em "não vinculado"
  // até um F5 manual).
  useEffect(() => {
    void verificarVinculoMestre();
  }, []);

  useEffect(() => {
    if (!modalAberto) return;
    const gatilho = gatilhoRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
      if (e.key !== 'Tab') return;
      const controles = dialogoRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
      if (!controles?.length) return;
      const primeiro = controles[0];
      const ultimo = controles[controles.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      gatilho?.focus();
    };
  }, [modalAberto]);

  const fechar = () => {
    setModalAberto(false);
    setStatusModal('idle');
    setErro(null);
    setTrocaAberta(false);
    setTokenAtual('');
    setTokenNovo('');
    setStatusTroca('idle');
    setErroTroca(null);
  };

  const trocarToken = async () => {
    if (!tokenAtual.trim() || !tokenNovo.trim()) return;
    setStatusTroca('trocando');
    setErroTroca(null);
    const resultado = await trocarTokenMestre(tokenAtual.trim(), tokenNovo.trim());
    if (!resultado.ok) {
      setErroTroca(resultado.erro);
      setStatusTroca('idle');
      return;
    }
    // este navegador precisa do valor novo pra revincular no futuro (ex.: sessão anônima nova).
    localStorage.setItem(CHAVE_TOKEN, tokenNovo.trim());
    setToken(tokenNovo.trim());
    setStatusTroca('sucesso');
    setTokenAtual('');
    setTokenNovo('');
  };

  const vincular = async () => {
    if (!token.trim()) return;
    setStatusModal('vinculando');
    setErro(null);
    const resultado = await vincularComoMestre(token.trim());
    if (!resultado.ok) {
      setErro(resultado.erro);
      setStatusModal('idle');
      return;
    }
    localStorage.setItem(CHAVE_TOKEN, token.trim());
    setStatusModal('sucesso');
    setTimeout(() => window.location.reload(), 700);
  };

  const textoPill = vinculo === 'vinculado' ? 'mestre vinculado' : vinculo === 'nao-vinculado' ? 'mestre não vinculado' : 'verificando mestre';
  const tituloPill =
    vinculo === 'vinculado'
      ? 'vínculo de mestre desta sessão — abrir opções'
      : vinculo === 'nao-vinculado'
        ? 'sessão não vinculada — abrir vínculo de mestre'
        : 'checando vínculo de mestre…';

  return (
    <>
      <button
        type="button"
        className="mono status-vinculo"
        ref={gatilhoRef}
        data-vinculo={vinculo}
        onClick={() => setModalAberto(true)}
        title={tituloPill}
        aria-haspopup="dialog"
        aria-expanded={modalAberto}
      >
        <Icone nome={vinculo === 'checando' ? 'relogio' : 'escudo'} size={14} />
        {textoPill}
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
          onClick={fechar}
        >
          <div
            className="secao"
            ref={dialogoRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vinculo-mestre-titulo"
            aria-describedby="vinculo-mestre-descricao"
            style={{ width: 400, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 id="vinculo-mestre-titulo" style={{ margin: 0 }}>vínculo de mestre</h3>
              <button type="button" className="icone-botao" onClick={fechar} title="fechar (Esc)" aria-label="fechar vínculo de mestre">
                <Icone nome="fechar" size={14} />
              </button>
            </div>
            <p id="vinculo-mestre-descricao" className="vazio" style={{ margin: 0, color: 'var(--ink-dim)' }}>
              sem isso, esta sessão não lê nem escreve dados de mestre. o token fica salvo neste navegador — não aparece na URL nem em
              prints.
            </p>
            <label className="label" htmlFor="vinculo-mestre-token">
              token de mestre
            </label>
            <input
              id="vinculo-mestre-token"
              type="password"
              autoFocus
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setErro(null);
              }}
              style={{ width: '100%' }}
            />
            {erro && <span role="alert" style={{ color: 'var(--ink)', fontSize: '13px' }}>{erro}</span>}
            {statusModal === 'sucesso' && <span style={{ color: 'var(--rede)', fontSize: '12px' }}>vinculado — recarregando…</span>}
            <button className="acento" onClick={vincular} disabled={!token.trim() || statusModal !== 'idle'}>
              {statusModal === 'vinculando' ? 'vinculando…' : 'vincular'}
            </button>

            <hr style={{ width: '100%', border: 'none', borderTop: '1px solid var(--concrete-2)', margin: '0.2rem 0' }} />

            {!trocaAberta ? (
              <button onClick={() => setTrocaAberta(true)} style={{ alignSelf: 'flex-start' }}>
                trocar token
              </button>
            ) : (
              <>
                <p className="vazio" style={{ margin: 0 }}>
                  troca o token de mestre sem precisar do dev — só exige o token atual. depois de
                  trocar, avise quem mais tiver o link antigo.
                </p>
                <label className="label" htmlFor="vinculo-mestre-token-atual">
                  token atual
                </label>
                <input
                  id="vinculo-mestre-token-atual"
                  type="password"
                  value={tokenAtual}
                  onChange={(e) => {
                    setTokenAtual(e.target.value);
                    setErroTroca(null);
                  }}
                  style={{ width: '100%' }}
                />
                <label className="label" htmlFor="vinculo-mestre-token-novo">
                  token novo
                </label>
                <input
                  id="vinculo-mestre-token-novo"
                  type="password"
                  value={tokenNovo}
                  onChange={(e) => {
                    setTokenNovo(e.target.value);
                    setErroTroca(null);
                  }}
                  style={{ width: '100%' }}
                />
                {erroTroca && <span role="alert" style={{ color: 'var(--ink)', fontSize: '13px' }}>{erroTroca}</span>}
                {statusTroca === 'sucesso' && <span style={{ color: 'var(--rede)', fontSize: '12px' }}>token trocado.</span>}
                <button
                  className="acento"
                  onClick={trocarToken}
                  disabled={!tokenAtual.trim() || !tokenNovo.trim() || statusTroca === 'trocando'}
                >
                  {statusTroca === 'trocando' ? 'trocando…' : 'confirmar troca'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
