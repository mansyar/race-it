import { describe, expect, it } from 'vitest';
import type { CameraPlacement } from './layout';
import { MAX_DRIFT, MAX_ORBIT_RAD, PUSH_IN_MAX, raceCameraPose } from './race-camera';

const buildPlacement: CameraPlacement = {
  position: { x: 0, y: 15.32, z: 12.86 },
  target: { x: 0, y: 0, z: 1.2 },
};

const angleBetween = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number => {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const norm = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  return Math.acos(Math.min(1, Math.max(-1, dot / norm)));
};

describe('raceCameraPose', () => {
  it('returns the build placement untouched in build phase', () => {
    const pose = raceCameraPose('build', { x: 4, z: 0 }, 0, buildPlacement);
    expect(pose).toEqual(buildPlacement);
  });

  it('returns the build placement untouched during countdown', () => {
    const pose = raceCameraPose('countdown', { x: 4, z: 0 }, 0, buildPlacement);
    expect(pose).toEqual(buildPlacement);
  });

  it('keeps the build placement when the lead kart is at the camera focus', () => {
    const pose = raceCameraPose('running', { x: 0, z: 1.2 }, 0, buildPlacement);
    expect(pose.position.x).toBeCloseTo(buildPlacement.position.x);
    expect(pose.position.z).toBeCloseTo(buildPlacement.position.z);
    expect(pose.target.x).toBeCloseTo(buildPlacement.target.x);
    expect(pose.target.z).toBeCloseTo(buildPlacement.target.z);
  });

  it('drifts the target toward a distant lead kart but clamps to the max drift', () => {
    const pose = raceCameraPose('running', { x: 50, z: 0 }, 0, buildPlacement);
    const offsetX = pose.target.x - buildPlacement.target.x;
    expect(offsetX).toBeGreaterThan(0);
    expect(offsetX).toBeLessThanOrEqual(MAX_DRIFT + 1e-9);
  });

  it('bounds the orbit to the max orbit angle', () => {
    const pose = raceCameraPose('running', { x: 50, z: -50 }, 0, buildPlacement);
    const dir = {
      x: pose.position.x - pose.target.x,
      y: pose.position.y - pose.target.y,
      z: pose.position.z - pose.target.z,
    };
    const baseDir = {
      x: buildPlacement.position.x - buildPlacement.target.x,
      y: buildPlacement.position.y - buildPlacement.target.y,
      z: buildPlacement.position.z - buildPlacement.target.z,
    };
    expect(angleBetween(dir, baseDir)).toBeLessThanOrEqual(MAX_ORBIT_RAD + 1e-9);
  });

  it('pushes the camera in toward the target during drift', () => {
    const pose = raceCameraPose('running', { x: 50, z: 0 }, 0, buildPlacement);
    const dist = Math.hypot(
      pose.position.x - pose.target.x,
      pose.position.y - pose.target.y,
      pose.position.z - pose.target.z,
    );
    const baseDist = Math.hypot(
      buildPlacement.position.x - buildPlacement.target.x,
      buildPlacement.position.y - buildPlacement.target.y,
      buildPlacement.position.z - buildPlacement.target.z,
    );
    expect(dist).toBeLessThan(baseDist);
    expect(dist).toBeGreaterThanOrEqual(baseDist * (1 - PUSH_IN_MAX));
  });

  it('settles back onto the build placement as the race nears completion', () => {
    const early = raceCameraPose('running', { x: 50, z: 0 }, 0.1, buildPlacement);
    const late = raceCameraPose('running', { x: 50, z: 0 }, 0.9, buildPlacement);
    expect(Math.abs(late.target.x - buildPlacement.target.x)).toBeLessThan(
      Math.abs(early.target.x - buildPlacement.target.x),
    );
  });

  it('returns the build placement once the race is finished', () => {
    const pose = raceCameraPose('finished', { x: 50, z: 0 }, 1, buildPlacement);
    expect(pose).toEqual(buildPlacement);
  });

  it('leaves the aspect-dependent build placement untouched in countdown', () => {
    const wide: CameraPlacement = {
      position: { x: 0, y: 12.1, z: 9.4 },
      target: { x: 0, y: 0, z: 1.2 },
    };
    const pose = raceCameraPose('countdown', { x: 3, z: 2 }, 0, wide);
    expect(pose).toEqual(wide);
  });
});
