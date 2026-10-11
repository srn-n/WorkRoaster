// "Today" uses the local date; usual start time handles shifts around midnight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayString, averageStartTime } from '../../src/calculations.js';

test('todayString is the LOCAL calendar date, not the UTC one', () => {
  const d = new Date();
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(todayString(), local);
});

test('usual start time: day shifts are a plain average', () => {
  const s = (...xs) => averageStartTime(xs.map((start) => ({ start })));
  assert.equal(s('09:00', '11:00'), '10:00');
  assert.equal(s('06:00', '14:00'), '10:00');
  assert.equal(s('08:15', '08:45', '09:30'), '08:50');
  assert.equal(s('07:00'), '07:00');
  assert.equal(averageStartTime([]), null);
});

test('usual start time: night shifts average around midnight, not midday', () => {
  const s = (...xs) => averageStartTime(xs.map((start) => ({ start })));
  assert.equal(s('23:00', '01:00'), '00:00');
  assert.equal(s('23:00', '01:00', '23:30', '00:30'), '00:00');
  assert.equal(s('22:00', '23:00'), '22:30');
  assert.equal(s('23:50', '00:20'), '00:05');
});
