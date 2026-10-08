import { textoContaTeste, textoNaturalTeste, type ResultadoTesteDetalhado } from './resultadoTesteApresentacao';

export default function ResultadoTeste({ resultado }: { resultado: ResultadoTesteDetalhado }) {
  return (
    <div className="alerta-banner mono" role="status" style={{ marginTop: '0.75rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem' }}>
      <span>{resultado.quem} · {resultado.teste}</span>
      <strong>total do teste: {resultado.total}</strong>
      <span>{textoContaTeste(resultado)}</span>
      <span>{textoNaturalTeste(resultado.d20)}</span>
    </div>
  );
}
