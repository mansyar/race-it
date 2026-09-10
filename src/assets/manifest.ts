import musicLoopUrl from './audio/musicLoop.ogg?url';
import barrierUrl from './models/barrierWhite.glb?url';
import finishFlagUrl from './models/flagCheckers.glb?url';
import grandstandUrl from './models/grandStand.glb?url';
import kartOobiUrl from './models/kart-oobi.glb?url';
import kartOodiUrl from './models/kart-oodi.glb?url';
import kartOoliUrl from './models/kart-ooli.glb?url';
import kartOopiUrl from './models/kart-oopi.glb?url';
import cornerUrl from './models/roadCornerSmall.glb?url';
import startUrl from './models/roadStart.glb?url';
import straightUrl from './models/roadStraight.glb?url';
import treeUrl from './models/treeSmall.glb?url';
import clickUrl from './sfx/click_001.ogg?url';
import confirmAUrl from './sfx/confirmation_001.ogg?url';
import confirmBUrl from './sfx/confirmation_002.ogg?url';
import confirmGoUrl from './sfx/confirmation_003.ogg?url';
import nopeUrl from './sfx/error_001.ogg?url';
import jingleVictoryUrl from './sfx/jingleVictory.ogg?url';
import placeUrl from './sfx/pluck_001.ogg?url';
import removeUrl from './sfx/scratch_002.ogg?url';
import countdownUrl from './sfx/tick_001.ogg?url';

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

/** Decorative scenery models from Kenney Racing Kit (CC0). */
export const SCENERY = {
  tree: treeUrl,
  grandstand: grandstandUrl,
  barrier: barrierUrl,
} as const;

/** UI sound effects from Kenney Interface Sounds (CC0). */
export const SFX = {
  click: clickUrl,
  confirmA: confirmAUrl,
  confirmB: confirmBUrl,
  /** Brighter GO tone (distinct from confirmA/confirmB). */
  go: confirmGoUrl,
  /** Countdown beep; pitch rises via playbackRate per remaining step. */
  countdown: countdownUrl,
  /** Toy pluck when a piece is placed. */
  place: placeUrl,
  /** Scratch-out when a piece is removed. */
  remove: removeUrl,
  /** Gentle wobble for blocked actions (occupied cell, invalid GO tap). */
  nope: nopeUrl,
  /** Victory jingle played once at the trophy (with music ducked). */
  jingle: jingleVictoryUrl,
} as const;

/** Background music loop from Kenney Music Loops (CC0) — "Polka Train". */
export const MUSIC = {
  loop: musicLoopUrl,
} as const;
