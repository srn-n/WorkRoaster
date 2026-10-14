// Quick notes: per-profile storage, the pending count behind the Notes badge,
// and backups that carry notes without breaking older files. Also the shared
// appearance settings (visual theme + top bar transparency).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
const store = await import('../../src/storage.js');

const note = (id, text, done = false) => ({ id, text, done, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' });
const rec = (id, date = '2026-09-22') => ({ id, date, start: '09:00', workingMinutes: 60, breakMinutes: 0, paymentAmount: 10 });

beforeEach(() => {
  mem.clear();
  store.setActiveProfile(store.DEFAULT_PROFILE_ID);
});

test('notes persist for the open profile and are cleaned on load', () => {
  assert.deepEqual(store.loadNotes(), [], 'no notes yet');
  store.saveNotes([note('a', '  Check payslip  '), note('b', 'Swap Sunday shift', true)]);
  const loaded = store.loadNotes();
  assert.deepEqual(loaded.map((n) => [n.id, n.text, n.done]), [['a', 'Check payslip', false], ['b', 'Swap Sunday shift', true]]);
  assert.ok(mem.has(store.NOTES_KEY), 'first profile uses the plain notes key');
});

test('normalizeNotes drops junk, fills gaps and never repeats an id', () => {
  const out = store.normalizeNotes([null, 'text', { text: '   ' }, { id: 'x', text: 'One' }, { id: 'x', text: 'Two', done: 'yes' }, { text: 'No id', createdAt: 'nonsense' }]);
  assert.equal(out.length, 3);
  assert.equal(out[0].id, 'x');
  assert.notEqual(out[1].id, 'x', 'duplicate id replaced');
  assert.equal(out[1].done, false, 'only true counts as done');
  assert.ok(out[2].id && !Number.isNaN(Date.parse(out[2].createdAt)));
  assert.equal(store.normalizeNotes('nope').length, 0);
  assert.equal(store.normalizeNotes([{ text: 'x'.repeat(5000) }])[0].text.length, store.NOTE_MAX_LENGTH);
});

test('the badge count is the number of pending notes; ticking moves a note in and out of it', () => {
  let notes = [note('a', 'A'), note('b', 'B'), note('c', 'C', true)];
  assert.equal(store.pendingNoteCount(notes), 2);
  notes = notes.map((n) => (n.id === 'a' ? { ...n, done: true } : n));
  assert.equal(store.pendingNoteCount(notes), 1, 'completed notes do not count');
  notes = notes.map((n) => (n.id === 'c' ? { ...n, done: false } : n));
  assert.equal(store.pendingNoteCount(notes), 2, 'reopened notes count again');
  assert.equal(store.pendingNoteCount(null), 0);
});

test('each profile has its own notes; deleting a profile removes only its notes', () => {
  store.saveNotes([note('main', 'Main job note')]);
  const side = store.createProfile('Side job');
  assert.deepEqual(store.loadNotesFor(side.id), [], 'a new profile starts with no notes');
  store.setActiveProfile(side.id);
  store.saveNotes([note('s1', 'Side note'), note('s2', 'Done side note', true)]);
  store.setActiveProfile('default');
  assert.deepEqual(store.loadNotes().map((n) => n.id), ['main']);
  assert.deepEqual(store.loadNotesFor(side.id).map((n) => n.id), ['s1', 's2']);
  assert.ok(mem.has(store.notesKeyFor(side.id)));
  store.deleteProfile(side.id);
  assert.equal(mem.has(store.notesKeyFor(side.id)), false);
  assert.deepEqual(store.loadNotes().map((n) => n.id), ['main'], 'other profile untouched');
});

test('single-profile backups include notes and round-trip', () => {
  const notes = [note('a', 'Call manager'), note('b', 'Upload timesheet', true)];
  const file = JSON.stringify(store.buildBackup([rec('r1')], store.normalizeSettings({}), null, notes));
  const parsed = store.parseBackup(file);
  assert.deepEqual(parsed.notes.map((n) => [n.id, n.done]), [['a', false], ['b', true]]);
  const into = store.importBackup({ records: [], settings: store.normalizeSettings({}), notes: [] }, parsed, 'replace');
  assert.deepEqual(into.notes.map((n) => n.id), ['a', 'b']);
  assert.equal(into.summary.notesAdded, 2);
});

test('an older backup without notes imports normally and leaves notes alone', () => {
  const old = JSON.stringify({ app: 'WorkRoaster', schemaVersion: 1, records: [rec('r1')], settings: { currency: 'AUD' } });
  const parsed = store.parseBackup(old);
  assert.equal(parsed.notes, null, 'absent, not an empty list');
  const mine = [note('keep', 'Keep me')];
  for (const mode of ['merge', 'replace']) {
    const result = store.importBackup({ records: [], settings: store.normalizeSettings({}), notes: mine }, parsed, mode);
    assert.deepEqual(result.notes.map((n) => n.id), ['keep'], `${mode}: existing notes kept`);
    assert.equal(result.summary.notesAdded, 0);
    assert.equal(result.records.length, 1);
  }
  // Even when the caller has no notes at all (older code path).
  assert.deepEqual(store.importBackup({ records: [], settings: store.normalizeSettings({}) }, parsed, 'merge').notes, []);
});

test('merging notes skips ones already here (same id, or same text and state)', () => {
  const parsed = store.parseBackup(JSON.stringify({ records: [], notes: [note('a', 'Same id'), note('z', ' check  PAYSLIP '), note('n', 'New one'), note('d', 'check payslip', true)] }));
  const result = store.importBackup({ records: [], settings: store.normalizeSettings({}), notes: [note('a', 'Same id'), note('b', 'Check payslip')] }, parsed, 'merge');
  assert.deepEqual(result.notes.map((n) => n.id), ['a', 'b', 'n', 'd']);
  assert.equal(result.summary.notesAdded, 2);
});

test('all-profiles backups carry each profile’s notes; older all-profiles files still parse', () => {
  store.saveRecords([rec('m1')]);
  store.saveNotes([note('m', 'Main note')]);
  const side = store.createProfile('Side');
  store.setActiveProfile(side.id);
  store.saveNotes([note('s', 'Side note', true)]);
  store.setActiveProfile('default');
  const all = store.parseBackupFile(JSON.stringify(store.buildAllProfilesBackup()));
  assert.equal(all.kind, 'all');
  assert.deepEqual(all.profiles.map((p) => [p.name, p.parsed.notes.map((n) => n.id)]), [['My profile', ['m']], ['Side', ['s']]]);
  const older = store.parseBackupFile(JSON.stringify({ profiles: [{ name: 'Old', records: [rec('o')], settings: {} }] }));
  assert.equal(older.profiles[0].parsed.notes, null);
});

test('appearance: older settings get the classic theme and default transparency; bad values fall back', () => {
  const s = store.normalizeSettings({ currency: 'AUD' });
  assert.equal(s.visualTheme, 'classic');
  assert.equal(s.headerTransparency, store.DEFAULT_HEADER_TRANSPARENCY);
  assert.equal(store.normalizeSettings({ visualTheme: 'vaporwave' }).visualTheme, 'classic');
  assert.equal(store.normalizeSettings({ visualTheme: 'cyberpunk' }).visualTheme, 'cyberpunk');
  assert.equal(store.normalizeSettings({ headerTransparency: 140 }).headerTransparency, 100);
  assert.equal(store.normalizeSettings({ headerTransparency: -5 }).headerTransparency, 0);
  assert.equal(store.normalizeSettings({ headerTransparency: 'abc' }).headerTransparency, store.DEFAULT_HEADER_TRANSPARENCY);
  assert.equal(store.normalizeSettings({ headerTransparency: '30' }).headerTransparency, 30);
});

test('appearance is shared by every profile, like the light/dark theme', () => {
  store.saveSettings(store.normalizeSettings({ visualTheme: 'retro', headerTransparency: 70, theme: 'dark' }));
  const side = store.createProfile('Side', store.appearanceOf(store.loadSettings()));
  store.setActiveProfile(side.id);
  assert.equal(store.loadSettings().visualTheme, 'retro', 'a new profile starts with the current look');
  store.saveSettings({ ...store.loadSettings(), visualTheme: 'minimal', headerTransparency: 20 });
  store.setActiveProfile('default');
  const back = store.loadSettings();
  assert.deepEqual([back.visualTheme, back.headerTransparency, back.theme], ['minimal', 20, 'dark']);
  assert.equal(store.loadProfiles().visualTheme, 'minimal');
});
