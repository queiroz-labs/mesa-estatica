import type { ResultadoTeste } from '../../rules/teste';
import { consequenciaGatilhoTrauma, resultadoGatilhoTrauma } from './traumaApresentacao';

export default function ResultadoTrauma({ teste, consequencia }: { teste: ResultadoTeste; consequencia: string | null }) {
  return (
    <div className="alerta-banner mono" style={{ marginTop: '0.75rem', borderColor: teste.sucesso ? 'var(--rede)' : 'var(--ruido)', color: teste.sucesso ? 'var(--rede)' : 'var(--ruido)', display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
      <span>Dado bruto: d20 = {teste.d20}</span>
      <span>Modificador de Vontade: {teste.modificador >= 0 ? '+' : ''}{teste.modificador}</span>
      <span>Total do teste: {teste.total} · DT {teste.dt}</span>
      <strong>{resultadoGatilhoTrauma(teste)}</strong>
      <span>{consequencia ?? consequenciaGatilhoTrauma(teste)}</span>
    </div>
  );
}
