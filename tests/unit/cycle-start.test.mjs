// Pay cycle start day: weekly cycles on any weekday, longer cycles from a chosen date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCycleForDate, groupByCycle, cycleAnchorForWeekday, cycleStartWeekday, normalizeCycleAnchor, DEFAULT_CYCLE_ANCHOR } from '../../src/calculations.js';
import { normalizeSettings, recordsToCSV } from '../../src/storage.js';

test('default is unchanged: Monday–Sunday weeks', () => {
  assert.equal(normalizeSettings(null).payCycleAnchor, DEFAULT_CYCLE_ANCHOR);
  const c = getCycleForDate('2026-10-08', 7, normalizeSettings({}).payCycleAnchor);
  assert.deepEqual([c.cycleStart, c.cycleEnd], ['2026-10-05', '2026-10-11']);
  assert.equal(cycleStartWeekday(DEFAULT_CYCLE_ANCHOR), 1);
});

test('weekly cycles can start on any weekday', () => {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let wd = 0; wd < 7; wd++) {
    const anchor = cycleAnchorForWeekday(wd);
    assert.equal(cycleStartWeekday(anchor), wd, names[wd]);
    for (const date of ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-10', '2026-10-11']) {
      const c = getCycleForDate(date, 7, anchor);
      assert.equal(new Date(`${c.cycleStart}T00:00:00Z`).getUTCDay(), wd, `${names[wd]} ${date}`);
      assert.ok(c.cycleStart <= date && date <= c.cycleEnd);
    }
  }
  const tue = getCycleForDate('2026-10-05', 7, cycleAnchorForWeekday(2)); // a Monday
  assert.deepEqual([tue.cycleStart, tue.cycleEnd], ['2026-09-29', '2026-10-05'], 'Tuesday–Monday week');
});

test('fortnights follow the chosen start date, including which week', () => {
  const a = getCycleForDate('2026-10-08', 14, '2026-09-29');
  assert.deepEqual([a.cycleStart, a.cycleEnd], ['2026-09-29', '2026-10-12']);
  const b = getCycleForDate('2026-10-08', 14, '2026-10-06');
  assert.deepEqual([b.cycleStart, b.cycleEnd], ['2026-10-06', '2026-10-19']);
  const far = getCycleForDate('2024-01-01', 14, '2026-10-06');
  assert.equal((Date.parse('2026-10-06') - Date.parse(far.cycleStart)) / 86400000 % 14, 0, 'works far back in time');
});

test('bad saved values fall back to the default Monday', () => {
  for (const bad of ['2026-02-30', 'tuesday', '', null, 42, '2026-1-5']) assert.equal(normalizeCycleAnchor(bad), DEFAULT_CYCLE_ANCHOR, String(bad));
  assert.equal(normalizeSettings({ payCycleAnchor: '2026-13-01' }).payCycleAnchor, DEFAULT_CYCLE_ANCHOR);
  assert.equal(normalizeSettings({ payCycleAnchor: '2026-09-29' }).payCycleAnchor, '2026-09-29');
});

test('grouping and CSV use the start day; records are never changed', () => {
  const records = ['2026-09-28', '2026-09-29', '2026-10-05', '2026-10-06'].map((date, i) => ({ id: String(i), date, start: '09:00', workingMinutes: 60, paymentAmount: 10 }));
  const before = JSON.stringify(records);
  const mon = groupByCycle(records, 7, DEFAULT_CYCLE_ANCHOR).map((c) => c.records.map((r) => r.date));
  const tue = groupByCycle(records, 7, cycleAnchorForWeekday(2)).map((c) => c.records.map((r) => r.date));
  assert.deepEqual(mon, [['2026-10-06', '2026-10-05'], ['2026-09-29', '2026-09-28']]);
  assert.deepEqual(tue, [['2026-10-06'], ['2026-10-05', '2026-09-29'], ['2026-09-28']]);
  assert.equal(JSON.stringify(records), before);
  const csv = recordsToCSV(records, 7, [], cycleAnchorForWeekday(2));
  assert.match(csv, /2026-10-05,[^\n]*Sep 29 – Oct 5, 2026/);
});
