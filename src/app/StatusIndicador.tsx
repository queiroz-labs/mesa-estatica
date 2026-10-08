import type { ReactNode } from 'react';
import { limparErroRuntime, statusSincronizacao, useStatusMesa } from '../lib/statusMesa';
import { supabase } from '../lib/supabaseClient';
import { usePendenciasDetalhe } from '../multiplayer/filaPendencias';
import { IconeAlerta } from '../features/combate/icones';
import Icone from '../components/Icone';
import { recursosDaMesa } from './statusMensagens';
import './statusIndicadores.css';

function Detalhe({ sinal, children, classe = '' }: { sinal: ReactNode; children: ReactNode; classe?: string }) {
  return (
    <details className={`status-detalhe ${classe}`} onKeyDown={(evento) => {
      if (evento.key === 'Escape') {
        evento.currentTarget.open = false;
        evento.currentTarget.querySelector('summary')?.focus();
        evento.stopPropagation();
      }
    }}>
      <summary>{sinal}</summary>
      <div className="status-detalhe__conteudo">{children}</div>
    </details>
  );
}

/** Sinais independentes: gravação neste navegador, conexão e envios que falharam. */
export default function StatusIndicador() {
  const local = useStatusMesa((s) => s.local);
  const sync = useStatusMesa(statusSincronizacao);
  const canaisComErro = useStatusMesa((s) => s.canaisComErro);
  const erroRuntime = useStatusMesa((s) => s.erroRuntime);
  const online = useStatusMesa((s) => s.online);
  const pendencias = usePendenciasDetalhe();
  const recursosComErro = recursosDaMesa(canaisComErro);
  const recursosPendentes = recursosDaMesa(pendencias.map((item) => item.modulo));

  const textoConexao = !online ? 'sem internet' : sync === 'erro' ? 'sincronização com falha'
    : sync === 'conectado' ? 'conexão ativa' : supabase ? 'conectando' : 'modo local';
  const saudavel = online && sync === 'conectado';

  return (
    <div className="mono status-mesa" aria-label="Estado da mesa">
      <Detalhe classe={local === 'ok' ? 'status-saudavel' : ''} sinal={local === 'ok'
        ? '● registrado' : <><IconeAlerta size={14} /> não salvou neste navegador</>}>
        {local === 'ok' ? <>
          <p>As alterações são gravadas automaticamente neste navegador.</p>
          <p className="status-detalhe__recursos">Este sinal confirma a gravação local. O envio para a mesa aparece no indicador de conexão.</p>
        </> : <>
          <p>A gravação neste navegador falhou. O armazenamento pode estar cheio ou indisponível.</p>
          <p>Exporte um backup antes de fechar a página.</p>
        </>}
      </Detalhe>

      <Detalhe classe={saudavel ? 'status-saudavel' : textoConexao === 'modo local' ? 'status-neutro' : ''}
        sinal={<><Icone nome={!online ? 'wifi-off' : sync === 'erro' ? 'wifi-off' : supabase || sync === 'conectado' ? 'wifi' : 'relogio'} size={14} />{textoConexao}</>}>
        {!online ? <>
          <p>Este navegador está sem internet. A mesa continua disponível nesta tela.</p>
          <p>Os recursos voltam a se conectar automaticamente quando a internet retornar.</p>
        </> : sync === 'erro' ? <>
          <p>Parte da mesa não está recebendo atualizações. Os dados podem estar desatualizados.</p>
          <p className="status-detalhe__recursos">Recursos afetados: {recursosComErro.join(', ')}.</p>
          <p>A reconexão é automática. Se o aviso persistir, exporte um backup e recarregue a página.</p>
        </> : sync === 'conectado' ? <>
          <p>A conexão de atualização da mesa está ativa.</p>
          <p className="status-detalhe__recursos">Este sinal indica conexão; não confirma que todos os jogadores já receberam cada ação.</p>
        </> : supabase ? <p>Aguardando a conexão de atualização da mesa.</p>
          : <p>A sincronização entre dispositivos não está configurada. A mesa funciona apenas neste navegador.</p>}
      </Detalhe>

      {pendencias.length > 0 && <Detalhe sinal={<><Icone nome="relogio" size={14} />
        {pendencias.length} envio{pendencias.length > 1 ? 's' : ''} pendente{pendencias.length > 1 ? 's' : ''}</>}>
        <p>Algumas alterações ainda não foram enviadas. O sistema tenta reenviá-las automaticamente ao reconectar.</p>
        <p className="status-detalhe__recursos">Aguardando envio: {recursosPendentes.join(', ')}.</p>
      </Detalhe>}

      {erroRuntime && <Detalhe sinal={<><IconeAlerta size={14} /> aviso da mesa</>}>
        <p>{/sem permissão pra salvar/.test(erroRuntime)
          ? 'A permissão para salvar foi recusada. Recarregue a página para conferir o vínculo desta sessão.'
          : 'Uma ação encontrou um erro inesperado. Confira se ela foi concluída; se o aviso voltar, exporte um backup e recarregue a página.'}</p>
        <button type="button" onClick={(evento) => {
          evento.currentTarget.closest('.status-mesa')?.querySelector<HTMLElement>('summary')?.focus();
          limparErroRuntime();
        }}>dispensar aviso</button>
      </Detalhe>}
    </div>
  );
}
