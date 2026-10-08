import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarFichaVazia } from '../../state/factories';
import { usePedidoRolagemDanoStore } from '../../state/pedidoRolagemDanoStore';
import { usePedidoRolagemTesteStore } from '../../state/pedidoRolagemTesteStore';
import { useRolagemAoVivoStore } from '../../state/rolagemAoVivoStore';
import type { Ficha } from '../../state/types';
import RolagemAoVivoPlayer from './RolagemAoVivoPlayer';
import DadosTabJogador from './DadosTabJogador';

const ambiente = vi.hoisted(() => ({
  refs: [] as { current: any }[], indiceRef: 0, indiceEfeito: 0,
  estados: [] as any[], indiceEstado: 0,
  efeitos: [] as { deps?: unknown[]; executar: () => void | (() => void); limpar?: () => void; rodar: boolean }[],
  ready: true, rolando: false, erro: null as string | null,
  rolar: vi.fn(), reproduzir: vi.fn(), registrarLog: vi.fn(), registrarRoll: vi.fn(),
}));

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: (valor: any) => ambiente.refs[ambiente.indiceRef++] ??= { current: valor },
  useState: (valor: any) => {
    const i = ambiente.indiceEstado++;
    if (!(i in ambiente.estados)) ambiente.estados[i] = valor;
    return [ambiente.estados[i], (novo: any) => { ambiente.estados[i] = typeof novo === 'function' ? novo(ambiente.estados[i]) : novo; }];
  },
  useEffect: (executar: () => void | (() => void), deps?: unknown[]) => {
    const indice = ambiente.indiceEfeito++;
    const antigo = ambiente.efeitos[indice];
    const rodar = !antigo || !deps || deps.some((dep, i) => !Object.is(dep, antigo.deps?.[i]));
    ambiente.efeitos[indice] = { deps, executar, limpar: antigo?.limpar, rodar };
  },
}));
vi.mock('../../state/store', () => ({ useStore: (selecionar: (s: any) => any) => selecionar({ config: { basePV: 20 }, registrarLog: ambiente.registrarLog, registrarRoll: ambiente.registrarRoll }) }));
vi.mock('../../dice/useDiceBox', async (original) => ({
  ...await original<typeof import('../../dice/useDiceBox')>(),
  useDiceBox: () => ({ ready: ambiente.ready, rolando: ambiente.rolando, erro: ambiente.erro, falhaRolagem: ambiente.erro !== null, modo2D: true, rolar: ambiente.rolar, reproduzir: ambiente.reproduzir }),
}));
vi.mock('../../dice/useReproduzirRolagemAoVivo', () => ({ useReproduzirRolagemAoVivo: vi.fn() }));
vi.mock('../../state/pedidoRolagemTesteStore', async (original) => {
  const modulo = await original<typeof import('../../state/pedidoRolagemTesteStore')>();
  const store = modulo.usePedidoRolagemTesteStore;
  return { usePedidoRolagemTesteStore: Object.assign((selecionar: (s: any) => any) => selecionar(store.getState()), store) };
});
vi.mock('../../state/pedidoRolagemDanoStore', async (original) => {
  const modulo = await original<typeof import('../../state/pedidoRolagemDanoStore')>();
  const store = modulo.usePedidoRolagemDanoStore;
  return { usePedidoRolagemDanoStore: Object.assign((selecionar: (s: any) => any) => selecionar(store.getState()), store) };
});
vi.mock('../../state/rolagemAoVivoStore', async (original) => {
  const modulo = await original<typeof import('../../state/rolagemAoVivoStore')>();
  const store = modulo.useRolagemAoVivoStore;
  return { ...modulo, useRolagemAoVivoStore: Object.assign((selecionar: (s: any) => any) => selecionar(store.getState()), store) };
});

function renderizar(ficha: Ficha) {
  ambiente.indiceRef = 0;
  ambiente.indiceEfeito = 0;
  ambiente.indiceEstado = 0;
  RolagemAoVivoPlayer({ ficha });
  for (const efeito of ambiente.efeitos) {
    if (!efeito.rodar) continue;
    efeito.limpar?.();
    efeito.limpar = efeito.executar() || undefined;
    efeito.rodar = false;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  ambiente.refs = [];
  ambiente.efeitos = [];
  ambiente.estados = [];
  ambiente.ready = true;
  ambiente.rolando = false;
  ambiente.erro = null;
  useRolagemAoVivoStore.setState({ atual: null, iniciando: null, mostrando: false });
});
afterEach(() => {
  for (const efeito of ambiente.efeitos) efeito.limpar?.();
  usePedidoRolagemTesteStore.getState().limparPedidoRolagemTeste();
  usePedidoRolagemDanoStore.getState().limparPedidoRolagemDano();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe.each(['teste', 'dano'] as const)('pedido de %s do jogador', (tipo) => {
  function pedir(ficha: Ficha, id: string) {
    if (tipo === 'teste') usePedidoRolagemTesteStore.getState().pedirRolagemTeste({ id, fichaId: ficha.id, periciaId: 'investigacao', visibilidade: 'publica' });
    else usePedidoRolagemDanoStore.getState().pedirRolagemDano({ id, fichaId: ficha.id, armaId: 'arma', critico: false, visibilidade: 'publica' });
  }

  function fichaTeste() {
    const ficha = criarFichaVazia();
    ficha.nome = 'QA sessão 11-10';
    ficha.atributos.percepcao = 2;
    ficha.pericias.investigacao = 3;
    ficha.armas = [{ id: 'arma', nome: 'faca', dano: '1d6', bonusAtaque: '', alcance: '', nota: '', periciaAtaqueId: null }];
    return ficha;
  }

  it('eco da ficha durante a física não transforma um clique em duas rolagens', () => {
    const ficha = fichaTeste();
    renderizar(ficha);
    pedir(ficha, 'pedido-unico');
    renderizar(ficha);
    expect(ambiente.rolar).toHaveBeenCalledOnce();
    const inicioId = useRolagemAoVivoStore.getState().iniciando?.id;
    expect(inicioId).toBeTruthy();

    ambiente.rolando = true;
    const fichaDoEco = { ...ficha };
    renderizar(fichaDoEco);
    // O pedido ainda bloqueia os botões enquanto o dado cai.
    const store = tipo === 'teste' ? usePedidoRolagemTesteStore : usePedidoRolagemDanoStore;
    expect(store.getState().pedido?.id).toBe('pedido-unico');
    ambiente.rolar.mock.calls[0][1]([{ qty: 1, sides: tipo === 'teste' ? 20 : 6, value: 12, rolls: [{ value: 12 }] }]);
    ambiente.rolando = false;
    renderizar(fichaDoEco);

    expect(ambiente.rolar).toHaveBeenCalledOnce();
    expect(ambiente.registrarRoll).toHaveBeenCalledOnce();
    if (tipo === 'teste') expect(ambiente.registrarRoll).toHaveBeenCalledWith(expect.objectContaining({ bruto: 12, total: 17 }));
    expect(useRolagemAoVivoStore.getState().atual?.id).toBe(inicioId);
    expect(store.getState().pedido).toBeNull();
  });

  it('pedido aguardando a bandeja fica pendente e executa só uma vez ao liberar', () => {
    const ficha = fichaTeste();
    ambiente.ready = false;
    pedir(ficha, 'pedido-pendente');
    renderizar(ficha);
    renderizar({ ...ficha });
    expect(ambiente.rolar).not.toHaveBeenCalled();
    ambiente.ready = true;
    renderizar(ficha);
    // Reexecutar os efeitos (StrictMode) não cria outra rolagem do mesmo ID.
    for (const efeito of ambiente.efeitos) efeito.executar();
    expect(ambiente.rolar).toHaveBeenCalledOnce();
  });

  it('pedido privado não emite nome, tipo ou resultado no canal público de atividade', () => {
    const ficha = fichaTeste();
    if (tipo === 'teste') usePedidoRolagemTesteStore.getState().pedirRolagemTeste({ id: 'privado', fichaId: ficha.id, periciaId: 'investigacao', visibilidade: 'privada' });
    else usePedidoRolagemDanoStore.getState().pedirRolagemDano({ id: 'privado', fichaId: ficha.id, armaId: 'arma', critico: false, visibilidade: 'privada' });
    renderizar(ficha);
    expect(useRolagemAoVivoStore.getState().iniciando).toBeNull();
    ambiente.rolar.mock.calls[0][1]([{ qty: 1, sides: 20, value: 12, rolls: [{ value: 12 }] }]);
    expect(useRolagemAoVivoStore.getState().atual).toBeNull();
  });

  it('erro da física libera o botão da ficha, limpa o início e não registra resultado inventado', () => {
    const ficha = fichaTeste();
    pedir(ficha, 'pedido-falhou');
    renderizar(ficha);
    expect(ambiente.rolar).toHaveBeenCalledOnce();
    ambiente.erro = 'falha na física';
    renderizar(ficha);
    const store = tipo === 'teste' ? usePedidoRolagemTesteStore : usePedidoRolagemDanoStore;
    expect(store.getState().pedido).toBeNull();
    expect(useRolagemAoVivoStore.getState().iniciando).toBeNull();
    expect(ambiente.registrarRoll).not.toHaveBeenCalled();
    ambiente.erro = null;
    pedir(ficha, 'nova-tentativa');
    renderizar(ficha);
    expect(ambiente.rolar).toHaveBeenCalledTimes(2);
  });
});

it('aviso remoto aparece antes do resultado e expira se o autor cair', () => {
  useRolagemAoVivoStore.getState().definirInicio({ id: 'inicio-remoto', origem: 'Arthur', cor: '#888888', tipo: 'teste' });
  renderizar(criarFichaVazia());
  expect(useRolagemAoVivoStore.getState().mostrando).toBe(true);
  expect(ambiente.rolar).not.toHaveBeenCalled();
  vi.advanceTimersByTime(16_000);
  expect(useRolagemAoVivoStore.getState().mostrando).toBe(false);
  expect(useRolagemAoVivoStore.getState().iniciando).toBeNull();
});

it('reiniciar controles destrava os roladores sem repetir Sanidade já pedida', () => {
  const ficha = criarFichaVazia();
  const renderizarDados = (pedido: number) => {
    ambiente.indiceRef = 0;
    ambiente.indiceEstado = 0;
    ambiente.indiceEfeito = 0;
    return DadosTabJogador({ ficha, pedidoRapidoSanidade: pedido });
  };
  ambiente.erro = 'falha na física';
  const antes = renderizarDados(2);
  const elementos = antes.props.children as any[];
  const aviso = elementos.find((e) => e?.props?.role === 'status');
  const controlesAntes = elementos.find((e) => e?.key === '0');
  expect(controlesAntes.props.children[1].props.pedidoRapido).toBe(2);
  aviso.props.children[1].props.onClick();
  const depois = renderizarDados(2);
  const controlesDepois = (depois.props.children as any[]).find((e) => e?.key === '1');
  expect(controlesDepois.props.children[1].props.pedidoRapido).toBe(0);
  ambiente.erro = null;
  const semErro = renderizarDados(2);
  expect((semErro.props.children as any[]).find((e) => e?.key === '1').props.children[1].props.pedidoRapido).toBe(0);
  const novoLembrete = renderizarDados(3);
  expect((novoLembrete.props.children as any[]).find((e) => e?.key === '1').props.children[1].props.pedidoRapido).toBe(3);
  expect(ambiente.rolar).not.toHaveBeenCalled();
  expect(ambiente.registrarRoll).not.toHaveBeenCalled();
});

describe('conclusão pública de Trauma no jogador', () => {
  function rolarTrauma(onComplete: () => void | false) {
    ambiente.indiceRef = 0; ambiente.indiceEstado = 0; ambiente.indiceEfeito = 0;
    const dados = DadosTabJogador({ ficha: criarFichaVazia() });
    const controles = (dados.props.children as any[]).find((e) => e?.key === '0');
    controles.props.children[3].props.rolar([{ sides: 20, qty: 1 }], onComplete, 'ruido', 'personagem', 'teste', 2, 'trauma');
    expect(ambiente.rolar.mock.calls[0].slice(2)).toEqual(['ruido', 'personagem', 'teste']);
    const inicioId = useRolagemAoVivoStore.getState().iniciando?.id;
    ambiente.rolar.mock.calls[0][1]([{ qty: 1, sides: 20, value: 1, rolls: [{ value: 1 }] }]);
    return inicioId;
  }

  it('callback vetado por Anestesia/cancelamento não publica falha e limpa o início local', () => {
    const onComplete = vi.fn().mockReturnValue(false);
    rolarTrauma(onComplete);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(useRolagemAoVivoStore.getState().atual).toBeNull();
    expect(useRolagemAoVivoStore.getState().iniciando).toBeNull();
  });

  it('callback válido conserva o mesmo ID, bônus, contexto e categoria de resolução', () => {
    const id = rolarTrauma(vi.fn());
    expect(useRolagemAoVivoStore.getState().atual).toMatchObject({ id, bonus: 2, contexto: 'trauma', tipo: 'teste', valores: [1] });
    expect(useRolagemAoVivoStore.getState().iniciando).toBeNull();
  });
});
