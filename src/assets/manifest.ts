import finishFlagUrl from './models/flagCheckers.glb?url';
import cornerUrl from './models/roadCornerLarge.glb?url';
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

/** UI sound effects from Kenney Interface Sounds (CC0). */
export const SFX = {
  click: clickUrl,
  confirmA: confirmAUrl,
  confirmB: confirmBUrl,
} as const;
