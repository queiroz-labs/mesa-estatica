import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface TokenVisual {
  id: string;
  x: number; // normalizado 0-1
  y: number; // normalizado 0-1
  cor: string;
  sanidadeCritica: boolean;
  /** Surto ativo nesta cena (Parte II §2) — pulso de escala, distinto do jitter de Sanidade crítica. */
  surtoAtivo: boolean;
}

interface Props {
  tokens: TokenVisual[];
  width: number;
  height: number;
  active: boolean;
  /** imagem renderizada (object-fit: contain) — se null, usa container inteiro (fallback). */
  imgRenderRect: { offsetX: number; offsetY: number; renderW: number; renderH: number } | null;
}

/**
 * Camada 3D decorativa sobre o mapa: um cristal low-poly por token, cor do personagem, rotação
 * lenta; jitter quando a Sanidade do participante está em tier 3 — ≤25% (arte.md). O drag continua
 * em DOM (pointer events no MapaTab) — esta cena só espelha a posição normalizada de cada token.
 * Câmera ortográfica em pixels do container, com posição derivada de imgRenderRect
 * para que o cristal bata 1:1 com o token DOM sobre a imagem do mapa.
 * Corte barato (ROADMAP): trocar isso por divs coloridas não muda a lógica de drag.
 *
 * IMPORTANTE: um `<canvas>` só aceita um contexto WebGL por toda a sua vida — reaproveitar um
 * `<canvas>` fixo do JSX quebra em StrictMode (que monta/desmonta/remonta os efeitos: a 2ª
 * montagem falharia com "Canvas has an existing context of a different type") e em qualquer
 * remount real. Por isso, como o `useDiceBox.ts` já faz pra bandeja de dados, o efeito cria seu
 * próprio `<canvas>` via `document.createElement` e o remove do DOM inteiro no cleanup — cada
 * montagem começa com um elemento (e contexto) 100% novo.
 */
export default function TokenScene({ tokens, width, height, active, imgRenderRect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const tamanhoRef = useRef({ width, height });
  tamanhoRef.current = { width, height };
  const imgRectRef = useRef(imgRenderRect);
  imgRectRef.current = imgRenderRect;
  const activeRef = useRef(active);
  activeRef.current = active;

  const cenaRef = useRef<{ camera: THREE.OrthographicCamera; renderer: THREE.WebGLRenderer } | null>(null);

  // cria a cena/renderer uma única vez, na montagem — ver aviso acima sobre não recriar o contexto.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%;';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, tamanhoRef.current.width, 0, tamanhoRef.current.height, 0.1, 1000);
    camera.position.z = 100;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(tamanhoRef.current.width, tamanhoRef.current.height, false);
    cenaRef.current = { camera, renderer };

    scene.add(new THREE.HemisphereLight(0xc6ccd6, 0x14171d, 1.2));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 2);
    scene.add(dirLight);

    // geometria compartilhada entre todos os cristais — só descartada uma vez, no unmount.
    const geometria = new THREE.OctahedronGeometry(16, 0);
    const meshes = new Map<string, THREE.Mesh>();

    const sincronizarMeshes = () => {
      const idsAtuais = new Set(tokensRef.current.map((t) => t.id));
      for (const [id, mesh] of meshes) {
        if (!idsAtuais.has(id)) {
          scene.remove(mesh);
          (mesh.material as THREE.Material).dispose();
          meshes.delete(id);
        }
      }
      for (const t of tokensRef.current) {
        if (!meshes.has(t.id)) {
          const material = new THREE.MeshStandardMaterial({
            color: t.cor,
            flatShading: true,
            roughness: 0.35,
            metalness: 0.15,
          });
          const mesh = new THREE.Mesh(geometria, material);
          scene.add(mesh);
          meshes.set(t.id, mesh);
        } else {
          (meshes.get(t.id)!.material as THREE.MeshStandardMaterial).color.set(t.cor);
        }
      }
    };

    let vivo = true;
    let frame = 0;
    let ultimoTempo = performance.now();

    // roda sempre (rAF sozinho é ~grátis); o trabalho pesado (sync + render) só acontece com a
    // aba Mapa visível e o documento em foco — arquitetura.md, seção Performance.
    const animar = (agora: number) => {
      if (!vivo) return;
      const dt = Math.min(0.1, (agora - ultimoTempo) / 1000);
      ultimoTempo = agora;
      if (!document.hidden && activeRef.current) {
        const { width: w, height: h } = tamanhoRef.current;
        const ir = imgRectRef.current;
        sincronizarMeshes();
        for (const t of tokensRef.current) {
          const mesh = meshes.get(t.id);
          if (!mesh) continue;
          let px: number, py: number;
          if (ir) {
            px = ir.offsetX + t.x * ir.renderW;
            py = ir.offsetY + t.y * ir.renderH;
          } else {
            px = t.x * w;
            py = t.y * h;
          }
          if (t.sanidadeCritica) {
            px += (Math.random() - 0.5) * 4;
            py += (Math.random() - 0.5) * 4;
          }
          mesh.position.set(px, py, 0);
          mesh.rotation.y += dt * 0.6;
          mesh.rotation.x += dt * 0.15;
          mesh.scale.setScalar(t.surtoAtivo ? 1 + Math.sin(agora / 150) * 0.18 : 1);
        }
        renderer.render(scene, camera);
      }
      frame = requestAnimationFrame(animar);
    };
    frame = requestAnimationFrame(animar);

    return () => {
      vivo = false;
      cancelAnimationFrame(frame);
      for (const mesh of meshes.values()) {
        (mesh.material as THREE.Material).dispose();
      }
      geometria.dispose();
      renderer.dispose();
      cenaRef.current = null;
      container.removeChild(canvas);
    };
  }, []);

  // resize: atualiza câmera e renderer sem tocar no contexto WebGL (ver aviso no topo do arquivo).
  useEffect(() => {
    const cena = cenaRef.current;
    if (!cena || width === 0 || height === 0) return;
    cena.camera.right = width;
    cena.camera.bottom = height;
    cena.camera.updateProjectionMatrix();
    cena.renderer.setSize(width, height, false);
  }, [width, height]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} />;
}
