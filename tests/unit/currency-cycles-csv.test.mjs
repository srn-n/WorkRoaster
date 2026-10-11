// Currency validation, rolling pay cycles, CSV formula-injection guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedCurrency, normalizeCurrencyInput } from '../../src/currency.js';
import { getCycleForDate, formatMoney } from '../../src/calculations.js';
import { sanitizeCsvText, recordsToCSV } from '../../src/storage.js';

test('real ISO 4217 codes are accepted (any case, trimmed)', () => {
  for (const c of ['AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD', 'SGD', 'INR', 'JPY', 'BDT', 'CHF', 'ZAR', 'aud', ' usd ']) assert.ok(isSupportedCurrency(c), c);
  assert.equal(normalizeCurrencyInput(' gbp '), 'GBP');
});

test('made-up or malformed codes are rejected', () => {
  for (const c of ['ZZZ', 'ABC', 'XXX', 'XTS', 'US', 'USDD', '', '123', null, undefined]) assert.equal(isSupportedCurrency(c), false, String(c));
});

test('formatting a legacy unsupported saved code still works (no crash, no rewrite)', () => {
  assert.match(formatMoney(10, 'ZZZ'), /10\.00/);
});

test('30- and 365-day cycles are rolling blocks, not calendar months/years', () => {
  const m = getCycleForDate('2026-09-15', 30);
  assert.equal(m.cycleStart, '2026-09-15');
  assert.equal(m.cycleEnd, '2026-10-14');
  const y = getCycleForDate('2026-06-15', 365);
  assert.equal(y.cycleStart, '2025-12-29');
  assert.equal(y.cycleEnd, '2026-12-28');
  const next = getCycleForDate('2026-12-29', 365);
  assert.equal(next.cycleStart, '2026-12-29', 'next rolling year starts the day after');
  // 7/14-day cycles still start on Mondays
  for (const d of ['2026-09-30', '2027-01-01', '2028-02-29']) {
    assert.equal(new Date(getCycleForDate(d, 7).cycleStart + 'T00:00:00Z').getUTCDay(), 1);
    assert.equal(new Date(getCycleForDate(d, 14).cycleStart + 'T00:00:00Z').getUTCDay(), 1);
  }
});

test('cached cycle lookups return independent copies', () => {
  const a = getCycleForDate('2026-09-15', 14);
  a.cycleStart = 'mutated';
  assert.notEqual(getCycleForDate('2026-09-15', 14).cycleStart, 'mutated');
  assert.equal(getCycleForDate('', 14), null);
  assert.equal(getCycleForDate('bad', 14), null);
});

test('CSV: formula-looking text is neutralised, ordinary text and numbers are not', () => {
  for (const v of ['=SUM(1,2)', '+SUM(1,2)', '-SUM(1,2)', '@SUM(1,2)', '\t=1', '-10 minutes']) assert.equal(sanitizeCsvText(v), `'${v}`);
  for (const v of ['Worked extra hours', '$50', 'Meeting @ office', '-25.50', '+61', '12']) assert.equal(sanitizeCsvText(v), v);
  const csv = recordsToCSV([{ date: '2026-09-15', start: '09:00', workingMinutes: 60, paymentAmount: -5, notes: '=HYPERLINK("x")', jobId: 'j' }], 14, [{ id: 'j', name: '@evil' }]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /,'@evil$/m);
  assert.match(csv, /,-5\.00,/);
});
