import { appReady } from './app';
import { MODELS, SFX } from './assets/manifest';
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
  const scene = createBuildScene(root);
  window.addEventListener('pagehide', () => scene.dispose(), { once: true });
}
