import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOvertime, splitOvertime, paymentWithOvertime, DEFAULT_OVERTIME_AFTER_MINUTES } from '../../src/calculations.js';
import { normalizeJob, repriceJobRecords, payRulesChanged } from '../../src/jobs.js';
import { parseBackup } from '../../src/storage.js';

const migrateRecord = (r) => parseBackup(JSON.stringify({ records: [r] })).records[0];

test('overtime is off by default with an 8-hour limit', () => {
  assert.deepEqual(normalizeOvertime(undefined), { enabled: false, afterMinutes: 480, lastRate: null });
  assert.equal(DEFAULT_OVERTIME_AFTER_MINUTES, 480);
  assert.deepEqual(normalizeJob({ name: 'Café' }).overtime, { enabled: false, afterMinutes: 480, lastRate: null });
});

test('bad overtime settings fall back safely', () => {
  assert.equal(normalizeOvertime({ enabled: 'yes' }).enabled, false);
  assert.equal(normalizeOvertime({ afterMinutes: 0 }).afterMinutes, 480);
  assert.equal(normalizeOvertime({ afterMinutes: 2000 }).afterMinutes, 480);
  assert.equal(normalizeOvertime({ afterMinutes: '450' }).afterMinutes, 450);
  assert.equal(normalizeOvertime({ lastRate: -5 }).lastRate, null);
  assert.equal(normalizeOvertime({ lastRate: '' }).lastRate, null);
  assert.equal(normalizeOvertime({ lastRate: '<b>' }).lastRate, null);
  assert.equal(normalizeOvertime({ lastRate: 45.555 }).lastRate, 45.56);
});

test('split: only time past the day limit is overtime, counting earlier records', () => {
  assert.deepEqual(splitOvertime(600, 0, 480), { normal: 480, overtime: 120 });
  assert.deepEqual(splitOvertime(240, 300, 480), { normal: 180, overtime: 60 });
  assert.deepEqual(splitOvertime(90, 600, 480), { normal: 0, overtime: 90 });
  assert.deepEqual(splitOvertime(300, 0, 480), { normal: 300, overtime: 0 });
});

test('pay = normal time × rate + overtime × overtime rate', () => {
  assert.equal(paymentWithOvertime(30, 480, 45, 120), 330);
  assert.equal(paymentWithOvertime(30, 0, 45, 90), 67.5);
});

test('records keep a valid overtime snapshot; junk is dropped', () => {
  const ok = migrateRecord({ id: 'a', date: '2026-11-20', start: '07:00', workingMinutes: 600, paymentAmount: 330, overtimeMinutesAtEntry: 120, overtimeRateAtEntry: 45, overtimeAfterMinutesAtEntry: 480 });
  assert.equal(ok.overtimeMinutesAtEntry, 120);
  assert.equal(ok.overtimeRateAtEntry, 45);
  assert.equal(ok.overtimeAfterMinutesAtEntry, 480);
  const bad = migrateRecord({ id: 'b', date: '2026-11-20', start: '07:00', workingMinutes: 60, paymentAmount: 30, overtimeMinutesAtEntry: 500, overtimeRateAtEntry: '<script>' });
  assert.equal(bad.overtimeMinutesAtEntry, undefined);
  assert.equal(bad.overtimeRateAtEntry, undefined);
});

test('changing a job keeps each record\'s own overtime split and rate', () => {
  const job = normalizeJob({ id: 'cafe', name: 'Café', baseRate: 32, payCalculationMode: 'hourlyRate', overtime: { enabled: true, afterMinutes: 480 } });
  const records = [
    { id: 'r1', jobId: 'cafe', date: '2026-11-18', start: '07:00', workingMinutes: 600, hourlyRate: 30, paymentAmount: 330, overtimeMinutesAtEntry: 120, overtimeRateAtEntry: 45 },
    { id: 'r2', jobId: 'cafe', date: '2026-11-19', start: '07:00', workingMinutes: 240, hourlyRate: 30, paymentAmount: 120 },
  ];
  const { records: next } = repriceJobRecords(records, job);
  assert.equal(next[0].paymentAmount, 32 * 8 + 45 * 2); // 346
  assert.equal(next[0].overtimeRateAtEntry, 45);
  assert.equal(next[1].paymentAmount, 128);
});

test('turning overtime on or changing its limit never asks to reprice old records', () => {
  const a = { id: 'c', name: 'C', baseRate: 30 };
  assert.equal(payRulesChanged(a, { ...a, overtime: { enabled: true, afterMinutes: 450 } }), false);
});
