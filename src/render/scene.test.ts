import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('three', () => {
  class StubObject3D {
    position = { x: 0, y: 0, z: 0, set: vi.fn() };
    rotation = { x: 0, y: 0, z: 0 };
    visible = true;
    add(..._children: unknown[]): void {}
  }

  class StubRenderer {
    domElement = (() => {
      const el = document.createElement('canvas');
      return Object.assign(el, {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        remove: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      });
    })();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }

  class StubCanvasTexture {
    image: { width: number; height: number };
    colorSpace = '';
    dispose = vi.fn();
    constructor(image: { width: number; height: number }) {
      this.image = image;
    }
  }

  return {
    WebGLRenderer: class extends StubRenderer {},
    Scene: StubObject3D,
    PerspectiveCamera: class extends StubObject3D {
      aspect = 1;
      updateProjectionMatrix = vi.fn();
      lookAt = vi.fn();
    },
    Color: class {},
    HemisphereLight: StubObject3D,
    DirectionalLight: StubObject3D,
    BoxGeometry: class {
      dispose = vi.fn();
    },
    Mesh: StubObject3D,
    MeshLambertMaterial: class {},
    Float32BufferAttribute: class {},
    BufferGeometry: class {
      setAttribute = vi.fn();
      dispose = vi.fn();
    },
    LineSegments: StubObject3D,
    LineBasicMaterial: class {},
    PlaneGeometry: class {
      dispose = vi.fn();
    },
    MeshBasicMaterial: class {},
    CanvasTexture: StubCanvasTexture,
    SRGBColorSpace: '',
  };
});

import { contactShadowTexture, createBuildScene } from './scene';

describe('contactShadowTexture', () => {
  it('returns a canvas texture sized for the shadow disc', () => {
    const texture = contactShadowTexture(32);
    expect(texture.image?.width).toBe(32);
    expect(texture.image?.height).toBe(32);
    texture.dispose();
  });

  it('defaults to 64px when size is omitted', () => {
    const texture = contactShadowTexture();
    expect(texture.image?.width).toBe(64);
    texture.dispose();
  });
});

describe('createBuildScene frame loop', () => {
  let rafCallback: FrameRequestCallback | null = null;
  let cancelCount = 0;
  let container: HTMLDivElement;

  beforeEach(() => {
    rafCallback = null;
    cancelCount = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      cancelCount += 1;
    });
    class StubResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    container = document.createElement('div');
    document.body.append(container);
  });

  function renderFrame(now: number): void {
    const cb = rafCallback;
    if (!cb) {
      throw new Error('No rAF callback registered');
    }
    cb(now);
  }

  it('reports a small dt on the first frame', () => {
    const view = createBuildScene(container);
    const dts: number[] = [];
    view.onFrame((dt) => dts.push(dt));
    renderFrame(performance.now() + 16);
    expect(dts).toHaveLength(1);
    expect(dts[0]).toBeGreaterThanOrEqual(0);
    expect(dts[0]).toBeLessThan(0.05);
  });

  it('invokes the onFrame callback every frame with the elapsed dt', () => {
    const view = createBuildScene(container);
    const dts: number[] = [];
    view.onFrame((dt) => dts.push(dt));
    const t0 = performance.now();
    renderFrame(t0 + 16);
    renderFrame(t0 + 32);
    expect(dts).toHaveLength(2);
    expect(dts[0]).toBeCloseTo(0.016, 3);
    expect(dts[1]).toBeCloseTo(0.016, 3);
  });

  it('clamps dt to 0.1 seconds after long pauses', () => {
    const view = createBuildScene(container);
    const dts: number[] = [];
    view.onFrame((dt) => dts.push(dt));
    renderFrame(performance.now() + 5000);
    expect(dts[0]).toBe(0.1);
  });

  it('clears the callback when onFrame(null) is called', () => {
    const view = createBuildScene(container);
    const dts: number[] = [];
    view.onFrame((dt) => dts.push(dt));
    view.onFrame(null);
    renderFrame(performance.now() + 16);
    expect(dts).toHaveLength(0);
  });

  it('dispose cancels the animation loop', () => {
    const view = createBuildScene(container);
    expect(cancelCount).toBe(0);
    view.dispose();
    expect(cancelCount).toBe(1);
  });
});
