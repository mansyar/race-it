import { appReady } from './app';
import { MODELS, SFX } from './assets/manifest';
import type { GridModel, PieceType } from './grid/grid-model';
import { TrackEditor } from './grid/track-editor';
import { loadOrSeedTrack, saveTrack } from './grid/track-store';
import { validateTrack } from './grid/track-validator';
import { type BuildTool, handleCellTap } from './render/interaction';
import { PieceRenderer } from './render/piece-renderer';
import { createBuildScene } from './render/scene';
import './style.css';
import { createBuildBar } from './ui/build-bar';
import { createCornerCluster } from './ui/corner-cluster';

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

  const rerender = (): void => {
    pieces.update(model.toSnapshot());
    bar.setUndoEnabled(editor.canUndo());
    if (validateTrack(model).valid) {
      saveTrack(model);
    }
  };

  const view = createBuildScene(root, (x, y) => {
    handleCellTap(editor, tool, x, y);
    rerender();
  });

  const bar = createBuildBar({
    onPieceSelect: (type) => {
      selectedType = selectedType === type ? null : type;
      tool = selectedType ? { kind: 'piece', type: selectedType } : { kind: 'none' };
      bar.setSelected(selectedType);
      if (selectedType) {
        bar.setRemoveActive(false);
      }
    },
    onUndo: () => {
      editor.undo();
      rerender();
    },
    onRemoveToggle: () => {
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
      localStorage.setItem('race-it:muted', String(muted));
    },
    onClearConfirmed: () => {
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 12; x++) {
          model.setCell(x, y, null);
        }
      }
      editor = new TrackEditor(model);
      rerender();
    },
  });

  const appUi = document.createElement('div');
  appUi.append(cluster.root, bar.root, cluster.confirm);
  root.append(appUi);

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
