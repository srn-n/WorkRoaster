// Fixed-pay allocation: shares are whole cents, stable per date, and a
// complete period adds up to the salary exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateMinorUnits, fixedPayDayShare, scheduledWorkingDays } from '../../src/calculations.js';

const ymd = (d) => d.toISOString().slice(0, 10);
function periodDates(year, month /* null = whole year */) {
  const out = [];
  const d = new Date(Date.UTC(year, month ?? 0, 1));
  while (d.getUTCFullYear() === year && (month === null || d.getUTCMonth() === month)) { out.push(ymd(d)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const cents = (x) => Math.round(x * 100);
const SCHEDULES = {
  'Mon–Fri': [1, 2, 3, 4, 5],
  'weekends only': [0, 6],
  'Mon/Wed/Fri': [1, 3, 5],
  'Tue/Thu': [2, 4],
  'every day': [0, 1, 2, 3, 4, 5, 6],
  'Sunday only': [0],
};
const AMOUNTS = [5500, 5800, 1234.56, 72000, 0.07, 100000.01, 999.99];

test('allocateMinorUnits always sums exactly and differs by at most 1 cent', () => {
  for (const total of [0, 1, 7, 550000, 123456, 99999]) {
    for (const n of [1, 2, 3, 7, 21, 22, 23, 104, 261, 365]) {
      const parts = Array.from({ length: n }, (_, i) => allocateMinorUnits(total, n, i));
      assert.equal(parts.reduce((a, b) => a + b, 0), total, `${total} over ${n}`);
      assert.ok(Math.max(...parts) - Math.min(...parts) <= 1);
    }
  }
  assert.equal(allocateMinorUnits(100, 0, 0), 0);
  assert.equal(allocateMinorUnits(100, 3, 3), 0, 'out-of-range index gets nothing');
});

test('monthly salary: every complete month of 2024–2028 sums exactly, all schedules', () => {
  for (const [label, days] of Object.entries(SCHEDULES)) {
    for (const amount of AMOUNTS) {
      for (const year of [2024, 2026, 2027, 2028]) {
        for (let m = 0; m < 12; m += 1) {
          let sum = 0;
          let scheduled = 0;
          for (const date of periodDates(year, m)) {
            const r = fixedPayDayShare('monthlyFixed', { amount, workingDays: days }, date);
            if (r.scheduledDay) { sum += cents(r.share); scheduled += 1; }
          }
          assert.equal(scheduled, scheduledWorkingDays(days, year, m));
          assert.equal(sum, cents(amount), `${label} ${amount} ${year}-${m + 1}`);
        }
      }
    }
  }
});

test('yearly salary: every complete year sums exactly, including leap years', () => {
  for (const [label, days] of Object.entries(SCHEDULES)) {
    for (const amount of [72000, 50000.5, 1234.56]) {
      for (const year of [2024, 2026, 2028, 2100]) {
        let sum = 0;
        for (const date of periodDates(year, null)) {
          const r = fixedPayDayShare('yearlyFixed', { amount, workingDays: days }, date);
          if (r.scheduledDay) sum += cents(r.share);
        }
        assert.equal(sum, cents(amount), `${label} ${amount} ${year}`);
      }
    }
  }
});

test('a date’s share depends only on config + date (stable, order-independent)', () => {
  const cfg = { amount: 5500, workingDays: [1, 2, 3, 4, 5] };
  const dates = periodDates(2026, 4).filter((d) => fixedPayDayShare('monthlyFixed', cfg, d).scheduledDay);
  const forward = dates.map((d) => fixedPayDayShare('monthlyFixed', cfg, d).share);
  const backward = [...dates].reverse().map((d) => fixedPayDayShare('monthlyFixed', cfg, d).share).reverse();
  assert.deepEqual(forward, backward);
  // May 2026: 21 weekdays, 550000 ¢ = 21 × 26190 + 10 → first 10 dates get 261.91
  assert.equal(dates.length, 21);
  assert.deepEqual(forward.slice(0, 10), Array(10).fill(261.91));
  assert.deepEqual(forward.slice(10), Array(11).fill(261.9));
});

test('even split stays even (September 2026: 22 weekdays × $250)', () => {
  const cfg = { amount: 5500, workingDays: [1, 2, 3, 4, 5] };
  for (const d of periodDates(2026, 8)) {
    const r = fixedPayDayShare('monthlyFixed', cfg, d);
    if (r.scheduledDay) assert.equal(r.share, 250);
  }
});

test('partial month: logging only some days pays only those days’ shares', () => {
  const cfg = { amount: 5500, workingDays: [1, 2, 3, 4, 5] };
  const logged = ['2026-05-04', '2026-05-05', '2026-05-28'];
  const total = logged.reduce((s, d) => s + cents(fixedPayDayShare('monthlyFixed', cfg, d).share), 0);
  assert.equal(total, 26191 + 26191 + 26190);
});

test('unscheduled dates are not scheduled (records on them are saved at $0)', () => {
  const r = fixedPayDayShare('monthlyFixed', { amount: 5500, workingDays: [1, 2, 3, 4, 5] }, '2026-09-05');
  assert.equal(r.scheduledDay, false);
  const w = fixedPayDayShare('monthlyFixed', { amount: 1200, workingDays: [0, 6] }, '2026-09-05');
  assert.equal(w.scheduledDay, true);
  assert.equal(w.share, 150);
});

test('malformed input never throws', () => {
  assert.equal(fixedPayDayShare('monthlyFixed', { amount: 5500, workingDays: [1] }, 'nope').share, 0);
  assert.equal(fixedPayDayShare('hourlyRate', { amount: 5500 }, '2026-09-01').share, 0);
});
