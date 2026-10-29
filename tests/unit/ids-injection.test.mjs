// Ids from storage or an imported backup must never be able to carry markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { m: new Map(), getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }, setItem(k, v) { this.m.set(k, String(v)); }, removeItem(k) { this.m.delete(k); } };
const { safeId, isSafeId } = await import('../../src/ids.js');
const store = await import('../../src/storage.js');

const EVIL = `x"'><img src=x onerror=alert(1)>`;
const plain = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

test('safeId keeps ordinary ids and maps unsafe ones to a stable token', () => {
  for (const id of ['3f2a9c1e-0b7d-4c55-9e1a-2b3c4d5e6f70', 'cafe-barista', 'lx2k9a0.4512', 'note-abc-12', '1696000000000']) assert.equal(safeId(id), id);
  assert.equal(safeId(EVIL), safeId(EVIL));
  assert.ok(isSafeId(safeId(EVIL)));
  assert.notEqual(safeId(EVIL), safeId(EVIL + ' '));
  assert.equal(safeId(''), '');
  assert.equal(safeId(42), '42');
});

test('a backup with markup in record, job and option ids imports with plain ids and keeps its links', () => {
  const backup = {
    records: [{ id: EVIL, date: '2026-10-27', start: '09:00', workingMinutes: 60, paymentAmount: 30, jobId: EVIL }],
    settings: {
      jobs: [{ id: EVIL, name: 'Café', payCalculationMode: 'hourlyRate', baseRate: 30 }],
      dayTypes: [{ id: EVIL, label: 'Odd day' }],
      paymentTypes: [{ id: EVIL, label: 'Odd pay' }],
    },
  };
  const parsed = store.parseBackupFile(JSON.stringify(backup)).parsed;
  for (const mode of ['replace', 'merge']) {
    const res = store.importBackup({ records: [], settings: store.normalizeSettings(null), notes: [] }, parsed, mode);
    for (const r of res.records) assert.match(r.id, plain);
    for (const j of res.settings.jobs) assert.match(j.id, plain);
    for (const o of [...res.settings.dayTypes, ...res.settings.paymentTypes]) assert.match(o.id, plain);
    const job = res.settings.jobs.find((j) => j.name === 'Café');
    assert.ok(job, mode);
    assert.equal(res.records[0].jobId, job.id, `${mode}: record still points at its job`);
  }
});

test('stored data with markup ids is cleaned when loaded', () => {
  localStorage.setItem(store.RECORDS_KEY, JSON.stringify([{ id: EVIL, date: '2026-10-27', start: '09:00', workingMinutes: 60, paymentAmount: 30, jobId: EVIL }]));
  localStorage.setItem(store.SETTINGS_KEY, JSON.stringify({ jobs: [{ id: EVIL, name: 'Café' }] }));
  const [r] = store.loadRecords();
  const s = store.loadSettings();
  assert.match(r.id, plain);
  assert.equal(r.jobId, s.jobs[0].id);
});
