import { textoDadosLivre, type ResultadoLivreDetalhado } from './resultadoLivreApresentacao';

export default function ResultadoLivre({ resultado }: { resultado: ResultadoLivreDetalhado }) {
  return (
    <div className="alerta-banner mono" role="status" style={{ marginTop: '0.75rem', borderColor: 'var(--rede)', color: 'var(--rede)', flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem' }}>
      <span>{resultado.quem} · rolagem livre</span>
      <strong>total: {resultado.total}</strong>
      <span>{textoDadosLivre(resultado)}</span>
    </div>
  );
}
