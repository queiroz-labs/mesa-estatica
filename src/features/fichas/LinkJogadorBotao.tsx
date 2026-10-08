import { useEffect, useRef, useState } from 'react';
import Icone from '../../components/Icone';
import { consultarIsGm } from '../../multiplayer/auth';
import { buscarOwnerToken, montarLinkJogador, regenerarOwnerToken } from '../../multiplayer/links';

interface Props {
  fichaId: string;
  fichaNome: string;
}

/** `buscarOwnerToken`/`regenerarOwnerToken` retornam `null` tanto quando o multiplayer não
 *  está configurado quanto quando a RLS bloqueia a leitura por sessão não vinculada como
 *  mestre — os dois casos pareciam idênticos (mesmo aviso "multiplayer não configurado"),
 *  o que mascarava o caso real mais comum: vínculo de mestre expirado/nunca feito nesta aba,
 *  não a ficha ainda não ter sincronizado. `consultarIsGm()` distingue os dois na hora do erro. */
type Status = 'idle' | 'carregando' | 'copiado' | 'erro-vinculo' | 'erro-config' | 'erro-rede' | 'erro-copia';

/**
 * Controles GM-only pro link do jogador (mesa-estatica-multiplayer-completo.md Parte V §4):
 * copiar o link atual e regenerar (mitigação de link vazado, §13). Só existe na árvore do
 * mestre (`FichasTab`) — nunca chega no bundle do jogador.
 */
export default function LinkJogadorBotao({ fichaId, fichaNome }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [linkManual, setLinkManual] = useState<string | null>(null);
  const ocupadoRef = useRef(false);
  const prazoRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(prazoRef.current), []);

  const avisar = (novo: Status) => {
    clearTimeout(prazoRef.current);
    setStatus(novo);
    if (novo !== 'idle' && novo !== 'carregando' && novo !== 'erro-copia') prazoRef.current = setTimeout(() => setStatus('idle'), 1800);
  };

  const copiarToken = async (token: string) => {
    const link = montarLinkJogador(token);
    try {
      await navigator.clipboard.writeText(link);
      setLinkManual(null);
      avisar('copiado');
    } catch {
      // Regenerar já invalidou o link anterior. Preserve o novo para copiar manualmente.
      setLinkManual(link);
      avisar('erro-copia');
    }
  };

  const avisarFalha = async () => {
    const souGm = await consultarIsGm();
    avisar(souGm ? 'erro-config' : 'erro-vinculo');
  };

  const copiar = async () => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    avisar('carregando');
    try {
      const token = await buscarOwnerToken(fichaId);
      if (!token) { await avisarFalha(); return; }
      await copiarToken(token);
    } catch { avisar('erro-rede'); }
    finally { ocupadoRef.current = false; }
  };

  const regenerar = async () => {
    if (ocupadoRef.current) return;
    const ok = window.confirm(`regenerar o link de "${fichaNome || 'sem nome'}"? o link antigo para de funcionar.`);
    if (!ok) return;
    ocupadoRef.current = true;
    avisar('carregando');
    try {
      const token = await regenerarOwnerToken(fichaId);
      if (!token) { await avisarFalha(); return; }
      await copiarToken(token);
    } catch { avisar('erro-rede'); }
    finally { ocupadoRef.current = false; }
  };

  const titulo =
    status === 'copiado'
      ? 'link copiado'
      : status === 'erro-vinculo'
        ? 'sessão não vinculada como mestre — clique no indicador "mestre" no topo, cole o token e tente de novo'
        : status === 'erro-config'
          ? 'multiplayer não configurado nesta máquina, ou a ficha ainda não sincronizou — espere alguns segundos e tente de novo'
          : status === 'erro-rede'
            ? 'não consegui consultar o link — confira a conexão e tente novamente'
            : status === 'erro-copia'
              ? 'cópia bloqueada pelo navegador — copie o link mostrado abaixo'
              : 'copiar link do jogador';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
      <button
        type="button"
        className="icone-botao"
        disabled={status === 'carregando'}
        aria-disabled={status === 'carregando'}
        title={titulo}
        aria-label={titulo}
        onClick={(e) => {
          e.stopPropagation();
          void copiar();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          void copiar();
        }}
        style={{
          color: status === 'copiado' ? 'var(--rede)' : status.startsWith('erro') ? 'var(--ink)' : undefined,
        }}
      >
        <Icone nome="link" />
      </button>
      <button
        type="button"
        className="icone-botao"
        disabled={status === 'carregando'}
        aria-disabled={status === 'carregando'}
        title="regenerar link (invalida o antigo)"
        aria-label="regenerar link (invalida o antigo)"
        onClick={(e) => {
          e.stopPropagation();
          void regenerar();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          void regenerar();
        }}
      >
        <Icone nome="renovar" />
      </button>
      {status === 'copiado' && (
        <span
          className="mono"
          role="status"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 20,
            whiteSpace: 'nowrap',
            fontSize: '11px',
            padding: '0.25rem 0.5rem',
            color: 'var(--rede)',
            border: '1px solid var(--rede-dim)',
            background: 'var(--concrete-0)',
            borderRadius: 2,
          }}
        >
          link copiado
        </span>
      )}
      {linkManual && <span role="status" className="mono" style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20, padding: '0.4rem', width: 300, maxWidth: '100%', background: 'var(--concrete-0)', border: '1px solid var(--concrete-2)', fontSize: 12 }}>
        cópia bloqueada — selecione e copie este link:
        <input readOnly value={linkManual} aria-label="link do jogador para copiar manualmente" onFocus={(e) => e.currentTarget.select()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={{ width: '100%', fontSize: 12 }} />
      </span>}
    </span>
  );
}
