/*
 * Tax estimate checks against worked examples published in the cited
 * sources (see src/tax.js). Update these when a country's rates change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualTax, cycleTaxEstimate, cyclesPerYear, normalizeTaxSettings, progressive, krEmploymentDeduction, jpEmploymentDeduction, jpBasicDeduction, TAX_COUNTRIES } from '../../src/tax.js';

const part = (r, label) => r.parts.find((p) => p.label.startsWith(label))?.amount;

test('progressive bands', () => {
  assert.equal(progressive(100, [[50, 0], [Infinity, 0.1]]), 5);
  assert.equal(progressive(0, [[50, 0.1], [Infinity, 0.2]]), 0);
});

test('Australia 2026–27: $100,000 → $20,520 income tax + $2,000 Medicare levy', () => {
  const r = annualTax('AU', 100000, { medicare: true });
  assert.equal(part(r, 'Income tax'), 20520);
  assert.equal(part(r, 'Medicare'), 2000);
  // LITO: no income tax until about $22,866.
  assert.equal(part(annualTax('AU', 22800), 'Income tax'), 0);
  assert.ok(part(annualTax('AU', 23000), 'Income tax') > 0);
  // Medicare levy nil at the low-income threshold, phased in above it.
  assert.equal(part(annualTax('AU', 28011), 'Medicare'), 0);
  assert.equal(part(annualTax('AU', 30000), 'Medicare'), 198.9);
});

test('USA 2026 single: $85,000 → $9,870 federal tax (after $16,100 standard deduction)', () => {
  const r = annualTax('US', 85000, { filing: 'single', fica: true });
  assert.equal(part(r, 'Federal'), 9870);
  assert.equal(part(r, 'Social Security'), 5270);
  assert.equal(part(r, 'Medicare'), 1232.5);
  assert.equal(part(annualTax('US', 300000, { fica: true }), 'Social Security'), 11439);
});

test('UK 2026–27: £60,000 → £11,432 income tax; NI 8% / 2%', () => {
  const r = annualTax('UK', 60000, { ni: true });
  assert.equal(part(r, 'Income tax'), 11432);
  assert.equal(part(r, 'National Insurance'), 0.08 * 37700 + 0.02 * 9730);
  // Personal Allowance gone at £125,140.
  assert.equal(part(annualTax('UK', 125140), 'Income tax'), 37700 * 0.2 + (125140 - 37700) * 0.4);
});

test('South Korea 2026: employment deduction table and capped credit', () => {
  assert.equal(krEmploymentDeduction(5e6), 3.5e6);
  assert.equal(krEmploymentDeduction(70e6), 13.25e6);
  assert.equal(krEmploymentDeduction(500e6), 20e6);
  const r = annualTax('KR', 50e6, { local: true });
  // 50M: deduction 12M + 5% × 5M = 12.25M, taxable 36.25M → 840,000 + 15% × 22.25M = 4,177,500; credit capped at 740,000.
  assert.equal(part(r, 'Income tax'), 4177500 - 740000);
  assert.equal(part(r, 'Local'), (4177500 - 740000) * 0.1);
});

test('Japan 2026: deductions and national + resident tax', () => {
  assert.equal(jpEmploymentDeduction(4e6), 1.24e6); // NTA table: 20% + ¥440,000
  assert.equal(jpEmploymentDeduction(1.5e6), 740000); // 2026 minimum
  assert.equal(jpBasicDeduction(2.76e6), 1.04e6);
  const r = annualTax('JP', 4e6, { resident: true });
  // employment income 2.76M − basic 1.04M = 1.72M taxable × 5% = 86,000 × 1.021
  assert.equal(part(r, 'Income tax'), 87806);
  assert.equal(part(r, 'Resident'), (2.76e6 - 430000) * 0.1);
});

test('Malaysia YA2026: relief, bands and RM400 rebate', () => {
  // RM60,000 → chargeable 51,000: 150 + 450 + 900 + 110 = 1,610
  assert.equal(annualTax('MY', 60000).total, 1610);
  // RM40,000 → chargeable 31,000: 150 + 330 = 480 − 400 rebate = 80
  assert.equal(annualTax('MY', 40000).total, 80);
});

test('Bangladesh 2026–27: salaried exemption and slabs', () => {
  // Tk 1,200,000 salaried: exempt 400,000 → taxable 800,000: 0 on 375k, 10% on 300k, 15% on 125k = 48,750
  assert.equal(annualTax('BD', 1.2e6, { salaried: true, category: 'general' }).total, 48750);
  // Women / 65+: threshold 425,000 → 10% on 300k + 15% on 75k = 41,250
  assert.equal(annualTax('BD', 1.2e6, { salaried: true, category: 'women' }).total, 41250);
  assert.equal(annualTax('BD', 1.2e6, { salaried: false }).total, 30000 + 60000 + 25000);
});

test('pay-cycle estimate: annualise, then take the cycle share', () => {
  assert.equal(cyclesPerYear(14), 26);
  const off = cycleTaxEstimate(1000, 14, { enabled: false, country: 'AU' });
  assert.equal(off, null);
  const e = cycleTaxEstimate(100000 / 26, 14, { enabled: true, country: 'AU' });
  assert.ok(Math.abs(e.tax - 22520 / 26) < 0.05);
  assert.ok(Math.abs(e.net - (100000 - 22520) / 26) < 0.05);
});

test('settings are normalised and every country has sources and a year', () => {
  assert.deepEqual(normalizeTaxSettings(null), { enabled: false, country: 'AU', options: { medicare: true } });
  assert.equal(normalizeTaxSettings({ country: 'XX' }).country, 'AU');
  assert.equal(normalizeTaxSettings({ country: 'US', options: { filing: 'bogus' } }).options.filing, 'single');
  for (const c of TAX_COUNTRIES) {
    assert.ok(c.year && c.sources.length && c.bands.length && c.notes, c.id);
    for (const s of c.sources) assert.match(s.url, /^https:\/\//);
  }
});
