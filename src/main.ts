import * as THREE from 'three';
import { appReady } from './app';
import { MODELS, SFX } from './assets/manifest';
import { createSfx } from './audio/sfx';
import type { GridModel, PieceType } from './grid/grid-model';
import { GRID_SIZE } from './grid/grid-model';
import { TrackEditor } from './grid/track-editor';
import { loadOrSeedTrack, saveTrack } from './grid/track-store';
import { validateTrack } from './grid/track-validator';
import { type BuildTool, handleCellTap } from './render/interaction';
import { fillPerfPattern } from './render/perf-harness';
import { PieceRenderer } from './render/piece-renderer';
import { createBuildScene } from './render/scene';
import './style.css';
import { createBuildBar } from './ui/build-bar';
import { createCornerCluster } from './ui/corner-cluster';
import { createGoButton } from './ui/go-button';

// Referenced so the production build emits every GLB/OGG for service-worker
// precaching; the race-mode renderer (Track 2) and audio (Track 3) consume
// them at runtime.
const ASSET_URLS: readonly string[] = [...Object.values(MODELS), ...Object.values(SFX)];
void ASSET_URLS.length;

const root = document.querySelector<HTMLDivElement>('#app');

if (root && appReady()) {
  root.replaceChildren();
  root.style.width = '100vw';
  root.style.height = '100vh';

  const model: GridModel = loadOrSeedTrack();
  let editor = new TrackEditor(model);
  let tool: BuildTool = { kind: 'none' };
  let selectedType: PieceType | null = null;

  const pieces = new PieceRenderer();
  const sfx = createSfx();
  sfx.setMuted(localStorage.getItem('race-it:muted') === 'true');

  const rerender = (): void => {
    pieces.update(model.toSnapshot());
    bar.setUndoEnabled(editor.canUndo());
    go.setValid(validateTrack(model).valid);
    if (validateTrack(model).valid) {
      saveTrack(model);
    }
  };

  const view = createBuildScene(root, (x, y) => {
    handleCellTap(editor, tool, x, y);
    rerender();
  });

  // Debug mode: `?perf` fills the whole board (worst case, 144 pieces) and
  // exposes renderer stats on the window for manual fps/draw-call measurement.
  if (new URLSearchParams(window.location.search).has('perf')) {
    fillPerfPattern(model);
    (window as unknown as Record<string, unknown>).__raceItPerf = () => view.renderer.info.render;
  }

  // Debug mode: `?debug` exposes per-piece world transforms and road-level
  // vertex extents for in-engine geometry verification.
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as Record<string, unknown>).__raceItDebug = {
      view,
      pieces: () =>
        pieces.group.children.map((holder) => {
          holder.updateWorldMatrix(true, true);
          const parts: Array<{
            name: string;
            color: string;
            minX: number;
            maxX: number;
            minZ: number;
            maxZ: number;
          }> = [];
          holder.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if ((mesh as unknown as { isMesh?: boolean }).isMesh !== true || !mesh.geometry) {
              return;
            }
            const pos = mesh.geometry.getAttribute('position');
            if (!pos) return;
            const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            const colored = mat as { color?: THREE.Color };
            const v = new THREE.Vector3();
            let minX = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let minZ = Number.POSITIVE_INFINITY;
            let maxZ = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
              if (v.y > 0.1) continue;
              minX = Math.min(minX, v.x);
              maxX = Math.max(maxX, v.x);
              minZ = Math.min(minZ, v.z);
              maxZ = Math.max(maxZ, v.z);
            }
            parts.push({
              name: mesh.name,
              color: colored.color ? `#${colored.color.getHexString()}` : '?',
              minX: +minX.toFixed(2),
              maxX: +maxX.toFixed(2),
              minZ: +minZ.toFixed(2),
              maxZ: +maxZ.toFixed(2),
            });
          });
          return { holder: holder.position.toArray(), rotY: holder.rotation.y, parts };
        }),
    };
  }

  const go = createGoButton({
    // Race mode starts in Track 2; GO is wired but inert until then.
    onGo: () => {},
  });

  const bar = createBuildBar({
    onPieceSelect: (type) => {
      sfx.play('click');
      selectedType = selectedType === type ? null : type;
      tool = selectedType ? { kind: 'piece', type: selectedType } : { kind: 'none' };
      bar.setSelected(selectedType);
      if (selectedType) {
        bar.setRemoveActive(false);
      }
    },
    onUndo: () => {
      sfx.play('click');
      editor.undo();
      rerender();
    },
    onRemoveToggle: () => {
      sfx.play('click');
      const active = tool.kind !== 'remove';
      tool = active ? { kind: 'remove' } : { kind: 'none' };
      bar.setRemoveActive(active);
      if (active) {
        selectedType = null;
        bar.setSelected(null);
      }
    },
  });

  const cluster = createCornerCluster({
    onShelf: () => {
      // Shelf UI is Track 3 scope; stub is inert for now.
    },
    onMuteToggle: (muted) => {
      sfx.setMuted(muted);
      localStorage.setItem('race-it:muted', String(muted));
    },
    onClearConfirmed: () => {
      sfx.play('confirmB');
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          model.setCell(x, y, null);
        }
      }
      editor = new TrackEditor(model);
      rerender();
    },
  });

  const appUi = document.createElement('div');
  appUi.append(cluster.root, go.root, bar.root, cluster.confirm);
  root.append(appUi);

  go.setValid(validateTrack(model).valid);

  pieces
    .load()
    .then(() => {
      view.scene.add(pieces.update(model.toSnapshot()));
    })
    .catch((error: unknown) => {
      console.error('Failed to load track pieces', error);
    });
  window.addEventListener('pagehide', () => view.dispose(), { once: true });
}
