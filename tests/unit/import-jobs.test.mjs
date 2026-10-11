// Import brings jobs with it: created from the file, matched by name,
// never overwriting; backups label each record with its job and weekend rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, importBackup, normalizeSettings, weekendRuleSourceOf } from '../../src/storage.js';

const job = (id, name, extra = {}) => ({
  id, name, employer: '', baseRate: 30, payCalculationMode: 'hourlyRate', active: true,
  saturdayRule: { type: 'multiplier', value: 1.5 }, sundayRule: { type: 'multiplier', value: 2 }, additionalRule: { type: 'none', value: 0 }, ...extra,
});
const rec = (id, jobId, over = {}) => ({
  id, date: '2026-09-22', start: '09:00', end: '13:00', workingMinutes: 240, breakMinutes: 0, paymentAmount: 120, hourlyRate: 30,
  dayType: 'Day', paymentType: 'Normal', notes: '', cycle: 'Unassigned', mapNumber: '',
  ...(jobId ? { jobId, baseRateAtEntry: 30, weekendRuleAtEntry: { type: 'none', value: 0 }, additionalRuleAtEntry: { type: 'none', value: 0 }, effectiveRateAtEntry: 30, weekendOverride: { mode: 'default' } } : {}),
  ...over,
});
const fileWith = (records, jobs, extra = {}) => JSON.stringify({ app: 'WorkRoaster', schemaVersion: 1, records, settings: { currency: 'AUD', jobs, ...extra } });
const empty = () => ({ records: [], settings: normalizeSettings(null) });

test('backup records carry a readable job name and weekend-rule label, not "cycle: Unassigned"', () => {
  const settings = normalizeSettings({ jobs: [job('w', 'Westfield')] });
  const records = [
    rec('a', 'w', { date: '2026-09-26' }), // Saturday, job rule
    rec('b', 'w', { date: '2026-09-27', weekendOverride: { mode: 'custom', rule: { type: 'multiplier', value: 1.75 } }, weekendRuleAtEntry: { type: 'multiplier', value: 1.75 } }),
    rec('c', 'w', { date: '2026-09-24', weekendOverride: { mode: 'custom', rule: { type: 'custom', value: 35 } } }), // Thursday override
    rec('d', 'w'), // Tuesday
    rec('e', null), // no job
    rec('f', 'w', { cycle: '24 Aug – 6 Sep' }), // old hand-typed cycle is kept
  ];
  const out = buildBackup(records, settings).records;
  assert.deepEqual(out.map((r) => r.jobName ?? null), ['Westfield', 'Westfield', 'Westfield', 'Westfield', null, 'Westfield']);
  assert.deepEqual(out.map((r) => r.weekendRuleSource ?? null), ['saturday', 'sunday-override', 'weekday-override', 'none', null, 'none']);
  assert.ok(out.slice(0, 5).every((r) => !('cycle' in r)));
  assert.equal(out[5].cycle, '24 Aug – 6 Sep');
  assert.equal(records[0].cycle, 'Unassigned', 'export never changes the stored records');
  assert.equal(weekendRuleSourceOf(rec('x', null)), null);
});

test('a fresh device gets every job from the file, rates and all', () => {
  const jobs = [job('w', 'Westfield', { baseRate: 31.13, saturdayRule: { type: 'multiplier', value: 1.45 }, sundayRule: { type: 'multiplier', value: 1.8 } }), job('f', 'Flyers', { payCalculationMode: 'payment', baseRate: 0 })];
  const parsed = parseBackup(fileWith([rec('a', 'w')], jobs));
  for (const mode of ['merge', 'replace']) {
    const { records, settings, summary } = importBackup(empty(), parsed, mode);
    const w = settings.jobs.find((j) => j.name === 'Westfield');
    assert.ok(w, mode);
    assert.equal(w.baseRate, 31.13);
    assert.deepEqual(w.saturdayRule, { type: 'multiplier', value: 1.45 });
    assert.deepEqual(w.sundayRule, { type: 'multiplier', value: 1.8 });
    assert.ok(settings.jobs.some((j) => j.name === 'Flyers' && j.payCalculationMode === 'payment'), 'jobs without shifts come too');
    assert.equal(records[0].jobId, w.id, `${mode}: record points at the created job`);
    assert.equal(records[0].paymentAmount, 120);
    if (mode === 'merge') assert.deepEqual(summary.jobsAdded, ['Westfield', 'Flyers']);
  }
});

test('jobs set up by hand are matched by name (any case/spacing) and never overwritten', () => {
  const device = { records: [], settings: normalizeSettings({ jobs: [job('my-own-id', '  westfield ', { baseRate: 40 })] }) };
  const parsed = parseBackup(fileWith([rec('a', 'w'), rec('b', 'w', { date: '2026-09-23' })], [job('w', 'Westfield', { baseRate: 31 })]));
  const { records, settings, summary } = importBackup(device, parsed, 'merge');
  assert.equal(settings.jobs.length, 1, 'no second Westfield');
  assert.equal(settings.jobs[0].baseRate, 40, "device's own rates are kept");
  assert.ok(records.every((r) => r.jobId === 'my-own-id'));
  assert.ok(records.every((r) => r.baseRateAtEntry === 30 && r.paymentAmount === 120), 'imported shifts keep the rates they were paid at');
  assert.deepEqual(summary.jobsMatched, ['westfield']);
});

test('same job under two different ids on two devices ends up as one job', () => {
  const phone = { records: [rec('p1', 'rockdale-mini-market')], settings: normalizeSettings({ jobs: [job('rockdale-mini-market', 'Rockdale Mini Market')] }) };
  const web = parseBackup(fileWith([rec('w1', 'rockdale-mini-hutbazar', { date: '2026-09-25' })], [job('rockdale-mini-hutbazar', 'Rockdale Mini Market')]));
  const { records, settings } = importBackup(phone, web, 'merge');
  assert.equal(settings.jobs.length, 1);
  assert.deepEqual(records.map((r) => r.jobId), ['rockdale-mini-market', 'rockdale-mini-market']);
});

test('the same shift entered on two devices is not imported twice', () => {
  const device = { records: [rec('phone-id', 'r')], settings: normalizeSettings({ jobs: [job('r', 'Rockdale')] }) };
  const parsed = parseBackup(fileWith([rec('web-id', 'x'), rec('web-2', 'x', { start: '14:00', end: '18:00' })], [job('x', 'Rockdale')]));
  const { records, summary } = importBackup(device, parsed, 'merge');
  assert.equal(records.length, 2);
  assert.equal(summary.duplicates, 1);
  assert.equal(summary.added, 1);
});

test('a job id the device uses for a different job is never reused', () => {
  const device = { records: [], settings: normalizeSettings({ jobs: [job('w', 'Woolworths')] }) };
  const parsed = parseBackup(fileWith([rec('a', 'w')], [job('w', 'Westfield')]));
  const { records, settings } = importBackup(device, parsed, 'merge');
  assert.equal(settings.jobs.length, 2);
  const westfield = settings.jobs.find((j) => j.name === 'Westfield');
  assert.notEqual(westfield.id, 'w');
  assert.equal(records[0].jobId, westfield.id);
  assert.equal(settings.jobs.find((j) => j.id === 'w').name, 'Woolworths');
});

test('records without a job stay "No job"; jobName alone can rebuild a missing job', () => {
  const parsed = parseBackup(JSON.stringify({ records: [rec('a', null), { ...rec('b', 'gone'), jobName: 'Cafe' }] }));
  const { records, settings } = importBackup(empty(), parsed, 'merge');
  assert.equal(records[0].jobId, undefined);
  const cafe = settings.jobs.find((j) => j.name === 'Cafe');
  assert.ok(cafe && cafe.payCalculationMode === 'hourlyRate' && cafe.baseRate === 30);
  assert.equal(records[1].jobId, cafe.id);
});

test('merge adds missing day/payment types and keeps every other setting', () => {
  const device = { records: [], settings: normalizeSettings({ currency: 'NZD', payCycleLengthDays: 14 }) };
  const parsed = parseBackup(fileWith([], [], { currency: 'USD', payCycleLengthDays: 7, dayTypes: [{ id: 'noon', label: 'Noon', archived: false }, { id: 'day', label: 'day', archived: false }] }));
  const { settings, summary } = importBackup(device, parsed, 'merge');
  assert.equal(settings.currency, 'NZD');
  assert.equal(settings.payCycleLengthDays, 14);
  assert.deepEqual(settings.dayTypes.map((d) => d.label), ['Day', 'Afternoon', 'Night', 'Overnight', 'Noon']);
  assert.deepEqual(summary.optionsAdded, ['Noon']);
});

test('a backup exported and imported again is unchanged', () => {
  const settings = normalizeSettings({ jobs: [job('w', 'Westfield')] });
  const records = parseBackup(fileWith([rec('a', 'w'), rec('b', null, { date: '2026-09-23' })], settings.jobs)).records;
  const again = importBackup(empty(), parseBackup(JSON.stringify(buildBackup(records, settings))), 'replace');
  assert.deepEqual(again.records, records);
  assert.deepEqual(again.settings.jobs, settings.jobs);
});
