import Avatar from '../../components/Avatar';

export interface CrachaItem {
  id: string;
  nome: string;
  cor: string;
  foto: string | null;
}

interface Props {
  personagens: CrachaItem[];
  euId?: string;
}

/** Conteúdo compartilhado do overlay "crachás" — lista de PCs (nome + foto/cor), usada
 *  tanto no painel do mestre quanto no do jogador. */
export default function CrachasLista({ personagens, euId }: Props) {
  if (personagens.length === 0) {
    return <p className="vazio">nenhum personagem na mesa ainda.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {personagens.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Avatar nome={p.nome} cor={p.cor} foto={p.foto} bordaCor={p.cor} tamanho={48} ampliavel />
          <span className="mono" style={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>
            {p.nome || 'sem nome'}
            {p.id === euId && <span className="vazio"> (você)</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
