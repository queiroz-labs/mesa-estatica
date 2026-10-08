import { Fragment, useState } from 'react';
import { useDiceBox } from '../../dice/useDiceBox';
import { consumirForcados } from '../../dice/forcarRolagem';
import { useReproduzirRolagemAoVivo } from '../../dice/useReproduzirRolagemAoVivo';
import FeedRolagens from './FeedRolagens';
import RoladorTeste from './RoladorTeste';
import RoladorSanidade from './RoladorSanidade';
import RoladorSurto from './RoladorSurto';
import RoladorTrauma from './RoladorTrauma';
import RolagemLivre from './RolagemLivre';
import RoladorTabelas from './RoladorTabelas';
import './dados.css';

export default function DadosTab({ active = true }: { active?: boolean }) {
  const { ready, rolando, erro, falhaRolagem, modo2D, rolar, reproduzir } = useDiceBox('dice-bandeja', active, 100, undefined, consumirForcados);
  // os 5 roladores compartilham UMA bandeja física — a lib não protege roll() concorrente
  // (ver comentário em useDiceBox.rolar), então "pronto pra rolar" tem que valer pra todos ao
  // mesmo tempo: enquanto qualquer um está rolando, os botões dos outros também ficam desabilitados.
  const podeRolar = ready && !rolando;
  const [geracaoControles, setGeracaoControles] = useState(0);

  // rolagem de jogador (rolagemAoVivoStore) também anima aqui quando a aba Dados está aberta —
  // não só no mini-aviso do header (RolagemAoVivoPlayer). `ready` já cobre "esta aba está
  // ativa" (useDiceBox zera `ready` quando `active` é false); a fila de useDiceBox intercala
  // com uma rolagem do mestre em andamento, sem precisar coordenar aqui.
  useReproduzirRolagemAoVivo(reproduzir, ready);

  return (
    <div className="dados-grade">
      {!modo2D && (
        <div
          id="dice-bandeja"
          className="dados-bandeja"
        />
      )}
      {modo2D && (
        <div className="secao" style={{ gridColumn: '1 / -1' }}>
          <p className="vazio">
            renderização 3D indisponível nesta máquina (sem WebGL) — os dados ainda funcionam, só sem o visual físico.
            resultados abaixo continuam honestos por padrão e respeitam a rolagem forçada normalmente.
          </p>
        </div>
      )}
      {falhaRolagem && <p role="status" style={{ color: 'var(--ruido)' }}>não consegui rolar. Se algum botão ficou bloqueado, <button onClick={() => setGeracaoControles((n) => n + 1)}>reiniciar controles</button> e tente novamente.</p>}
      {!ready && !erro && <p className="vazio">carregando física dos dados…</p>}

      <Fragment key={geracaoControles}>
        <RoladorTeste ready={podeRolar} rolar={rolar} />
        <RoladorSanidade ready={podeRolar} rolar={rolar} />
        <RoladorSurto ready={podeRolar} rolar={rolar} />
        <RoladorTrauma ready={podeRolar} rolar={rolar} />
        <RolagemLivre ready={podeRolar} rolar={rolar} />
        <RoladorTabelas ready={podeRolar} rolar={rolar} />
      </Fragment>
      <div style={{ gridColumn: '1 / -1' }}>
        <FeedRolagens />
      </div>
    </div>
  );
}
