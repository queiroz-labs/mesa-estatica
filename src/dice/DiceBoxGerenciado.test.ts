import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Scene, Texture } from 'three';

const mock = vi.hoisted(() => ({ inicializar: vi.fn(), animar: vi.fn(), configurar: vi.fn(), dimensoes: vi.fn() }));
vi.mock('@3d-dice/dice-box-threejs', async () => {
  const { Scene, PerspectiveCamera } = await import('three');
  return { default: class {
    scene = new Scene();
    camera = new PerspectiveCamera();
    container = { clientWidth: 200, clientHeight: 100 };
    renderer = { domElement: { width: 100, height: 100, remove: vi.fn() }, render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(), getContext: () => ({ isContextLost: () => false }) };
    diceList: any[] = [];
    world = { removeBody: vi.fn() };
    DiceFactory = { geometries: {}, materials_cache: {} };
    async initialize() { (this as any).resizeWorld(); await mock.inicializar(this); this.renderer.render(); }
    async updateConfig() { await mock.configurar(this); }
    setDimensions(dimensions: unknown) { mock.dimensoes(dimensions); }
    animateThrow() { mock.animar(); }
    animateAfterThrow() { mock.animar(); }
    roll() { return new Promise(() => {}); }
  } };
});
import DiceBoxGerenciado from './DiceBoxGerenciado';

beforeEach(() => {
  vi.clearAllMocks();
  mock.inicializar.mockResolvedValue(undefined);
  mock.configurar.mockResolvedValue(undefined);
  vi.useFakeTimers();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('remove o listener de resize e libera o renderer/canvas mesmo após vários descartes', async () => {
  const remover = vi.spyOn(window, 'removeEventListener');
  const box = new DiceBoxGerenciado('#teste');
  await box.initialize();
  window.dispatchEvent(new Event('resize'));
  box.encerrar();
  box.encerrar();
  await vi.runAllTimersAsync();
  expect(remover).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(mock.dimensoes).not.toHaveBeenCalled();
  expect(box.renderer!.dispose).toHaveBeenCalledOnce();
  expect(box.renderer!.forceContextLoss).toHaveBeenCalledOnce();
  expect(box.renderer!.domElement.remove).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('resize'));
  await vi.runAllTimersAsync();
  expect(mock.dimensoes).not.toHaveBeenCalled();
});

it('libera texturas do cache, geometrias e materiais dos dados', () => {
  const box = new DiceBoxGerenciado('#teste');
  const geometria = new BoxGeometry();
  const textura = new Texture();
  const material = new MeshBasicMaterial({ map: textura });
  const dado = Object.assign(new Mesh(geometria, material), { body: {} });
  box.scene = new Scene(); box.scene.add(dado); box.diceList.push(dado);
  box.DiceFactory.geometries.d6 = geometria;
  box.DiceFactory.materials_cache.d6 = { composite: textura, bump: textura };
  const disposeTextura = vi.spyOn(textura, 'dispose');
  const disposeGeometria = vi.spyOn(geometria, 'dispose');
  const disposeMaterial = vi.spyOn(material, 'dispose');
  box.encerrar();
  expect(disposeTextura).toHaveBeenCalledOnce();
  expect(disposeGeometria).toHaveBeenCalled();
  expect(disposeMaterial).toHaveBeenCalled();
  expect(box.scene.children).toHaveLength(0);
  expect(box.diceList).toHaveLength(0);
  expect(box.world.removeBody).toHaveBeenCalledWith(dado.body);
});

it('limpar uma rolagem mantém a geometria compartilhada e libera apenas a clonada', () => {
  const box = new DiceBoxGerenciado('#teste');
  const compartilhada = new BoxGeometry();
  const clonada = compartilhada.clone();
  box.DiceFactory.geometries.d6 = compartilhada;
  const a = new Mesh(compartilhada, new MeshBasicMaterial());
  const b = new Mesh(clonada, new MeshBasicMaterial());
  box.diceList.push(a, b); box.scene.add(a, b);
  const original = vi.spyOn(compartilhada, 'dispose');
  const clone = vi.spyOn(clonada, 'dispose');
  box.clearDice();
  expect(original).not.toHaveBeenCalled();
  expect(clone).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  box.encerrar();
});

it('inicialização tardia não remove o canvas de uma nova instância', async () => {
  let terminar!: () => void;
  mock.inicializar.mockImplementationOnce(() => new Promise<void>(resolve => { terminar = resolve; }));
  const antiga = new DiceBoxGerenciado('#teste');
  const inicializando = antiga.initialize();
  antiga.encerrar();
  const nova = new DiceBoxGerenciado('#teste');
  await nova.initialize();
  terminar(); await inicializando;
  expect(nova.renderer!.domElement.remove).not.toHaveBeenCalled();
  expect(nova.renderer!.dispose).not.toHaveBeenCalled();
  nova.encerrar();
});

it('descarte interrompe a promise de rolagem em vez de deixar a interface esperando', async () => {
  const box = new DiceBoxGerenciado('#teste');
  const rolando = box.roll('1d20');
  const rejeicao = expect(rolando).rejects.toThrow('interrompida');
  box.encerrar();
  await rejeicao;
  await expect(box.roll('1d20')).rejects.toThrow('encerrada');
});

it('callbacks de animação já agendados param após o descarte', () => {
  const box = new DiceBoxGerenciado('#teste');
  box.animateThrow(1, () => {});
  expect(mock.animar).toHaveBeenCalledOnce();
  box.encerrar();
  box.animateThrow(1, () => {});
  box.animateAfterThrow(1);
  expect(mock.animar).toHaveBeenCalledOnce();
});

it('troca de tema que termina após descarte libera seu cache tardio', async () => {
  let terminar!: () => void;
  const textura = new Texture();
  const dispose = vi.spyOn(textura, 'dispose');
  mock.configurar.mockImplementationOnce(async (box: DiceBoxGerenciado) => {
    await new Promise<void>(resolve => { terminar = resolve; });
    box.DiceFactory.materials_cache.tardia = { composite: textura, bump: null };
  });
  const box = new DiceBoxGerenciado('#teste');
  const configurando = box.updateConfig({});
  box.encerrar();
  terminar(); await configurando;
  expect(dispose).toHaveBeenCalledOnce();
  expect(box.renderer!.dispose).toHaveBeenCalledOnce();
});
