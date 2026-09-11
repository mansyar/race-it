import { describe, expect, it } from 'vitest';
import { CAMERA_VERTICAL_FOV_DEG, type CameraPlacement } from './layout';
import {
  LOOK_AHEAD_DISTANCE,
  PACK_FRAMING_FILL,
  PHOTO_FINISH_PUSH,
  RACE_ZOOM_CEILING,
  RACE_ZOOM_FLOOR,
  type RaceCameraInput,
  raceCameraPose,
} from './race-camera';

const buildPlacement: CameraPlacement = {
  position: { x: 0, y: 15.32, z: 12.86 },
  target: { x: 0, y: 0, z: 1.2 },
};

const baseDistance = (): number => {
  const dx = buildPlacement.position.x - buildPlacement.target.x;
  const dy = buildPlacement.position.y - buildPlacement.target.y;
  const dz = buildPlacement.position.z - buildPlacement.target.z;
  return Math.hypot(dx, dy, dz);
};

const poseDistance = (pose: CameraPlacement): number => {
  const dx = pose.position.x - pose.target.x;
  const dy = pose.position.y - pose.target.y;
  const dz = pose.position.z - pose.target.z;
  return Math.hypot(dx, dy, dz);
};

/**
 * Independent NDC oracle: largest |NDC| of the ground points when viewed from
 * the given pose. Mirrors the projection used by the build-camera solver so the
 * race solver can be checked against the same frustum.
 */
const maxPointNdc = (
  pose: CameraPlacement,
  aspect: number,
  points: readonly { x: number; z: number }[],
): number => {
  const view = {
    y: pose.target.y - pose.position.y,
    z: pose.target.z - pose.position.z,
  };
  const len = Math.hypot(view.y, view.z);
  const dY = view.y / len;
  const dZ = view.z / len;
  const uY = -dZ;
  const uZ = dY;
  const tanV = Math.tan((CAMERA_VERTICAL_FOV_DEG * Math.PI) / 360);
  const tanH = tanV * aspect;
  let max = 0;
  for (const point of points) {
    const vx = point.x - pose.position.x;
    const vy = -pose.position.y;
    const vz = point.z - pose.position.z;
    const depth = vy * dY + vz * dZ;
    const ndcX = vx / (depth * tanH);
    const ndcY = (vy * uY + vz * uZ) / (depth * tanV);
    max = Math.max(max, Math.abs(ndcX), Math.abs(ndcY));
  }
  return max;
};

const runningInput = (overrides: Partial<RaceCameraInput> = {}): RaceCameraInput => ({
  phase: 'running',
  lead: { x: 2, z: 6 },
  rival: { x: 0, z: 4 },
  heading: { x: 1, z: 0 },
  finishPoint: { x: 0, z: 0 },
  buildPlacement,
  aspect: 9 / 16,
  ...overrides,
});

describe('raceCameraPose', () => {
  it('returns the build placement untouched in build phase', () => {
    const pose = raceCameraPose(runningInput({ phase: 'build' }));
    expect(pose).toEqual(buildPlacement);
  });

  it('returns the aspect-dependent build placement untouched during countdown', () => {
    const wide: CameraPlacement = {
      position: { x: 0, y: 12.1, z: 9.4 },
      target: { x: 0, y: 0, z: 1.2 },
    };
    const pose = raceCameraPose(runningInput({ phase: 'countdown', buildPlacement: wide }));
    expect(pose).toEqual(wide);
  });

  it('clamps a tight pair at the zoom floor (0.4x the build distance)', () => {
    const input = runningInput({ lead: { x: 3, z: 3 }, rival: { x: 3.2, z: 3.1 } });
    const pose = raceCameraPose(input);
    expect(poseDistance(pose)).toBeCloseTo(baseDistance() * RACE_ZOOM_FLOOR, 6);
  });

  it('clamps a spread-out pair at the zoom ceiling (the full-board distance)', () => {
    const input = runningInput({ lead: { x: 40, z: 0 }, rival: { x: -40, z: 4 } });
    const pose = raceCameraPose(input);
    expect(poseDistance(pose)).toBeCloseTo(baseDistance() * RACE_ZOOM_CEILING, 6);
  });

  it('frames both karts inside the pack margin when the zoom is not clamped', () => {
    const input = runningInput();
    const pose = raceCameraPose(input);
    const distance = poseDistance(pose);
    expect(distance).toBeGreaterThan(baseDistance() * RACE_ZOOM_FLOOR);
    expect(distance).toBeLessThan(baseDistance() * RACE_ZOOM_CEILING);
    expect(
      maxPointNdc(pose, input.aspect, [input.lead, input.rival as { x: number; z: number }]),
    ).toBeLessThanOrEqual(PACK_FRAMING_FILL + 1e-9);
    // The camera keeps the fixed diorama azimuth: straight behind the target.
    expect(pose.position.x).toBeCloseTo(pose.target.x, 6);
  });

  it('aims at the pair midpoint nudged ahead of the leader along its heading', () => {
    const input = runningInput();
    const pose = raceCameraPose(input);
    // runningInput() defaults: lead (2,6), rival (0,4) -> midpoint (1,5).
    const midpoint = { x: 1, z: 5 };
    expect(pose.target.x).toBeCloseTo(midpoint.x + LOOK_AHEAD_DISTANCE, 6);
    expect(pose.target.z).toBeCloseTo(midpoint.z, 6);
    expect(pose.target.y).toBe(0);
  });

  it('nudges along whichever way the leader is heading', () => {
    const input = runningInput({ heading: { x: 0, z: -1 } });
    const pose = raceCameraPose(input);
    expect(pose.target.x).toBeCloseTo(1, 6);
    expect(pose.target.z).toBeCloseTo(5 - LOOK_AHEAD_DISTANCE, 6);
  });

  it('handles a lone leader (no rival) with the same clamps', () => {
    const input = runningInput({ rival: null });
    const pose = raceCameraPose(input);
    const distance = poseDistance(pose);
    expect(distance).toBeGreaterThanOrEqual(baseDistance() * RACE_ZOOM_FLOOR - 1e-9);
    expect(distance).toBeLessThanOrEqual(baseDistance() * RACE_ZOOM_CEILING + 1e-9);
    expect(pose.target.x).toBeCloseTo(input.lead.x + LOOK_AHEAD_DISTANCE, 6);
    expect(pose.target.z).toBeCloseTo(input.lead.z, 6);
  });

  it('holds close on the finish point once the race is finished', () => {
    const input = runningInput({ phase: 'finished', finishPoint: { x: 2, z: -4 } });
    const pose = raceCameraPose(input);
    expect(pose.target.x).toBeCloseTo(2, 6);
    expect(pose.target.z).toBeCloseTo(-4, 6);
    expect(pose.target.y).toBe(0);
    expect(poseDistance(pose)).toBeCloseTo(baseDistance() * RACE_ZOOM_FLOOR, 6);
  });

  it('tightens the finished hold by the photo-finish push amount', () => {
    const standard = raceCameraPose(runningInput({ phase: 'finished' }));
    const pose = raceCameraPose(runningInput({ phase: 'finished', push: 1 }));
    const standardDistance = poseDistance(standard);
    const pushedDistance = poseDistance(pose);
    expect(pushedDistance).toBeCloseTo(standardDistance * (1 - PHOTO_FINISH_PUSH), 6);
    // The push stays within the 10–15% tightening band beyond the close hold.
    const tightened = 1 - pushedDistance / standardDistance;
    expect(tightened).toBeGreaterThanOrEqual(0.1);
    expect(tightened).toBeLessThanOrEqual(0.15);
    expect(pose.target).toEqual(standard.target);
  });

  it('eases the finished hold back toward the standard distance as the push unwinds', () => {
    const standard = poseDistance(raceCameraPose(runningInput({ phase: 'finished' })));
    const full = poseDistance(raceCameraPose(runningInput({ phase: 'finished', push: 1 })));
    const half = poseDistance(raceCameraPose(runningInput({ phase: 'finished', push: 0.5 })));
    expect(half).toBeGreaterThan(full);
    expect(half).toBeLessThan(standard);
    expect(half).toBeCloseTo((full + standard) / 2, 6);
  });

  it('clamps the push amount so the tightening stays bounded', () => {
    const standard = raceCameraPose(runningInput({ phase: 'finished' }));
    const bounds = raceCameraPose(runningInput({ phase: 'finished', push: 1 }));
    expect(raceCameraPose(runningInput({ phase: 'finished', push: 4 }))).toEqual(bounds);
    expect(raceCameraPose(runningInput({ phase: 'finished', push: -1 }))).toEqual(standard);
  });

  it('ignores the push while running so pack framing is unaffected', () => {
    expect(raceCameraPose(runningInput({ push: 1 }))).toEqual(raceCameraPose(runningInput()));
  });

  it('leaves build and countdown placements untouched by the push', () => {
    expect(raceCameraPose(runningInput({ phase: 'build', push: 1 }))).toEqual(buildPlacement);
    expect(raceCameraPose(runningInput({ phase: 'countdown', push: 1 }))).toEqual(buildPlacement);
  });
});
