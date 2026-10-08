import { beforeEach, expect, it } from 'vitest';
import { criarEstadoInicial, criarFichaVazia, criarNpcVazio } from './factories';
import { useStore } from './store';

beforeEach(() => useStore.setState(criarEstadoInicial()));

it.each(['todos', 'selecionados', 'grupo', 'rerolar'] as const)(
  'iniciativa %s mantém o nome de NPC oculto no log privado', (acao) => {
    const oculto = { ...criarNpcVazio(), nome: 'Revelação secreta', visivel: false };
    const visivel = { ...criarNpcVazio(), nome: 'Guarda', visivel: true };
    const ficha = { ...criarFichaVazia(), nome: 'Arthur' };
    useStore.setState({ npcs: [oculto, visivel], fichas: [ficha] });
    const store = useStore.getState();
    if (acao === 'todos') store.rolarIniciativaTodos();
    else if (acao === 'grupo') store.rolarIniciativaGrupo([oculto.id, visivel.id]);
    else {
      store.rolarIniciativa([oculto.id, visivel.id, ficha.id]);
      if (acao === 'rerolar') {
        useStore.setState({ log: [] });
        store.rerolarIniciativaDe(oculto.id);
        store.rerolarIniciativaDe(visivel.id);
        store.rerolarIniciativaDe(ficha.id);
      }
    }
    const log = useStore.getState().log;
    expect(log.find((e) => e.personagemId === oculto.id)?.visibilidade).toBe('privada');
    expect(log.find((e) => e.personagemId === visivel.id)?.visibilidade ?? 'publica').toBe('publica');
    if (acao !== 'grupo') {
      expect(log.find((e) => e.personagemId === ficha.id)?.visibilidade ?? 'publica').toBe('publica');
    }
  },
);
