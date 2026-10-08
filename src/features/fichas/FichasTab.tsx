import { marcarRemocaoExplicita } from '../../multiplayer/remocaoExplicita';
import { useStore } from '../../state/store';
import FichaEditor from './FichaEditor';
import ImportarPersonagemBotao from './ImportarPersonagemBotao';
import LinkJogadorBotao from './LinkJogadorBotao';
import './ficha.css';
import Icone from '../../components/Icone';

export default function FichasTab() {
  const fichas = useStore((s) => s.fichas);
  const fichaAtivaId = useStore((s) => s.fichaAtivaId);
  const adicionarFicha = useStore((s) => s.adicionarFicha);
  const removerFicha = useStore((s) => s.removerFicha);
  const definirFichaAtiva = useStore((s) => s.definirFichaAtiva);

  const fichaAtiva = fichas.find((f) => f.id === fichaAtivaId) ?? fichas[0] ?? null;

  const remover = (id: string, nome: string) => {
    const ok = window.confirm(`apagar "${nome || 'sem nome'}" da rede? o papel não esquece.`);
    if (ok) {
      marcarRemocaoExplicita(id);
      removerFicha(id);
    }
  };

  return (
    <div className="fichas-tab">
      <div className="fichas-lista">
        <button className="acento" onClick={() => adicionarFicha()}>
          + novo personagem
        </button>
        <ImportarPersonagemBotao />
        {fichas.map((f) => (
          <div
            key={f.id}
            className="fichas-lista__item"
            data-ativa={f.id === fichaAtiva?.id}
          >
            <button type="button" className="fichas-lista__selecionar" onClick={() => definirFichaAtiva(f.id)} aria-pressed={f.id === fichaAtiva?.id} title={f.nome || 'sem nome'}>
              <span className="fichas-lista__cor" style={{ background: f.corVisual }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.nome || 'sem nome'}
              </span>
            </button>
            <LinkJogadorBotao fichaId={f.id} fichaNome={f.nome} />
            <button
              type="button"
              className="icone-botao"
              aria-label={`excluir personagem ${f.nome || 'sem nome'}`}
              title={`excluir personagem ${f.nome || 'sem nome'}`}
              onClick={(e) => {
                e.stopPropagation();
                remover(f.id, f.nome);
              }}
              style={{ color: 'var(--ink-dim)' }}
            >
              <Icone nome="lixeira" />
            </button>
          </div>
        ))}
      </div>
      {fichaAtiva ? (
        <FichaEditor key={fichaAtiva.id} ficha={fichaAtiva} souMestre />
      ) : (
        <p className="vazio">nenhum personagem ainda — clique em "+ novo personagem".</p>
      )}
    </div>
  );
}
