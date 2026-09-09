import finishFlagUrl from './models/flagCheckers.glb?url';
import kartOobiUrl from './models/kart-oobi.glb?url';
import kartOodiUrl from './models/kart-oodi.glb?url';
import kartOoliUrl from './models/kart-ooli.glb?url';
import kartOopiUrl from './models/kart-oopi.glb?url';
import cornerUrl from './models/roadCornerSmall.glb?url';
import startUrl from './models/roadStart.glb?url';
import straightUrl from './models/roadStraight.glb?url';
import clickUrl from './sfx/click_001.ogg?url';
import confirmAUrl from './sfx/confirmation_001.ogg?url';
import confirmBUrl from './sfx/confirmation_002.ogg?url';

/** Track piece models from Kenney Racing Kit (CC0). */
export const MODELS = {
  straight: straightUrl,
  corner: cornerUrl,
  start: startUrl,
  finishFlag: finishFlagUrl,
} as const;

/**
 * Kart racer models from Kenney Car Kit (CC0). One distinct model per kart
 * index (0-3); tinted per kart color at load time.
 */
export const KARTS = {
  oobi: kartOobiUrl,
  oodi: kartOodiUrl,
  ooli: kartOoliUrl,
  oopi: kartOopiUrl,
} as const;

/** UI sound effects from Kenney Interface Sounds (CC0). */
export const SFX = {
  click: clickUrl,
  confirmA: confirmAUrl,
  confirmB: confirmBUrl,
} as const;
