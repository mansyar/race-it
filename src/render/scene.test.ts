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

describe('createBuildScene pixel-ratio caps', () => {
  let resizeCallback: (() => void) | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    class CapturingResizeObserver {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    document.body.append(container);
  });

  function rendererMocks(view: ReturnType<typeof createBuildScene>): {
    setPixelRatio: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
  } {
    return view.renderer as unknown as {
      setPixelRatio: ReturnType<typeof vi.fn>;
      setSize: ReturnType<typeof vi.fn>;
    };
  }

  it('boots at the high cap: min of device ratio and 2', () => {
    const view = createBuildScene(container);
    expect(rendererMocks(view).setPixelRatio).toHaveBeenLastCalledWith(2);
  });

  it('applies the mid and low caps immediately and re-sizes the buffer', () => {
    const view = createBuildScene(container);
    const { setPixelRatio, setSize } = rendererMocks(view);
    const sizesBefore = setSize.mock.calls.length;

    view.setPixelRatioCap('mid');
    expect(setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(setSize.mock.calls.length).toBe(sizesBefore + 1);

    view.setPixelRatioCap('low');
    expect(setPixelRatio).toHaveBeenLastCalledWith(1);
    expect(setSize.mock.calls.length).toBe(sizesBefore + 2);
  });

  it('restores the high cap when asked', () => {
    const view = createBuildScene(container);
    view.setPixelRatioCap('low');
    view.setPixelRatioCap('high');
    expect(rendererMocks(view).setPixelRatio).toHaveBeenLastCalledWith(2);
  });

  it('keeps the active cap when the container resizes', () => {
    const view = createBuildScene(container);
    view.setPixelRatioCap('low');
    if (!resizeCallback) {
      throw new Error('ResizeObserver callback was not captured');
    }
    resizeCallback();
    expect(rendererMocks(view).setPixelRatio).toHaveBeenLastCalledWith(1);
  });
});
