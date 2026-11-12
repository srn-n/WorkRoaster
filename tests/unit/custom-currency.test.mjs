import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomCurrency, MAJOR_CURRENCIES, currencyName, isSupportedCurrency } from '../../src/currency.js';
import { formatMoney, formatRate, formatRuleLabel } from '../../src/calculations.js';

test('major currency list: AUD first, every entry a real ISO code', () => {
  assert.equal(MAJOR_CURRENCIES[0], 'AUD');
  for (const c of MAJOR_CURRENCIES) assert.ok(isSupportedCurrency(c), c);
  assert.ok(['USD', 'GBP', 'JPY', 'KRW', 'MYR', 'BDT'].every((c) => MAJOR_CURRENCIES.includes(c)));
  assert.match(currencyName('BDT'), /taka/i);
});

test('custom currency: symbol required, trimmed and length-capped', () => {
  assert.equal(normalizeCustomCurrency(null), null);
  assert.equal(normalizeCustomCurrency({ symbol: '   ' }), null);
  assert.deepEqual(normalizeCustomCurrency({ symbol: ' Tk ', name: ' Taka ' }), { symbol: 'Tk', name: 'Taka' });
  assert.equal(normalizeCustomCurrency({ symbol: 'ABCDEFGH' }).symbol.length, 6);
  assert.equal(normalizeCustomCurrency({ symbol: 'x', name: 'n'.repeat(80) }).name.length, 30);
});

test('custom currency: markup and quote characters can never be stored', () => {
  const c = normalizeCustomCurrency({ symbol: '<b>"\'`&', name: '<img src=x onerror=1>\u0007' });
  assert.doesNotMatch(c.symbol + c.name, /[<>&"'`\u0000-\u001f]/);
  assert.equal(normalizeCustomCurrency({ symbol: '<>&"' }), null);
});

test('custom currency formats amounts, rates and flat rules without converting', () => {
  const tk = { symbol: 'Tk', name: 'Taka' };
  assert.equal(formatMoney(1234.5, tk, 'en-AU'), 'Tk 1,234.50');
  assert.equal(formatMoney(-5, { symbol: '₩' }, 'en-AU'), '-₩5.00');
  assert.equal(formatRate(60, 120, tk), formatMoney(30, tk) + '/hr');
  assert.equal(formatRuleLabel({ type: 'custom', value: 10 }, tk), formatMoney(10, tk) + ' flat');
  // ISO path unchanged.
  assert.equal(formatMoney(9, 'AUD', 'en-AU'), '$9.00');
});

test('settings keep a custom currency through save/import, and drop a bad one', async () => {
  const { normalizeSettings } = await import('../../src/storage.js');
  assert.equal(normalizeSettings({ currency: 'AUD' }).customCurrency, null);
  assert.deepEqual(normalizeSettings({ currency: 'AUD', customCurrency: { symbol: 'pts', name: 'Points' } }).customCurrency, { symbol: 'pts', name: 'Points' });
  assert.equal(normalizeSettings({ customCurrency: { symbol: '<>' } }).customCurrency, null);
  assert.equal(normalizeSettings({ customCurrency: 'Tk' }).customCurrency, null);
});
