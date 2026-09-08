import type { PieceType } from '../grid/grid-model';
import type { TrackEditor } from '../grid/track-editor';

/** The currently selected palette tool. */
export type BuildTool = { kind: 'none' } | { kind: 'piece'; type: PieceType } | { kind: 'remove' };

export type TapResult = 'placed' | 'rotated' | 'removed' | 'ignored';

/**
 * Applies one board tap for the current tool: with no tool selected a tap
 * rotates the tapped piece; with a piece tool it fills an empty cell (occupied
 * cells are protected so kids cannot destroy work by accident); remove mode
 * deletes a piece.
 */
export function handleCellTap(
  editor: TrackEditor,
  tool: BuildTool,
  x: number,
  y: number,
): TapResult {
  if (tool.kind === 'piece') {
    const cell = editor.getCell(x, y);
    if (cell) {
      return 'ignored';
    }
    editor.place(x, y, tool.type, 0);
    return 'placed';
  }
  if (tool.kind === 'remove') {
    if (!editor.getCell(x, y)) {
      return 'ignored';
    }
    editor.remove(x, y);
    return 'removed';
  }
  if (!editor.getCell(x, y)) {
    return 'ignored';
  }
  editor.rotate(x, y);
  return 'rotated';
}
