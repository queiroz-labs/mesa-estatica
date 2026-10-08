import { useRef, useState } from 'react';
import type { ColorsetId } from '../../dice/colorsets';
import type { TipoRolagemForcada } from '../../dice/registroForcados';
import type { RollGroupResult, RollTermo } from '../../dice/useDiceBox';
import { calcularPerdaSanidade } from '../../rules/sanidade';
import { PERDA_SANIDADE, type GatilhoSanidade } from '../../rules/data/dificuldades';
import { useStore } from '../../state/store';
import { sucessoNaturalSanidade, textoConsequenciasSanidade, textoDadoPerda, textoTesteSanidade } from './resultadosEspeciais';

export function parseDado(dado: string): RollTermo {
  const [qty, sides] = dado.split('d').map(Number);
  return { qty, sides };
}

export function extrairResultadosSanidade(grupos: RollGroupResult[], perdaTermo: RollTermo) {
  // `usados` evita que o d20 do teste de Vontade e o dado de perda apontem pro MESMO grupo
  // quando os dois critérios colidem (ex: se um gatilho futuro de PERDA_SANIDADE usar 1d20 — hoje
  // só 1d4/1d8/2d8 existem, então isso nunca dispara em uso normal, mas sem essa exclusão o
  // segundo `.find()` reencontraria o grupo já usado pelo primeiro, e um dos dois valores reais
  // seria descartado em silêncio).
  const usados = new Set<RollGroupResult>();

  const d20Grupo = grupos.find((g) => !usados.has(g) && Number(g.sides) === 20) ?? grupos[0];
  if (d20Grupo) usados.add(d20Grupo);

  const perdaGrupo =
    grupos.find((g) => !usados.has(g) && Number(g.sides) === perdaTermo.sides && Number(g.qty) === perdaTermo.qty) ??
    grupos.find((g) => !usados.has(g) && Number(g.sides) === perdaTermo.sides) ??
    grupos.find((g) => !usados.has(g)) ??
    grupos.at(-1);

  return {
    d20: d20Grupo?.rolls?.[0]?.value ?? 0,
    perdaRolada: perdaGrupo?.value ?? perdaGrupo?.rolls?.[0]?.value ?? 0,
  };
}

interface RoladorSanidadeProps {
  ready: boolean;
  rolar: (
    notacao: RollTermo[],
    onComplete: (r: RollGroupResult[]) => void,
    colorset?: ColorsetId,
    personagemId?: string | null,
    tipo?: TipoRolagemForcada,
  ) => void;
}

export default function RoladorSanidade({ ready, rolar }: RoladorSanidadeProps) {
  const fichas = useStore((s) => s.fichas);
  const ajustarSanidadeAtual = useStore((s) => s.ajustarSanidadeAtual);
  const registrarLog = useStore((s) => s.registrarLog);
  const registrarRoll = useStore((s) => s.registrarRoll);

  const [fichaId, setFichaId] = useState('');
  const [gatilhoId, setGatilhoId] = useState<GatilhoSanidade>('perturbador');
  const [rolando, setRolando] = useState(false);
  // Guarda de qual personagem/gatilho a rolagem era, capturado no momento de rolar — sem
  // isso, "confirmar" lia o `ficha`/`gatilho` ATUAIS (derivados do dropdown), não os de
  // quando o dado caiu: trocar o personagem selecionado (ou o gatilho) entre rolar e
  // confirmar aplicava a perda de Sanidade — e registrava o log — no personagem/gatilho
  // errado, silenciosamente (achado na revisão de 29/08).
  const [resultado, setResultado] = useState<{
    fichaId: string;
    fichaNome: string;
    gatilhoNome: string;
    gatilhoDado: string;
    d20: number;
    vontade: number;
    visibilidade: 'publica' | 'privada';
    perdaRolada: number;
    aplicado: { sucesso: boolean; perda: number } | null;
  } | null>(null);
  const resultadoRef = useRef(resultado);
  resultadoRef.current = resultado;
  const [privado, setPrivado] = useState(true);
  const visibilidade = privado ? 'privada' as const : 'publica' as const;

  const ficha = fichas.find((f) => f.id === fichaId) ?? null;
  const gatilho = PERDA_SANIDADE.find((g) => g.id === gatilhoId)!;

  const rolarSanidade = () => {
    if (!ficha) return;
    setRolando(true);
    resultadoRef.current = null;
    setResultado(null);
    const perdaTermo = parseDado(gatilho.dado);
    const fichaIdDoRoll = ficha.id;
    const fichaNomeDoRoll = ficha.nome || 'Personagem';
    const gatilhoDoRoll = gatilho;
    rolar([{ sides: 20, qty: 1 }, perdaTermo], (grupos) => {
      const { d20, perdaRolada } = extrairResultadosSanidade(grupos, perdaTermo);
      setResultado({
        fichaId: fichaIdDoRoll,
        fichaNome: fichaNomeDoRoll,
        gatilhoNome: gatilhoDoRoll.nome,
        gatilhoDado: gatilhoDoRoll.dado,
        d20,
        vontade: ficha.atributos.vontade,
        visibilidade,
        perdaRolada,
        aplicado: null,
      });
      setRolando(false);
    }, 'ruido', ficha.id, 'sanidade');
  };

  // 1/20 naturais seguem a regra geral; nos demais o mestre compara com a DT da
  // cena. A perda só é aplicada quando ele confirma, inclusive nos naturais.
  const confirmarResultado = (sucesso: boolean) => {
    // Handlers de um resultado antigo devem conferir o resultado atual.
    const resultado = resultadoRef.current;
    if (!resultado || resultado.aplicado) return;
    const natural = sucessoNaturalSanidade(resultado.d20);
    if (natural !== null && sucesso !== natural) return;
    const fichaAlvo = fichas.find((f) => f.id === resultado.fichaId);
    if (!fichaAlvo) return; // personagem removido entre o roll e a confirmação
    const perda = calcularPerdaSanidade(resultado.perdaRolada, sucesso);
    const confirmado = { ...resultado, aplicado: { sucesso, perda } };
    resultadoRef.current = confirmado;
    setResultado(confirmado);
    registrarLog(
      'sanidade',
      `${resultado.fichaNome} · Sanidade: ${resultado.gatilhoNome} · ${textoTesteSanidade(resultado)} · ${textoDadoPerda(resultado)}${natural !== null ? ` · ${textoConsequenciasSanidade(resultado.perdaRolada, resultado.d20)}` : ''} · ${sucesso ? 'sucesso' : 'falha'} confirmado pelo mestre · perda aplicada: ${perda}`,
      fichaAlvo.id,
      resultado.visibilidade,
    );
    registrarRoll({
      origem: resultado.fichaNome,
      personagemId: fichaAlvo.id,
      formula: `d20+${resultado.vontade} (Vontade); ${resultado.gatilhoDado} (perda)`,
      total: resultado.d20 + resultado.vontade,
      bruto: resultado.d20,
      visibilidade: resultado.visibilidade,
    });
    ajustarSanidadeAtual(fichaAlvo.id, fichaAlvo.sanidadeAtual - perda, resultado.visibilidade);
  };

  return (
    <section className="secao">
      <h3 className="label">Rolador de Sanidade</h3>
      <p className="vazio">role o teste de Vontade e, separado, o dado de perda. O mestre confirma o resultado e aplica a perda na ficha.</p>

      <div className="campos-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <label htmlFor="rs-ficha">Personagem</label>
          <select id="rs-ficha" value={fichaId} disabled={rolando} onChange={(e) => setFichaId(e.target.value)}>
            <option value="">— selecione —</option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome || 'sem nome'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rs-gatilho">Gatilho</label>
          <select id="rs-gatilho" value={gatilhoId} disabled={rolando} onChange={(e) => setGatilhoId(e.target.value as GatilhoSanidade)}>
            {PERDA_SANIDADE.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome} ({g.dado})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
        <button className="acento" disabled={!ready || !ficha || rolando} onClick={rolarSanidade}>
          rolar teste de Vontade e perda ({gatilho.dado})
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '12px' }}>
          <input type="checkbox" checked={privado} disabled={rolando} onChange={(e) => setPrivado(e.target.checked)} />
          {privado ? 'só no app do mestre' : 'mostrar aos jogadores'}
        </label>
      </div>

      {resultado && !resultado.aplicado && (
        <div className="alerta-banner mono" style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span>
            {resultado.fichaNome} · {textoTesteSanidade(resultado)}
          </span>
          <span>{textoDadoPerda(resultado)} · {textoConsequenciasSanidade(resultado.perdaRolada, resultado.d20)}</span>
          <span>{sucessoNaturalSanidade(resultado.d20) === null ? 'compare o teste com a DT da cena. Escolha abaixo para aplicar a perda na ficha.' : 'o resultado natural define o sucesso ou a falha. Confirme abaixo para aplicar a perda na ficha.'}</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {sucessoNaturalSanidade(resultado.d20) !== false && <button onClick={() => confirmarResultado(true)}>sucesso — aplicar perda de {calcularPerdaSanidade(resultado.perdaRolada, true)}</button>}
            {sucessoNaturalSanidade(resultado.d20) !== true && <button onClick={() => confirmarResultado(false)}>falha — aplicar perda de {resultado.perdaRolada}</button>}
          </div>
        </div>
      )}

      {resultado?.aplicado && (
        <div
          className="alerta-banner mono"
          style={{
            marginTop: '0.75rem',
            borderColor: resultado.aplicado.sucesso ? 'var(--rede)' : 'var(--ruido)',
            color: resultado.aplicado.sucesso ? 'var(--rede)' : 'var(--ruido)',
          }}
        >
          <span>
            {resultado.fichaNome} · {textoTesteSanidade(resultado)} · {resultado.aplicado.sucesso ? 'sucesso' : 'falha'} confirmado pelo mestre · perda aplicada: {resultado.aplicado.perda} de Sanidade
            {sucessoNaturalSanidade(resultado.d20) !== null && ` · ${textoConsequenciasSanidade(resultado.perdaRolada, resultado.d20)}`}
          </span>
        </div>
      )}
    </section>
  );
}
