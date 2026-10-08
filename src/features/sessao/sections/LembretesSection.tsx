import { useState } from 'react';
import { useStore } from '../../../state/store';
import BadgePrivado from '../../../components/BadgePrivado';

/** §5 — Lembretes do mestre [Privado]: notas soltas de ritmo/continuidade. */
export default function LembretesSection() {
  const lembretes = useStore((s) => s.sessaoPrivada.lembretes);
  const adicionarLembrete = useStore((s) => s.adicionarLembrete);
  const removerLembrete = useStore((s) => s.removerLembrete);
  const [texto, setTexto] = useState('');

  const adicionar = () => {
    const t = texto.trim();
    if (!t) return;
    adicionarLembrete(t);
    setTexto('');
  };

  return (
    <section className="secao">
      <h3>
        lembretes do mestre <BadgePrivado />
      </h3>

      {lembretes.length === 0 && <p className="vazio">nenhum lembrete anotado.</p>}
      {lembretes.map((l) => (
        <div key={l.id} className="linha-repetivel">
          <span className="mono" style={{ fontSize: '13px' }}>
            • {l.texto}
          </span>
          <button className="icone-botao perigo" onClick={() => removerLembrete(l.id)}>
            remover
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
        <input
          type="text"
          placeholder="ex.: João esqueceu de gastar Determinação"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <button className="acento" onClick={adicionar}>
          + lembrete
        </button>
      </div>
    </section>
  );
}
