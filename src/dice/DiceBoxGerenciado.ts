import DiceBox, { type DiceBoxConfig } from '@3d-dice/dice-box-threejs';
import type { BufferGeometry, Material, Mesh, Texture } from 'three';

/** Adaptação da 0.0.12: a biblioteca não oferece destroy e seu resizeWorld mantém
 * cada renderer vivo em window. Não altera protótipos nem a instalação em node_modules. */
export default class DiceBoxGerenciado extends DiceBox {
  private encerrado = false;
  private rendererDescartado = false;
  private rejeitarRolagem?: (erro: Error) => void;
  private frameResize = 0;
  private readonly aoResize = () => {
    cancelAnimationFrame(this.frameResize);
    this.frameResize = requestAnimationFrame(() => {
      if (this.encerrado || !this.renderer) return;
      const { clientWidth: x, clientHeight: y } = this.container;
      if (x > 0 && y > 0 && (this.renderer.domElement.width !== x || this.renderer.domElement.height !== y)) {
        this.setDimensions({ x, y });
      }
    });
  };

  override resizeWorld() {
    window.addEventListener('resize', this.aoResize);
  }

  redimensionar() {
    this.aoResize();
  }

  override setDimensions(dimensions: { x: number; y: number }) {
    if (this.encerrado) return;
    const desk = this.desk;
    const light = this.light;
    super.setDimensions(dimensions);
    desk?.geometry.dispose();
    if (desk) this.liberarMateriais(desk);
    light?.shadow.dispose();
  }

  override async initialize() {
    if (this.encerrado) return;
    this.dimensions = { x: this.container.clientWidth, y: this.container.clientHeight };
    try {
      await super.initialize();
    } finally {
      // initialize pode terminar depois do unmount. Libera também recursos tardios,
      // sem remover os elementos de uma eventual instância substituta.
      if (this.encerrado) this.liberarRecursos();
    }
  }

  override async updateConfig(config: Partial<DiceBoxConfig>) {
    if (this.encerrado) throw new Error('renderização 3D encerrada');
    try {
      await super.updateConfig(config);
    } finally {
      if (this.encerrado) this.liberarRecursos();
    }
  }

  override animateThrow(thread: number, complete: (...args: unknown[]) => void) {
    if (!this.encerrado) super.animateThrow(thread, complete);
  }

  override animateAfterThrow(thread: number) {
    if (!this.encerrado) super.animateAfterThrow(thread);
  }

  override async roll(notation: string) {
    if (this.encerrado) throw new Error('renderização 3D encerrada');
    const interrompida = new Promise<never>((_, reject) => { this.rejeitarRolagem = reject; });
    try {
      return await Promise.race([super.roll(notation), interrompida]);
    } finally {
      this.rejeitarRolagem = undefined;
    }
  }

  private liberarMateriais(mesh: Mesh) {
    const materiais: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materiais) material.dispose();
  }

  override clearDice() {
    // A implementação original agenda um render 100 ms depois e não libera materiais.
    // Geometrias e texturas são compartilhadas no cache da fábrica até o descarte final.
    this.running = false;
    for (const dado of this.diceList.splice(0)) {
      this.scene.remove(dado);
      if (dado.body) this.world.removeBody(dado.body);
      this.liberarMateriais(dado);
      // Rolagens forçadas clonam a geometria para trocar as faces.
      if (!Object.values(this.DiceFactory.geometries).includes(dado.geometry)) dado.geometry.dispose();
    }
    if (!this.encerrado) this.renderer?.render(this.scene, this.camera);
  }

  encerrar() {
    if (this.encerrado) return;
    this.encerrado = true;
    this.running = false;
    this.rolling = false;
    window.removeEventListener('resize', this.aoResize);
    cancelAnimationFrame(this.frameResize);
    this.rejeitarRolagem?.(new Error('renderização 3D interrompida; tente novamente em 2D'));
    this.liberarRecursos();
  }

  private liberarRecursos() {
    const texturas = new Set<Texture>();
    const geometrias = new Set<BufferGeometry>(Object.values(this.DiceFactory.geometries));
    const materiais = new Set<Material>();
    this.scene.traverse(objeto => {
      const mesh = objeto as Mesh;
      if (!mesh.isMesh) return;
      geometrias.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materiais.add(material);
        for (const valor of Object.values(material)) {
          if (valor && typeof valor === 'object' && (valor as Texture).isTexture) texturas.add(valor as Texture);
        }
      }
    });
    this.light?.shadow.dispose();
    this.light = undefined;
    this.desk = undefined;
    for (const { composite, bump } of Object.values(this.DiceFactory.materials_cache)) {
      texturas.add(composite);
      if (bump) texturas.add(bump);
    }
    for (const textura of texturas) textura.dispose();
    for (const geometria of geometrias) geometria.dispose();
    for (const material of materiais) material.dispose();
    this.DiceFactory.geometries = {};
    this.DiceFactory.materials_cache = {};
    for (const dado of this.diceList.splice(0)) {
      if (dado.body) this.world.removeBody(dado.body);
    }
    this.scene.clear();
    if (this.renderer && !this.rendererDescartado) {
      this.rendererDescartado = true;
      // Impede render tardio do initialize, que não tem cancelamento na biblioteca.
      this.renderer.render = () => {};
      this.renderer.dispose();
      if (!this.renderer.getContext().isContextLost()) this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
  }
}
