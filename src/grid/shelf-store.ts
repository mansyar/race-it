import type { GridModel, GridSnapshot } from './grid-model';
import { isSnapshot } from './track-store';

/** localStorage key for the saved-track shelf. */
export const SHELF_STORAGE_KEY = 'race-it:shelf';

/** Maximum number of tracks the shelf can hold. */
export const SHELF_CAPACITY = 12;

/** One saved track on the shelf. */
export interface ShelfEntry {
  id: string;
  createdAt: number;
  snapshot: GridSnapshot;
}

/** Outcome of a shelf save: accepted, or rejected because the shelf is full. */
export type SaveShelfResult = 'saved' | 'full';

/**
 * Type guard for a persisted shelf entry; entries failing any part of the
 * shape (id, createdAt, snapshot schema) are treated as corrupt.
 */
function isEntry(value: unknown): value is ShelfEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<ShelfEntry>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'number' &&
    isSnapshot(candidate.snapshot)
  );
}

/**
 * Reads the shelf defensively: missing or corrupt JSON yields an empty shelf,
 * and corrupt entries are silently dropped so healthy saves survive.
 */
function readEntries(): ShelfEntry[] {
  const raw = localStorage.getItem(SHELF_STORAGE_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

/**
 * Saves the grid as a new shelf entry (newest first). Best-effort: storage
 * failures (quota, private-mode restrictions) must never crash the game.
 */
export function saveToShelf(grid: GridModel): SaveShelfResult {
  const entries = readEntries();
  if (entries.length >= SHELF_CAPACITY) {
    return 'full';
  }
  const entry: ShelfEntry = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    snapshot: grid.toSnapshot(),
  };
  try {
    localStorage.setItem(SHELF_STORAGE_KEY, JSON.stringify([entry, ...entries]));
  } catch {
    // Keep playing unsaved rather than interrupting the child.
  }
  return 'saved';
}

/**
 * Loads all shelf entries, newest first.
 */
export function loadShelf(): ShelfEntry[] {
  return readEntries();
}

/**
 * Removes a shelf entry by id. Best-effort: unknown ids are a no-op and
 * storage failures never crash the game.
 */
export function deleteFromShelf(id: string): void {
  const entries = readEntries();
  const next = entries.filter((entry) => entry.id !== id);
  if (next.length === entries.length) {
    return;
  }
  try {
    localStorage.setItem(SHELF_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep playing unsaved rather than interrupting the child.
  }
}
