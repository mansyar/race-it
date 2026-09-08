import { appReady } from './app';
import { MODELS, SFX } from './assets/manifest';
import type { GridModel } from './grid/grid-model';
import { TrackEditor } from './grid/track-editor';
import { loadOrSeedTrack, saveTrack } from './grid/track-store';
import { validateTrack } from './grid/track-validator';
import { type BuildTool, handleCellTap } from './render/interaction';
import { PieceRenderer } from './render/piece-renderer';
import { createBuildScene } from './render/scene';

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
  const editor = new TrackEditor(model);
  // Palette UI arrives in Phase 4; until then taps rotate existing pieces.
  const tool: BuildTool = { kind: 'none' };

  const view = createBuildScene(root, (x, y) => {
    handleCellTap(editor, tool, x, y);
    if (validateTrack(model).valid) {
      saveTrack(model);
    }
    pieces.update(model.toSnapshot());
  });

  const pieces = new PieceRenderer();
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
