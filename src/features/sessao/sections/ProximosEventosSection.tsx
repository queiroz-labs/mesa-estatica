import { useState } from 'react';
import { useStore } from '../../../state/store';
import BadgePrivado from '../../../components/BadgePrivado';

/** §4 — Próximos eventos [Privado]: checklist de acontecimentos, é spoiler por definição. */
export default function ProximosEventosSection() {
  const eventos = useStore((s) => s.sessaoPrivada.eventos);
  const adicionarEvento = useStore((s) => s.adicionarEvento);
  const alternarEvento = useStore((s) => s.alternarEvento);
  const removerEvento = useStore((s) => s.removerEvento);
  const [texto, setTexto] = useState('');

  const adicionar = () => {
    const t = texto.trim();
    if (!t) return;
    adicionarEvento(t);
    setTexto('');
  };

  return (
    <section className="secao">
      <h3>
        próximos eventos <BadgePrivado />
      </h3>

      {eventos.length === 0 && <p className="vazio">nenhum evento planejado ainda.</p>}
      {eventos.map((e) => (
        <div key={e.id} className="linha-repetivel">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <input type="checkbox" checked={e.feito} onChange={() => alternarEvento(e.id)} />
            <span style={{ textDecoration: e.feito ? 'line-through' : 'none', color: e.feito ? 'var(--ink-faint)' : undefined }}>
              {e.texto}
            </span>
          </label>
          <button className="icone-botao perigo" onClick={() => removerEvento(e.id)}>
            remover
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
        <input
          type="text"
          placeholder="ex.: chegada do trem"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <button className="acento" onClick={adicionar}>
          + evento
        </button>
      </div>
    </section>
  );
}
