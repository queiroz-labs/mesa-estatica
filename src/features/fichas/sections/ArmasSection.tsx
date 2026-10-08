import { useState } from 'react';
import InputNumeroDraft from '../../../components/InputNumeroDraft';
import { usePedidoRolagemDanoStore } from '../../../state/pedidoRolagemDanoStore';
import { usePedidoRolagemTesteStore } from '../../../state/pedidoRolagemTesteStore';
import { ARMAS, PROTECOES } from '../../../rules/data/armas';
import { PERICIAS } from '../../../rules/data/pericias';
import type { ArmaFicha } from '../../../state/types';
import type { SecaoFichaProps } from '../tipos';

export default function ArmasSection({ ficha, onChange, souMestre }: SecaoFichaProps) {
  const [arsenalSelect, setArsenalSelect] = useState('');
  // Privado por padrão só faz sentido pro mestre — o jogador rolando a própria arma continua
  // sempre público, sem opção (comportamento inalterado). Ver `souMestre` em `tipos.ts`.
  const [privado, setPrivado] = useState(true);
  const visibilidade = souMestre && privado ? 'privada' : 'publica';
  const [protecaoSelect, setProtecaoSelect] = useState('');
  /** Margem 10+ no ataque (ou 20 natural) = dano máximo do dado (regras.md). Por arma, marcado
   *  manualmente após ver o resultado do ataque. */
  const [margem10Mais, setMargem10Mais] = useState<Record<string, boolean>>({});

  // Ataque/dano rolam pela mesma bandeja física 3D da aba Combate (QuickRollOverlay.tsx/
  // QuickRollOverlayJogador.tsx, montados perto da raiz) em vez de calcular local e silencioso
  // — mesmo padrão de `ArmasCombate.tsx`/`PericiasSection.tsx`, unificando toda rolagem fora da
  // aba Dados num único fluxo (animação pra quem rola + header/log pros demais).
  const pedido = usePedidoRolagemDanoStore((s) => s.pedido);
  const pedirRolagemDano = usePedidoRolagemDanoStore((s) => s.pedirRolagemDano);
  const pedidoTeste = usePedidoRolagemTesteStore((s) => s.pedido);
  const pedirRolagemTeste = usePedidoRolagemTesteStore((s) => s.pedirRolagemTeste);
  // desabilita os botões de rolar enquanto qualquer pedido está em voo — a bandeja física é
  // compartilhada, uma rolagem de cada vez (mesmo guard de `ArmasCombate.tsx`).
  const rolagemEmVoo = pedido !== null || pedidoTeste !== null;

  const rolarAtaque = (arma: ArmaFicha) => {
    if (!arma.periciaAtaqueId) return;
    pedirRolagemTeste({
      id: crypto.randomUUID(),
      fichaId: ficha.id,
      periciaId: arma.periciaAtaqueId,
      rotuloArma: arma.nome || 'arma',
      visibilidade,
    });
  };

  const rolarDano = (arma: ArmaFicha) => {
    pedirRolagemDano({
      id: crypto.randomUUID(),
      fichaId: ficha.id,
      armaId: arma.id,
      critico: margem10Mais[arma.id] ?? false,
      visibilidade,
    });
  };
  const atualizar = (id: string, patch: Partial<ArmaFicha>) => {
    onChange({ armas: ficha.armas.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  };

  const remover = (id: string) => {
    onChange({ armas: ficha.armas.filter((a) => a.id !== id) });
  };

  const adicionarVazia = () => {
    const nova: ArmaFicha = { id: crypto.randomUUID(), nome: '', bonusAtaque: '', dano: '', alcance: '', nota: '', periciaAtaqueId: null };
    onChange({ armas: [...ficha.armas, nova] });
  };

  const adicionarDoArsenal = (nomeArma: string) => {
    const def = ARMAS.find((a) => a.nome === nomeArma);
    if (!def) return;
    const nova: ArmaFicha = {
      id: crypto.randomUUID(),
      nome: def.nome,
      bonusAtaque: def.somaVigor ? 'Vigor + Briga' : 'Agilidade + Pontaria',
      dano: def.somaVigor ? `${def.dano} + Vigor` : def.dano,
      alcance: `${def.alcanceMetros} m`,
      nota: def.nota,
      periciaAtaqueId: def.somaVigor ? 'briga' : 'pontaria',
    };
    onChange({ armas: [...ficha.armas, nova] });
  };

  const aplicarProtecao = (nomeProtecao: string) => {
    const def = PROTECOES.find((p) => p.nome === nomeProtecao);
    if (!def) return;
    onChange({ equipamentoModificadorDefesa: def.defesa, equipamentoProtecaoNome: def.nome });
  };

  const removerProtecao = () => {
    onChange({ equipamentoModificadorDefesa: 0, equipamentoProtecaoNome: null });
  };

  return (
    <section className="secao">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <h3 className="label" style={{ margin: 0 }}>
          Armas e Proteção
        </h3>
        {souMestre && (
          <label
            title="ataque e dano rolados aqui nascem privados por padrão — desmarque pra rolar público"
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '11px', cursor: 'pointer' }}
          >
            <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
            privado
          </label>
        )}
      </div>
      {ficha.armas.length > 0 && (
        <table className="armas-tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ataque (d20 + …)</th>
              <th>Dano</th>
              <th>Alcance</th>
              <th>Nota</th>
              <th>Rolar</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ficha.armas.map((a) => (
              <tr key={a.id}>
                <td>
                  <input value={a.nome} onChange={(e) => atualizar(a.id, { nome: e.target.value })} />
                </td>
                <td>
                  <input value={a.bonusAtaque} onChange={(e) => atualizar(a.id, { bonusAtaque: e.target.value })} />
                </td>
                <td>
                  <input value={a.dano} onChange={(e) => atualizar(a.id, { dano: e.target.value })} />
                </td>
                <td>
                  <input value={a.alcance} onChange={(e) => atualizar(a.id, { alcance: e.target.value })} />
                </td>
                <td>
                  <input value={a.nota} onChange={(e) => atualizar(a.id, { nota: e.target.value })} />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <select
                      value={a.periciaAtaqueId ?? ''}
                      title="perícia que governa o ataque desta arma"
                      onChange={(e) => atualizar(a.id, { periciaAtaqueId: e.target.value || null })}
                      style={{ maxWidth: 110 }}
                    >
                      <option value="">— perícia —</option>
                      {PERICIAS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => rolarAtaque(a)} disabled={rolagemEmVoo || !a.periciaAtaqueId}>
                      atacar
                    </button>
                    <button onClick={() => rolarDano(a)} disabled={rolagemEmVoo || a.dano.trim() === ''}>
                      dano
                    </button>
                    <label
                      title="margem 10+ no ataque, ou 20 natural — dano máximo"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '12px', cursor: 'pointer', color: 'var(--ink-dim)' }}
                    >
                      <input
                        type="checkbox"
                        checked={margem10Mais[a.id] ?? false}
                        onChange={(e) => setMargem10Mais((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                      />
                      10+
                    </label>
                  </div>
                </td>
                <td>
                  <button className="icone-botao perigo" onClick={() => remover(a.id)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="acento" onClick={adicionarVazia}>
          + arma livre
        </button>
        <select
          value={arsenalSelect}
          onChange={(e) => {
            const val = e.target.value;
            setArsenalSelect('');
            if (val) adicionarDoArsenal(val);
          }}
        >
          <option value="">+ do arsenal…</option>
          {ARMAS.map((a) => (
            <option key={a.nome} value={a.nome}>
              {a.nome}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.6rem' }}>
        <h4 className="label" style={{ margin: 0 }}>
          Proteção
        </h4>
        {ficha.equipamentoProtecaoNome && (
          <table className="armas-tabela">
            <tbody>
              <tr>
                <td>{ficha.equipamentoProtecaoNome}</td>
                <td>+{ficha.equipamentoModificadorDefesa} defesa</td>
                <td>{PROTECOES.find((p) => p.nome === ficha.equipamentoProtecaoNome)?.nota ?? ''}</td>
                <td>
                  <button className="icone-botao perigo" onClick={removerProtecao}>
                    ×
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={protecaoSelect}
            onChange={(e) => {
              const val = e.target.value;
              setProtecaoSelect('');
              if (val) aplicarProtecao(val);
            }}
          >
            <option value="">+ proteção…</option>
            {PROTECOES.map((p) => (
              <option key={p.nome} value={p.nome}>
                {p.nome} — {p.preco}
              </option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
            <span className="vazio">bônus de defesa</span>
            <InputNumeroDraft
              value={ficha.equipamentoModificadorDefesa}
              onCommit={(valor) => onChange({ equipamentoModificadorDefesa: valor, equipamentoProtecaoNome: null })}
              style={{ width: 72 }}
            />
          </label>
        </div>
        <p className="vazio">A proteção escolhida soma no cálculo de Defesa da ficha.</p>
      </div>
    </section>
  );
}
