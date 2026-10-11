// Repeatable performance check for large record histories.
//
// Not a pass/fail gate: timings depend on the machine, so this prints a
// table (and optional JSON) of measurements plus the environment, for
// before/after comparisons on the SAME machine.
//
// Usage (needs Playwright available, e.g. `npm i -D playwright` locally or a
// global install — it is intentionally not a project dependency):
//   npm run build && npx vite preview --port 4173 &
//   node tests/perf/perf-check.mjs http://localhost:4173/ [out.json]
// Optional: CHROMIUM=/path/to/chrome to use a specific browser binary.
import os from 'node:os';
import fs from 'node:fs';

const { chromium } = await import('playwright');
const URL_ = process.argv[2] || 'http://localhost:4173/';
const OUT = process.argv[3];
const SIZES = [250, 500, 1000, 2000];
const RUNS = 3;

const browser = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}), args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(URL_, { waitUntil: 'networkidle' });

// Synthetic history: one record per day going back from 2026-09-30,
// mixing jobs-less actual-payment records (no personal data).
const seed = (n) =>
  page.evaluate((n) => {
    const out = [];
    const d = new Date(Date.UTC(2026, 8, 30));
    for (let i = 0; i < n; i++) {
      out.push({ id: 'perf' + i, date: d.toISOString().slice(0, 10), start: '09:00', workingMinutes: 60 + (i % 300), breakMinutes: 0, paymentAmount: 10 + (i % 90), dayType: 'Day', paymentType: 'Normal', notes: i % 5 ? '' : 'note ' + i });
      d.setUTCDate(d.getUTCDate() - 1);
    }
    localStorage.clear();
    localStorage.setItem('modern_work_hours_tracker_v1', JSON.stringify(out));
  }, n);

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [];
for (const n of SIZES) {
  const m = { open: [], redraw: [], save: [], expand: [], calendar: [] };
  for (let r = 0; r < RUNS; r++) {
    await seed(n);
    const t0 = Date.now();
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.app-shell');
    m.open.push(Date.now() - t0);
    m.redraw.push(await page.evaluate(() => { const t = performance.now(); document.getElementById('btn-theme').click(); return performance.now() - t; }));
    m.calendar.push(await page.evaluate(() => { const t = performance.now(); document.getElementById('btn-cal-prev').click(); return performance.now() - t; }));
    m.expand.push(await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-cycle-toggle]')].find((x) => x.getAttribute('aria-expanded') === 'false');
      if (!b) return 0;
      const t = performance.now(); b.click(); return performance.now() - t;
    }));
    m.save.push(await page.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
      set('f-date', '2026-10-01'); set('f-start', '09:00'); set('f-hours', '1'); set('f-minutes', '0'); set('f-pay', '10');
      const t = performance.now(); document.getElementById('record-form').requestSubmit(); return performance.now() - t;
    }));
  }
  const rowsInPage = await page.locator('.ledger-row').count();
  rows.push({ records: n, openMs: median(m.open), redrawMs: Math.round(median(m.redraw)), saveMs: Math.round(median(m.save)), expandCycleMs: Math.round(median(m.expand)), calendarMonthMs: Math.round(median(m.calendar)), ledgerRowsInPage: rowsInPage });
}
await page.evaluate(() => localStorage.clear());
const env = { url: URL_, date: new Date().toISOString(), node: process.version, browser: browser.version(), cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGB: Math.round(os.totalmem() / 1e9), runsPerSize: RUNS, statistic: 'median' };
await browser.close();
console.log(JSON.stringify(env));
console.table(rows);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ env, rows }, null, 2));
