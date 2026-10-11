// Export visibility settings: defaults, safe loading of older / damaged settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, normalizeExportVisibility, defaultExportVisibility, EXPORT_VISIBILITY_KEYS } from '../../src/storage.js';

test('all four export options default to on', () => {
  assert.deepEqual(defaultExportVisibility(), { baseSalary: true, time: true, hours: true, amount: true });
  assert.deepEqual(EXPORT_VISIBILITY_KEYS, ['baseSalary', 'time', 'hours', 'amount']);
  assert.deepEqual(normalizeSettings(null).exportVisibility, defaultExportVisibility());
});

test('older settings without the option load with everything on and keep every other preference', () => {
  const older = { currency: 'NZD', theme: 'dark', payCycleLengthDays: 7, calculateDurationFromEndTime: true, defaults: { startTime: '07:30' }, jobs: [{ id: 'j1', name: 'Cafe', payCalculationMode: 'hourlyRate', baseRate: 28 }] };
  const s = normalizeSettings(older);
  assert.deepEqual(s.exportVisibility, defaultExportVisibility());
  assert.equal(s.currency, 'NZD');
  assert.equal(s.theme, 'dark');
  assert.equal(s.payCycleLengthDays, 7);
  assert.equal(s.calculateDurationFromEndTime, true);
  assert.equal(s.defaults.startTime, '07:30');
  assert.equal(s.jobs[0].name, 'Cafe');
});

test('saved choices are kept exactly', () => {
  const s = normalizeSettings({ exportVisibility: { baseSalary: false, time: true, hours: false, amount: true } });
  assert.deepEqual(s.exportVisibility, { baseSalary: false, time: true, hours: false, amount: true });
});

test('damaged values fall back to on, unknown keys are dropped', () => {
  assert.deepEqual(normalizeExportVisibility('nope'), defaultExportVisibility());
  assert.deepEqual(normalizeExportVisibility([false, false]), defaultExportVisibility());
  assert.deepEqual(normalizeExportVisibility({ time: 'no', hours: 0, amount: false, evil: false }), { baseSalary: true, time: true, hours: true, amount: false });
  assert.deepEqual(normalizeSettings({ exportVisibility: null }).exportVisibility, defaultExportVisibility());
});
