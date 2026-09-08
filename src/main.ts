import { appReady } from './app';
import { MODELS, SFX } from './assets/manifest';

// Referenced so the production build emits every GLB/OGG for service-worker
// precaching; the renderer consumes them starting in Phase 3.
const ASSET_URLS: readonly string[] = [...Object.values(MODELS), ...Object.values(SFX)];
void ASSET_URLS.length;

const root = document.querySelector<HTMLDivElement>('#app');

if (root && appReady()) {
  root.textContent = 'RACE-IT';
}
