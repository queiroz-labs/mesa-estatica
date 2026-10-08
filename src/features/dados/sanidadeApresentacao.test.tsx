import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarFichaVazia } from '../../state/factories';
import RoladorSanidade from './RoladorSanidade';
import RoladorSanidadeJogador from './RoladorSanidadeJogador';
import RoladorSurto from './RoladorSurto';
import RoladorSurtoJogador from './RoladorSurtoJogador';

const ambiente = vi.hoisted(() => ({ estados: [] as any[], indice: 0, refs: [] as { current: any }[], indiceRef: 0, store: {} as any, rolar: vi.fn(), log: vi.fn(), roll: vi.fn(), ajustar: vi.fn(), escolher: vi.fn(), expira: vi.fn().mockReturnValue(5) }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (valor: any) => {
    const i = ambiente.indice++;
    if (!(i in ambiente.estados)) ambiente.estados[i] = valor;
    return [ambiente.estados[i], (novo: any) => { ambiente.estados[i] = typeof novo === 'function' ? novo(ambiente.estados[i]) : novo; }];
  },
  useRef: (valor: any) => ambiente.refs[ambiente.indiceRef++] ??= { current: valor },
  useEffect: vi.fn(),
}));
vi.mock('../../state/store', () => ({ useStore: (selecionar: (s: any) => any) => selecionar(ambiente.store) }));
vi.mock('../../rules/surto', async (original) => ({ ...await original<typeof import('../../rules/surto')>(), calcularExpiraSurto: ambiente.expira }));

function texto(elemento: any): string {
  if (elemento == null || typeof elemento === 'boolean') return '';
  if (Array.isArray(elemento)) return elemento.map(texto).join('');
  if (typeof elemento !== 'object') return String(elemento);
  return texto(elemento.props?.children);
}
function buscar(elemento: any, predicado: (e: any) => boolean): any {
  if (!elemento || typeof elemento !== 'object') return undefined;
  if (Array.isArray(elemento)) return elemento.map((e) => buscar(e, predicado)).find(Boolean);
  return predicado(elemento) ? elemento : buscar(elemento.props?.children, predicado);
}
function renderizar(jogador = false) {
  ambiente.indice = 0;
  ambiente.indiceRef = 0;
  return jogador ? RoladorSanidadeJogador({ ficha: ambiente.store.fichas[0], ready: true, rolar: ambiente.rolar }) : RoladorSanidade({ ready: true, rolar: ambiente.rolar });
}
const grupos = [{ sides: 20, qty: 1, value: 12, rolls: [{ value: 12 }] }, { sides: 8, qty: 1, value: 7, rolls: [{ value: 7 }] }];

beforeEach(() => {
  vi.clearAllMocks();
  ambiente.estados = [];
  ambiente.refs = [];
  const ficha = criarFichaVazia();
  ficha.nome = 'Arthur'; ficha.atributos.vontade = 2; ficha.sanidadeAtual = 20;
  ambiente.store = {
    fichas: [ficha], registrarLog: ambiente.log, registrarRoll: ambiente.roll, ajustarSanidadeAtual: ambiente.ajustar,
    sessaoPublica: { modoCombate: true, rodada: 3, contadorCena: 1 }, dispararBurstRuido: vi.fn(), resolverEscolhaSurtoPendente: ambiente.escolher,
    atualizarFicha: (id: string, patch: any) => { ambiente.store.fichas = ambiente.store.fichas.map((f: any) => f.id === id ? { ...f, ...patch } : f); },
  };
  ambiente.escolher.mockImplementation((id: string) => {
    const pendente = ambiente.store.fichas.find((f: any) => f.id === id)?.surtoPendente;
    if (pendente) ambiente.log('surto', 'efeito escolhido', id, pendente.visibilidade ?? 'publica');
  });
});

describe('Surto como opções da tabela', () => {
  const renderizarSurto = (jogador = false) => {
    ambiente.indice = 0;
    ambiente.indiceRef = 0;
    return jogador ? RoladorSurtoJogador({ ficha: ambiente.store.fichas[0], ready: true, rolar: ambiente.rolar }) : RoladorSurto({ ready: true, rolar: ambiente.rolar });
  };
  const rolar = (a: number, b: number, jogador = false) => {
    if (!jogador) buscar(renderizarSurto(), (e) => e.props?.id === 'rsu-ficha').props.onChange({ target: { value: ambiente.store.fichas[0].id } });
    buscar(renderizarSurto(jogador), (e) => e.type === 'button' && texto(e).startsWith('rolar surto')).props.onClick();
    ambiente.rolar.mock.calls[0][1]([{ sides: 20, qty: 2, value: a + b, rolls: [{ value: a }, { value: b }] }]);
    return renderizarSurto(jogador);
  };

  it.each([false, true])('números iguais explicam efeito obrigatório e duração sem somar (jogador=%s)', (jogador) => {
    const exibido = texto(rolar(5, 5, jogador));
    expect(exibido).toContain('2d20: 5 e 5 · mesmo número — o efeito é obrigatório');
    expect(exibido).toContain('Congelamento');
    expect(exibido).toContain('até o fim da rodada 5 inclusive');
    expect(exibido).not.toContain('= 10');
    expect(ambiente.expira).toHaveBeenCalledOnce();
    expect(ambiente.log.mock.calls[0][3]).toBe(jogador ? 'publica' : 'privada');
  });

  it('mestre escolhe entre duas opções do personagem rolado mesmo após trocar o select', () => {
    const idOriginal = ambiente.store.fichas[0].id;
    ambiente.store.fichas.push(criarFichaVazia());
    const resultado = rolar(5, 18);
    expect(texto(resultado)).toContain('o jogador escolhe um dos dois efeitos');
    expect(texto(resultado)).toContain('opção A · d20 5: Congelamento');
    expect(texto(resultado)).toContain('opção B · d20 18: Paranoia');
    expect(ambiente.log).not.toHaveBeenCalled();
    buscar(resultado, (e) => e.props?.id === 'rsu-ficha').props.onChange({ target: { value: ambiente.store.fichas[1].id } });
    buscar(renderizarSurto(), (e) => e.type === 'button' && texto(e) === 'escolher este').props.onClick();
    expect(ambiente.escolher).toHaveBeenCalledWith(idOriginal, 'A');
    expect(ambiente.expira).toHaveBeenCalledOnce();
  });

  it('checkbox alterado após o Surto não torna pública a escolha privada já rolada', () => {
    const resultado = rolar(5, 18);
    expect(ambiente.store.fichas[0].surtoPendente.visibilidade).toBe('privada');
    expect(ambiente.estados[2].visibilidade).toBe('privada');
    buscar(resultado, (e) => e.type === 'input' && e.props.type === 'checkbox').props.onChange({ target: { checked: false } });
    const depois = renderizarSurto();
    expect(texto(depois)).toContain('mostrar aos jogadores');
    buscar(depois, (e) => e.type === 'button' && texto(e) === 'escolher este').props.onClick();
    expect(ambiente.log.mock.calls[0][3]).toBe('privada');
    expect(ambiente.estados[2].visibilidade).toBe('privada');
  });
});

describe('Sanidade em duas partes', () => {
  it.each([1, 20])('natural%d mostra só a consequência permitida e bloqueia um handler antigo contrário', (d20) => {
    buscar(renderizar(), (e) => e.props?.id === 'rs-ficha').props.onChange({ target: { value: ambiente.store.fichas[0].id } });
    buscar(renderizar(), (e) => e.props?.id === 'rs-gatilho').props.onChange({ target: { value: 'horror' } });
    buscar(renderizar(), (e) => e.type === 'button' && texto(e).startsWith('rolar teste')).props.onClick();
    ambiente.rolar.mock.calls[0][1](grupos);
    const anterior = renderizar();
    const contrario = d20 === 1 ? 'sucesso — aplicar' : 'falha — aplicar';
    const handlerAntigo = buscar(anterior, (e) => e.type === 'button' && texto(e).startsWith(contrario)).props.onClick;
    buscar(anterior, (e) => e.type === 'button' && texto(e).startsWith('rolar teste')).props.onClick();
    handlerAntigo();
    expect(ambiente.ajustar).not.toHaveBeenCalled();
    ambiente.rolar.mock.calls[1][1]([{ sides: 20, qty: 1, value: d20, rolls: [{ value: d20 }] }, grupos[1]]);
    const atual = renderizar();
    expect(texto(atual)).toContain(d20 === 1 ? '1 natural — falha com complicação' : '20 natural — sucesso com efeito extra');
    expect(buscar(atual, (e) => e.type === 'button' && texto(e).startsWith(contrario))).toBeUndefined();
    handlerAntigo();
    expect(ambiente.ajustar).not.toHaveBeenCalled();
    const permitido = buscar(atual, (e) => e.type === 'button' && texto(e).startsWith(d20 === 1 ? 'falha — aplicar' : 'sucesso — aplicar'));
    permitido.props.onClick();
    permitido.props.onClick();
    expect(ambiente.ajustar).toHaveBeenCalledOnce();
    expect(ambiente.ajustar).toHaveBeenCalledWith(ambiente.store.fichas[0].id, d20 === 1 ? 13 : 17, 'privada');
  });

  it.each([1, 20])('jogadornatural%d espera confirmação e não desconta Sanidade', (d20) => {
    buscar(renderizar(true), (e) => e.props?.id === 'rsj-gatilho').props.onChange({ target: { value: 'horror' } });
    buscar(renderizar(true), (e) => e.type === 'button' && texto(e).startsWith('rolar teste')).props.onClick();
    ambiente.rolar.mock.calls[0][1]([{ sides: 20, qty: 1, value: d20, rolls: [{ value: d20 }] }, grupos[1]]);
    const atual = renderizar(true);
    expect(texto(atual)).toContain(d20 === 1 ? '1 natural — falha com complicação' : '20 natural — sucesso com efeito extra');
    expect(texto(atual)).not.toContain(d20 === 1 ? 'sucesso: perde' : 'falha: perde');
    expect(texto(atual)).toContain('Nada foi descontado ainda.');
    expect(ambiente.ajustar).not.toHaveBeenCalled();
    expect(ambiente.log.mock.calls[0][1]).toContain(d20 === 1 ? '1 natural' : '20 natural');
  });

  it('mestre vê teste14 e perda7 separados e confirma3 sem publicar a rolagem privada', () => {
    buscar(renderizar(), (e) => e.props?.id === 'rs-ficha').props.onChange({ target: { value: ambiente.store.fichas[0].id } });
    buscar(renderizar(), (e) => e.props?.id === 'rs-gatilho').props.onChange({ target: { value: 'horror' } });
    buscar(renderizar(), (e) => e.type === 'button' && texto(e).startsWith('rolar teste')).props.onClick();
    ambiente.rolar.mock.calls[0][1](grupos);
    const resultado = renderizar();
    expect(texto(resultado)).toContain('teste de Vontade: d20 12 + Vontade 2 = 14');
    expect(texto(resultado)).toContain('dado de perda (1d8): 7');
    expect(ambiente.ajustar).not.toHaveBeenCalled();
    // Alterar o checkbox depois do dado cair não torna público o resultado privado.
    buscar(resultado, (e) => e.type === 'input' && e.props.type === 'checkbox').props.onChange({ target: { checked: false } });
    buscar(renderizar(), (e) => e.type === 'button' && texto(e).startsWith('sucesso — aplicar')).props.onClick();
    expect(ambiente.ajustar).toHaveBeenCalledWith(ambiente.store.fichas[0].id, 17, 'privada');
    expect(ambiente.roll).toHaveBeenCalledWith(expect.objectContaining({ bruto: 12, total: 14, visibilidade: 'privada' }));
    expect(ambiente.log.mock.calls[0][3]).toBe('privada');
    expect(ambiente.log.mock.calls[0][1]).toContain('perda aplicada: 3');
  });

  it('jogador informa Vontade, perda e decisões possíveis, sem aplicar nem expor a DT', () => {
    buscar(renderizar(true), (e) => e.props?.id === 'rsj-gatilho').props.onChange({ target: { value: 'horror' } });
    buscar(renderizar(true), (e) => e.type === 'button' && texto(e).startsWith('rolar teste')).props.onClick();
    expect(ambiente.rolar.mock.calls[0].slice(4)).toEqual(['sanidade', 2]);
    ambiente.rolar.mock.calls[0][1](grupos);
    const exibido = texto(renderizar(true));
    expect(exibido).toContain('teste de Vontade: d20 12 + Vontade 2 = 14');
    expect(exibido).toContain('dado de perda (1d8): 7');
    expect(exibido).toContain('sucesso: perde 3 de Sanidade; falha: perde 7.');
    expect(exibido).toContain('Nada foi descontado ainda.');
    expect(exibido).not.toMatch(/DT\s+\d/);
    expect(ambiente.ajustar).not.toHaveBeenCalled();
    expect(ambiente.roll).not.toHaveBeenCalled();
  });
});
