import { useEffect, useRef, useState } from 'react';
import type { ColorsetId } from '../../dice/colorsets';
import type { TipoRolagemForcada } from '../../dice/registroForcados';
import { formatarLogRolagem, type RollGroupResult, type RollTermo } from '../../dice/useDiceBox';
import { calcularPvMaximo, estaFerido } from '../../rules/derivados';
import { resolverTeste, type ResultadoTeste } from '../../rules/teste';
import { useStore } from '../../state/store';
import ResultadoTrauma from './ResultadoTrauma';
import { consequenciaGatilhoTrauma, perdaTraumaAplicada, respostaTraumaAplicada, resultadoGatilhoTrauma, rotuloInterpretarTrauma } from './traumaApresentacao';

/** DT fixa — trauma é contra o próprio passado, não contra a dificuldade externa da
 *  cena (que, aliás, não é mais lida automaticamente por nenhum rolador — ver
 *  `RoladorSanidade.tsx`). Intencional. */
const DT_GATILHO = 12;
type TesteTraumaMestre = ResultadoTeste & { visibilidade: 'publica' | 'privada' };

interface RoladorTraumaProps {
  ready: boolean;
  rolar: (
    notacao: RollTermo[],
    onComplete: (r: RollGroupResult[]) => void,
    colorset?: ColorsetId,
    personagemId?: string | null,
    tipo?: TipoRolagemForcada,
  ) => void;
}

export default function RoladorTrauma({ ready, rolar }: RoladorTraumaProps) {
  const fichas = useStore((s) => s.fichas);
  const basePV = useStore((s) => s.config.basePV);
  const registrarLog = useStore((s) => s.registrarLog);
  const ajustarSanidadeAtual = useStore((s) => s.ajustarSanidadeAtual);
  const ajustarDeterminacao = useStore((s) => s.ajustarDeterminacao);

  const [fichaId, setFichaId] = useState('');
  const [traumaId, setTraumaId] = useState('');
  const [rolando, setRolando] = useState(false);
  const [teste, setTeste] = useState<TesteTraumaMestre | null>(null);
  const [resolvido, setResolvido] = useState(false);
  const [consequencia, setConsequencia] = useState<string | null>(null);
  const respostaEscolhidaRef = useRef(false);
  const [privado, setPrivado] = useState(true);
  const visibilidade = privado ? 'privada' as const : 'publica' as const;

  const ficha = fichas.find((f) => f.id === fichaId) ?? null;
  const traumasAtivos = ficha?.traumas.filter((t) => !t.virouCicatriz) ?? [];
  const trauma = traumasAtivos.find((t) => t.id === traumaId) ?? null;
  const anestesiaAtiva = ficha?.anestesiaAte != null;

  useEffect(() => {
    if (anestesiaAtiva) { setTeste(null); setResolvido(true); setConsequencia(null); respostaEscolhidaRef.current = true; }
  }, [anestesiaAtiva]);

  const rolarGatilho = () => {
    if (!ficha || !trauma || useStore.getState().fichas.find((f) => f.id === ficha.id)?.anestesiaAte != null) return;
    setRolando(true);
    setTeste(null);
    setResolvido(false);
    setConsequencia(null);
    respostaEscolhidaRef.current = false;
    const visibilidadeDoTeste = visibilidade;
    rolar([{ sides: 20, qty: 1 }], (grupos) => {
      setRolando(false);
      if (useStore.getState().fichas.find((f) => f.id === ficha.id)?.anestesiaAte != null) {
        setTeste(null); setResolvido(true); return;
      }
      const d20 = grupos[0].rolls[0].value;
      const pvMaximo = calcularPvMaximo(basePV, ficha.atributos.vigor);
      const ferido = estaFerido(ficha.pvAtual, pvMaximo);
      const r = resolverTeste({
        d20,
        atributoId: 'vontade',
        valorAtributo: ficha.atributos.vontade,
        grauPericia: 0,
        personagemFerido: ferido,
        dt: DT_GATILHO,
      });
      setTeste({ ...r, visibilidade: visibilidadeDoTeste });
      if (r.sucesso) setResolvido(true);
      registrarLog(
        'trauma',
        formatarLogRolagem({
          quem: ficha.nome || 'Personagem',
          tipo: `Trauma: ${trauma.nome}`,
          grupos: [{ notacao: '1d20', resultados: [d20] }],
          bonus: r.modificador,
          total: r.total,
          sufixo: `· DT ${r.dt} · ${resultadoGatilhoTrauma(r)} ${consequenciaGatilhoTrauma(r)}`,
        }),
        ficha.id,
        visibilidadeDoTeste,
      );
    }, 'ruido', ficha.id);
  };

  const perderSanidade = () => {
    if (!ficha || !trauma || !teste || teste.sucesso || respostaEscolhidaRef.current || useStore.getState().fichas.find((f) => f.id === ficha.id)?.anestesiaAte != null) return;
    // trava os dois botões já no clique, antes do dado assentar — sem isso, um duplo clique (ou
    // clicar "interpretar" enquanto o dado ainda anima) aplica as duas consequências, que
    // deveriam ser mutuamente exclusivas (mesmo guard que RoladorSurto.tsx já usa, síncrono).
    setResolvido(true);
    setRolando(true);
    respostaEscolhidaRef.current = true;
    setConsequencia('Perda escolhida: rolando 1d4 de Sanidade. Não há outro teste de Vontade.');
    const visibilidadeDaResposta = teste.visibilidade;
    rolar(
      [{ sides: 4, qty: 1 }],
      (grupos) => {
        setRolando(false);
        const atual = useStore.getState().fichas.find((f) => f.id === ficha.id);
        if (!atual || atual.anestesiaAte !== null) return;
        const perda = grupos[0].value;
        ajustarSanidadeAtual(ficha.id, atual.sanidadeAtual - perda, visibilidadeDaResposta);
        const depois = useStore.getState().fichas.find((f) => f.id === ficha.id)!.sanidadeAtual;
        const efeito = perdaTraumaAplicada(perda, atual.sanidadeAtual, depois);
        setConsequencia(efeito);
        registrarLog(
          'trauma',
          formatarLogRolagem({ quem: ficha.nome || 'Personagem', tipo: `Trauma: ${trauma.nome} · perda de Sanidade`, grupos: [{ notacao: '1d4', resultados: [perda] }], total: perda, sufixo: `· ${efeito}` }),
          ficha.id,
          visibilidadeDaResposta,
        );
      },
      'ruido',
      ficha.id,
    );
  };

  const interpretar = () => {
    if (!ficha || !trauma || !teste || teste.sucesso || respostaEscolhidaRef.current) return;
    const atual = useStore.getState().fichas.find((f) => f.id === ficha.id);
    if (!atual || atual.anestesiaAte !== null) return;
    respostaEscolhidaRef.current = true;
    ajustarDeterminacao(ficha.id, atual.determinacao + 1, teste.visibilidade);
    const depois = useStore.getState().fichas.find((f) => f.id === ficha.id)!.determinacao;
    const efeito = respostaTraumaAplicada(atual.determinacao, depois);
    setConsequencia(efeito);
    registrarLog('trauma', `${ficha.nome || 'Personagem'} · trauma "${trauma.nome}" · ${efeito}`, ficha.id, teste.visibilidade);
    setResolvido(true);
  };

  return (
    <section className="secao">
      <h3 className="label">Gatilho de Trauma em cena</h3>

      <div className="campos-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <label htmlFor="rtr-ficha">Personagem</label>
          <select
            id="rtr-ficha"
            value={fichaId}
            disabled={rolando}
            onChange={(e) => {
              setFichaId(e.target.value);
              setTraumaId('');
              setTeste(null);
              setConsequencia(null);
            }}
          >
            <option value="">— selecione —</option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome || 'sem nome'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rtr-trauma">Trauma</label>
          <select
            id="rtr-trauma"
            value={traumaId}
            onChange={(e) => {
              setTraumaId(e.target.value);
              setTeste(null);
              setResolvido(false);
              setConsequencia(null);
              respostaEscolhidaRef.current = false;
            }}
            disabled={!ficha || rolando}
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
      {ficha && traumasAtivos.length === 0 && <p className="vazio">nenhum trauma ativo (não-cicatriz) nesta ficha.</p>}
      {trauma && <p className="vazio">Gatilho: {trauma.gatilho || 'não preenchido'}. Resposta: {trauma.resposta || 'não preenchida — combine com o mestre'}.</p>}
      {anestesiaAtiva && <p className="vazio">anestesia ativa — gatilhos de Trauma passam automaticamente e não geram Determinação.</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
        <button className="acento" disabled={!ready || !trauma || rolando || anestesiaAtiva} onClick={rolarGatilho}>
          rolar Vontade vs DT{DT_GATILHO}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '12px' }}>
          <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
          {privado ? 'só no app do mestre' : 'mostrar aos jogadores'}
        </label>
      </div>

      {teste && !anestesiaAtiva && <ResultadoTrauma teste={teste} consequencia={consequencia} />}

      {teste && !teste.sucesso && !resolvido && !anestesiaAtiva && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button className="perigo" onClick={perderSanidade}>
            perder 1d4 Sanidade (direto, sem outro teste)
          </button>
          <button className="acento" onClick={interpretar}>
            {rotuloInterpretarTrauma(ficha?.determinacao ?? 0)}
          </button>
        </div>
      )}
    </section>
  );
}
