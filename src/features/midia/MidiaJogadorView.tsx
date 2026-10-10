import { useStore } from '../../state/store';
import { IconePause, IconePlay } from '../combate/icones';
import { listarCamadasAmbiencia } from '../../state/ambiencia';

/**
 * Aba Mídia do jogador — mostra somente o estado dos canais, sem nomes que possam
 * antecipar acontecimentos da sessão. A playlist identificada fica em `MidiaTab.tsx`,
 * na visão do mestre. Isso não remove os dados recebidos pelo cliente.
 */
export default function MidiaJogadorView() {
  const midia = useStore((s) => s.midia);
  const faixaAtual = midia.faixas.find((f) => f.id === midia.faixaAtualId) ?? null;
  const ambiencia = useStore((s) => s.ambiencia);
  const camadas = listarCamadasAmbiencia(ambiencia).filter((c) => ambiencia.faixas.some((f) => f.id === c.faixaAtualId));

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
            display: 'flex', alignItems: 'center', gap: '0.4rem', overflowWrap: 'anywhere',
          }}
        >
          {midia.tocando ? <IconePlay size={14} /> : <IconePause size={14} />}
          {midia.tocando ? 'música da mesa' : 'música pausada'}
        </div>
      ) : (
        <p className="vazio">nada tocando no momento.</p>
      )}
      <h3 className="label" style={{ margin: '1rem 0 0' }}>ambiência</h3>
      {camadas.length ? camadas.map((c, i) => <p className="vazio" key={c.id}>
        {camadas.length > 1 ? `ambiência ${i + 1}` : 'ambiência'} {c.tocando ? 'em loop' : 'pausada'}
      </p>) : <p className="vazio">nenhuma ambiência tocando.</p>}
    </div>
  );
}
