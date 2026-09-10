import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KARTS } from '../assets/manifest';
import type { KartColor } from '../race/lineup';
import { KART_COLORS } from './kart-meshes';
import { applyModelFit, KART_FIT } from './model-fit';

/**
 * Race palette per kart color, derived from the race presentation's
 * KART_COLORS so preview karts look exactly like the karts that race.
 */
export const KART_TINT: Record<KartColor, number> = {
  red: KART_COLORS[0] ?? 0xffffff,
  blue: KART_COLORS[1] ?? 0xffffff,
  green: KART_COLORS[2] ?? 0xffffff,
  yellow: KART_COLORS[3] ?? 0xffffff,
};

const PREVIEW_FOV = 45;
const PREVIEW_DISTANCE = 4.2;
const LOOK_AT_Y = 0.6;

/** A material that carries a tintable base color (standard, lambert, ...). */
type TintableMaterial = THREE.Material & { color: THREE.Color };

/** Sets a material's color to the kart tint. */
function tintKartMaterial(material: THREE.Material, color: KartColor): void {
  if ('color' in material) {
    const tintable = material as TintableMaterial;
    tintable.color.setHex(KART_TINT[color]);
  }
}

interface GltfLike {
  scene: THREE.Object3D;
}

interface LoaderLike {
  loadAsync: (url: string) => Promise<GltfLike>;
}

/** The subset of the WebGLRenderer surface KartPreview relies on (mockable). */
interface RendererLike {
  domElement: HTMLCanvasElement;
  setSize: (width: number, height: number, updateStyle: boolean) => void;
  setScissorTest: (enabled: boolean) => void;
  setScissor: (x: number, y: number, w: number, h: number) => void;
  setViewport: (x: number, y: number, w: number, h: number) => void;
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  dispose: () => void;
}

export interface KartPreviewOptions {
  /** DOM element the shared preview canvas is appended to. */
  container: HTMLElement;
  /** GLB loader override (unit tests). */
  loader?: LoaderLike;
  /** Renderer override (unit tests); defaults to a transparent WebGLRenderer. */
  renderer?: RendererLike;
}

/**
 * Renders one tinted kart per color into a single shared canvas using
 * scissored viewports (2x2 quadrants), so the whole picker costs exactly one
 * extra WebGL context on the device floor.
 */
export class KartPreview {
  /** The shared canvas (the renderer's own domElement). */
  readonly canvas: HTMLCanvasElement;
  /** One fitted, tinted kart model per {@link KART_COLORS} entry. */
  readonly models: THREE.Object3D[] = [];
  private readonly renderer: RendererLike;
  private readonly loader: LoaderLike;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(PREVIEW_FOV, 1, 0.1, 100);
  private readonly container: HTMLElement;

  constructor(options: KartPreviewOptions) {
    this.container = options.container;
    this.loader = options.loader ?? new GLTFLoader();
    this.renderer = options.renderer ?? new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.canvas = this.renderer.domElement;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.container.appendChild(this.canvas);
    this.camera.position.set(0, 0, PREVIEW_DISTANCE);
    this.camera.lookAt(0, LOOK_AT_Y, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 4, 3);
    this.scene.add(key);
  }

  /** Loads the four kart models and builds one tinted, fitted clone each. */
  async load(): Promise<void> {
    if (this.models.length > 0) {
      return;
    }
    const urls = Object.values(KARTS);
    const templates: THREE.Object3D[] = [];
    for (const url of urls) {
      const gltf = await this.loader.loadAsync(url);
      templates.push(gltf.scene);
    }
    const colorNames = Object.keys(KART_TINT) as KartColor[];
    templates.forEach((template, index) => {
      const model = template.clone(true);
      const color = colorNames[index] ?? 'red';
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          // clone(true) shares the source material between clones, so clone
          // materials per model to give each kart its own tint.
          if (Array.isArray(obj.material)) {
            obj.material = obj.material.map((material) => {
              const clone = material.clone();
              tintKartMaterial(clone, color);
              return clone;
            });
          } else {
            const clone = obj.material.clone();
            tintKartMaterial(clone, color);
            obj.material = clone;
          }
        }
      });
      applyModelFit(model, KART_FIT);
      model.userData.kartPreview = true;
      this.models.push(model);
      this.scene.add(model);
    });
  }

  /** Renders each kart into its own quadrant of the shared canvas. */
  render(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.renderer.setScissorTest(true);
    const columns = 2;
    const rows = 2;
    const quadrantW = Math.floor(width / columns);
    const quadrantH = Math.floor(height / rows);
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      if (!model) {
        continue;
      }
      const column = i % columns;
      const row = Math.floor(i / columns);
      const x = column * quadrantW;
      const y = row * quadrantH;
      this.camera.aspect = quadrantW / quadrantH;
      this.camera.updateProjectionMatrix();
      this.renderer.setViewport(x, y, quadrantW, quadrantH);
      this.renderer.setScissor(x, y, quadrantW, quadrantH);
      for (const other of this.models) {
        other.visible = other === model;
      }
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Removes the canvas and releases the renderer, geometries, and materials. */
  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) {
          material.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
  }
}
