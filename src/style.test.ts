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

/** Raw index.html text, for viewport-level contracts. */
const indexHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
  'utf8',
);

/** Returns declaration bodies of every rule whose selector list includes `selector`. */
function declarationBodies(selector: string): string[] {
  const bodies: string[] = [];
  for (const block of uncommented.split('}')) {
    const [header = '', ...rest] = block.split('{');
    if (rest.length === 0) continue;
    const selectsIt = header.split(',').some((part) => part.trim() === selector);
    if (selectsIt) bodies.push(rest.join('{'));
  }
  return bodies;
}

/** True when a rule selecting `selector` declares `property` with a matching value. */
function declares(selector: string, property: string, value: RegExp): boolean {
  return declarationBodies(selector).some((body) =>
    new RegExp(`(^|[;\\s])${property}\\s*:\\s*${value.source}`).test(body),
  );
}

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

/** True when the rule for `selector` declares min-size both >= `target` px. */
function hasMinTargetSize(selector: string, target: number): boolean {
  return uncommented.split('}').some((block) => {
    const [header = '', ...bodies] = block.split('{');
    if (bodies.length === 0) return false;
    if (!header.split(',').some((part) => part.trim() === selector)) return false;
    const body = bodies.join('{');
    const minWidth = /min-width:\s*(\d+)px/.exec(body);
    const minHeight = /min-height:\s*(\d+)px/.exec(body);
    return (
      minWidth !== null &&
      minHeight !== null &&
      Number(minWidth[1]) >= target &&
      Number(minHeight[1]) >= target
    );
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

describe('style.css gesture hardening contract', () => {
  it('disables overscroll bounce on html and body', () => {
    expect(declares('html', 'overscroll-behavior', /none/)).toBe(true);
    expect(declares('body', 'overscroll-behavior', /none/)).toBe(true);
  });

  it('suppresses the iOS long-press callout on html and body', () => {
    expect(declares('html', '-webkit-touch-callout', /none/)).toBe(true);
    expect(declares('body', '-webkit-touch-callout', /none/)).toBe(true);
  });

  it('disables double-tap zoom on the app root', () => {
    expect(declares('html', 'touch-action', /manipulation/)).toBe(true);
    expect(declares('body', 'touch-action', /manipulation/)).toBe(true);
  });
});

describe('index.html zoom defense contract', () => {
  it('keeps user-scalable=no in the viewport meta', () => {
    expect(indexHtml).toMatch(/name="viewport" content="[^"]*user-scalable=no/);
  });
});

describe('style.css Build Again button contract', () => {
  it('gives the Build Again button a >=64px touch target', () => {
    expect(hasMinTargetSize('.build-again-button', 64)).toBe(true);
  });
});
