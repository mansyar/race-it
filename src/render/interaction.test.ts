import { beforeEach, describe, expect, it } from 'vitest';
import { GRID_SIZE, GridModel } from '../grid/grid-model';
import { TrackEditor } from '../grid/track-editor';
import { type BuildTool, handleCellTap } from './interaction';

describe('handleCellTap', () => {
  let model: GridModel;
  let editor: TrackEditor;

  beforeEach(() => {
    model = new GridModel();
    editor = new TrackEditor(model);
  });

  it('rotates an existing piece when no tool is selected', () => {
    model.setCell(2, 3, { type: 'straight', orientation: 0 });
    const result = handleCellTap(editor, { kind: 'none' }, 2, 3);
    expect(result).toBe('rotated');
    expect(model.getCell(2, 3)?.orientation).toBe(90);
  });

  it('ignores taps on empty cells when no tool is selected', () => {
    expect(handleCellTap(editor, { kind: 'none' }, 4, 4)).toBe('ignored');
    expect(editor.canUndo()).toBe(false);
  });

  it('places a piece on an empty cell when a piece tool is selected', () => {
    const result = handleCellTap(editor, { kind: 'piece', type: 'curve' }, 1, 1);
    expect(result).toBe('placed');
    expect(model.getCell(1, 1)).toEqual({ type: 'curve', orientation: 0 });
  });

  it("ignores placement on occupied cells (protects the kid's work)", () => {
    model.setCell(1, 1, { type: 'start', orientation: 90 });
    const result = handleCellTap(editor, { kind: 'piece', type: 'curve' }, 1, 1);
    expect(result).toBe('ignored');
    expect(model.getCell(1, 1)).toEqual({ type: 'start', orientation: 90 });
  });

  it('removes an occupied cell in remove mode', () => {
    model.setCell(2, 2, { type: 'straight', orientation: 0 });
    const result = handleCellTap(editor, { kind: 'remove' }, 2, 2);
    expect(result).toBe('removed');
    expect(model.getCell(2, 2)).toBeNull();
  });

  it('ignores remove mode on empty cells', () => {
    expect(handleCellTap(editor, { kind: 'remove' }, 5, 5)).toBe('ignored');
    expect(editor.canUndo()).toBe(false);
  });

  it('every accepted action is undoable', () => {
    handleCellTap(editor, { kind: 'piece', type: 'straight' }, 0, 0);
    handleCellTap(editor, { kind: 'none' }, 0, 0);
    handleCellTap(editor, { kind: 'remove' }, 0, 0);
    expect(model.getCell(0, 0)).toBeNull();
    editor.undo();
    expect(model.getCell(0, 0)?.orientation).toBe(90);
  });
});

describe('BuildTool type', () => {
  it('covers the three palette modes', () => {
    const tools: BuildTool[] = [
      { kind: 'none' },
      { kind: 'piece', type: 'straight' },
      { kind: 'remove' },
    ];
    expect(tools.length).toBe(3);
  });
});

describe('grid bound sanity', () => {
  it('GRID_SIZE is 12 for the interaction layer', () => {
    expect(GRID_SIZE).toBe(12);
  });
});
