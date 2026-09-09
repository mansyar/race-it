import { describe, expect, it } from 'vitest';
import { SEGMENT_LENGTH } from '../race/engine';
import type { LoopCell } from '../race/path';
import { kartPose } from './kart-rig';

const eightCellLoop: LoopCell[] = [
  { x: 3, y: 2, type: 'start', orientation: 90 },
  { x: 4, y: 2, type: 'curve', orientation: 180 },
  { x: 4, y: 3, type: 'straight', orientation: 0 },
  { x: 4, y: 4, type: 'curve', orientation: 270 },
  { x: 3, y: 4, type: 'straight', orientation: 90 },
  { x: 2, y: 4, type: 'curve', orientation: 0 },
  { x: 2, y: 3, type: 'straight', orientation: 0 },
  { x: 2, y: 2, type: 'curve', orientation: 90 },
];

// gridToWorld: worldX = x*2 - 11, worldZ = y*2 - 11
const cellWorld = (x: number, y: number) => ({ x: x * 2 - 11, z: y * 2 - 11 });

describe('kartPose', () => {
  it('places a kart at the start cell center facing the first segment at progress 0', () => {
    const pose = kartPose(eightCellLoop, 0, 0);
    expect(pose.x).toBeCloseTo(cellWorld(3, 2).x);
    expect(pose.z).toBeCloseTo(cellWorld(3, 2).z);
    expect(pose.heading).toBeCloseTo(0); // first step heads east
  });

  it('interpolates along the middle of a segment', () => {
    const pose = kartPose(eightCellLoop, SEGMENT_LENGTH / 2, 0);
    expect(pose.x).toBeCloseTo(-4); // midpoint between (3,2) and (4,2)
    expect(pose.z).toBeCloseTo(-7);
    expect(pose.heading).toBeCloseTo(0);
  });

  it('snaps to the next cell center at a segment boundary', () => {
    const pose = kartPose(eightCellLoop, SEGMENT_LENGTH, 0);
    expect(pose.x).toBeCloseTo(cellWorld(4, 2).x);
    expect(pose.z).toBeCloseTo(cellWorld(4, 2).z);
  });

  it('follows the southward tangent after the first corner', () => {
    const pose = kartPose(eightCellLoop, SEGMENT_LENGTH * 1.5, 0);
    expect(pose.x).toBeCloseTo(-3);
    expect(pose.z).toBeCloseTo(-6);
    expect(pose.heading).toBeCloseTo(-Math.PI / 2);
  });

  it('follows the northward tangent on the return leg', () => {
    const pose = kartPose(eightCellLoop, SEGMENT_LENGTH * 6.5, 0);
    expect(pose.x).toBeCloseTo(-7);
    expect(pose.z).toBeCloseTo(-6);
    expect(pose.heading).toBeCloseTo(Math.PI / 2);
  });

  it('offsets the kart perpendicular to the heading by the lane distance', () => {
    const lane = 0.35;
    const pose = kartPose(eightCellLoop, SEGMENT_LENGTH / 2, lane);
    const forward = { x: 1, z: 0 }; // heading 0
    const delta = { x: pose.x - -4, z: pose.z - -7 };
    expect(delta.x * forward.x + delta.z * forward.z).toBeCloseTo(0); // perpendicular
    expect(Math.hypot(delta.x, delta.z)).toBeCloseTo(lane);
    expect(pose.heading).toBeCloseTo(0);
  });

  it('places karts behind the line for negative progress (row spacing)', () => {
    const pose = kartPose(eightCellLoop, -1.2, 0);
    expect(pose.x).toBeCloseTo(-6.2); // 1.2 units back along the tail segment
    expect(pose.z).toBeCloseTo(-7);
    expect(pose.heading).toBeCloseTo(0); // still facing forward
  });

  it('wraps progress at the lap length back to the start pose', () => {
    const lap = eightCellLoop.length * SEGMENT_LENGTH;
    const pose = kartPose(eightCellLoop, lap, 0);
    expect(pose.x).toBeCloseTo(cellWorld(3, 2).x);
    expect(pose.z).toBeCloseTo(cellWorld(3, 2).z);
    expect(pose.heading).toBeCloseTo(0);
  });

  it('wraps progress beyond the lap length modulo the loop', () => {
    const lap = eightCellLoop.length * SEGMENT_LENGTH;
    const pose = kartPose(eightCellLoop, lap + SEGMENT_LENGTH / 2, 0);
    expect(pose.x).toBeCloseTo(-4);
    expect(pose.z).toBeCloseTo(-7);
  });

  it('runs straight along an east-west straight path with west heading on return', () => {
    const straightPath: LoopCell[] = [
      { x: 0, y: 0, type: 'start', orientation: 90 },
      { x: 1, y: 0, type: 'straight', orientation: 90 },
      { x: 2, y: 0, type: 'straight', orientation: 90 },
      { x: 3, y: 0, type: 'straight', orientation: 90 },
    ];
    const mid = kartPose(straightPath, SEGMENT_LENGTH * 1.5, 0);
    expect(mid.x).toBeCloseTo(-8); // between (1,0) and (2,0)
    expect(mid.z).toBeCloseTo(-11);
    expect(mid.heading).toBeCloseTo(0);
    const returnMid = kartPose(straightPath, SEGMENT_LENGTH * 3.5, 0);
    expect(returnMid.x).toBeCloseTo(-8); // between (3,0) and (0,0)
    expect(returnMid.z).toBeCloseTo(-11);
    expect(Math.abs(returnMid.heading)).toBeCloseTo(Math.PI); // facing west
  });
});
