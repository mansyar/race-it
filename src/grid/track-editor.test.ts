import { beforeEach, describe, expect, it } from 'vitest';
import { GridModel } from './grid-model';
import { TrackEditor } from './track-editor';

let grid: GridModel;
let editor: TrackEditor;

beforeEach(() => {
  grid = new GridModel();
  editor = new TrackEditor(grid);
});

describe('TrackEditor.place', () => {
  it('places a piece on an empty cell', () => {
    editor.place(2, 3, 'curve', 90);
    expect(grid.getCell(2, 3)).toEqual({ type: 'curve', orientation: 90 });
  });

  it('replaces whatever was in the cell', () => {
    editor.place(0, 0, 'straight', 0);
    editor.place(0, 0, 'start', 180);
    expect(grid.getCell(0, 0)).toEqual({ type: 'start', orientation: 180 });
  });
});

describe('TrackEditor.rotate', () => {
  it('rotates the piece 90 degrees clockwise', () => {
    editor.place(4, 4, 'curve', 0);
    editor.rotate(4, 4);
    expect(grid.getCell(4, 4)?.orientation).toBe(90);
  });

  it('wraps 270 back to 0', () => {
    editor.place(4, 4, 'straight', 270);
    editor.rotate(4, 4);
    expect(grid.getCell(4, 4)?.orientation).toBe(0);
  });

  it('does nothing on an empty cell', () => {
    expect(() => editor.rotate(1, 1)).not.toThrow();
    expect(grid.getCell(1, 1)).toBeNull();
  });
});

describe('TrackEditor.remove', () => {
  it('deletes the piece in a cell', () => {
    editor.place(6, 7, 'finish', 0);
    editor.remove(6, 7);
    expect(grid.getCell(6, 7)).toBeNull();
  });

  it('does nothing on an empty cell', () => {
    expect(() => editor.remove(2, 2)).not.toThrow();
  });
});

describe('TrackEditor undo', () => {
  it('undoes a place', () => {
    editor.place(3, 3, 'straight', 0);
    editor.undo();
    expect(grid.getCell(3, 3)).toBeNull();
  });

  it('undoes a rotate', () => {
    editor.place(3, 3, 'curve', 0);
    editor.rotate(3, 3);
    editor.undo();
    expect(grid.getCell(3, 3)?.orientation).toBe(0);
  });

  it('undoes a remove', () => {
    editor.place(3, 3, 'finish', 90);
    editor.remove(3, 3);
    editor.undo();
    expect(grid.getCell(3, 3)).toEqual({ type: 'finish', orientation: 90 });
  });

  it('undoes operations one at a time, newest first', () => {
    editor.place(1, 1, 'straight', 0);
    editor.place(2, 1, 'curve', 90);
    editor.undo();
    expect(grid.getCell(2, 1)).toBeNull();
    expect(grid.getCell(1, 1)).toEqual({ type: 'straight', orientation: 0 });
  });

  it('reports whether there is anything to undo', () => {
    expect(editor.canUndo()).toBe(false);
    editor.place(1, 1, 'straight', 0);
    expect(editor.canUndo()).toBe(true);
    editor.undo();
    expect(editor.canUndo()).toBe(false);
  });

  it('does nothing when undoing with empty history', () => {
    expect(() => editor.undo()).not.toThrow();
  });

  it('an undo of a replaced cell restores the previous piece', () => {
    editor.place(5, 5, 'straight', 0);
    editor.place(5, 5, 'start', 180);
    editor.undo();
    expect(grid.getCell(5, 5)).toEqual({ type: 'straight', orientation: 0 });
  });
});
