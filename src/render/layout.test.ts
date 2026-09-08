import { describe, expect, it } from 'vitest';
import {
  BOARD_WORLD_SIZE,
  CELL_WORLD_SIZE,
  computeCameraPlacement,
  gridToWorld,
  worldToGrid,
} from './layout';

describe('world layout constants', () => {
  it('derives board size from cell size', () => {
    expect(CELL_WORLD_SIZE).toBeGreaterThan(0);
    expect(BOARD_WORLD_SIZE).toBe(CELL_WORLD_SIZE * 12);
  });
});

describe('gridToWorld', () => {
  it('places cell (0,0) in the top-left quadrant of the board', () => {
    const pos = gridToWorld(0, 0);
    expect(pos.x).toBeLessThan(0);
    expect(pos.z).toBeLessThan(0);
  });

  it('places cell (11,11) in the bottom-right quadrant of the board', () => {
    const pos = gridToWorld(11, 11);
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.z).toBeGreaterThan(0);
  });

  it('centers the board on the origin: cell (5.5,5.5) maps to 0,0', () => {
    const pos = gridToWorld(5, 5);
    const half = CELL_WORLD_SIZE / 2;
    expect(pos.x).toBeCloseTo(-half);
    expect(pos.z).toBeCloseTo(-half);
  });

  it('moves east (x+) when the column increases and south (z+) when the row increases', () => {
    const a = gridToWorld(2, 3);
    const b = gridToWorld(3, 3);
    const c = gridToWorld(3, 4);
    expect(b.x - a.x).toBeCloseTo(CELL_WORLD_SIZE);
    expect(c.z - b.z).toBeCloseTo(CELL_WORLD_SIZE);
  });
});

describe('worldToGrid', () => {
  it('is the inverse of gridToWorld', () => {
    for (const [gx, gy] of [
      [0, 0],
      [5, 7],
      [11, 11],
      [3, 2],
    ] as const) {
      const pos = gridToWorld(gx, gy);
      expect(worldToGrid(pos.x, pos.z)).toEqual({ x: gx, y: gy });
    }
  });

  it('returns null for taps outside the board', () => {
    const beyond = BOARD_WORLD_SIZE / 2 + CELL_WORLD_SIZE;
    expect(worldToGrid(beyond, 0)).toBeNull();
    expect(worldToGrid(0, -beyond)).toBeNull();
  });
});

describe('computeCameraPlacement', () => {
  it('looks at the board center from above and behind (diorama tilt)', () => {
    const cam = computeCameraPlacement(1);
    expect(cam.target.x).toBeCloseTo(0);
    expect(cam.target.z).toBeCloseTo(0);
    expect(cam.position.y).toBeGreaterThan(0);
  });

  it('keeps the same viewing angle regardless of aspect ratio (only distance adjusts)', () => {
    const portrait = computeCameraPlacement(0.6);
    const landscape = computeCameraPlacement(1.8);
    const verticalAngle = (cam: ReturnType<typeof computeCameraPlacement>): number =>
      Math.atan2(cam.position.y, Math.hypot(cam.position.x, cam.position.z));
    expect(verticalAngle(portrait)).toBeCloseTo(verticalAngle(landscape));
  });

  it('frames the whole board: wider view (smaller aspect) needs more distance', () => {
    const portrait = computeCameraPlacement(0.6);
    const landscape = computeCameraPlacement(1.8);
    const dist = (cam: ReturnType<typeof computeCameraPlacement>): number =>
      Math.hypot(cam.position.x, cam.position.y, cam.position.z);
    expect(dist(portrait)).toBeGreaterThan(dist(landscape));
  });
});
