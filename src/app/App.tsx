import { useEffect, useRef, useState } from 'react';
import DadosTab from '../features/dados/DadosTab';
import QuickRollOverlay from '../features/dados/QuickRollOverlay';
import RolagemAoVivoPlayer from '../features/dados/RolagemAoVivoPlayer';
import FichasTab from '../features/fichas/FichasTab';
import MapaTab from '../features/mapa/MapaTab';
import MidiaPlayerGM from '../features/midia/MidiaPlayerGM';
import AmbienciaPlayer from '../features/midia/AmbienciaPlayer';
import ControleAudioRapido from '../features/midia/ControleAudioRapido';
import MidiaTab from '../features/midia/MidiaTab';
import SoundpadPlayer from '../features/midia/SoundpadPlayer';
import GateOverlay from '../features/multiplayer/GateOverlay';
import VinculoMestre from '../features/multiplayer/VinculoMestre';
import NpcsTab from '../features/npcs/NpcsTab';
import PistasTab from '../features/pistas/PistasTab';
import RuidoOverlay from '../features/ruido/RuidoOverlay';
import AlertaOverlay from '../features/sessao/AlertaOverlay';
import DestaqueSuperior from '../features/sessao/DestaqueSuperior';
import SessaoTab from '../features/sessao/SessaoTab';
import { usePedidoRolagemDanoStore } from '../state/pedidoRolagemDanoStore';
import { usePedidoRolagemTesteStore } from '../state/pedidoRolagemTesteStore';
import { useStore } from '../state/store';
import { iniciarSyncAoE } from '../multiplayer/aoeSync';
import { iniciarAuthMultiplayer } from '../multiplayer/auth';
import { iniciarSyncFichas } from '../multiplayer/fichasSync';
import { iniciarSyncIniciativa } from '../multiplayer/iniciativaSync';
import { iniciarSyncLogRolls } from '../multiplayer/logRollsSync';
import { iniciarSyncMapaAtivo } from '../multiplayer/mapaAtivoSync';
import { iniciarSyncMapasBiblioteca } from '../multiplayer/mapasBibliotecaSync';
import { iniciarSyncMidiaEstado } from '../multiplayer/midiaEstadoSync';
import { iniciarSyncMidiaFaixas } from '../multiplayer/midiaFaixasSync';
import { iniciarSyncNpcs } from '../multiplayer/npcsSync';
import { iniciarSyncPing } from '../multiplayer/pingSync';
import { iniciarSyncReguas } from '../multiplayer/reguasSync';
import { iniciarSyncRolagemAoVivo } from '../multiplayer/rolagemAoVivoSync';
import { iniciarSyncSessaoPublica } from '../multiplayer/sessaoPublicaSync';
import { iniciarSyncSoundpad } from '../multiplayer/soundpadSync';
import { iniciarSyncTokens } from '../multiplayer/tokensSync';
import { useRolagemAoVivoStore } from '../state/rolagemAoVivoStore';
import AvisoSupabaseAusente from './AvisoSupabaseAusente';
import ImportarNuvemModal from './ImportarNuvemModal';
import LogTab from './LogTab';
import StatusIndicador from './StatusIndicador';
import { supabase } from '../lib/supabaseClient';
import { uploadR2 } from '../multiplayer/uploadR2';
import Icone, { type NomeIcone } from '../components/Icone';
import { IconeAlerta } from '../features/combate/icones';
import './cabecalho.css';

const ATALHOS: Record<string, string> = {
  sessao: '1',
  personagens: '2',
  dados: '3',
  mapa: '4',
  npcs: '5',
  pistas: '6',
  log: '7',
  midia: '8',
};

type AbaId = 'sessao' | 'personagens' | 'dados' | 'mapa' | 'npcs' | 'pistas' | 'log' | 'midia';

const ABAS: { id: AbaId; label: string }[] = [
  { id: 'sessao', label: 'Sessão' },
  { id: 'personagens', label: 'Personagens' },
  { id: 'dados', label: 'Dados & Regras' },
  { id: 'mapa', label: 'Mapa' },
  { id: 'npcs', label: 'NPCs & Iniciativa' },
  { id: 'pistas', label: 'Pistas' },
  { id: 'log', label: 'Log' },
  { id: 'midia', label: 'Mídia' },
];

/** Nunca automático de verdade: navegadores bloqueiam downloads disparados por script sem
 *  clique depois do primeiro (Chrome mostra "permitir múltiplos downloads?" e pode simplesmente
 *  descartar os seguintes) — um lembrete visual que exige clique é a única forma confiável de
 *  garantir que o backup realmente saia. Reseta a cada exportação (manual ou por este lembrete). */
const INTERVALO_LEMBRETE_BACKUP_MS = 15 * 60 * 1000;

/** `YYYY-MM-DDTHH-mm-ss` em horário local — usado tanto no nome do arquivo local quanto (com um
 *  sufixo aleatório a mais) na chave do save na nuvem. */
function carimboDataHora(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

type StatusNuvem = 'idle' | 'salvando' | 'ok' | 'erro';
type MenuId = 'exportar' | 'importar' | null;

/** Botão-gatilho + menu de 2 opções (local/nuvem) que fecha sozinho ao clicar fora ou Esc. Sem
 *  `supabase` configurado não tem escolha real a fazer, então nem mostra o menu — `onSemNuvem` é
 *  chamado direto (mesmo padrão de degradação graciosa do resto do app). */
function BotaoComMenu({
  label,
  icone,
  aviso = false,
  className,
  title,
  temNuvem,
  aberto,
  onAbrir,
  onFechar,
  onSemNuvem,
  onLocal,
  onNuvem,
}: {
  label: string;
  icone: NomeIcone;
  aviso?: boolean;
  className?: string;
  title?: string;
  temNuvem: boolean;
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  onSemNuvem: () => void;
  onLocal: () => void;
  onNuvem: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onFechar();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [aberto, onFechar]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={`cabecalho__acao ${className ?? ''}`} title={title} onClick={temNuvem ? onAbrir : onSemNuvem} aria-expanded={temNuvem ? aberto : undefined}>
        <Icone nome={icone} />
        {label}
        {aviso && <IconeAlerta size={14} />}
      </button>
      {aberto && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '0.25rem',
            background: 'var(--concrete-1)',
            border: '1px solid var(--concrete-2)',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 70,
            minWidth: '100%',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => {
              onLocal();
              onFechar();
            }}
            style={{ textAlign: 'left', padding: '0.4rem 0.7rem' }}
          >
            local
          </button>
          <button
            onClick={() => {
              onNuvem();
              onFechar();
            }}
            style={{ textAlign: 'left', padding: '0.4rem 0.7rem' }}
          >
            nuvem
          </button>
        </div>
      )}
    </div>
  );
}

function ExportarImportar({ abrirControle }: { abrirControle: () => void }) {
  const exportarJSON = useStore((s) => s.exportarJSON);
  const importarJSON = useStore((s) => s.importarJSON);
  const inputRef = useRef<HTMLInputElement>(null);
  const [precisaBackup, setPrecisaBackup] = useState(false);
  const [statusNuvem, setStatusNuvem] = useState<StatusNuvem>('idle');
  const [erroNuvem, setErroNuvem] = useState<string | null>(null);
  const [nuvemAberta, setNuvemAberta] = useState(false);
  const [menuAberto, setMenuAberto] = useState<MenuId>(null);

  useEffect(() => {
    const id = setInterval(() => setPrecisaBackup(true), INTERVALO_LEMBRETE_BACKUP_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!menuAberto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAberto(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [menuAberto]);

  const exportarLocal = () => {
    const blob = new Blob([exportarJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estatica-mesa-${carimboDataHora()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setPrecisaBackup(false);
  };

  const exportarNuvem = async () => {
    setStatusNuvem('salvando');
    const blob = new Blob([exportarJSON()], { type: 'application/json' });
    const sufixo = crypto.randomUUID().slice(0, 6);
    const { url: publicUrl, erro } = await uploadR2(`saves/estatica-mesa-${carimboDataHora()}-${sufixo}.json`, blob, 'application/json');
    if (publicUrl) {
      setStatusNuvem('ok');
      setPrecisaBackup(false);
    } else {
      setStatusNuvem('erro');
      setErroNuvem(erro ?? 'falha ao salvar na nuvem');
    }
  };

  const importarLocal = () => inputRef.current?.click();

  const importarDeArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    void arquivo.text().then((texto) => {
      try {
        importarJSON(texto);
        setPrecisaBackup(false);
      } catch {
        window.alert('sinal corrompido — não foi possível ler esse arquivo.');
      }
    }).catch(() => window.alert('não consegui ler esse arquivo — selecione o JSON novamente.'));
    e.target.value = '';
  };

  return (
    <div className="cabecalho__acoes">
      <div className="cabecalho__acoes">
        <BotaoComMenu
          label="exportar"
          icone="download"
          aviso={precisaBackup}
          className={precisaBackup ? 'acento' : undefined}
          title={precisaBackup ? 'já faz 15+ min do último backup — considere exportar de novo' : 'confie no papel, não na nuvem'}
          temNuvem={!!supabase}
          aberto={menuAberto === 'exportar'}
          onAbrir={() => setMenuAberto('exportar')}
          onFechar={() => setMenuAberto(null)}
          onSemNuvem={exportarLocal}
          onLocal={exportarLocal}
          onNuvem={exportarNuvem}
        />
        <BotaoComMenu
          label="importar"
          icone="upload"
          temNuvem={!!supabase}
          aberto={menuAberto === 'importar'}
          onAbrir={() => setMenuAberto('importar')}
          onFechar={() => setMenuAberto(null)}
          onSemNuvem={importarLocal}
          onLocal={importarLocal}
          onNuvem={() => setNuvemAberta(true)}
        />
        {statusNuvem === 'salvando' && (
          <span className="vazio" style={{ fontSize: '12px' }}>
            salvando na nuvem…
          </span>
        )}
        {statusNuvem === 'ok' && (
          <span className="vazio" style={{ fontSize: '12px' }}>
            salvo na nuvem
          </span>
        )}
        {statusNuvem === 'erro' && (
          <span className="mono" style={{ fontSize: '12px', color: 'var(--ink)' }} title={erroNuvem ?? undefined}>
            <IconeAlerta size={14} /> nuvem: falhou
          </span>
        )}
        {/* botão de controle agora oculto; o controle é acessível clicando no título principal */}
        <button onClick={abrirControle} title="janela secreta do mestre — não compartilhar" style={{ display: 'none' }}>
          controle
        </button>
        <input ref={inputRef} type="file" accept="application/json" hidden onChange={importarDeArquivo} />
      </div>
      {nuvemAberta && <ImportarNuvemModal onFechar={() => setNuvemAberta(false)} />}
    </div>
  );
}

export default function App() {
  const [aba, setAba] = useState<AbaId>('sessao');
  const [overlayAberto, setOverlayAberto] = useState(false);
  const [pedidosRolagemRapida, setPedidosRolagemRapida] = useState(0);
  const rolagemAoVivo = useRolagemAoVivoStore((s) => s.atual);
  const mostrandoRolagemAoVivo = useRolagemAoVivoStore((s) => s.mostrando);
  const pedidoDano = usePedidoRolagemDanoStore((s) => s.pedido);
  const pedidoTeste = usePedidoRolagemTesteStore((s) => s.pedido);

  // chip de dano/ataque na aba Combate (ArmasCombate.tsx) e o d20 de perícia na Ficha
  // (PericiasSection.tsx) pedem a rolagem por esses stores — abre o "d20 rápido" sozinho pra
  // física rodar lá (mesma bandeja, sem caixinha própria por card).
  useEffect(() => {
    if (pedidoDano || pedidoTeste) setOverlayAberto(true);
  }, [pedidoDano, pedidoTeste]);

  const abrirControle = () => {
    window.open(
      `${location.origin}${location.pathname}#controle`,
      'estatica-controle',
      'width=620,height=760',
    );
  };

  // Multiplayer Fases A+B (mesa-estatica-multiplayer-completo.md §11): sessão anônima +
  // vínculo por URL primeiro, sync de tokens/fichas/npcs/sessão/iniciativa via Supabase
  // Realtime depois — nessa ordem, pra RLS já enxergar auth.uid() na primeira assinatura.
  // Vira no-op sem env vars.
  useEffect(() => {
    let pararTokens = () => {};
    let pararFichas = () => {};
    let pararNpcs = () => {};
    let pararSessaoPublica = () => {};
    let pararIniciativa = () => {};
    let pararMapasBiblioteca = () => {};
    let pararMapaAtivo = () => {};
    let pararMidiaFaixas = () => {};
    let pararMidiaEstado = () => {};
    let pararLogRolls = () => {};
    let pararReguas = () => {};
    let pararPing = () => {};
    let pararSoundpad = () => {};
    let pararAoE = () => {};
    let pararRolagemAoVivo = () => {};
    let cancelado = false;
    iniciarAuthMultiplayer().then(() => {
      if (cancelado) return;
      pararTokens = iniciarSyncTokens();
      pararFichas = iniciarSyncFichas();
      pararNpcs = iniciarSyncNpcs();
      pararSessaoPublica = iniciarSyncSessaoPublica();
      pararIniciativa = iniciarSyncIniciativa();
      pararMapasBiblioteca = iniciarSyncMapasBiblioteca();
      pararMapaAtivo = iniciarSyncMapaAtivo();
      pararMidiaFaixas = iniciarSyncMidiaFaixas();
      pararMidiaEstado = iniciarSyncMidiaEstado();
      pararLogRolls = iniciarSyncLogRolls();
      pararReguas = iniciarSyncReguas();
      pararPing = iniciarSyncPing();
      pararSoundpad = iniciarSyncSoundpad();
      pararAoE = iniciarSyncAoE();
      pararRolagemAoVivo = iniciarSyncRolagemAoVivo();
    });
    return () => {
      cancelado = true;
      pararTokens();
      pararFichas();
      pararNpcs();
      pararSessaoPublica();
      pararIniciativa();
      pararMapasBiblioteca();
      pararMapaAtivo();
      pararMidiaFaixas();
      pararMidiaEstado();
      pararLogRolls();
      pararReguas();
      pararPing();
      pararSoundpad();
      pararAoE();
      pararRolagemAoVivo();
    };
  }, []);

  // atalhos: 1–8 trocam de aba, R abre a rolagem rápida e já rola (de novo se já aberta), X
  // fecha, C abre a janela de controle secreta (mesmo destino do clique no título). Ignorados
  // enquanto o foco está num campo de texto (senão digitar "1" numa ficha trocaria de aba).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando =
        alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable);
      if (digitando || e.ctrlKey || e.altKey || e.metaKey) return;

      const indiceAba = '12345678'.indexOf(e.key);
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
      } else if (tecla === 'c') {
        abrirControle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="mesa-shell">
      <GateOverlay />
      <AvisoSupabaseAusente />
      <RuidoOverlay incluirSanidade={false} />
      <AlertaOverlay />
      <header className="cabecalho">
        <div className="cabecalho__topo">
          <h1 className="cabecalho__titulo">
            <button className="cabecalho__titulo-controle" onClick={abrirControle} title="abrir controle — janela secreta do mestre (atalho: C)">
              Estática — Mesa
            </button>
          </h1>
          <div className="cabecalho__acoes">
            <MidiaPlayerGM />
            <AmbienciaPlayer />
            <SoundpadPlayer />
            <RolagemAoVivoPlayer verProprias />
            <ControleAudioRapido />
            <ExportarImportar abrirControle={abrirControle} />
          </div>
        </div>
          <nav className="cabecalho__abas" aria-label="Abas da mesa">
            {ABAS.map((a) => {
              const atalho = ATALHOS[a.id];
              const ativa = aba === a.id;
              // aviso discreto (mesmo espírito do botão ATK ciano do CombatOverlay quando o
              // combate começa): a aba Dados acende na cor de quem está rolando, se o mestre
              // não estiver nela vendo ao vivo — some sozinho alguns segundos depois do dado
              // assentar (`mostrando` espelha o `visivel` de RolagemAoVivoPlayer.tsx; `atual`
              // nunca volta a null sozinho, então não serve pra saber se ainda está em tela).
              const rolandoFora = !ativa && a.id === 'dados' && mostrandoRolagemAoVivo && rolagemAoVivo;
              return (
                <button
                  key={a.id}
                  aria-current={ativa ? 'page' : undefined}
                  onClick={() => setAba(a.id)}
                  title={`${a.label} (atalho: ${atalho})`}
                  style={
                    ativa
                      ? { borderColor: 'var(--rede)', color: 'var(--rede)', boxShadow: '0 0 0 1px var(--rede-glow)' }
                      : rolandoFora
                        ? { borderColor: rolagemAoVivo.cor, color: rolagemAoVivo.cor }
                        : undefined
                  }
                >
                  {atalho} {a.label}
                </button>
              );
            })}
          </nav>
        <div className="cabecalho__operacao" aria-label="Estado da mesa">
          <VinculoMestre />
          <StatusIndicador />
        </div>
      </header>
      <DestaqueSuperior />
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
          <SessaoTab />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: aba === 'personagens' ? 'visible' : 'hidden',
            pointerEvents: aba === 'personagens' ? 'auto' : 'none',
            padding: '1.5rem',
            height: '100%',
          }}
        >
          <FichasTab />
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
          <DadosTab active={aba === 'dados'} />
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
          <MapaTab active={aba === 'mapa'} />
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
          <NpcsTab />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            visibility: aba === 'pistas' ? 'visible' : 'hidden',
            pointerEvents: aba === 'pistas' ? 'auto' : 'none',
            padding: '1.5rem',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <PistasTab />
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
          <LogTab />
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
          <MidiaTab />
        </div>
      </main>
      <QuickRollOverlay
        abaAtual={aba}
        aberto={overlayAberto}
        onAbertoChange={setOverlayAberto}
        pedidoRolagem={pedidosRolagemRapida}
      />
    </div>
  );
}
