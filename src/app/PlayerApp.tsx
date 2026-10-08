import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar';
import DadosTabJogador from '../features/dados/DadosTabJogador';
import QuickRollOverlayJogador from '../features/dados/QuickRollOverlayJogador';
import RolagemAoVivoPlayer from '../features/dados/RolagemAoVivoPlayer';
import FichaEditor from '../features/fichas/FichaEditor';
import CombateJogadorView from '../features/iniciativa/CombateJogadorView';
import MapaJogadorView from '../features/mapa/MapaJogadorView';
import MidiaJogadorView from '../features/midia/MidiaJogadorView';
import MidiaPlayerJogador from '../features/midia/MidiaPlayerJogador';
import AmbienciaPlayer from '../features/midia/AmbienciaPlayer';
import SoundpadPlayer from '../features/midia/SoundpadPlayer';
import NpcPublicaView from '../features/npcs/NpcPublicaView';
import RuidoOverlay from '../features/ruido/RuidoOverlay';
import AlertaOverlayJogador from '../features/sessao/AlertaOverlayJogador';
import DestaqueSuperior from '../features/sessao/DestaqueSuperior';
import SessaoPublicaView from '../features/sessao/SessaoPublicaView';
import { iniciarSyncAoE } from '../multiplayer/aoeSync';
import { iniciarAuthMultiplayer } from '../multiplayer/auth';
import {
  useFichasPublicas,
  useHidratarMidia,
  useHidratarSessaoPublica,
  useIniciativaPublica,
  useNpcsPublicos,
} from '../multiplayer/hidratacaoJogador';
import { iniciarSyncLogRolls } from '../multiplayer/logRollsSync';
import { iniciarSyncMapaAtivo } from '../multiplayer/mapaAtivoSync';
import { iniciarSyncMapasBiblioteca } from '../multiplayer/mapasBibliotecaSync';
import { useMinhaFicha } from '../multiplayer/minhaFicha';
import { iniciarSyncPing } from '../multiplayer/pingSync';
import { iniciarSyncReguas } from '../multiplayer/reguasSync';
import { iniciarSyncRolagemAoVivo } from '../multiplayer/rolagemAoVivoSync';
import { iniciarSyncSoundpad } from '../multiplayer/soundpadSync';
import { iniciarSyncTokens } from '../multiplayer/tokensSync';
import { useRolagemAoVivoStore } from '../state/rolagemAoVivoStore';
import { useRolagemRapidaSanidadeStore } from '../state/rolagemRapidaSanidadeStore';
import { useStore } from '../state/store';
import { COR_NPC_PADRAO } from '../state/factories';
import AvisoSupabaseAusente from './AvisoSupabaseAusente';
import DesyncIndicadorJogador from './DesyncIndicadorJogador';
import LogTabJogador from './LogTabJogador';
import ResumoJogador from './ResumoJogador';
import '../features/fichas/ficha.css';

type AbaId = 'sessao' | 'personagens' | 'dados' | 'npcs' | 'mapa' | 'midia' | 'log';

const ABAS: { id: AbaId; label: string }[] = [
  { id: 'sessao', label: 'Sessão' },
  { id: 'personagens', label: 'Personagens' },
  { id: 'dados', label: 'Dados' },
  { id: 'npcs', label: 'NPCs & Combate' },
  { id: 'mapa', label: 'Mapa' },
  { id: 'midia', label: 'Mídia' },
  { id: 'log', label: 'Log' },
];

/**
 * App reduzido do jogador (mesa-estatica-multiplayer-completo.md Parte IV §2, §5, Fase 6) —
 * monta só as `*View` de leitura + `FichaEditor`/roladores/`QuickRollOverlayJogador` pra
 * própria ficha. Sem `ControlPanel`, `FichasTab`, `NpcsTab`, `MapaTab`, `DadosTab`/roladores de
 * mestre, `LogTab`; sem `#controle`. Hidratado via Realtime (§6.4) — `fichas` (dos
 * outros)/`npcs` vêm de `characters_publico`/`npcs_publico` em estado local (RLS já filtra
 * `visivel`), `sessaoPublica` e a própria ficha vão pro `useStore` compartilhado
 * (`useMinhaFicha` — `FichaEditor` já lê/escreve via esse store, reuso sem modificação). Abas
 * por `visibility`/`pointer-events` (não renderização condicional) — mesmo padrão de
 * `App.tsx`, importante aqui porque desmontar `DadosTabJogador` reinicializaria a física 3D
 * do zero a cada troca de aba.
 */
export default function PlayerApp() {
  const [aba, setAba] = useState<AbaId>('sessao');
  const [overlayAberto, setOverlayAberto] = useState(false);
  const [pedidosRolagemRapida, setPedidosRolagemRapida] = useState(0);
  const [pedidosSanidadeRapida, setPedidosSanidadeRapida] = useState(0);
  const rolagemAoVivo = useRolagemAoVivoStore((s) => s.atual);
  const mostrandoRolagemAoVivo = useRolagemAoVivoStore((s) => s.mostrando);

  useHidratarSessaoPublica();
  useHidratarMidia();
  const { carregando, possuiFicha } = useMinhaFicha();
  const minhaFicha = useStore((s) => s.fichas.find((f) => f.id === s.fichaAtivaId) ?? null);
  const outrasFichas = useFichasPublicas().filter((f) => f.id !== minhaFicha?.id);
  const npcs = useNpcsPublicos();
  const iniciativa = useIniciativaPublica();

  const corMap: Record<string, string> = {};
  if (minhaFicha) corMap[minhaFicha.id] = minhaFicha.corVisual;
  for (const f of outrasFichas) corMap[f.id] = f.corVisual;
  for (const n of npcs) corMap[n.id] = n.corVisual ?? COR_NPC_PADRAO;

  // botão "rolar" no lembrete de Sanidade do log (LogTabJogador.tsx) — troca pra aba Dados e
  // pede pro RoladorSanidadeJogador disparar sozinho (repassado via pedidosSanidadeRapida).
  const pedidoSanidade = useRolagemRapidaSanidadeStore((s) => s.pedido);
  useEffect(() => {
    if (pedidoSanidade === 0) return;
    setAba('dados');
    setPedidosSanidadeRapida((p) => p + 1);
  }, [pedidoSanidade]);

  // sync de tokens (posição no mapa) + log/rolagens — mesmos módulos do GmApp (App.tsx), RLS
  // ainda aberta pra `tokens` desde a Fase A; gated pela mesma auth anônima que `useMinhaFicha`
  // já dispara.
  useEffect(() => {
    let pararTokens = () => {};
    let pararLogRolls = () => {};
    let pararReguas = () => {};
    let pararPing = () => {};
    let pararSoundpad = () => {};
    let pararAoE = () => {};
    let pararMapasBiblioteca = () => {};
    let pararMapaAtivo = () => {};
    let pararRolagemAoVivo = () => {};
    let cancelado = false;
    iniciarAuthMultiplayer().then(() => {
      if (cancelado) return;
      pararTokens = iniciarSyncTokens();
      pararLogRolls = iniciarSyncLogRolls();
      pararReguas = iniciarSyncReguas();
      // ping é simétrico igual régua: o jogador também pinga (useRegua.ts), não só recebe.
      pararPing = iniciarSyncPing();
      // mesmo módulo do mestre: aqui ele é só leitura na prática (o jogador não tem UI de
      // soundpad, e a RLS só deixa o GM escrever).
      pararSoundpad = iniciarSyncSoundpad();
      // Somente leitura explícita: hidratação e metadados de retry do mestre na mesma
      // origem nunca podem publicar uma área ou limpeza pelo cliente do jogador.
      pararAoE = iniciarSyncAoE({ somenteLeitura: true });
      // Biblioteca/mapa ativo são somente leitura explícita: hidratação e filas antigas
      // não podem gerar publicação GM-only no cliente do jogador.
      pararMapasBiblioteca = iniciarSyncMapasBiblioteca({ somenteLeitura: true });
      pararMapaAtivo = iniciarSyncMapaAtivo({ somenteLeitura: true });
      // simétrico: aqui é quem de fato PUBLICA (DadosTabJogador.tsx/QuickRollOverlayJogador.tsx
      // chamam rolagemAoVivoStore.definirAtual), o mestre só recebe.
      pararRolagemAoVivo = iniciarSyncRolagemAoVivo();
    });
    return () => {
      cancelado = true;
      pararTokens();
      pararLogRolls();
      pararReguas();
      pararPing();
      pararSoundpad();
      pararAoE();
      pararMapasBiblioteca();
      pararMapaAtivo();
      pararRolagemAoVivo();
    };
  }, []);

  // atalhos: 1-7 trocam de aba, R abre a rolagem rápida e já rola, S só abre o painel —
  // mesmo padrão de App.tsx, ignorado enquanto o foco está num campo de texto.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando =
        alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable);
      if (digitando || e.ctrlKey || e.altKey || e.metaKey) return;

      const indiceAba = '1234567'.indexOf(e.key);
      if (indiceAba !== -1) {
        setAba(ABAS[indiceAba].id);
        return;
      }
      const tecla = e.key.toLowerCase();
      if (tecla === 'r') {
        setOverlayAberto((prev) => {
          if (!prev) return true;
          setPedidosRolagemRapida((n) => n + 1);
          return true;
        });
      } else if (tecla === 'x') {
        setOverlayAberto(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AvisoSupabaseAusente />
      <RuidoOverlay />
      <AlertaOverlayJogador />
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid var(--concrete-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', minWidth: 0, flex: '1 1 auto' }}>
          <h1
            style={{
              fontSize: '18px',
              margin: 0,
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.4rem',
              flexWrap: 'wrap',
              minWidth: 0,
            }}
          >
            <span style={{ color: 'var(--ink-dim)', fontWeight: 400 }}>Estática —</span>
            <span style={{ color: minhaFicha?.corVisual || 'var(--rede)', fontWeight: 700 }}>
              {minhaFicha?.nome || 'Mesa'}
            </span>
          </h1>
          <DesyncIndicadorJogador />
          <nav style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            {ABAS.map((a) => {
              const ativa = aba === a.id;
              // aviso discreto (mesmo espírito do botão ATK ciano do CombatOverlay): a aba
              // Dados acende na cor de quem está rolando, se o jogador não estiver vendo ao vivo —
              // some sozinho alguns segundos depois do dado assentar (`mostrando` espelha o
              // `visivel` de RolagemAoVivoPlayer.tsx; `atual` nunca volta a null sozinho).
              const rolandoFora = !ativa && a.id === 'dados' && mostrandoRolagemAoVivo && rolagemAoVivo;
              return (
                <button
                  key={a.id}
                  onClick={() => setAba(a.id)}
                  style={
                    ativa
                      ? { borderColor: 'var(--rede)', color: 'var(--rede)', boxShadow: '0 0 0 1px var(--rede-glow)' }
                      : rolandoFora
                        ? { borderColor: rolagemAoVivo.cor, color: rolagemAoVivo.cor }
                        : undefined
                  }
                >
                  {a.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          <SoundpadPlayer />
          <RolagemAoVivoPlayer ficha={minhaFicha ?? undefined} />
          <MidiaPlayerJogador />
          <AmbienciaPlayer jogador />
        </div>
      </header>
      <DestaqueSuperior />
      <ResumoJogador minhaFicha={possuiFicha ? minhaFicha : null} iniciativa={iniciativa} />
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: aba === 'sessao' ? 'visible' : 'hidden',
            pointerEvents: aba === 'sessao' ? 'auto' : 'none',
            padding: '1.5rem',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <SessaoPublicaView />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: aba === 'personagens' ? 'visible' : 'hidden',
            pointerEvents: aba === 'personagens' ? 'auto' : 'none',
            padding: '1.5rem',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {carregando ? (
              <p className="vazio">sintonizando...</p>
            ) : possuiFicha && minhaFicha ? (
              <FichaEditor ficha={minhaFicha} />
            ) : (
              <p className="vazio">link inválido ou ficha ainda não vinculada — confira com o mestre.</p>
            )}
            {outrasFichas.length > 0 && (
              <div>
                <h3 className="label" style={{ marginBottom: '0.2rem' }}>outros jogadores</h3>
                <p className="vazio" style={{ marginBottom: '0.5rem' }}>não é a sua ficha — só pra saber quem mais está na mesa.</p>
              </div>
            )}
            {outrasFichas.map((f) => (
              <div key={f.id} className="secao" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Avatar nome={f.nome} cor={f.corVisual} foto={f.foto} bordaCor={f.corVisual} tamanho={40} ampliavel />
                <span className="label">{f.nome || 'sem nome'}</span>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: aba === 'dados' ? 'visible' : 'hidden',
            pointerEvents: aba === 'dados' ? 'auto' : 'none',
            padding: '1.5rem',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          {carregando ? (
            <p className="vazio">sintonizando...</p>
          ) : possuiFicha && minhaFicha ? (
            <DadosTabJogador ficha={minhaFicha} active={aba === 'dados'} pedidoRapidoSanidade={pedidosSanidadeRapida} />
          ) : (
            <p className="vazio">sem ficha vinculada — nada pra rolar.</p>
          )}
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: aba === 'mapa' ? 'visible' : 'hidden',
            pointerEvents: aba === 'mapa' ? 'auto' : 'none',
            height: '100%',
          }}
        >
          {carregando ? (
            <p className="vazio" style={{ padding: '1.5rem' }}>sintonizando...</p>
          ) : possuiFicha && minhaFicha ? (
            <MapaJogadorView minhaFicha={minhaFicha} outrasFichas={outrasFichas} npcs={npcs} iniciativa={iniciativa} />
          ) : (
            <p className="vazio" style={{ padding: '1.5rem' }}>
              sem ficha vinculada — sem token pra mostrar no mapa.
            </p>
          )}
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: aba === 'midia' ? 'visible' : 'hidden',
            pointerEvents: aba === 'midia' ? 'auto' : 'none',
            height: '100%',
          }}
        >
          <MidiaJogadorView />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: aba === 'npcs' ? 'visible' : 'hidden',
            pointerEvents: aba === 'npcs' ? 'auto' : 'none',
            padding: '1.5rem',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {minhaFicha && (
              <CombateJogadorView iniciativa={iniciativa} minhaFicha={minhaFicha} corMap={corMap} npcs={npcs} />
            )}
            {npcs.length > 0 && (
              <div>
                <h3 className="label" style={{ marginBottom: '0.2rem' }}>npcs</h3>
                <p className="vazio" style={{ marginBottom: '0.5rem' }}>aparecem aqui porque o mestre revelou.</p>
              </div>
            )}
            {npcs.length === 0 ? (
              <p className="vazio">nada revelado ainda.</p>
            ) : (
              npcs.map((n) => (
                <NpcPublicaView key={n.id} nome={n.nome} corVisual={n.corVisual} visivel={n.visivel} foto={n.foto} silhueta={n.silhueta} notas={n.notas} />
              ))
            )}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: aba === 'log' ? 'visible' : 'hidden',
            pointerEvents: aba === 'log' ? 'auto' : 'none',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <LogTabJogador />
        </div>
      </main>
      {possuiFicha && minhaFicha && (
        <QuickRollOverlayJogador
          ficha={minhaFicha}
          abaAtual={aba}
          aberto={overlayAberto}
          onAbertoChange={setOverlayAberto}
          pedidoRolagem={pedidosRolagemRapida}
        />
      )}
    </div>
  );
}
