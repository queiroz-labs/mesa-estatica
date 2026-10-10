import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../app/App';
import ErrorBoundary from '../app/ErrorBoundary';
import { consumirForcados } from '../dice/forcarRolagem';
import { registrarConsumidorForcados } from '../dice/registroForcados';
import ControlPanel from '../features/controle/ControlPanel';
import { instalarHandlerGlobalDeErro } from '../lib/globalErrorHandler';
import { instalarDetectorConectividade } from '../lib/statusMesa';
import { instalarRetentativaAutomatica } from '../multiplayer/filaPendencias';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-sans-condensed/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ruido.css';
import '../styles/alerta-sessao.css';
import '../styles/fow.css';

// #controle abre a janela de controle secreta do mestre (rolagem forçada), separada da
// janela principal compartilhada no Discord. Mesma origin → BroadcastChannel conecta as duas.
const ehControle = window.location.hash === '#controle';

// Liga a fila de forçados nos pontos de rolagem que ficam fora da bandeja 3D (iniciativa, ação
// de NPC, dano de arma, surto automático...). Só aqui: no bundle do jogador ninguém registra, e
// o consumidor continua sendo o no-op — as rolagens dele são honestas por construção.
// Ver registroForcados.ts pro porquê da indireção.
registrarConsumidorForcados(consumirForcados);

instalarHandlerGlobalDeErro();
instalarDetectorConectividade();
instalarRetentativaAutomatica();

// Este módulo rodou — o bundle carregou de verdade. Limpa a flag que o listener inline de
// index.html usa pra evitar loop de reload (ver comentário lá) — sem isso, um 2º deploy na
// mesma aba (sessão longa, sem fechar) ficaria sem nenhuma tentativa de recuperação automática,
// já que a flag do 1º incidente continuaria presa até a aba fechar.
try {
  sessionStorage.removeItem('estatica-bundle-recarregado');
} catch {
  // sem acesso a storage — nada a limpar
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>{ehControle ? <ControlPanel /> : <App />}</ErrorBoundary>
  </StrictMode>,
);
