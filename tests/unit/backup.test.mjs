// Backup parsing/validation: all-or-nothing, clear messages, legacy-safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, mergeRecords, buildBackup, backupRecordProblem } from '../../src/storage.js';

const good = (over = {}) => ({ id: 'a1', date: '2026-09-15', start: '09:00', workingMinutes: 90, breakMinutes: 0, paymentAmount: 45, ...over });
const file = (records, extra = {}) => JSON.stringify({ app: 'WorkRoaster', schemaVersion: 1, records, ...extra });
const rejects = (text, pattern) => assert.throws(() => parseBackup(text), (e) => {
  assert.ok(!(e instanceof TypeError), `raw TypeError leaked: ${e.message}`);
  assert.match(e.message, pattern);
  return true;
});

test('malformed JSON and wrong shapes give friendly errors', () => {
  rejects('{nope', /not valid JSON/);
  rejects('', /not valid JSON/);
  rejects('[]', /WorkRoaster backup/);
  rejects('null', /WorkRoaster backup/);
  rejects('42', /WorkRoaster backup/);
  rejects('{"records":"x"}', /WorkRoaster backup/);
});

test('null / non-object records are named and rejected — no raw property errors', () => {
  rejects(file([null]), /Record 1: it is empty \(null\)/);
  rejects(file([good(), 'text']), /Record 2: it is a string/);
  rejects(file([good(), [1, 2]]), /Record 2: it is a list/);
  rejects(file([7]), /Record 1: it is a number/);
});

test('record-entry rules are enforced on import', () => {
  rejects(file([good({ workingMinutes: 0 })]), /Record 1 \(2026-09-15\): its working time is 0 minutes/);
  rejects(file([good({ workingMinutes: -30 })]), /0 minutes or less/);
  rejects(file([good({ workingMinutes: 'abc' })]), /not a number/);
  rejects(file([good({ workingMinutes: undefined })]), /no working time/);
  rejects(file([good({ date: '2026-02-30' })]), /real YYYY-MM-DD date/);
  rejects(file([good({ date: '' })]), /date/);
  rejects(file([good({ start: '25:00' })]), /start time/);
  rejects(file([good({ start: undefined })]), /start time/);
  rejects(file([good({ breakMinutes: -5 })]), /break/);
  rejects(file([good({ breakMinutes: 'x' })]), /break/);
  rejects(file([good({ paymentAmount: -1 })]), /payment amount/);
  rejects(file([good({ paymentAmount: undefined })]), /payment amount/);
  rejects(file([good({ hourlyRate: -3 })]), /hourly rate/);
  rejects(file([good({ end: '9am' })]), /end time/);
  rejects(file([good({ notes: { x: 1 } })]), /notes field is not text/);
  rejects(file([good(), good()]), /Record 2 .*same id as record 1/);
});

test('one bad record rejects the whole file and says nothing was imported', () => {
  assert.throws(() => parseBackup(file([good(), good({ id: 'b', workingMinutes: 0 })])), /Nothing was imported/);
});

test('many problems are summarised', () => {
  const bad = Array.from({ length: 6 }, (_, i) => good({ id: 'x' + i, workingMinutes: 0 }));
  assert.throws(() => parseBackup(file(bad)), /and 3 more/);
});

test('valid current and legacy backups still import', () => {
  const cur = parseBackup(file([good(), good({ id: 'a2', hourlyRate: 32, end: '10:30', jobId: 'cleaning' })], { settings: { currency: 'AUD' } }));
  assert.equal(cur.records.length, 2);
  assert.equal(cur.settings.currency, 'AUD');
  // Older WorkTrack backups: app field "WorkTrack", decimal hours, numeric strings, no id / breakMinutes
  const legacy = parseBackup(JSON.stringify({ app: 'WorkTrack', records: [
    { date: '2025-03-03', start: '08:30', workingHours: 2.5, paymentAmount: '75' },
    { id: 7, date: '2025-03-04', start: '08:30', workingMinutes: '60', paymentAmount: 30, cycle: 'Mar 3 to Mar 16' },
  ] }));
  assert.equal(legacy.records.length, 2);
  assert.equal(legacy.records[0].workingMinutes, 150);
  assert.equal(legacy.records[0].paymentAmount, 75);
  assert.equal(legacy.records[0].breakMinutes, 0);
  assert.ok(legacy.records[0].id, 'missing id is generated as before');
  assert.equal(legacy.records[1].cycle, 'Mar 3 to Mar 16', 'legacy cycle text preserved');
  // Fixed-pay snapshot round-trips
  const fp = { mode: 'monthlyFixed', amount: 5500, workingDays: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', breakMinutes: 30, scheduledDays: 22, dayShare: 250, counted: true, reason: 'scheduled' };
  assert.deepEqual(parseBackup(file([good({ fixedPayAtEntry: fp })])).records[0].fixedPayAtEntry, fp);
});

test('an invalid settings section is rejected', () => {
  assert.throws(() => parseBackup(file([good()], { settings: 'x' })), /settings section is not valid/);
});

test('merge skips duplicates; parse never mutates the caller’s data', () => {
  const existing = [{ id: 'a1', date: '2026-09-15' }];
  const snapshot = JSON.stringify(existing);
  const { records } = parseBackup(file([good(), good({ id: 'n1', date: '2026-09-16' })]));
  const { merged, added } = mergeRecords(existing, records);
  assert.equal(added, 1);
  assert.equal(merged.length, 2);
  assert.equal(JSON.stringify(existing), snapshot);
});

test('backups identify themselves as WorkRoaster', () => {
  assert.equal(buildBackup([], {}).app, 'WorkRoaster');
  assert.equal(backupRecordProblem(good()), null);
});
