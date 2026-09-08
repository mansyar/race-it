import { appReady } from './app';
import { MODELS, SFX } from './assets/manifest';
import { loadOrSeedTrack } from './grid/track-store';
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
  const view = createBuildScene(root);
  const track = loadOrSeedTrack();
  const pieces = new PieceRenderer();
  pieces
    .load()
    .then(() => {
      view.scene.add(pieces.update(track.toSnapshot()));
    })
    .catch((error: unknown) => {
      console.error('Failed to load track pieces', error);
    });
  window.addEventListener('pagehide', () => view.dispose(), { once: true });
}
