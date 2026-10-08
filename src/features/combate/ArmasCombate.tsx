import { useState } from 'react';
import { usePedidoRolagemDanoStore } from '../../state/pedidoRolagemDanoStore';
import { usePedidoRolagemTesteStore } from '../../state/pedidoRolagemTesteStore';
import type { Ficha } from '../../state/types';
import { IconeLamina } from './icones';

interface Props {
  ficha: Ficha;
  /** true só quando `IniciativaPanel.tsx` (mestre) monta este componente — controla se o dano
   *  nasce privado por padrão, com checkbox. Ausente (jogador, `CombateJogadorView.tsx`) =
   *  sempre público, sem checkbox — comportamento inalterado. */
  souMestre?: boolean;
}

/**
 * Chips de arma da aba Combate — clique pede a rolagem de ataque/dano via `pedidoRolagemTesteStore`/
 * `pedidoRolagemDanoStore` (`QuickRollOverlay.tsx`/`QuickRollOverlayJogador.tsx` são quem de fato
 * rolam o dado e chamam `rolarTestePericiaFicha`/`rolarDanoArmaFicha`, na bandeja física que já
 * têm, lendo `registrarLog`/`registrarRoll` do próprio `useStore` — não precisam vir por prop).
 * Este componente não guarda mais sua própria instância de `useDiceBox` — antes tinha uma
 * caixinha 40×40 própria por card de PC expandido, frágil a colisão entre instâncias simultâneas
 * (achado ao vivo no commit `20fe51d`) e sem espaço de verdade pro dado 3D cair.
 */
export default function ArmasCombate({ ficha, souMestre }: Props) {
  const [privado, setPrivado] = useState(true);
  /** Margem 10+ no ataque (ou 20 natural) = dano máximo do dado (regras.md). Por arma. */
  const [criticos, setCriticos] = useState<Record<string, boolean>>({});
  const pedido = usePedidoRolagemDanoStore((s) => s.pedido);
  const pedirRolagemDano = usePedidoRolagemDanoStore((s) => s.pedirRolagemDano);
  const pedidoTeste = usePedidoRolagemTesteStore((s) => s.pedido);
  const pedirRolagemTeste = usePedidoRolagemTesteStore((s) => s.pedirRolagemTeste);
  const visibilidade = souMestre && privado ? 'privada' : 'publica';
  // desabilita os dois botões (ataque/dano) enquanto qualquer um dos dois pedidos está em voo —
  // as duas rolagens caem na mesma bandeja física, uma de cada vez.
  const rolagemEmVoo = pedido !== null || pedidoTeste !== null;

  if (ficha.armas.length === 0) return null;

  const rolarAtaque = (periciaAtaqueId: string, nomeArma: string) => {
    pedirRolagemTeste({ id: crypto.randomUUID(), fichaId: ficha.id, periciaId: periciaAtaqueId, rotuloArma: nomeArma || 'arma', visibilidade });
  };

  const rolarDano = (armaId: string) => {
    pedirRolagemDano({ id: crypto.randomUUID(), fichaId: ficha.id, armaId, critico: criticos[armaId] ?? false, visibilidade });
  };

  return (
    <div style={{ marginBottom: '0.4rem' }}>
      <span className="combate-rotulo">armas</span>
      {souMestre && (
        <label
          title="dano rolado aqui nasce privado por padrão — desmarque pra rolar público"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: 12, cursor: 'pointer', color: 'var(--ink-dim)', marginLeft: '0.4rem' }}
        >
          <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
          privado
        </label>
      )}
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {ficha.armas.map((a) => (
          <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
            <span
              className="combate-chip"
              title={`${a.nome || 'arma'} · bonus: ${a.bonusAtaque} · dano: ${a.dano} · alcance: ${a.alcance}${a.nota ? ` · ${a.nota}` : ''}`}
              style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <IconeLamina size={10} /> {a.nome || 'arma'}
            </span>
            <button
              className="combate-chip combate-chip--ativa"
              disabled={rolagemEmVoo || !a.periciaAtaqueId}
              onClick={() => rolarAtaque(a.periciaAtaqueId!, a.nome)}
              title="rolar ataque (d20 + atributo + perícia)"
              style={{ fontSize: 11, cursor: 'pointer' }}
            >
              atacar
            </button>
            <button
              className="combate-chip combate-chip--ativa"
              disabled={rolagemEmVoo}
              onClick={() => rolarDano(a.id)}
              title="rolar dano"
              style={{ fontSize: 11, cursor: 'pointer' }}
            >
              dano
            </button>
            <label
              title="margem 10+ no ataque, ou 20 natural — dano máximo"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem', fontSize: 12, cursor: 'pointer', color: 'var(--ink-dim)' }}
            >
              <input
                type="checkbox"
                checked={criticos[a.id] ?? false}
                onChange={(e) => setCriticos((prev) => ({ ...prev, [a.id]: e.target.checked }))}
              />
              10+
            </label>
          </span>
        ))}
      </div>
    </div>
  );
}
