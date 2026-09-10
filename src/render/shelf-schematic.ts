import { GRID_SIZE, type GridSnapshot, type Orientation } from '../grid/grid-model';

/** Road fill for schematic bars and elbows. */
export const ROAD_FILL = '#b8c2cc';

/** Accent fill marking the start pad. */
export const START_FILL = '#6fbf73';

/** Light squares of the finish checker. */
export const FINISH_LIGHT = '#f2f5f7';

/** Dark squares of the finish checker. */
export const FINISH_DARK = '#5b6770';

/** Road thickness as a fraction of a cell. */
const ROAD_THICKNESS = 0.35;

/** Inset from the cell edge where the road centerline sits. */
const ROAD_INSET = (1 - ROAD_THICKNESS) / 2;

/** A piece to draw on a shelf card, in grid coordinates. */
export interface SchematicGlyph {
  x: number;
  y: number;
  type: 'straight' | 'curve' | 'start' | 'finish';
  orientation: Orientation;
}

/** One painted rectangle of a schematic, in canvas pixels. */
export interface SchematicRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

/** Minimal 2D context surface used to rasterize a schematic. */
export interface SchematicContext {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Orientation convention for glyphs: 0/180 run the road north-south,
 * 90/270 run it east-west; curves connect the two edges implied by the
 * same rotation as their 3D tile.
 */

/**
 * Extracts the pieces to draw from a snapshot, one glyph per occupied cell
 * (index layout: y * GRID_SIZE + x).
 */
export function schematicGlyphs(snapshot: GridSnapshot): SchematicGlyph[] {
  const glyphs: SchematicGlyph[] = [];
  for (let i = 0; i < snapshot.length; i++) {
    const cell = snapshot[i];
    if (cell !== null) {
      glyphs.push({
        x: i % GRID_SIZE,
        y: Math.floor(i / GRID_SIZE),
        type: cell.type,
        orientation: cell.orientation,
      });
    }
  }
  return glyphs;
}

/** Builds the rects for a straight road segment at (cx, cy). */
function straightRects(
  cx: number,
  cy: number,
  cell: number,
  orientation: Orientation,
): SchematicRect[] {
  const horizontal = orientation === 90 || orientation === 270;
  return [
    horizontal
      ? { x: cx, y: cy + ROAD_INSET * cell, w: cell, h: ROAD_THICKNESS * cell, fill: ROAD_FILL }
      : { x: cx + ROAD_INSET * cell, y: cy, w: ROAD_THICKNESS * cell, h: cell, fill: ROAD_FILL },
  ];
}

/** Elbow rects per orientation: [dx, dy, w, h] relative to the cell origin. */
const CURVE_LEGS: Record<Orientation, Array<[number, number, number, number]>> = {
  0: [
    [ROAD_INSET, ROAD_INSET, ROAD_THICKNESS, 1 - ROAD_INSET],
    [ROAD_INSET, ROAD_INSET, 1 - ROAD_INSET, ROAD_THICKNESS],
  ],
  90: [
    [0, ROAD_INSET, 1 - ROAD_INSET, ROAD_THICKNESS],
    [ROAD_INSET, ROAD_INSET, ROAD_THICKNESS, 1 - ROAD_INSET],
  ],
  180: [
    [0, ROAD_INSET, 1 - ROAD_INSET, ROAD_THICKNESS],
    [ROAD_INSET, 0, ROAD_THICKNESS, 1 - ROAD_INSET],
  ],
  270: [
    [ROAD_INSET, 0, ROAD_THICKNESS, 1 - ROAD_INSET],
    [ROAD_INSET, ROAD_INSET, 1 - ROAD_INSET, ROAD_THICKNESS],
  ],
};

/** Builds the rects for a curve elbow at (cx, cy). */
function curveRects(
  cx: number,
  cy: number,
  cell: number,
  orientation: Orientation,
): SchematicRect[] {
  return CURVE_LEGS[orientation].map(([dx, dy, w, h]) => ({
    x: cx + dx * cell,
    y: cy + dy * cell,
    w: w * cell,
    h: h * cell,
    fill: ROAD_FILL,
  }));
}

/** Builds the rects for a start piece: road bar plus an accent pad. */
function startRects(
  cx: number,
  cy: number,
  cell: number,
  orientation: Orientation,
): SchematicRect[] {
  const pad = cell * 0.3;
  return [
    ...straightRects(cx, cy, cell, orientation),
    { x: cx + (cell - pad) / 2, y: cy + (cell - pad) / 2, w: pad, h: pad, fill: START_FILL },
  ];
}

/** Builds the rects for a finish piece: a full-cell checker. */
function finishRects(cx: number, cy: number, cell: number): SchematicRect[] {
  const rects: SchematicRect[] = [{ x: cx, y: cy, w: cell, h: cell, fill: FINISH_LIGHT }];
  const square = cell / 3;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if ((row + col) % 2 === 0) {
        rects.push({
          x: cx + col * square,
          y: cy + row * square,
          w: square,
          h: square,
          fill: FINISH_DARK,
        });
      }
    }
  }
  return rects;
}

/**
 * Computes the paint list for the given glyphs on a square canvas of
 * `size` pixels. Pure: no drawing happens here.
 */
export function schematicRects(glyphs: SchematicGlyph[], size: number): SchematicRect[] {
  const cell = size / GRID_SIZE;
  const rects: SchematicRect[] = [];
  for (const glyph of glyphs) {
    const cx = glyph.x * cell;
    const cy = glyph.y * cell;
    if (glyph.type === 'straight') {
      rects.push(...straightRects(cx, cy, cell, glyph.orientation));
    } else if (glyph.type === 'curve') {
      rects.push(...curveRects(cx, cy, cell, glyph.orientation));
    } else if (glyph.type === 'start') {
      rects.push(...startRects(cx, cy, cell, glyph.orientation));
    } else {
      rects.push(...finishRects(cx, cy, cell));
    }
  }
  return rects;
}

/**
 * Draws a top-down track schematic onto the given 2D context. The caller
 * owns the canvas background; this only paints the track pieces.
 */
export function drawSchematic(ctx: SchematicContext, snapshot: GridSnapshot, size: number): void {
  for (const rect of schematicRects(schematicGlyphs(snapshot), size)) {
    ctx.fillStyle = rect.fill;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}
