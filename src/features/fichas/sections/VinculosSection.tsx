import type { Vinculo } from '../../../state/types';
import InputTextoDraft from '../../../components/InputTextoDraft';
import type { SecaoFichaProps } from '../tipos';

const MAX_VINCULOS = 3;

export default function VinculosSection({ ficha, onChange }: SecaoFichaProps) {
  const atualizarVinculo = (id: string, patch: Partial<Vinculo>) => {
    onChange({ vinculos: ficha.vinculos.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  };

  const adicionar = () => {
    if (ficha.vinculos.length >= MAX_VINCULOS) return;
    const novo: Vinculo = { id: crypto.randomUUID(), quemOuOque: '', frase: '' };
    onChange({ vinculos: [...ficha.vinculos, novo] });
  };

  const remover = (id: string) => {
    onChange({ vinculos: ficha.vinculos.filter((v) => v.id !== id) });
  };

  return (
    <section className="secao">
      <h3 className="label">
        Vínculos ({ficha.vinculos.length}/{MAX_VINCULOS})
      </h3>
      {ficha.vinculos.length === 0 && <p className="vazio">nenhum vínculo ainda.</p>}
      {ficha.vinculos.map((v) => (
        <div key={v.id} className="linha-repetivel">
          <div className="campos-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <InputTextoDraft
              placeholder="quem ou o quê"
              value={v.quemOuOque}
              onCommit={(quemOuOque) => atualizarVinculo(v.id, { quemOuOque })}
            />
            <InputTextoDraft
              placeholder="uma frase"
              value={v.frase}
              onCommit={(frase) => atualizarVinculo(v.id, { frase })}
            />
          </div>
          <button className="icone-botao perigo" onClick={() => remover(v.id)}>
            remover
          </button>
        </div>
      ))}
      {ficha.vinculos.length < MAX_VINCULOS && (
        <button className="acento" onClick={adicionar}>
          + vínculo
        </button>
      )}
      <p className="vazio" style={{ marginTop: '0.5rem' }}>
        cena de vínculo no downtime: +1d4 Sanidade — perder um vínculo: -1d8 Sanidade, sem teste
      </p>
    </section>
  );
}
