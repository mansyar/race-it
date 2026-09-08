import * as THREE from 'three';
import { GRID_SIZE } from '../grid/grid-model';
import { BOARD_WORLD_SIZE, CELL_WORLD_SIZE, computeCameraPlacement, gridToWorld } from './layout';
import { pickCell } from './picking';

/** Warm wood tone of the toy table. */
const TABLE_COLOR = 0xc99a6b;
/** Faint etched grid line color. */
const GRID_LINE_COLOR = 0xa87f52;

/**
 * Creates the build-mode 3D diorama: a wooden toy table with a faint etched
 * 12x12 grid, lit softly, viewed from a fixed tilted camera. Handles responsive
 * resizing. Rendering is verified manually; all math lives in layout.ts.
 */
export function createBuildScene(
  container: HTMLElement,
  onCellTap?: (x: number, y: number) => void,
): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  dispose: () => void;
} {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f1e7);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

  // Soft toy-diorama lighting.
  const ambient = new THREE.HemisphereLight(0xffffff, 0x8b6a4a, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(6, 12, 4);
  scene.add(ambient, sun);

  // The toy table surface (the board itself; edges come from the table fill below).
  const tableGeometry = new THREE.BoxGeometry(BOARD_WORLD_SIZE, 0.5, BOARD_WORLD_SIZE);
  const table = new THREE.Mesh(
    tableGeometry,
    new THREE.MeshLambertMaterial({ color: TABLE_COLOR }),
  );
  table.position.y = -0.25;
  scene.add(table);

  // Faint etched grid on the tabletop.
  const half = BOARD_WORLD_SIZE / 2;
  const linePoints: number[] = [];
  for (let i = 0; i <= GRID_SIZE; i++) {
    const offset = i * CELL_WORLD_SIZE - half;
    linePoints.push(offset, 0.005, -half, offset, 0.005, half);
    linePoints.push(-half, 0.005, offset, half, 0.005, offset);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
  const gridLines = new THREE.LineSegments(
    gridGeometry,
    new THREE.LineBasicMaterial({ color: GRID_LINE_COLOR, transparent: true, opacity: 0.35 }),
  );
  scene.add(gridLines);

  // Soft highlight quad shown under the finger while a cell is pressed.
  const highlightGeometry = new THREE.PlaneGeometry(CELL_WORLD_SIZE * 0.9, CELL_WORLD_SIZE * 0.9);
  const highlight = new THREE.Mesh(
    highlightGeometry,
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45 }),
  );
  highlight.rotation.x = -Math.PI / 2;
  highlight.position.y = 0.01;
  highlight.visible = false;
  scene.add(highlight);

  // Tap handling: report the picked cell on a clean tap (no drag).
  let tapStart: { x: number; y: number } | null = null;
  function eventToNdc(event: PointerEvent): { x: number; y: number } {
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }
  function onPointerDown(event: PointerEvent): void {
    const cell = pickCell(eventToNdc(event), camera);
    if (cell) {
      const pos = gridToWorld(cell.x, cell.y);
      highlight.position.set(pos.x, 0.01, pos.z);
      highlight.visible = true;
    }
    tapStart = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event: PointerEvent): void {
    highlight.visible = false;
    const start = tapStart;
    tapStart = null;
    if (!start) {
      return;
    }
    // Only a clean tap (finger did not drag) counts as an edit.
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx * dx + dy * dy > 24 * 24) {
      return;
    }
    const cell = pickCell(eventToNdc(event), camera);
    if (cell && onCellTap) {
      onCellTap(cell.x, cell.y);
    }
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  function resize(): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    // updateStyle (default true) is REQUIRED: it sets the canvas CSS size to
    // the container size. Without it the canvas displays at its pixel-buffer
    // size (clientWidth * devicePixelRatio), overflowing and cropping the view
    // whenever the browser zoom or OS display scaling is not 100%.
    renderer.setSize(width, height);
    const aspect = width / height;
    camera.aspect = aspect;
    const placement = computeCameraPlacement(aspect);
    camera.position.set(placement.position.x, placement.position.y, placement.position.z);
    camera.lookAt(placement.target.x, placement.target.y, placement.target.z);
    camera.updateProjectionMatrix();
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  let frame = 0;
  function loop(): void {
    frame = requestAnimationFrame(loop);
    renderer.render(scene, camera);
  }
  loop();

  return {
    scene,
    camera,
    renderer,
    dispose: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      gridGeometry.dispose();
      highlightGeometry.dispose();
      tableGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
