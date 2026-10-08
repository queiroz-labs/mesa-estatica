import { useStore } from '../../state/store';

/**
 * Aba Mídia do jogador — só a faixa tocando agora. Nomes das próximas faixas (ou já tocadas)
 * ficam ocultos de propósito, pra não virar spoiler da sessão; quem quer ver/mudar a playlist
 * inteira é o mestre, em `MidiaTab.tsx`.
 */
export default function MidiaJogadorView() {
  const midia = useStore((s) => s.midia);
  const faixaAtual = midia.faixas.find((f) => f.id === midia.faixaAtualId) ?? null;
  const ambiencia = useStore((s) => s.ambiencia);
  const somAmbiencia = ambiencia.faixas.find((f) => f.id === ambiencia.faixaAtualId);

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', height: '100%', overflowY: 'auto' }}>
      <h3 className="label" style={{ margin: 0 }}>
        tocando agora
      </h3>
      {faixaAtual ? (
        <div
          style={{
            padding: '0.4rem 0.5rem',
            border: '1px solid var(--concrete-2)',
            borderRadius: '2px',
            background: 'var(--concrete-1)',
          }}
        >
          {midia.tocando ? '▶ ' : '❚❚ '}
          {faixaAtual.nome}
        </div>
      ) : (
        <p className="vazio">nada tocando no momento.</p>
      )}
      <h3 className="label" style={{ margin: '1rem 0 0' }}>ambiência</h3>
      <p className="vazio">{somAmbiencia ? `${ambiencia.tocando ? 'em loop' : 'pausada'} · ${somAmbiencia.nome}` : 'nenhuma ambiência tocando.'}</p>
    </div>
  );
}
