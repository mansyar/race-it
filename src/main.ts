import * as THREE from 'three';
import { appReady } from './app';
import { CARS, MODELS, SCENERY, SFX } from './assets/manifest';
import { createSfx } from './audio/sfx';
import type { GridModel, PieceType } from './grid/grid-model';
import { GRID_SIZE } from './grid/grid-model';
import { TrackEditor } from './grid/track-editor';
import { loadOrSeedTrack, saveTrack } from './grid/track-store';
import { validateTrack } from './grid/track-validator';
import { createRaceEngine, type RaceEngine } from './race/engine';
import { loadLineup, saveLineup } from './race/lineup';
import { extractLoopPath } from './race/path';
import { type BuildTool, handleCellTap } from './render/interaction';
import { KartPreview } from './render/kart-preview';
import { fillPerfPattern } from './render/perf-harness';
import { applyPieceFeedback } from './render/piece-feedback-apply';
import { PieceRenderer } from './render/piece-renderer';
import { createBuildScene } from './render/scene';
import { SceneryRenderer } from './render/scenery-render';
import { PieceFeedback } from './render/toy-feedback';
import './style.css';
import { createBuildBar } from './ui/build-bar';
import { createCarPicker } from './ui/car-picker';
import { createCornerCluster } from './ui/corner-cluster';
import { createGoButton } from './ui/go-button';

// Referenced so the production build emits every GLB/OGG for service-worker
// precaching; renderers, the car picker, and audio consume them at runtime.
const ASSET_URLS: readonly string[] = [
  ...Object.values(MODELS),
  ...Object.values(SCENERY),
  ...Object.values(CARS),
  ...Object.values(SFX),
];
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
  let raceEngine: RaceEngine | null = null;

  const pieces = new PieceRenderer();
  const scenery = new SceneryRenderer();
  const feedback = new PieceFeedback();
  const sfx = createSfx();
  sfx.setMuted(localStorage.getItem('race-it:muted') === 'true');

  const rerender = (): void => {
    pieces.update(model.toSnapshot());
    scenery.update(model.toSnapshot());
    bar.setUndoEnabled(editor.canUndo());
    go.setValid(validateTrack(model).valid);
    if (validateTrack(model).valid) {
      saveTrack(model);
    }
  };

  const view = createBuildScene(
    root,
    (x, y) => {
      const result = handleCellTap(editor, tool, x, y);
      if (result === 'placed') {
        feedback.notePlaced(y * GRID_SIZE + x);
      }
      rerender();
    },
    (dt) => {
      feedback.tick(dt);
      // Keep piece feedback in build mode only — races stay a pure spectacle.
      if (!raceEngine || raceEngine.state === 'idle') {
        applyPieceFeedback(pieces.group, feedback, feedback.time);
      }
      if (raceEngine) {
        raceEngine.tick(dt);
      }
    },
  );

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
      holderInfo: (index: number) => {
        const holder = pieces.group.children[index];
        if (!holder) {
          return null;
        }
        holder.updateWorldMatrix(true, true);
        const child = holder.children[0];
        return {
          holderRotY: holder.rotation.y,
          childRotY: child ? child.rotation.y : null,
          childPos: child ? [child.position.x, child.position.y, child.position.z] : null,
        };
      },
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
      roadMap: (index: number) => {
        const holder = pieces.group.children[index];
        if (!holder) return null;
        holder.updateWorldMatrix(true, true);
        const N = 16;
        const grid: Array<Array<number>> = Array.from({ length: N }, () =>
          Array<number>(N).fill(0),
        );
        const v = new THREE.Vector3();
        holder.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if ((mesh as unknown as { isMesh?: boolean }).isMesh !== true || !mesh.geometry) return;
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          const colored = mat as { color?: THREE.Color };
          const hex = colored.color ? colored.color.getHexString() : '';
          if (hex !== 'b0b2b5') return; // road-gray material only
          const pos = mesh.geometry.getAttribute('position');
          if (!pos) return;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
            if (v.y > 0.1) continue;
            const gx = Math.floor(((v.x - holder.position.x) / 2 + 0.5) * N);
            const gz = Math.floor(((v.z - holder.position.z) / 2 + 0.5) * N);
            const row = grid[gz];
            if (gx >= 0 && gx < N && gz >= 0 && gz < N && row) {
              row[gx] = 1;
            }
          }
        });
        return grid.map((row) => row.join(''));
      },
    };
  }

  // Debug mode: `?race` runs a headless seeded race on the current track and
  // prints the result — the end-to-end verification vehicle for the race engine
  // until race presentation lands (Track 2 scope: Race Engine Core).
  if (new URLSearchParams(window.location.search).has('race')) {
    try {
      raceEngine = createRaceEngine(extractLoopPath(model), { seed: 42 });
      raceEngine.on('kartFinish', ({ index, time }) => {
        console.info(`[race] kart ${index} finished at ${time.toFixed(2)}s`);
      });
      raceEngine.start();
      let guard = 0;
      while (!raceEngine.karts.every((kart) => kart.finished) && guard < 60 * 60) {
        raceEngine.tick(1 / 60);
        guard += 1;
      }
      console.info('[race] result', raceEngine.result);
      console.info('[race] headless run complete');
      (window as unknown as Record<string, unknown>).__raceItRace = raceEngine;
    } catch (error) {
      console.error('[race] track has no closed loop', error);
    }
  }

  const go = createGoButton({
    onGo: () => {
      sfx.play('click');
      picker.setLineup(loadLineup());
      picker.show();
      renderKartPreviews();
    },
  });

  const bar = createBuildBar({
    onPieceSelect: (type) => {
      sfx.play('click');
      selectedType = selectedType === type ? null : type;
      tool = selectedType ? { kind: 'piece', type: selectedType } : { kind: 'none' };
      bar.setSelected(selectedType);
      if (selectedType) {
        bar.setRemoveActive(false);
        feedback.setRemoveMode(false);
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
      feedback.setRemoveMode(active);
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

  const picker = createCarPicker({
    onRace: (lineup) => {
      sfx.play('confirmA');
      saveLineup(lineup);
      picker.hide();
      raceEngine = createRaceEngine(extractLoopPath(model), {
        kartCount: lineup.karts.length,
      });
      raceEngine.on('kartFinish', ({ index, time }) => {
        console.info(`[race] kart ${index} finished at ${time.toFixed(2)}s`);
        if (raceEngine?.karts.every((kart) => kart.finished)) {
          console.info('[race] result', raceEngine.result);
          (window as unknown as Record<string, unknown>).__raceItRace = raceEngine;
        }
      });
      feedback.setRemoveMode(false);
      bar.setRemoveActive(false);
      raceEngine.start();
    },
    onBack: () => {
      sfx.play('click');
      picker.hide();
    },
    onToggle: () => {
      sfx.play('click');
    },
  });

  // One shared WebGL canvas renders the four tinted kart previews; it sits
  // above the swatch grid and only paints when the picker is visible.
  const kartPreview = new KartPreview({ container: picker.getPreviewSlot() });
  const renderKartPreviews = (): void => {
    const rect = picker.getPreviewSlot().getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      kartPreview.render(rect.width, rect.height);
    }
  };
  kartPreview
    .load()
    .then(renderKartPreviews)
    .catch((error: unknown) => {
      console.error('Failed to load kart preview models', error);
    });
  window.addEventListener('resize', renderKartPreviews);

  const appUi = document.createElement('div');
  appUi.append(cluster.root, go.root, bar.root, cluster.confirm, picker.root);
  root.append(appUi);

  go.setValid(validateTrack(model).valid);

  pieces
    .load()
    .then(() => {
      view.scene.add(pieces.update(model.toSnapshot()));
      return scenery.load();
    })
    .then(() => {
      view.scene.add(scenery.update(model.toSnapshot()));
    })
    .catch((error: unknown) => {
      console.error('Failed to load track pieces or scenery', error);
    });

  window.addEventListener(
    'pagehide',
    () => {
      window.removeEventListener('resize', renderKartPreviews);
      kartPreview.dispose();
      view.dispose();
    },
    { once: true },
  );
}
