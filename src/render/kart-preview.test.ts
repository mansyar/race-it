import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KARTS } from '../assets/manifest';
import { KART_COLORS } from '../race/lineup';
import { KART_COLORS as RACE_KART_COLORS } from './kart-meshes';
import { KART_TINT, KartPreview } from './kart-preview';
import { KART_FIT } from './model-fit';

function kartTemplate(): THREE.Object3D {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff0000 }),
  );
  const root = new THREE.Object3D();
  root.add(mesh);
  return root;
}

function fakeLoader(loaded: string[]) {
  return {
    loadAsync: async (url: string) => {
      loaded.push(url);
      return { scene: kartTemplate() };
    },
  };
}

interface RendererCalls {
  scissor: number[][];
  viewport: number[][];
  renderCount: number;
  visiblePerRender: number[];
  scissorTestEnabled: boolean;
  disposed: boolean;
}

function fakeRenderer(calls: RendererCalls) {
  const canvas = document.createElement('canvas');
  return {
    domElement: canvas,
    setSize: vi.fn(),
    setScissorTest: (enabled: boolean) => {
      calls.scissorTestEnabled = enabled;
    },
    setScissor: (x: number, y: number, w: number, h: number) => {
      calls.scissor.push([x, y, w, h]);
    },
    setViewport: (x: number, y: number, w: number, h: number) => {
      calls.viewport.push([x, y, w, h]);
    },
    render: (scene: THREE.Scene, _camera: THREE.Camera) => {
      calls.renderCount += 1;
      calls.visiblePerRender.push(
        scene.children.filter((child) => child.visible && child.userData.kartPreview === true)
          .length,
      );
    },
    dispose: () => {
      calls.disposed = true;
    },
  };
}

function makePreview(container: HTMLElement, loaded: string[], calls: RendererCalls) {
  return new KartPreview({
    container,
    loader: fakeLoader(loaded),
    renderer: fakeRenderer(calls) as unknown as THREE.WebGLRenderer,
  });
}

describe('KartPreview', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('loads all four kart models from the KARTS manifest via the injected loader', async () => {
    const loaded: string[] = [];
    const preview = makePreview(container, loaded, {
      scissor: [],
      viewport: [],
      renderCount: 0,
      visiblePerRender: [],
      scissorTestEnabled: false,
      disposed: false,
    });
    await preview.load();
    expect(loaded).toEqual([...Object.values(KARTS)]);
  });

  it('builds one race-palette-tinted model per kart color', async () => {
    const preview = makePreview(container, [], {
      scissor: [],
      viewport: [],
      renderCount: 0,
      visiblePerRender: [],
      scissorTestEnabled: false,
      disposed: false,
    });
    await preview.load();
    expect(preview.models).toHaveLength(KART_COLORS.length);
    for (let i = 0; i < KART_COLORS.length; i++) {
      const color = KART_COLORS[i];
      if (!color) {
        throw new Error('missing kart color');
      }
      const model = preview.models[i];
      if (!model) {
        throw new Error('missing model');
      }
      const mesh = model.children[0] as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;
      const expected = new THREE.Color(RACE_KART_COLORS[i] ?? 0xffffff);
      expect(material.color.equals(expected)).toBe(true);
      expect(KART_TINT[color]).toBe(RACE_KART_COLORS[i]);
    }
  });

  it('applies the kart fit transform to every model', async () => {
    const preview = makePreview(container, [], {
      scissor: [],
      viewport: [],
      renderCount: 0,
      visiblePerRender: [],
      scissorTestEnabled: false,
      disposed: false,
    });
    await preview.load();
    for (const model of preview.models) {
      expect(model.scale.toArray()).toEqual(KART_FIT.scale);
      expect(model.position.x).toBe(KART_FIT.position[0]);
      expect(model.position.y).toBe(KART_FIT.position[1] + 0.03);
      expect(model.position.z).toBe(KART_FIT.position[2]);
    }
  });

  it('ignores repeated load calls (models stay unique)', async () => {
    const loaded: string[] = [];
    const preview = makePreview(container, loaded, {
      scissor: [],
      viewport: [],
      renderCount: 0,
      visiblePerRender: [],
      scissorTestEnabled: false,
      disposed: false,
    });
    await preview.load();
    await preview.load();
    expect(loaded).toHaveLength(Object.values(KARTS).length);
    expect(preview.models).toHaveLength(KART_COLORS.length);
  });

  it('renders four scissored viewports into one shared canvas', async () => {
    const calls: RendererCalls = {
      scissor: [],
      viewport: [],
      renderCount: 0,
      visiblePerRender: [],
      scissorTestEnabled: false,
      disposed: false,
    };
    const preview = makePreview(container, [], calls);
    await preview.load();
    preview.render(400, 200);
    expect(calls.renderCount).toBe(KART_COLORS.length);
    expect(calls.scissor).toEqual([
      [0, 0, 200, 100],
      [200, 0, 200, 100],
      [0, 100, 200, 100],
      [200, 100, 200, 100],
    ]);
    expect(calls.viewport).toEqual(calls.scissor);
    expect(calls.scissorTestEnabled).toBe(true);
  });

  it('shows only one kart per quadrant render', async () => {
    const calls: RendererCalls = {
      scissor: [],
      viewport: [],
      renderCount: 0,
      visiblePerRender: [],
      scissorTestEnabled: false,
      disposed: false,
    };
    const preview = makePreview(container, [], calls);
    await preview.load();
    preview.render(400, 200);
    expect(calls.visiblePerRender).toEqual([1, 1, 1, 1]);
  });

  it('dispose removes the canvas and releases renderer, geometries, and materials', async () => {
    const calls: RendererCalls = {
      scissor: [],
      viewport: [],
      renderCount: 0,
      visiblePerRender: [],
      scissorTestEnabled: false,
      disposed: false,
    };
    const preview = makePreview(container, [], calls);
    container.appendChild(preview.canvas);
    await preview.load();
    const mesh = preview.models[0]?.children[0] as THREE.Mesh;
    const geometrySpy = vi.spyOn(mesh.geometry, 'dispose');
    const materialSpy = vi.spyOn(mesh.material as THREE.Material, 'dispose');
    preview.dispose();
    expect(container.contains(preview.canvas)).toBe(false);
    expect(calls.disposed).toBe(true);
    expect(geometrySpy).toHaveBeenCalled();
    expect(materialSpy).toHaveBeenCalled();
  });
});
