import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Style contract tests. jsdom never applies the project stylesheet, so the
 * DOM tests in src/ui/ cannot catch the bug class where an author `display`
 * rule defeats the HTML `hidden` attribute. These tests read the stylesheet
 * text directly and assert the overrides exist.
 */
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'style.css'), 'utf8');

/** Strips comments so a commented-out rule can never satisfy the contract. */
const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** True when `selector[hidden]` appears in a rule that sets `display: none`. */
function hidesWhenHidden(selector: string): boolean {
  const target = `${selector}[hidden]`;
  return uncommented.split('}').some((block) => {
    const [header = '', ...bodies] = block.split('{');
    if (bodies.length === 0) return false;
    const selectsIt = header.split(',').some((part) => part.trim() === target);
    return selectsIt && /(^|[;\s])display:\s*none\b/.test(bodies.join('{'));
  });
}

describe('style.css hidden-attribute contract', () => {
  it('visually hides the race pause overlay when [hidden] is set', () => {
    expect(hidesWhenHidden('.race-overlay')).toBe(true);
  });

  it('visually hides the quit confirm when [hidden] is set', () => {
    expect(hidesWhenHidden('.race-confirm')).toBe(true);
  });
});

/**
 * Brace-balanced body of the first `@media (max-height: <limit>px)` block,
 * or null when no such block exists.
 */
function maxHeightBlock(limitPx: number): string | null {
  const marker = new RegExp(`@media\\s*\\(max-height:\\s*${limitPx}px\\)`);
  const match = marker.exec(uncommented);
  if (!match) {
    return null;
  }
  let depth = 0;
  for (let i = match.index; i < uncommented.length; i += 1) {
    if (uncommented[i] === '{') {
      depth += 1;
    } else if (uncommented[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return uncommented.slice(match.index, i + 1);
      }
    }
  }
  return null;
}

/** Rule body for `selector` within `scope` (defaults to the whole stylesheet). */
function ruleBody(selector: string, scope: string = uncommented): string | null {
  for (const chunk of scope.split('}')) {
    const [header = '', ...bodies] = chunk.split('{');
    if (bodies.length === 0) {
      continue;
    }
    const head = header.split('\n').at(-1)?.trim();
    if (head === selector) {
      return bodies.join('{');
    }
  }
  return null;
}

/** Rule body for `selector` inside the short-viewport media block, or null. */
function shortViewportRule(selector: string): string | null {
  const block = maxHeightBlock(520);
  return block === null ? null : ruleBody(selector, block);
}

describe('style.css car picker layout contract', () => {
  it('lays the swatches out as a 2x2 grid on the styled container', () => {
    const rule = ruleBody('.car-picker__grid');
    expect(rule, 'missing .car-picker__grid rule').not.toBeNull();
    expect(/(^|[;\s])display:\s*grid\b/.test(rule ?? '')).toBe(true);
    expect(/grid-template-columns:\s*repeat\(2,/.test(rule ?? '')).toBe(true);
  });
});

describe('style.css short-viewport car picker contract', () => {
  it('compacts the picker so RACE stays fully reachable on a landscape phone', () => {
    const rule = shortViewportRule('.car-picker__race');
    expect(rule, 'missing .car-picker__race rule in the max-height: 520px block').not.toBeNull();
    const minHeight = /min-height:\s*(\d+(?:\.\d+)?)px/.exec(rule ?? '');
    expect(Number(minHeight?.[1] ?? 0)).toBeGreaterThanOrEqual(64);
  });

  it('keeps swatch touch targets at least 64px in the compact layout', () => {
    const rule = shortViewportRule('.swatch');
    expect(rule, 'missing .swatch rule in the max-height: 520px block').not.toBeNull();
    const minWidth = /min-width:\s*(\d+(?:\.\d+)?)px/.exec(rule ?? '');
    const minHeight = /min-height:\s*(\d+(?:\.\d+)?)px/.exec(rule ?? '');
    expect(Number(minWidth?.[1] ?? 0)).toBeGreaterThanOrEqual(64);
    expect(Number(minHeight?.[1] ?? 0)).toBeGreaterThanOrEqual(64);
  });
});
