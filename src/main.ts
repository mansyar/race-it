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
