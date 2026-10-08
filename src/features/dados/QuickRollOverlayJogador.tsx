import { useEffect, useRef, useState } from 'react';
import Icone from '../../components/Icone';
import { formatarLogRolagem, normalizarTermos, useDiceBox } from '../../dice/useDiceBox';
import { resolverRolagemJogador } from '../../multiplayer/rolagemRemota';
import { calcularPvMaximo, estaFerido } from '../../rules/derivados';
import { ATRIBUTOS, PERICIAS } from '../../rules/data/pericias';
import { avisarInicioRolagem, marcarComoProprio, useRolagemAoVivoStore } from '../../state/rolagemAoVivoStore';
import { useStore } from '../../state/store';
import type { Ficha } from '../../state/types';

interface Props {
  ficha: Ficha;
  abaAtual: string;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  pedidoRolagem: number;
}

/**
 * d20 rápido do jogador — versão reduzida de `QuickRollOverlay.tsx`: sem alternância PC/NPC
 * (só a própria ficha), sem checkbox "privado" (rolagem do jogador é sempre pública — a
 * distinção privada/pública era só pra rolagem de NPC do mestre), sem sucesso/falha no modo
 * perícia (a DT da cena é segredo do mestre — mesmo raciocínio de `RoladorTesteJogador`).
 * Bandeja física própria (`useDiceBox` com `resolverRolagemJogador`), separada da bandeja da
 * aba Dados — mesmo padrão do mestre (duas instâncias independentes).
 *
 * Só cobre o "R"/botão manual (rolarSimples/rolarPericia) — pedido de dano/teste de
 * ataque/perícia vindo de fora (chip de arma, botão de perícia) migrou pro header
 * (`RolagemAoVivoPlayer.tsx`, 03/09, melhorias-pendentes-2026-09-02.md §4): a física roda na
 * bandeja sempre-montada de lá, sem precisar abrir este popup só pra existir o container.
 */
export default function QuickRollOverlayJogador({ ficha, abaAtual, aberto, onAbertoChange, pedidoRolagem }: Props) {
  const habilitado = abaAtual !== 'dados' && aberto;
  const { ready, rolando, modo2D, rolar } = useDiceBox('dice-overlay-jogador', habilitado, 45, resolverRolagemJogador);
  const basePV = useStore((s) => s.config.basePV);
  const registrarLog = useStore((s) => s.registrarLog);
  const registrarRoll = useStore((s) => s.registrarRoll);

  const [modo, setModo] = useState<'simples' | 'pericia'>('simples');
  const [periciaId, setPericiaId] = useState(PERICIAS[0].id);
  const [bonus, setBonus] = useState(0);
  const [resultadoRoll, setResultadoRoll] = useState<{ d20: number; modificador: number; total: number } | null>(null);

  const pericia = PERICIAS.find((p) => p.id === periciaId)!;
  const atributo = ATRIBUTOS.find((a) => a.id === pericia.atributo)!;

  // transmite a rolagem pra mesa toda ver o dado caindo (rolagemAoVivoStore/rolagemAoVivoSync) —
  // mesmo wrapper de DadosTabJogador.tsx, aqui só com os dois call sites locais. `bonusRolagem`
  // (6º parâmetro, opcional) é o modificador de perícia/atributo — não passa pela física, só
  // entra no total mostrado pelo aviso ao vivo (formatarHeaderRolagem).
  const rolarEBroadcast = (
    notacao: Parameters<typeof rolar>[0],
    onComplete: Parameters<typeof rolar>[1],
    colorset?: Parameters<typeof rolar>[2],
    personagemId?: Parameters<typeof rolar>[3],
    tipo?: Parameters<typeof rolar>[4],
    bonusRolagem?: number,
    contexto?: 'livre',
  ) => {
    const id = avisarInicioRolagem(ficha.nome || 'jogador', ficha.corVisual, tipo ?? 'teste');
    rolar(
      notacao,
      (grupos) => {
        onComplete(grupos);
        marcarComoProprio(id);
        useRolagemAoVivoStore.getState().definirAtual({
          id,
          termos: normalizarTermos(notacao),
          valores: grupos.flatMap((g) => g.rolls.map((r) => r.value)),
          colorsetBase: typeof colorset === 'string' ? colorset : 'rede',
          cor: ficha.corVisual,
          origem: ficha.nome || 'jogador',
          tipo: tipo ?? 'teste',
          bonus: bonusRolagem,
          contexto,
        });
      },
      colorset,
      personagemId,
      tipo,
    );
  };

  const rolarSimples = () => {
    setResultadoRoll(null);
    rolarEBroadcast(
      '1d20',
      (grupos) => {
        const valor = grupos[0]?.rolls[0]?.value ?? 0;
        const mod = bonus;
        const total = valor + mod;
        setResultadoRoll({ d20: valor, modificador: mod, total });

        const nome = ficha.nome || 'd20 rápido';
        const formula = bonus !== 0 ? `d20${bonus > 0 ? '+' : ''}${bonus}` : 'd20';
        registrarLog(
          'teste',
          formatarLogRolagem({ quem: nome, tipo: 'Rolagem Rápida', grupos: [{ notacao: '1d20', resultados: [valor] }], bonus, total }),
          ficha.id,
          'publica',
        );
        registrarRoll({
          origem: nome,
          personagemId: ficha.id,
          formula,
          total,
          bruto: valor,
          visibilidade: 'publica',
        });
      },
      'rede',
      ficha.id,
      undefined,
      bonus || undefined,
      'livre',
    );
  };

  const rolarPericia = () => {
    setResultadoRoll(null);
    const pvMaximo = calcularPvMaximo(basePV, ficha.atributos.vigor);
    const ferido = estaFerido(ficha.pvAtual, pvMaximo);
    const penalidadeFerido = ferido && (pericia.atributo === 'vigor' || pericia.atributo === 'agilidade') ? -2 : 0;
    const grauPericia = ficha.pericias[periciaId] ?? 0;
    const modificador = ficha.atributos[pericia.atributo] + grauPericia + penalidadeFerido;
    rolarEBroadcast(
      '1d20',
      (grupos) => {
        const d20 = grupos[0]?.rolls[0]?.value ?? 0;
        setResultadoRoll({ d20, modificador, total: d20 + modificador });

        const nome = ficha.nome || 'Personagem';
        const modStr = modificador >= 0 ? `+${modificador}` : `${modificador}`;
        registrarLog(
          'teste',
          formatarLogRolagem({
            quem: nome,
            tipo: `Teste de Perícia: ${pericia.nome}(${atributo.nome})`,
            grupos: [{ notacao: '1d20', resultados: [d20] }],
            bonus: modificador,
            total: d20 + modificador,
          }),
          ficha.id,
          'publica',
        );
        registrarRoll({
          origem: nome,
          personagemId: ficha.id,
          formula: `d20${modStr}`,
          total: d20 + modificador,
          bruto: d20,
          visibilidade: 'publica',
        });
      },
      'rede',
      ficha.id,
      undefined,
      modificador || undefined,
    );
  };

  const pendenteRef = useRef(false);
  const rolarAtual = modo === 'simples' ? rolarSimples : rolarPericia;
  const rolarAtualRef = useRef(rolarAtual);
  rolarAtualRef.current = rolarAtual;

  useEffect(() => {
    if (pedidoRolagem === 0) return;
    if (ready && !rolando) {
      rolarAtualRef.current();
    } else {
      pendenteRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoRolagem]);

  useEffect(() => {
    if (ready && pendenteRef.current) {
      pendenteRef.current = false;
      if (!rolando) rolarAtualRef.current();
    }
  }, [ready, rolando]);

  if (abaAtual === 'dados') return null;

  return (
    <div style={{ position: 'fixed', right: '1.25rem', bottom: '1.25rem', zIndex: 50 }}>
      {aberto && (
        <div className="secao" style={{ width: 'min(260px, calc(100vw - 2.5rem))', marginBottom: '0.6rem', maxHeight: 'calc(100vh - 6rem)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 className="label" style={{ margin: 0 }}>
              d20 rápido
            </h3>
            <button className="controle-icone" onClick={() => onAbertoChange(false)} title="fechar (atalho: X)" aria-label="fechar rolagem rápida">
              <Icone nome="fechar" />
            </button>
          </div>
          <div className="vazio" style={{ fontSize: 12, marginBottom: '0.4rem', textAlign: 'center' }}>
            atalhos: R=abrir/rolar · X=fechar
          </div>

          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem' }}>
            <button
              className={modo === 'simples' ? 'acento' : undefined}
              aria-pressed={modo === 'simples'}
              style={{ flex: 1, fontSize: 12, padding: '0.35em' }}
              onClick={() => setModo('simples')}
            >
              simples
            </button>
            <button
              className={modo === 'pericia' ? 'acento' : undefined}
              aria-pressed={modo === 'pericia'}
              style={{ flex: 1, fontSize: 12, padding: '0.35em' }}
              onClick={() => setModo('pericia')}
            >
              perícia
            </button>
          </div>

          {modo === 'simples' && (
            <div style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="qrj-bonus">Bônus</label>
              <input
                id="qrj-bonus"
                type="number"
                value={bonus}
                onChange={(e) => setBonus(Number(e.target.value) || 0)}
              />
            </div>
          )}

          {modo === 'pericia' && (
            <div style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="qrj-pericia">Perícia</label>
              <select id="qrj-pericia" value={periciaId} onChange={(e) => setPericiaId(e.target.value)}>
                {PERICIAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({ATRIBUTOS.find((a) => a.id === p.atributo)!.nome})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!modo2D && (
            <div
              id="dice-overlay-jogador"
              style={{
                width: '100%',
                height: '140px',
                background: 'var(--concrete-0)',
                border: '1px solid var(--concrete-2)',
                position: 'relative',
                overflow: 'hidden',
              }}
            />
          )}
          {modo2D && (
            <p className="vazio" style={{ fontSize: 12 }}>
              sem WebGL nesta máquina — rolando por número, sem o dado físico.
            </p>
          )}

          <div style={{ marginTop: '0.4rem' }}>
            <span className="vazio">{ficha.nome || 'sem nome'}</span>
          </div>

          <button className="acento" style={{ width: '100%', marginTop: '0.5rem' }} disabled={!ready || rolando} onClick={rolarAtual}>
            {modo === 'simples' ? 'rolar d20' : 'rolar teste'}
          </button>

          {resultadoRoll && (
            <div className="alerta-banner mono" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
              <span style={{ fontSize: 12 }}>
                {resultadoRoll.modificador === 0
                  ? `1d20 → ${resultadoRoll.total}`
                  : `1d20: ${resultadoRoll.d20}${resultadoRoll.modificador > 0 ? ` + ${resultadoRoll.modificador}` : ` - ${Math.abs(resultadoRoll.modificador)}`} = ${resultadoRoll.total}`}
              </span>
            </div>
          )}

        </div>
      )}
      <button className="controle-icone" onClick={() => onAbertoChange(!aberto)} title="rolagem rápida (atalho: R)" aria-label="rolagem rápida d20" aria-expanded={aberto} style={{ width: 40, height: 40 }}>
        d20
      </button>
    </div>
  );
}
