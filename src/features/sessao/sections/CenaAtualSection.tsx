import { DIFICULDADES } from '../../../rules/data/dificuldades';
import { useStore } from '../../../state/store';
import BadgePrivado from '../../../components/BadgePrivado';

/** §2 — Cena atual expandida: mistura campos [Público] (chegam aos jogadores) e [Privado]
 *  (só o mestre vê — nunca sobe pra tela compartilhada). */
export default function CenaAtualSection() {
  const sessaoPublica = useStore((s) => s.sessaoPublica);
  const sessaoPrivada = useStore((s) => s.sessaoPrivada);
  const atualizarSessaoPublica = useStore((s) => s.atualizarSessaoPublica);
  const atualizarSessaoPrivada = useStore((s) => s.atualizarSessaoPrivada);
  const avancarCena = useStore((s) => s.avancarCena);

  return (
    <section className="secao">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>cena atual</h3>
        <button className="icone-botao" onClick={avancarCena} title="cena nº atual">
          avançar cena ({sessaoPublica.contadorCena})
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label htmlFor="cena-atmosfera">
            Atmosfera <span className="badge badge--publico">público</span>
          </label>
          <input
            id="cena-atmosfera"
            type="text"
            placeholder="garoa · energia instável · pouca iluminação"
            value={sessaoPublica.atmosfera}
            onChange={(e) => atualizarSessaoPublica({ atmosfera: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="cena-veem">
            O que os jogadores veem{' '}
            <span className="badge badge--publico">público</span>
          </label>
          <textarea
            id="cena-veem"
            value={sessaoPublica.cenaAtual}
            onChange={(e) => atualizarSessaoPublica({ cenaAtual: e.target.value })}
            placeholder="o que os jogadores estão vendo agora — atualiza ao vivo na tela compartilhada."
            style={{ minHeight: '5.5em', resize: 'vertical' }}
          />
        </div>

        <div>
          <label htmlFor="cena-real">
            O que realmente está acontecendo <BadgePrivado />
          </label>
          <textarea
            id="cena-real"
            value={sessaoPrivada.oQueRealmenteAcontece}
            onChange={(e) => atualizarSessaoPrivada({ oQueRealmenteAcontece: e.target.value })}
            placeholder="só o mestre vê — nunca compartilhar esta tela."
            style={{ minHeight: '5em', resize: 'vertical' }}
          />
        </div>

        <div>
          <label htmlFor="cena-proximo">
            Próximo evento <BadgePrivado />
          </label>
          <input
            id="cena-proximo"
            type="text"
            placeholder="quando alguém abrir a porta..."
            value={sessaoPrivada.proximoEvento}
            onChange={(e) => atualizarSessaoPrivada({ proximoEvento: e.target.value })}
          />
        </div>

        <div className="campos-grid" style={{ gridTemplateColumns: sessaoPrivada.dificuldadeCena === 'custom' ? '1fr 1fr' : '1fr' }}>
          <div>
            <label htmlFor="cena-dificuldade">
              Dificuldade da cena <BadgePrivado />
            </label>
            <select
              id="cena-dificuldade"
              value={sessaoPrivada.dificuldadeCena}
              onChange={(e) => atualizarSessaoPrivada({ dificuldadeCena: e.target.value as typeof sessaoPrivada.dificuldadeCena })}
            >
              {DIFICULDADES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                  {d.dt ? ` (${d.dt})` : ''}
                </option>
              ))}
            </select>
            <p className="vazio" style={{ marginTop: '0.3rem' }}>
              só uma nota sua — não afeta nenhuma rolagem sozinha.
            </p>
          </div>
          {sessaoPrivada.dificuldadeCena === 'custom' && (
            <div>
              <label htmlFor="cena-dificuldade-custom">DT customizada</label>
              <input
                id="cena-dificuldade-custom"
                type="number"
                value={sessaoPrivada.dificuldadeCenaCustom}
                onChange={(e) => atualizarSessaoPrivada({ dificuldadeCenaCustom: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
