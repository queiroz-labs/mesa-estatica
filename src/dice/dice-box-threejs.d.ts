/**
 * @3d-dice/dice-box-threejs@0.0.12 não publica tipos.
 * Declaração mínima baseada na leitura de dist/dice-box-threejs.es.js.
 * Escolhido (em vez do Babylon @3d-dice/dice-box) por suportar rolagem forçada nativa
 * via notação `1d20@15` — o motor faz swap da face do dado (ver arquitetura.md).
 */
declare module '@3d-dice/dice-box-threejs' {
  import type { BufferGeometry, Camera, Mesh, Scene, SpotLight, Texture, WebGLRenderer } from 'three';
  /** Cor customizada do dado. `foreground` = cor do número; `background` = cor do corpo. */
  export interface CustomColorset {
    background?: string | string[];
    foreground?: string | string[];
    outline?: string | string[];
    edge?: string | string[];
    texture?: string;
    material?: 'none' | 'metal' | 'wood' | 'glass' | 'plastic';
    name?: string;
  }

  export interface DiceBoxConfig {
    assetPath?: string;
    framerate?: number;
    sounds?: boolean;
    volume?: number;
    shadows?: boolean;
    theme_surface?: string;
    theme_customColorset?: CustomColorset | null;
    theme_colorset?: string;
    theme_texture?: string;
    theme_material?: 'none' | 'metal' | 'wood' | 'glass' | 'plastic';
    gravity_multiplier?: number;
    light_intensity?: number;
    baseScale?: number;
    strength?: number;
    onRollComplete?: (results: RollResults) => void;
    onRerollComplete?: (results: RollResults) => void;
    onAddDiceComplete?: (results: RollResults) => void;
    onRemoveDiceComplete?: (results: RollResults) => void;
  }

  export interface DieRoll {
    type: string;
    sides: number;
    id: number;
    value: number;
    reason?: string;
  }

  export interface RollSet {
    num: number;
    type: string;
    sides: number;
    rolls: DieRoll[];
    total: number;
  }

  export interface RollResults {
    notation: string;
    sets: RollSet[];
    modifier: number;
    total: number;
  }

  export default class DiceBox {
    /** 2 argumentos: seletor CSS do container + config. */
    constructor(container: string, config?: DiceBoxConfig);
    scene: Scene;
    diceList: (Mesh & { body?: unknown })[];
    initialized: boolean;
    // Internos da versão 0.0.12 usados exclusivamente pelo adaptador de ciclo de vida.
    container: HTMLElement;
    dimensions: { x: number; y: number };
    renderer?: WebGLRenderer;
    camera: Camera;
    desk?: Mesh;
    light?: SpotLight;
    running: number | false;
    rolling: boolean;
    world: { removeBody(body: unknown): void };
    DiceFactory: {
      geometries: Record<string, BufferGeometry>;
      materials_cache: Record<string, { composite: Texture; bump: Texture | null }>;
    };
    resizeWorld(): void;
    setDimensions(dimensions: { x: number; y: number }): void;
    animateThrow(thread: number, complete: (...args: unknown[]) => void): void;
    animateAfterThrow(thread: number): void;
    /** inicializa cena/física/assets — precisa ser chamado (e aguardado) antes de rolar. */
    initialize(): Promise<void>;
    /** notação padrão ("1d20", "1d8+1d20") ou forçada ("1d20@15", "1d8+1d20@5,15"). */
    roll(notation: string): Promise<RollResults>;
    updateConfig(config: Partial<DiceBoxConfig>): Promise<void>;
    clearDice(): void;
  }
}
