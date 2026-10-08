import { useStore } from '../../state/store';
import { TIPOS_ROLAGEM } from './tiposRolagem';

const N = 8;

/** Últimas rolagens direto na aba Dados, sem precisar trocar pra aba Log — mesmo padrão de
 *  MiniLogSection.tsx (aba Sessão), filtrado só pra tipos de rolagem de dado. Tela do mestre:
 *  sem filtro de privacidade, mostra tudo. */
export default function FeedRolagens() {
  const log = useStore((s) => s.log);
  const ultimos = log.filter((e) => TIPOS_ROLAGEM.includes(e.tipo)).slice(0, N);

  return (
    <section className="secao">
      <h3 className="label">Últimas rolagens</h3>
      {ultimos.length === 0 ? (
        <p className="vazio">sem registros. sinal limpo.</p>
      ) : (
        <div className="mono" style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {ultimos.map((e) => (
            <div key={e.id}>
              [{new Date(e.timestamp).toLocaleTimeString()}] {e.texto}
              <span className="vazio" style={{ marginLeft: '0.5rem', fontSize: 11 }}>{e.visibilidade === 'privada' ? 'só no app do mestre' : 'visível aos jogadores'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
