import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pressHoldRemaining, PRESSABLE, MIN_PRESS_MS } from '../../src/press.js';

const css = fs.readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');

test('a quick tap keeps the pressed look for the minimum time', () => {
  assert.equal(pressHoldRemaining(1000, 1000), MIN_PRESS_MS);
  assert.equal(pressHoldRemaining(1000, 1040), MIN_PRESS_MS - 40);
  assert.equal(pressHoldRemaining(1000, 1500), 0);
  assert.equal(pressHoldRemaining(1000, 900), MIN_PRESS_MS); // clock oddities never lengthen it
});

test('every pressable control has a touch pressed style', () => {
  for (const selector of PRESSABLE.split(',').map((s) => s.trim())) {
    const escaped = selector.replace('.', '\\.');
    assert.match(css, new RegExp(`${escaped}\\.is-pressed`), `${selector} needs an .is-pressed rule`);
  }
});

test('reduced motion and Minimal keep touch presses still', () => {
  assert.match(css, /:root\[data-motion="minimal"\] \.is-pressed/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.is-pressed/);
});
