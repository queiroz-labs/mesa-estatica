import { useEffect, useRef, useState } from 'react';
import type { ColorsetId } from '../../dice/colorsets';
import { formatarLogRolagem, type RollGroupResult, type RollTermo } from '../../dice/useDiceBox';
import type { TipoRolagemForcada } from '../../dice/registroForcados';
import { calcularPvMaximo, estaFerido } from '../../rules/derivados';
import { resolverTeste, type ResultadoTeste } from '../../rules/teste';
import { useStore } from '../../state/store';
import type { Ficha } from '../../state/types';
import ResultadoTrauma from './ResultadoTrauma';
import { consequenciaGatilhoTrauma, perdaTraumaAplicada, respostaTraumaAplicada, resultadoGatilhoTrauma, rotuloInterpretarTrauma } from './traumaApresentacao';

/** DT fixa — trauma é contra o próprio passado, não contra a dificuldade externa da cena.
 *  Intencional — e é exatamente por isso que este rolador (diferente do de Sanidade) pode
 *  aplicar a consequência sozinho: a DT é conhecida, não depende de julgamento do mestre. */
const DT_GATILHO = 12;

interface Props {
  ficha: Ficha;
  ready: boolean;
  rolar: (
    notacao: RollTermo[],
    onComplete: (r: RollGroupResult[]) => void | false,
    colorset?: ColorsetId,
    personagemId?: string | null,
    tipo?: TipoRolagemForcada,
    bonus?: number,
    contexto?: 'trauma',
  ) => void;
}

/** Gatilho de Trauma do jogador — versão reduzida de `RoladorTrauma.tsx` pra própria ficha. */
export default function RoladorTraumaJogador({ ficha, ready, rolar }: Props) {
  const basePV = useStore((s) => s.config.basePV);
  const ajustarSanidadeAtual = useStore((s) => s.ajustarSanidadeAtual);
  const ajustarDeterminacao = useStore((s) => s.ajustarDeterminacao);
  const registrarLog = useStore((s) => s.registrarLog);

  const [traumaId, setTraumaId] = useState('');
  const [rolando, setRolando] = useState(false);
  const [teste, setTeste] = useState<ResultadoTeste | null>(null);
  const [resolvido, setResolvido] = useState(false);
  const [consequencia, setConsequencia] = useState<string | null>(null);
  const respostaEscolhidaRef = useRef(false);

  const traumasAtivos = ficha.traumas.filter((t) => !t.virouCicatriz);
  const trauma = traumasAtivos.find((t) => t.id === traumaId) ?? null;
  const anestesiaAtiva = ficha.anestesiaAte !== null;

  useEffect(() => {
    if (anestesiaAtiva) { setTeste(null); setResolvido(true); setConsequencia(null); respostaEscolhidaRef.current = true; }
  }, [anestesiaAtiva]);

  const rolarGatilho = () => {
    if (!trauma || useStore.getState().fichas.find((f) => f.id === ficha.id)?.anestesiaAte != null) return;
    setRolando(true);
    setTeste(null);
    setResolvido(false);
    setConsequencia(null);
    respostaEscolhidaRef.current = false;
    const pvMaximo = calcularPvMaximo(basePV, ficha.atributos.vigor);
    const ferido = estaFerido(ficha.pvAtual, pvMaximo);
    // mesma fórmula de resolverTeste (não dá pra chamá-la antes de ter o d20) — penalidade de
    // ferido só se aplica a vigor/agilidade, então pra vontade o modificador é só o atributo.
    const modificador = ficha.atributos.vontade;
    rolar(
      [{ sides: 20, qty: 1 }],
      (grupos) => {
        setRolando(false);
        const fichaAtual = useStore.getState().fichas.find((f) => f.id === ficha.id);
        if (!fichaAtual || fichaAtual.anestesiaAte != null) {
          setTeste(null); setResolvido(true); return false;
        }
        const d20 = grupos[0].rolls[0].value;
        const r = resolverTeste({
          d20,
          atributoId: 'vontade',
          valorAtributo: ficha.atributos.vontade,
          grauPericia: 0,
          personagemFerido: ferido,
          dt: DT_GATILHO,
        });
        setTeste(r);
        if (r.sucesso) setResolvido(true);
        registrarLog(
          'trauma',
          formatarLogRolagem({
            quem: ficha.nome || 'Personagem',
            tipo: `Trauma: ${trauma.nome}`,
            grupos: [{ notacao: '1d20', resultados: [r.d20] }],
            bonus: r.modificador,
            total: r.total,
            sufixo: `· DT ${r.dt} · ${resultadoGatilhoTrauma(r)} ${consequenciaGatilhoTrauma(r)}`,
          }),
          ficha.id,
          'publica',
        );
      },
      'ruido',
      ficha.id,
      'teste',
      modificador || undefined,
      'trauma',
    );
  };

  const perderSanidade = () => {
    if (!trauma || !teste || teste.sucesso || respostaEscolhidaRef.current || useStore.getState().fichas.find((f) => f.id === ficha.id)?.anestesiaAte != null) return;
    // trava os dois botões já no clique, antes do dado assentar — mesmo motivo de RoladorTrauma.tsx.
    setResolvido(true);
    setRolando(true);
    respostaEscolhidaRef.current = true;
    setConsequencia('Perda escolhida: rolando 1d4 de Sanidade. Não há outro teste de Vontade.');
    rolar(
      [{ sides: 4, qty: 1 }],
      (grupos) => {
        setRolando(false);
        const atual = useStore.getState().fichas.find((f) => f.id === ficha.id);
        if (!atual || atual.anestesiaAte !== null) return false;
        const perda = grupos[0].value;
        ajustarSanidadeAtual(ficha.id, atual.sanidadeAtual - perda);
        const depois = useStore.getState().fichas.find((f) => f.id === ficha.id)!.sanidadeAtual;
        const efeito = perdaTraumaAplicada(perda, atual.sanidadeAtual, depois);
        setConsequencia(efeito);
        registrarLog(
          'trauma',
          formatarLogRolagem({ quem: ficha.nome || 'Personagem', tipo: `Trauma: ${trauma.nome} · perda de Sanidade`, grupos: [{ notacao: '1d4', resultados: [perda] }], total: perda, sufixo: `· ${efeito}` }),
          ficha.id,
          'publica',
        );
      },
      'ruido',
      ficha.id,
      undefined,
      undefined,
      'trauma',
    );
  };

  const interpretar = () => {
    if (!trauma || !teste || teste.sucesso || respostaEscolhidaRef.current) return;
    const atual = useStore.getState().fichas.find((f) => f.id === ficha.id);
    if (!atual || atual.anestesiaAte !== null) return;
    respostaEscolhidaRef.current = true;
    ajustarDeterminacao(ficha.id, atual.determinacao + 1);
    const depois = useStore.getState().fichas.find((f) => f.id === ficha.id)!.determinacao;
    const efeito = respostaTraumaAplicada(atual.determinacao, depois);
    setConsequencia(efeito);
    registrarLog('trauma', `${ficha.nome || 'Personagem'} · trauma "${trauma.nome}" · ${efeito}`, ficha.id, 'publica');
    setResolvido(true);
  };

  return (
    <section className="secao">
      <h3 className="label">Gatilho de Trauma em cena</h3>

      <div className="campos-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <label htmlFor="rtrj-trauma">Trauma</label>
          <select
            id="rtrj-trauma"
            value={traumaId}
            disabled={rolando}
            onChange={(e) => {
              setTraumaId(e.target.value);
              setTeste(null);
              setConsequencia(null);
              setResolvido(false);
              respostaEscolhidaRef.current = false;
            }}
          >
            <option value="">— selecione —</option>
            {traumasAtivos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome || 'sem nome'}
              </option>
            ))}
          </select>
        </div>
      </div>
      {traumasAtivos.length === 0 && <p className="vazio">nenhum trauma ativo (não-cicatriz) nesta ficha.</p>}
      {trauma && <p className="vazio">Gatilho: {trauma.gatilho || 'não preenchido'}. Resposta: {trauma.resposta || 'não preenchida — combine com o mestre'}.</p>}
      {anestesiaAtiva && <p className="vazio">anestesia ativa — gatilhos de Trauma passam automaticamente e não geram Determinação.</p>}

      <button className="acento" style={{ marginTop: '0.75rem' }} disabled={!ready || !trauma || rolando || anestesiaAtiva} onClick={rolarGatilho}>
        rolar Vontade vs DT{DT_GATILHO}
      </button>

      {teste && !anestesiaAtiva && <ResultadoTrauma teste={teste} consequencia={consequencia} />}

      {teste && !teste.sucesso && !resolvido && !anestesiaAtiva && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button className="perigo" onClick={perderSanidade}>
            perder 1d4 Sanidade (direto, sem outro teste)
          </button>
          <button className="acento" onClick={interpretar}>
            {rotuloInterpretarTrauma(ficha.determinacao)}
          </button>
        </div>
      )}
    </section>
  );
}
