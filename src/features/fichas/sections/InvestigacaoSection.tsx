import { useState } from 'react';
import InputTextoDraft from '../../../components/InputTextoDraft';
import { KIT_INVESTIGACAO, SERVICOS_RUA, type DefinicaoKitInvestigacao } from '../../../rules/data/kitInvestigacao';
import type { KitInvestigacaoItem } from '../../../state/types';
import type { SecaoFichaProps } from '../tipos';

export default function InvestigacaoSection({ ficha, onChange }: SecaoFichaProps) {
  const [arsenalSelect, setArsenalSelect] = useState('');
  const itens = ficha.kitInvestigacao ?? [];

  const atualizar = (id: string, patch: Partial<KitInvestigacaoItem>) => {
    onChange({ kitInvestigacao: itens.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  };

  const remover = (id: string) => {
    onChange({ kitInvestigacao: itens.filter((a) => a.id !== id) });
  };

  const adicionarDoCatalogo = (nomeEquipamento: string) => {
    const def = KIT_INVESTIGACAO.find((a: DefinicaoKitInvestigacao) => a.nome === nomeEquipamento);
    if (!def) return;
    const nova: KitInvestigacaoItem = {
      id: crypto.randomUUID(),
      nome: def.nome,
      nota: `${def.acesso} / ${def.etiquetas} — ${def.nota}`,
    };
    onChange({ kitInvestigacao: [...itens, nova] });
  };

  return (
    <section className="secao">
      <h3 className="label">Kit de Investigação</h3>
      {itens.length > 0 && (
        <table className="armas-tabela">
          <thead>
            <tr>
              <th>Item</th>
              <th>Nota / Acesso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((a) => (
              <tr key={a.id}>
                <td>
                  <InputTextoDraft value={a.nome} onCommit={(nome) => atualizar(a.id, { nome })} />
                </td>
                <td>
                  <InputTextoDraft value={a.nota} onCommit={(nota) => atualizar(a.id, { nota })} />
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
        <button className="acento" onClick={() => {
          const nova: KitInvestigacaoItem = { id: crypto.randomUUID(), nome: '', nota: '' };
          onChange({ kitInvestigacao: [...itens, nova] });
        }}>
          + item livre
        </button>
        <select
          value={arsenalSelect}
          onChange={(e) => {
            const val = e.target.value;
            setArsenalSelect('');
            if (val) adicionarDoCatalogo(val);
          }}
        >
          <option value="">+ do catálogo…</option>
          {KIT_INVESTIGACAO.map((a) => (
            <option key={a.nome} value={a.nome}>
              {a.nome} — {a.preco} ({a.acesso})
            </option>
          ))}
        </select>
      </div>
      <p className="vazio" style={{ marginTop: '0.75rem' }}>
        Acesso: Comum = compra direta · Marcado = registrado na rede · Restrito = Contato + teste DT 15-20 · Proibido = gancho de caso
      </p>
      <p className="vazio" style={{ marginTop: '0.4rem' }}>
        Etiquetas: Rastreável (rede sabe onde está) · Analógico (fora da rede, sobrevive à Correção) · Ilegal (ser pego é problema) · Óbvio (todo mundo nota)
      </p>

      <h4 className="label" style={{ marginTop: '1rem' }}>
        Serviços da rua (referência de preço)
      </h4>
      <table className="armas-tabela">
        <tbody>
          {SERVICOS_RUA.map((s) => (
            <tr key={s.servico}>
              <td>{s.servico}</td>
              <td>{s.preco}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
