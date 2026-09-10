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

describe('style.css hidden-attribute contract', () => {
  it('visually hides the race pause overlay when [hidden] is set', () => {
    expect(hidesWhenHidden('.race-overlay')).toBe(true);
  });

  it('visually hides the quit confirm when [hidden] is set', () => {
    expect(hidesWhenHidden('.race-confirm')).toBe(true);
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
