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
