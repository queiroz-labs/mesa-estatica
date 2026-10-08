import { statusSincronizacao, useStatusMesa } from '../lib/statusMesa';
import { IconeAlerta } from '../features/combate/icones';
import Icone from '../components/Icone';
import { recursosDaMesa } from './statusMensagens';
import './statusIndicadores.css';

/** Silencioso quando saudável; separa falta de internet de falhas em recursos da mesa. */
export default function DesyncIndicadorJogador() {
  const sync = useStatusMesa(statusSincronizacao);
  const online = useStatusMesa((s) => s.online);
  const canaisComErro = useStatusMesa((s) => s.canaisComErro);
  if (online && sync !== 'erro') return null;

  return (
    <span className="mono status-jogador" role="status">
      {!online ? <>
        <Icone nome="wifi-off" size={14} />
        sem internet
        <span className="status-jogador__contexto">· reconexão automática</span>
      </> : <>
        <IconeAlerta size={14} />
        sincronização com falha
        <span className="status-jogador__contexto">· informações de {recursosDaMesa(canaisComErro).join(', ')} podem estar desatualizadas</span>
      </>}
    </span>
  );
}
