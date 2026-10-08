import { useEffect, useRef, useState } from 'react';
import Icone from '../../components/Icone';
import { formatarLogRolagem, useDiceBox } from '../../dice/useDiceBox';
import { consumirForcados } from '../../dice/forcarRolagem';
import { calcularPvMaximo, estaFerido } from '../../rules/derivados';
import { ATRIBUTOS, PERICIAS } from '../../rules/data/pericias';
import { rolarDanoArmaFicha } from '../../rules/armasCombate';
import { rolarAtaqueNpc, rolarDanoNpcArma } from '../../rules/npcAcoes';
import { parseDanoArma } from '../../rules/teste';
import { rolarTestePericiaFicha } from '../../rules/testePericia';
import { usePedidoRolagemDanoStore, type PedidoRolagemDano } from '../../state/pedidoRolagemDanoStore';
import { usePedidoRolagemTesteStore, type PedidoRolagemTeste } from '../../state/pedidoRolagemTesteStore';
import { useStore } from '../../state/store';

interface QuickRollOverlayProps {
  abaAtual: string;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  pedidoRolagem: number;
}

export default function QuickRollOverlay({ abaAtual, aberto, onAbertoChange, pedidoRolagem }: QuickRollOverlayProps) {
  const habilitado = abaAtual !== 'dados' && aberto;
  const { ready, rolando, modo2D, erro, falhaRolagem, rolar, reproduzir } = useDiceBox('dice-overlay-rapido', habilitado, 45, undefined, consumirForcados);
  const fichas = useStore((s) => s.fichas);
  const npcs = useStore((s) => s.npcs);
  const fichaAtivaId = useStore((s) => s.fichaAtivaId);
  const basePV = useStore((s) => s.config.basePV);
  const registrarLog = useStore((s) => s.registrarLog);
  const registrarRoll = useStore((s) => s.registrarRoll);

  const [modo, setModo] = useState<'simples' | 'pericia'>('simples');
  const [quem, setQuem] = useState<'pc' | 'npc'>('pc');
  const [npcId, setNpcId] = useState('');
  const [bonus, setBonus] = useState(0);
  const [privado, setPrivado] = useState(true);
  const [periciaId, setPericiaId] = useState(PERICIAS[0].id);
  const [resultadoRoll, setResultadoRoll] = useState<{ d20: number; modificador: number; total: number } | null>(null);
  const [resultadoDano, setResultadoDano] = useState<{ nomeArma: string; texto: string; erro: boolean } | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<{ rotulo: string; texto: string } | null>(null);
  const pedidoDano = usePedidoRolagemDanoStore((s) => s.pedido);
  const limparPedidoRolagemDano = usePedidoRolagemDanoStore((s) => s.limparPedidoRolagemDano);
  const pedidoTeste = usePedidoRolagemTesteStore((s) => s.pedido);
  const limparPedidoRolagemTeste = usePedidoRolagemTesteStore((s) => s.limparPedidoRolagemTeste);

  const ficha = fichas.find((f) => f.id === fichaAtivaId) ?? null;
  const npc = npcs.find((n) => n.id === npcId) ?? null;
  const pericia = PERICIAS.find((p) => p.id === periciaId)!;
  const atributo = ATRIBUTOS.find((a) => a.id === pericia.atributo)!;

  const visibilidade = privado ? 'privada' as const : 'publica' as const;

  // NPC não exige selecionar um NPC específico da lista — o mestre pode rolar um "d20 de NPC"
  // genérico na hora (mesmo padrão que RolagemLivre já usa pro modo 'nenhum').
  const podeRolarSimples = (quem === 'pc' && ficha !== null) || quem === 'npc';
  const podeRolarPericia = quem === 'pc' ? ficha !== null : npc !== null;
  const podeRolar = modo === 'simples' ? podeRolarSimples : podeRolarPericia;

  const rolarSimples = () => {
    setResultadoRoll(null);
    rolar('1d20', (grupos) => {
      const valor = grupos[0]?.rolls[0]?.value ?? 0;
      const mod = bonus;
      const total = valor + mod;
      setResultadoRoll({ d20: valor, modificador: mod, total });

      const origem = quem === 'npc' ? (npc?.nome || 'NPC') : (ficha?.nome || 'd20 rápido');
      const id = quem === 'npc' ? (npc?.id ?? null) : (ficha?.id ?? null);
      const formula = bonus !== 0 ? `d20${bonus > 0 ? '+' : ''}${bonus}` : 'd20';
      registrarLog(
        'teste',
        formatarLogRolagem({ quem: origem, tipo: 'Rolagem Rápida', grupos: [{ notacao: '1d20', resultados: [valor] }], bonus, total }),
        id,
        visibilidade,
      );
      registrarRoll({
        origem,
        personagemId: id,
        formula,
        total,
        bruto: valor,
        visibilidade,
      });
    }, 'rede', quem === 'npc' ? (npc?.id ?? null) : (ficha?.id ?? null), 'teste');
  };

  const rolarPericia = () => {
    if (quem === 'pc' && ficha) {
      setResultadoRoll(null);
      rolar('1d20', (grupos) => {
        const d20 = grupos[0]?.rolls[0]?.value ?? 0;
        const pvMaximo = calcularPvMaximo(basePV, ficha.atributos.vigor);
        const ferido = estaFerido(ficha.pvAtual, pvMaximo);
        const grauPericia = ficha.pericias[periciaId] ?? 0;
        const penalidadeFerido = ferido && (pericia.atributo === 'vigor' || pericia.atributo === 'agilidade') ? -2 : 0;
        const modificador = ficha.atributos[pericia.atributo] + grauPericia + penalidadeFerido;
        const total = d20 + modificador;
        setResultadoRoll({ d20, modificador, total });
        const formula = `d20${modificador >= 0 ? '+' : ''}${modificador}`;
        registrarLog(
          'teste',
          formatarLogRolagem({
            quem: ficha.nome || 'Personagem',
            tipo: `Teste de Perícia: ${pericia.nome}(${atributo.nome})`,
            grupos: [{ notacao: '1d20', resultados: [d20] }],
            bonus: modificador,
            total,
          }),
          ficha.id,
          visibilidade,
        );
        registrarRoll({
          origem: ficha.nome || 'Personagem',
          personagemId: ficha.id,
          formula,
          total,
          bruto: d20,
          visibilidade,
        });
      }, 'rede', ficha.id, 'teste');
    } else if (quem === 'npc' && npc) {
      setResultadoRoll(null);
      rolar('1d20', (grupos) => {
        const d20 = grupos[0]?.rolls[0]?.value ?? 0;
        const total = d20 + bonus;
        setResultadoRoll({ d20, modificador: bonus, total });
        const formula = bonus !== 0 ? `d20${bonus > 0 ? '+' : ''}${bonus}` : 'd20';
        registrarLog(
          'teste',
          formatarLogRolagem({ quem: npc.nome || 'NPC', tipo: 'Teste Rápido', grupos: [{ notacao: '1d20', resultados: [d20] }], bonus, total }),
          npc.id,
          visibilidade,
        );
        registrarRoll({
          origem: npc.nome || 'NPC',
          personagemId: npc.id,
          formula,
          total,
          bruto: d20,
          visibilidade,
        });
      }, undefined, npc.id, 'teste');
    }
  };

  // Rolagem de dano de arma pedida de fora (chip em `ArmasCombate.tsx`/`ArmasCombateNpc.tsx`) —
  // a física roda nesta bandeja (a mesma do "d20 rápido") em vez de uma caixinha própria por
  // card (removida — colidia entre instâncias simultâneas, ver `armasCombate.ts`). NPC não tem
  // crítico (nunca teve gatilho de UI pra isso), só o ramo de PC usa `p.critico`.
  const executarPedidoDano = (p: PedidoRolagemDano) => {
    if (!usePedidoRolagemDanoStore.getState().iniciarPedidoRolagemDano(p.id)) return;
    if (p.npcId !== undefined) {
      const npcAlvo = npcs.find((n) => n.id === p.npcId);
      const acao = npcAlvo?.acoes.find((a) => a.id === p.armaId);
      if (!npcAlvo || !acao) {
        limparPedidoRolagemDano(p.id);
        return;
      }
      setResultadoDano(null);
      const parsed = parseDanoArma(acao.dano);
      const finalizarNpc = (valoresDados: number[], termos: Parameters<typeof reproduzir>[0]) => {
        const r = rolarDanoNpcArma(npcAlvo, acao, termos, valoresDados, registrarLog, registrarRoll, p.visibilidade);
        setResultadoDano({ nomeArma: acao.nome || 'arma', texto: r.texto, erro: r.erro });
        limparPedidoRolagemDano(p.id);
      };
      if (!parsed) {
        finalizarNpc([], []);
        return;
      }
      const termosNpc = [{ sides: parsed.lados, qty: parsed.qtd }];
      rolar(termosNpc, (grupos) => finalizarNpc(grupos.flatMap((g) => g.rolls.map((r) => r.value)), termosNpc), 'rede', npcAlvo.id, 'dano');
      return;
    }
    const fichaAlvo = fichas.find((f) => f.id === p.fichaId);
    const arma = fichaAlvo?.armas.find((a) => a.id === p.armaId);
    if (!fichaAlvo || !arma) {
      limparPedidoRolagemDano(p.id);
      return;
    }
    setResultadoDano(null);
    const finalizar = (valoresDados: number[], termos: Parameters<typeof reproduzir>[0]) => {
      const r = rolarDanoArmaFicha(fichaAlvo, arma, termos, valoresDados, p.critico, registrarLog, registrarRoll, p.visibilidade);
      setResultadoDano({ nomeArma: arma.nome || 'arma', texto: r.texto, erro: r.erro });
      limparPedidoRolagemDano(p.id);
    };
    const parsed = parseDanoArma(arma.dano);
    if (!parsed) {
      finalizar([], []);
      return;
    }
    const termos = [{ sides: parsed.lados, qty: parsed.qtd }];
    if (p.critico) {
      const valoresMaximos = Array(parsed.qtd).fill(parsed.lados);
      reproduzir(termos, valoresMaximos, { base: 'rede', cor: fichaAlvo.corVisual }, () => finalizar(valoresMaximos, termos));
    } else {
      rolar(termos, (grupos) => finalizar(grupos.flatMap((g) => g.rolls.map((r) => r.value)), termos), 'rede', fichaAlvo.id, 'dano');
    }
  };

  // Pedido de teste de perícia/ataque vindo de fora (`ArmasCombate.tsx`/`ArmasCombateNpc.tsx` pro
  // ataque, `PericiasSection.tsx` pro teste solo de PC) — mesma ponte de `executarPedidoDano`
  // acima, mesma bandeja física. NPC não tem perícia/atributo — `bonusFixo` já é o modificador
  // pronto, sem lookup nenhum.
  const executarPedidoTeste = (p: PedidoRolagemTeste) => {
    if (!usePedidoRolagemTesteStore.getState().iniciarPedidoRolagemTeste(p.id)) return;
    if (p.npcId !== undefined) {
      const npcAlvo = npcs.find((n) => n.id === p.npcId);
      if (!npcAlvo || p.bonusFixo === undefined) {
        limparPedidoRolagemTeste(p.id);
        return;
      }
      setResultadoTeste(null);
      rolar('1d20', (grupos) => {
        const d20 = grupos[0]?.rolls[0]?.value ?? 0;
        const r = rolarAtaqueNpc(npcAlvo, p.rotuloArma ?? 'ação', p.bonusFixo!, d20, registrarLog, registrarRoll, p.visibilidade);
        setResultadoTeste({ rotulo: p.rotuloArma ?? npcAlvo.nome, texto: r.texto });
        limparPedidoRolagemTeste(p.id);
      }, 'rede', npcAlvo.id, 'teste');
      return;
    }
    const fichaAlvo = fichas.find((f) => f.id === p.fichaId);
    const pericia = PERICIAS.find((per) => per.id === p.periciaId);
    if (!fichaAlvo || !pericia) {
      limparPedidoRolagemTeste(p.id);
      return;
    }
    setResultadoTeste(null);
    rolar('1d20', (grupos) => {
      const d20 = grupos[0]?.rolls[0]?.value ?? 0;
      const r = rolarTestePericiaFicha(fichaAlvo, pericia, d20, basePV, registrarLog, registrarRoll, p.visibilidade, p.rotuloArma);
      setResultadoTeste({ rotulo: p.rotuloArma ?? pericia.nome, texto: r.texto });
      limparPedidoRolagemTeste(p.id);
    }, 'rede', fichaAlvo.id, 'teste');
  };

  const pendenteRef = useRef(false);
  const rolarAtual = modo === 'simples' ? rolarSimples : rolarPericia;
  const rolarAtualRef = useRef(rolarAtual);
  rolarAtualRef.current = rolarAtual;

  useEffect(() => {
    if (pedidoRolagem === 0) return;
    if (ready && !rolando && podeRolar) {
      rolarAtualRef.current();
    } else {
      pendenteRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoRolagem]);

  useEffect(() => {
    if (ready && pendenteRef.current) {
      pendenteRef.current = false;
      if (!rolando && podeRolar) rolarAtualRef.current();
    }
  }, [ready, rolando, podeRolar]);

  // Mesmo padrão acima, pro pedido de dano: `pedidoDano` só limpa (volta a `null`) quando o
  // roll termina — se chegar um pedido novo enquanto o dado ainda cai, fica pendente até
  // `ready`/`rolando` liberarem.
  const pedidoDanoPendenteRef = useRef<PedidoRolagemDano | null>(null);
  const executarPedidoDanoRef = useRef(executarPedidoDano);
  executarPedidoDanoRef.current = executarPedidoDano;

  useEffect(() => {
    if (!pedidoDano) { pedidoDanoPendenteRef.current = null; return; }
    if (ready && !rolando) {
      executarPedidoDanoRef.current(pedidoDano);
    } else {
      pedidoDanoPendenteRef.current = pedidoDano;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDano?.id]);

  useEffect(() => {
    if (ready && !rolando && pedidoDanoPendenteRef.current) {
      const p = pedidoDanoPendenteRef.current;
      pedidoDanoPendenteRef.current = null;
      executarPedidoDanoRef.current(p);
    }
  }, [ready, rolando]);

  // Mesmo padrão acima, pro pedido de teste de perícia/ataque.
  const pedidoTestePendenteRef = useRef<PedidoRolagemTeste | null>(null);
  const executarPedidoTesteRef = useRef(executarPedidoTeste);
  executarPedidoTesteRef.current = executarPedidoTeste;

  useEffect(() => {
    if (!pedidoTeste) { pedidoTestePendenteRef.current = null; return; }
    if (ready && !rolando) {
      executarPedidoTesteRef.current(pedidoTeste);
    } else {
      pedidoTestePendenteRef.current = pedidoTeste;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoTeste?.id]);

  useEffect(() => {
    if (ready && !rolando && pedidoTestePendenteRef.current) {
      const p = pedidoTestePendenteRef.current;
      pedidoTestePendenteRef.current = null;
      executarPedidoTesteRef.current(p);
    }
  }, [ready, rolando]);

  useEffect(() => {
    if (!erro || !falhaRolagem) return;
    const dano = usePedidoRolagemDanoStore.getState();
    const teste = usePedidoRolagemTesteStore.getState();
    if (dano.pedido && dano.emExecucaoId === dano.pedido.id) { pedidoDanoPendenteRef.current = null; dano.limparPedidoRolagemDano(dano.pedido.id); }
    if (teste.pedido && teste.emExecucaoId === teste.pedido.id) { pedidoTestePendenteRef.current = null; teste.limparPedidoRolagemTeste(teste.pedido.id); }
  }, [erro, falhaRolagem]);

  if (abaAtual === 'dados') return null;

  return (
    <div style={{ position: 'fixed', right: '1.25rem', bottom: '1.25rem', zIndex: 50 }}>
      {aberto && (
        <div
          className="secao"
          style={{ width: 'min(260px, calc(100vw - 2.5rem))', marginBottom: '0.6rem', maxHeight: 'calc(100vh - 6rem)', overflowY: 'auto' }}
        >
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
          {falhaRolagem && <p role="status" className="vazio">não consegui rolar — tente novamente.</p>}

          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem' }}>
            <button
              className={quem === 'pc' ? 'acento' : undefined}
              aria-pressed={quem === 'pc'}
              style={{ flex: 1, fontSize: 12, padding: '0.35em' }}
              onClick={() => setQuem('pc')}
            >
              PC
            </button>
            <button
              className={quem === 'npc' ? 'acento' : undefined}
              aria-pressed={quem === 'npc'}
              style={{ flex: 1, fontSize: 12, padding: '0.35em' }}
              onClick={() => { setQuem('npc'); setModo('simples'); }}
            >
              NPC
            </button>
          </div>

          {quem === 'pc' && (
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
          )}

          {quem === 'npc' && (
            <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem' }}>
              <button
                className={modo === 'simples' ? 'acento' : undefined}
                aria-pressed={modo === 'simples'}
                style={{ flex: 1, fontSize: 12, padding: '0.35em' }}
                onClick={() => setModo('simples')}
              >
                simples
              </button>
            </div>
          )}

          {quem === 'npc' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <div>
                <label htmlFor="qr-npc">NPC</label>
                <select id="qr-npc" value={npcId} onChange={(e) => setNpcId(e.target.value)}>
                  <option value="">— selecione —</option>
                  {npcs.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nome || 'sem nome'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {modo === 'simples' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <div>
                <label htmlFor="qr-bonus">Bônus</label>
                <input
                  id="qr-bonus"
                  type="number"
                  value={bonus}
                  onChange={(e) => setBonus(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          {modo === 'pericia' && quem === 'pc' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <div>
                <label htmlFor="qr-pericia">Perícia</label>
                <select id="qr-pericia" value={periciaId} onChange={(e) => setPericiaId(e.target.value)}>
                  {PERICIAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({ATRIBUTOS.find((a) => a.id === p.atributo)!.nome})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {!modo2D && (
            <div
              id="dice-overlay-rapido"
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem' }}>
            <span className="vazio">
              {quem === 'pc'
                ? (ficha ? ficha.nome : 'sem personagem ativo')
                : (npc ? npc.nome : 'selecione um NPC')}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '11px' }}>
              <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
              {privado ? 'só no app do mestre' : 'mostrar aos jogadores'}
            </label>
          </div>

          <button
            className="acento"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={!ready || rolando || !podeRolar}
            onClick={rolarAtual}
          >
            {modo === 'simples' ? 'rolar d20' : 'rolar teste'}
          </button>

          {resultadoRoll && (
            <div
              className="alerta-banner mono"
              style={{
                marginTop: '0.5rem',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 12 }}>
                {resultadoRoll.modificador === 0
                  ? `1d20 → ${resultadoRoll.total}`
                  : `1d20: ${resultadoRoll.d20}${resultadoRoll.modificador > 0 ? ` + ${resultadoRoll.modificador}` : ` - ${Math.abs(resultadoRoll.modificador)}`} = ${resultadoRoll.total}`}
              </span>
            </div>
          )}

          {resultadoDano && (
            <div
              className="alerta-banner mono"
              style={{ marginTop: '0.5rem', justifyContent: 'center', borderColor: resultadoDano.erro ? 'var(--ruido)' : undefined }}
            >
              <span style={{ fontSize: 12, color: resultadoDano.erro ? 'var(--ruido)' : undefined }}>
                dano · {resultadoDano.nomeArma}: {resultadoDano.texto}
              </span>
            </div>
          )}

          {resultadoTeste && (
            <div className="alerta-banner mono" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
              <span style={{ fontSize: 12 }}>
                {resultadoTeste.rotulo}: {resultadoTeste.texto}
              </span>
            </div>
          )}
        </div>
      )}
      <button
        className="controle-icone"
        onClick={() => onAbertoChange(!aberto)}
        title="rolagem rápida (atalho: R)"
        aria-label="rolagem rápida d20"
        aria-expanded={aberto}
        style={{ width: 40, height: 40 }}
      >
        d20
      </button>
    </div>
  );
}
