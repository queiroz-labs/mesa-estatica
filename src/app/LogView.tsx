import { useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import type { EntradaLog, EntradaRoll, TipoLog } from '../state/types';

const LABELS_TIPO: Record<TipoLog | 'todos', string> = {
  todos: 'todos',
  teste: 'teste',
  sanidade: 'sanidade',
  surto: 'surto',
  trauma: 'trauma',
  dano: 'dano',
  cura: 'cura',
  dinheiro: 'dinheiro',
  determinacao: 'determinação',
  anotacao: 'anotação',
  'rolagem-livre': 'rolagem livre',
  iniciativa: 'iniciativa',
};

/** Tipos que ganham o acento --ruido (arte.md: "vermelho sujo = só dano, Sanidade crítica e
 *  Surto — nunca as 3 cores no mesmo componente"). Só esse acento entra aqui; o resto do log
 *  fica sem cor. */
const TIPOS_RUIDO = new Set<TipoLog>(['dano', 'sanidade', 'surto']);

type ItemFeed = { tipo: 'log'; entrada: EntradaLog } | { tipo: 'roll'; entrada: EntradaRoll };

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function chaveDia(iso: string): number {
  return inicioDoDia(new Date(iso)).getTime();
}

/** "hoje"/"ontem" ou "23 de agosto" (com ano só se for de outro ano) — separador entre
 *  entradas de dias civis diferentes, pro log não virar uma lista indistinta numa mesa que
 *  roda há meses. */
function formatarSeparadorDia(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const diffDias = Math.round((inicioDoDia(hoje).getTime() - inicioDoDia(data).getTime()) / 86_400_000);
  if (diffDias === 0) return 'hoje';
  if (diffDias === 1) return 'ontem';
  return data.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: data.getFullYear() !== hoje.getFullYear() ? 'numeric' : undefined,
  });
}

function LinhaLog({
  entrada: e,
  renderAcao,
  podeLimpar,
  definirVisibilidadeLog,
}: {
  entrada: EntradaLog;
  renderAcao?: (e: EntradaLog) => ReactNode;
  podeLimpar: boolean;
  definirVisibilidadeLog: (id: string, visibilidade: 'publica' | 'privada') => void;
}) {
  const destaque = TIPOS_RUIDO.has(e.tipo);
  const privada = e.visibilidade === 'privada';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        color: destaque ? 'var(--ruido)' : undefined,
        borderLeft: destaque ? '2px solid var(--ruido)' : undefined,
        paddingLeft: destaque ? '0.4rem' : undefined,
      }}
    >
      <span style={{ opacity: privada ? 0.6 : 1 }}>
        [{new Date(e.timestamp).toLocaleTimeString()}] {LABELS_TIPO[e.tipo]} · {e.texto}
      </span>
      {podeLimpar && (
        <>
          <span style={{ fontSize: '11px', opacity: 0.5 }}>{privada ? 'privado' : 'público'}</span>
          <button
            className="icone-botao"
            onClick={() => definirVisibilidadeLog(e.id, privada ? 'publica' : 'privada')}
            title={privada ? 'tornar pública' : 'tornar privada'}
            style={{ fontSize: '11px', padding: '0.15rem 0.4rem' }}
          >
            {privada ? 'revelar' : 'ocultar'}
          </button>
        </>
      )}
      {renderAcao?.(e)}
    </div>
  );
}

function LinhaRoll({
  entrada: r,
  podeLimpar,
  definirVisibilidadeRoll,
}: {
  entrada: EntradaRoll;
  podeLimpar: boolean;
  definirVisibilidadeRoll: (id: string, visibilidade: 'publica' | 'privada') => void;
}) {
  const privada = r.visibilidade === 'privada';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ opacity: privada ? 0.6 : 1 }}>
        [{new Date(r.timestamp).toLocaleTimeString()}] {r.origem} · registro de dados: {r.formula} · total registrado: {r.total} · valor base: {r.bruto}
      </span>
      <span style={{ fontSize: '11px', opacity: 0.5 }}>{privada ? 'privado' : 'público'}</span>
      {podeLimpar && (
        <button
          className="icone-botao"
          onClick={() => definirVisibilidadeRoll(r.id, privada ? 'publica' : 'privada')}
          title={privada ? 'tornar pública' : 'tornar privada'}
          style={{ fontSize: '11px', padding: '0.15rem 0.4rem' }}
        >
          {privada ? 'revelar' : 'ocultar'}
        </button>
      )}
    </div>
  );
}

/**
 * Log compartilhado entre mestre (`LogTab.tsx`) e jogador (`LogTabJogador.tsx`) — mesmo
 * idioma de `podeArrastar` em `IniciativaPanel`: um componente, uma prop de capacidade.
 * `podeLimpar=false` esconde "limpar log" e restringe rolagens visíveis às públicas.
 *
 * `acoes` é um slot pra botões que só existem no lado do mestre (hoje, "iniciar sessão limpa"),
 * renderizado ao lado de "limpar log". É slot em vez de import direto justamente porque este
 * arquivo entra no bundle do jogador — quem passa o conteúdo é o `LogTab.tsx`, que não entra.
 *
 * `renderAcaoEntrada` é o mesmo idioma de slot, só que por-linha em vez de por-tela — hoje usado
 * por `LogTabJogador.tsx` pra oferecer "rolar" ao lado do lembrete de teste de Sanidade.
 *
 * Log narrativo e rolagens brutas (`rollsLog`) continuam dois canais paralelos no estado/sync
 * (visibilidade de cada um existe independente — ver `ROADMAP.md` sobre isso ser intencional),
 * mas aqui na tela são intercalados por timestamp num feed só, em vez de duas listas
 * empilhadas — `registrarLog`/`registrarRoll` já são chamados juntos na mesma ação, então isso
 * não duplica informação nova, só aproxima na tela o que já acontece junto no tempo.
 */
export default function LogView({
  podeLimpar,
  acoes,
  renderAcaoEntrada,
}: {
  podeLimpar: boolean;
  acoes?: ReactNode;
  renderAcaoEntrada?: (e: EntradaLog) => ReactNode;
}) {
  const log = useStore((s) => s.log);
  const rollsLog = useStore((s) => s.rollsLog);
  const fichas = useStore((s) => s.fichas);
  const limparLog = useStore((s) => s.limparLog);
  const definirVisibilidadeRoll = useStore((s) => s.definirVisibilidadeRoll);
  const definirVisibilidadeLog = useStore((s) => s.definirVisibilidadeLog);
  const [filtroPersonagem, setFiltroPersonagem] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<TipoLog | 'todos'>('todos');
  const [filtroTexto, setFiltroTexto] = useState('');

  const feed = useMemo(() => {
    const texto = filtroTexto.trim().toLowerCase();

    const itensLog: ItemFeed[] = log
      .filter((e) => {
        // defesa em profundidade — RLS já deveria impedir uma entrada privada alheia de
        // chegar aqui, mas filtra de novo no client por garantia.
        const passaPrivacidade = podeLimpar || e.visibilidade !== 'privada';
        const passaPersonagem = filtroPersonagem === 'todos' || e.personagemId === filtroPersonagem;
        const passaTipo = filtroTipo === 'todos' || e.tipo === filtroTipo;
        const passaTexto = texto === '' || e.texto.toLowerCase().includes(texto);
        return passaPrivacidade && passaPersonagem && passaTipo && passaTexto;
      })
      .map((entrada) => ({ tipo: 'log' as const, entrada }));

    // rolagens não têm `tipo` — um filtro de tipo específico (≠ "todos") as esconde do feed,
    // comportamento natural do filtro, sem precisar de caso especial.
    const itensRoll: ItemFeed[] =
      filtroTipo !== 'todos'
        ? []
        : rollsLog
            .filter((r) => {
              const passaPrivacidade = podeLimpar || r.visibilidade !== 'privada';
              const passaPersonagem = filtroPersonagem === 'todos' || r.personagemId === filtroPersonagem;
              const passaTexto =
                texto === '' || r.origem.toLowerCase().includes(texto) || r.formula.toLowerCase().includes(texto);
              return passaPrivacidade && passaPersonagem && passaTexto;
            })
            .map((entrada) => ({ tipo: 'roll' as const, entrada }));

    return [...itensLog, ...itensRoll].sort(
      (a, b) => new Date(b.entrada.timestamp).getTime() - new Date(a.entrada.timestamp).getTime(),
    );
  }, [filtroPersonagem, filtroTexto, filtroTipo, log, rollsLog, podeLimpar]);

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 className="label">Log da sessão</h3>
        {podeLimpar && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="perigo" onClick={limparLog}>
              limpar log
            </button>
            {acoes}
          </div>
        )}
      </div>

      <div className="campos-grid" style={{ marginBottom: '1rem' }}>
        <div>
          <label htmlFor="log-personagem">Personagem</label>
          <select id="log-personagem" value={filtroPersonagem} onChange={(e) => setFiltroPersonagem(e.target.value)}>
            <option value="todos">todos</option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome || 'sem nome'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="log-tipo">Tipo</label>
          <select id="log-tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoLog | 'todos')}>
            {Object.entries(LABELS_TIPO).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="log-texto">Busca</label>
          <input
            id="log-texto"
            type="text"
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            placeholder="ex.: sanidade, 1d20, Igor"
          />
        </div>
      </div>

      {log.length === 0 && rollsLog.length === 0 ? (
        <p className="vazio">sem registros. sinal limpo.</p>
      ) : feed.length === 0 ? (
        <p className="vazio">nenhum registro bate com os filtros atuais.</p>
      ) : (
        <div className="mono" style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {feed.map((item, i) => {
            const diaAnterior = i > 0 ? chaveDia(feed[i - 1].entrada.timestamp) : null;
            const mostrarSeparador = chaveDia(item.entrada.timestamp) !== diaAnterior;
            return (
              <div key={`${item.tipo}-${item.entrada.id}`}>
                {mostrarSeparador && (
                  <div
                    className="label"
                    style={{
                      borderBottom: '1px solid var(--concrete-2)',
                      paddingBottom: '0.2rem',
                      marginTop: i === 0 ? 0 : '0.6rem',
                      marginBottom: '0.3rem',
                    }}
                  >
                    {formatarSeparadorDia(item.entrada.timestamp)}
                  </div>
                )}
                {item.tipo === 'log' ? (
                  <LinhaLog
                    entrada={item.entrada}
                    renderAcao={renderAcaoEntrada}
                    podeLimpar={podeLimpar}
                    definirVisibilidadeLog={definirVisibilidadeLog}
                  />
                ) : (
                  <LinhaRoll entrada={item.entrada} podeLimpar={podeLimpar} definirVisibilidadeRoll={definirVisibilidadeRoll} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
