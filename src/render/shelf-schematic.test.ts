import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE,
  GridModel,
  type GridSnapshot,
  type Orientation,
  type PieceType,
} from '../grid/grid-model';
import {
  drawSchematic,
  FINISH_DARK,
  FINISH_LIGHT,
  type SchematicContext,
  type SchematicRect,
  START_FILL,
  schematicGlyphs,
  schematicRects,
} from './shelf-schematic';

/** Builds a snapshot with the given pieces. */
function gridWith(pieces: Array<[number, number, PieceType, Orientation]>): GridSnapshot {
  const grid = new GridModel();
  for (const [x, y, type, orientation] of pieces) {
    grid.setCell(x, y, { type, orientation });
  }
  return grid.toSnapshot();
}

const SIZE = 120;
const CELL = SIZE / GRID_SIZE;

/** Records fillRect calls along with the fillStyle active at call time. */
function fakeCtx(): SchematicContext & { calls: Array<{ fill: string; rect: SchematicRect }> } {
  const calls: Array<{ fill: string; rect: SchematicRect }> = [];
  let currentFill = '';
  return {
    get fillStyle(): string {
      return currentFill;
    },
    set fillStyle(value: string) {
      currentFill = value;
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      calls.push({ fill: currentFill, rect: { x, y, w, h, fill: currentFill } });
    },
    calls,
  };
}

function touchesSouth(rect: SchematicRect): boolean {
  return Math.abs(rect.y + rect.h - CELL) < 1e-9;
}

function touchesNorth(rect: SchematicRect): boolean {
  return Math.abs(rect.y) < 1e-9;
}

function touchesEast(rect: SchematicRect): boolean {
  return Math.abs(rect.x + rect.w - CELL) < 1e-9;
}

function touchesWest(rect: SchematicRect): boolean {
  return Math.abs(rect.x) < 1e-9;
}

describe('schematicGlyphs', () => {
  it('extracts glyphs at grid positions with orientations', () => {
    const snapshot = gridWith([
      [2, 3, 'straight', 0],
      [4, 4, 'curve', 90],
      [1, 1, 'start', 180],
      [6, 7, 'finish', 270],
    ]);
    expect(schematicGlyphs(snapshot)).toEqual([
      { x: 1, y: 1, type: 'start', orientation: 180 },
      { x: 2, y: 3, type: 'straight', orientation: 0 },
      { x: 4, y: 4, type: 'curve', orientation: 90 },
      { x: 6, y: 7, type: 'finish', orientation: 270 },
    ]);
  });

  it('returns no glyphs for an empty grid', () => {
    expect(schematicGlyphs(new GridModel().toSnapshot())).toEqual([]);
  });

  it('handles a mixed snapshot without exceptions', () => {
    const snapshot = gridWith([
      [0, 0, 'curve', 270],
      [1, 0, 'straight', 90],
      [2, 0, 'curve', 90],
      [0, 1, 'straight', 0],
      [2, 1, 'straight', 0],
      [0, 2, 'curve', 0],
      [1, 2, 'start', 90],
      [2, 2, 'curve', 180],
    ]);
    expect(schematicGlyphs(snapshot)).toHaveLength(8);
  });
});

describe('schematicRects', () => {
  it('draws a vertical bar for a straight piece at orientation 0', () => {
    const rects = schematicRects([{ x: 0, y: 0, type: 'straight', orientation: 0 }], SIZE);
    expect(rects).toHaveLength(1);
    expect(rects[0]?.h).toBeGreaterThan(rects[0]?.w ?? 0);
  });

  it('draws a horizontal bar for a straight piece at orientation 90', () => {
    const rects = schematicRects([{ x: 0, y: 0, type: 'straight', orientation: 90 }], SIZE);
    expect(rects).toHaveLength(1);
    expect(rects[0]?.w).toBeGreaterThan(rects[0]?.h ?? 0);
  });

  it('keeps every rect inside the canvas bounds for a mixed grid', () => {
    const snapshot = gridWith([
      [0, 0, 'curve', 270],
      [1, 0, 'straight', 90],
      [5, 5, 'curve', 180],
      [11, 11, 'curve', 0],
      [3, 8, 'start', 0],
      [9, 2, 'finish', 90],
      [11, 0, 'straight', 0],
      [0, 11, 'straight', 270],
    ]);
    for (const rect of schematicRects(schematicGlyphs(snapshot), SIZE)) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(SIZE + 1e-9);
      expect(rect.y + rect.h).toBeLessThanOrEqual(SIZE + 1e-9);
    }
  });

  it('scales rects with the canvas size', () => {
    const glyphs = [{ x: 2, y: 3, type: 'straight' as const, orientation: 0 as const }];
    const small = schematicRects(glyphs, 60);
    const large = schematicRects(glyphs, 120);
    expect(large[0]?.x).toBeCloseTo((small[0]?.x ?? 0) * 2);
    expect(large[0]?.w).toBeCloseTo((small[0]?.w ?? 0) * 2);
  });

  it('marks the start pad with the start fill', () => {
    const rects = schematicRects([{ x: 0, y: 0, type: 'start', orientation: 0 }], SIZE);
    expect(rects.some((r) => r.fill === START_FILL)).toBe(true);
  });

  it('renders a checkered finish', () => {
    const rects = schematicRects([{ x: 0, y: 0, type: 'finish', orientation: 0 }], SIZE);
    const fills = new Set(rects.map((r) => r.fill));
    expect(fills.has(FINISH_DARK)).toBe(true);
    expect(fills.has(FINISH_LIGHT)).toBe(true);
    expect(rects.filter((r) => r.fill === FINISH_DARK)).toHaveLength(5);
  });

  it('routes the curve at orientation 0 between south and east edges', () => {
    const rects = schematicRects([{ x: 0, y: 0, type: 'curve', orientation: 0 }], SIZE);
    expect(rects.some(touchesSouth)).toBe(true);
    expect(rects.some(touchesEast)).toBe(true);
    expect(rects.some(touchesNorth)).toBe(false);
    expect(rects.some(touchesWest)).toBe(false);
  });

  it('routes the curve at orientation 270 between north and east edges', () => {
    const rects = schematicRects([{ x: 0, y: 0, type: 'curve', orientation: 270 }], SIZE);
    expect(rects.some(touchesNorth)).toBe(true);
    expect(rects.some(touchesEast)).toBe(true);
    expect(rects.some(touchesSouth)).toBe(false);
    expect(rects.some(touchesWest)).toBe(false);
  });
});

describe('drawSchematic', () => {
  it('paints exactly the computed rects with matching fills', () => {
    const snapshot = gridWith([
      [0, 0, 'curve', 270],
      [1, 0, 'straight', 90],
      [5, 5, 'start', 0],
      [9, 2, 'finish', 90],
    ]);
    const ctx = fakeCtx();
    drawSchematic(ctx, snapshot, SIZE);
    const expected = schematicRects(schematicGlyphs(snapshot), SIZE);
    expect(ctx.calls).toHaveLength(expected.length);
    expected.forEach((rect, index) => {
      const call = ctx.calls[index];
      if (!call) {
        throw new Error(`missing paint call at index ${index}`);
      }
      expect(call.fill).toBe(rect.fill);
      expect(call.rect).toEqual(rect);
    });
  });

  it('paints nothing for an empty grid', () => {
    const ctx = fakeCtx();
    drawSchematic(ctx, new GridModel().toSnapshot(), SIZE);
    expect(ctx.calls).toHaveLength(0);
  });
});
