import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PlayerApp from '../app/PlayerApp';
import ErrorBoundary from '../app/ErrorBoundary';
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

// Bundle do jogador (mesa-estatica-multiplayer-completo.md Parte IV §2) — nunca importa
// App/ControlPanel/forcarRolagem. O Rollup faz tree-shaking por entrada: essa árvore não
// puxa nada exclusivo de mestre. `ErrorBoundary` é compartilhado (só usa `useStore`), seguro
// nos dois bundles.
instalarHandlerGlobalDeErro();
instalarDetectorConectividade();
instalarRetentativaAutomatica();

// Este módulo rodou — o bundle carregou de verdade. Limpa a flag que o listener inline de
// jogador.html usa pra evitar loop de reload (ver comentário lá) — sem isso, um 2º deploy na
// mesma aba (sessão longa, sem fechar) ficaria sem nenhuma tentativa de recuperação automática,
// já que a flag do 1º incidente continuaria presa até a aba fechar.
try {
  sessionStorage.removeItem('estatica-bundle-recarregado');
} catch {
  // sem acesso a storage — nada a limpar
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PlayerApp />
    </ErrorBoundary>
  </StrictMode>,
);
