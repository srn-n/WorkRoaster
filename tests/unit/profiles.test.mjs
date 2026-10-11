// Profiles: separate workspaces; the first one is the data that was always there.
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
const rec = (id, date = '2026-09-22') => ({ id, date, start: '09:00', workingMinutes: 60, breakMinutes: 0, paymentAmount: 10 });

beforeEach(() => {
  mem.clear();
  store.setActiveProfile(store.DEFAULT_PROFILE_ID);
});

test('existing data is the first profile, under the original keys, untouched', () => {
  mem.set(store.RECORDS_KEY, JSON.stringify([rec('old')]));
  mem.set(store.SETTINGS_KEY, JSON.stringify({ currency: 'NZD' }));
  const index = store.loadProfiles();
  assert.deepEqual(index.profiles, [{ id: 'default', name: 'My profile' }]);
  assert.equal(store.loadRecords()[0].id, 'old');
  assert.equal(store.loadSettings().currency, 'NZD');
  assert.equal(mem.has(store.PROFILES_KEY), false, 'nothing new is written for single-profile users');
  store.saveRecords([rec('a')]);
  assert.equal(JSON.parse(mem.get(store.RECORDS_KEY))[0].id, 'a');
});

test('profiles keep separate records, jobs and pay cycles', () => {
  store.saveRecords([rec('main-1')]);
  store.saveSettings(store.normalizeSettings({ payCycleLengthDays: 7, jobs: [{ id: 'w', name: 'Westfield' }] }));
  const side = store.createProfile('Side job', { theme: 'dark' });
  assert.equal(side.id, 'side-job');
  store.setActiveProfile(side.id);
  assert.deepEqual(store.loadRecords(), []);
  assert.equal(store.loadSettings().jobs.length, 0);
  store.saveRecords([rec('side-1')]);
  store.saveSettings({ ...store.loadSettings(), payCycleLengthDays: 14, payCycleAnchor: '2026-09-29' });
  store.setActiveProfile('default');
  assert.deepEqual(store.loadRecords().map((r) => r.id), ['main-1']);
  assert.equal(store.loadSettings().payCycleLengthDays, 7);
  assert.equal(store.loadSettings().jobs[0].name, 'Westfield');
  assert.equal(store.loadSettingsFor('side-job').payCycleAnchor, '2026-09-29');
  assert.deepEqual(store.loadRecordsFor('side-job').map((r) => r.id), ['side-1']);
});

test('the theme is shared between profiles', () => {
  store.saveProfiles({ ...store.loadProfiles(), theme: 'light' });
  store.createProfile('B');
  store.setActiveProfile('b');
  store.saveSettings({ ...store.loadSettings(), theme: 'dark' });
  store.setActiveProfile('default');
  assert.equal(store.loadSettings().theme, 'dark');
});

test('names are unique ids; renaming and deleting work; first profile is protected', () => {
  const a = store.createProfile('Side Job');
  const b = store.createProfile('side job!');
  assert.notEqual(a.id, b.id);
  assert.equal(store.renameProfile(a.id, '  Weekend work  '), true);
  assert.equal(store.loadProfiles().profiles.find((p) => p.id === a.id).name, 'Weekend work');
  assert.equal(store.renameProfile(a.id, '   '), false);
  store.setActiveProfile(a.id);
  store.saveRecords([rec('x')]);
  assert.equal(store.deleteProfile('default'), false);
  assert.equal(store.deleteProfile(a.id), true);
  assert.equal(mem.has(store.recordsKeyFor(a.id)), false, 'its data is removed');
  assert.equal(store.getActiveProfileId(), 'default', 'deleting the open profile falls back to the first');
  assert.equal(store.loadProfiles().profiles.length, 2);
});

test('the open profile is remembered; a broken or unknown saved id falls back safely', () => {
  const p = store.createProfile('Two');
  store.rememberActiveProfile(p.id);
  assert.equal(store.loadProfiles().active, p.id);
  assert.equal(store.setActiveProfile('nope'), 'default');
  mem.set(store.PROFILES_KEY, '{broken');
  assert.deepEqual(store.loadProfiles().profiles.map((x) => x.id), ['default']);
});

test('backups name their profile; "all profiles" backups round-trip', () => {
  store.saveRecords([rec('m')]);
  const side = store.createProfile('Side');
  store.setActiveProfile(side.id);
  store.saveRecords([rec('s1'), rec('s2', '2026-09-23')]);
  store.setActiveProfile('default');
  const single = store.parseBackupFile(JSON.stringify(store.buildBackup(store.loadRecords(), store.loadSettings(), 'My profile')));
  assert.equal(single.kind, 'single');
  assert.equal(single.profileName, 'My profile');
  const all = store.parseBackupFile(JSON.stringify(store.buildAllProfilesBackup()));
  assert.equal(all.kind, 'all');
  assert.deepEqual(all.profiles.map((p) => [p.name, p.parsed.records.length]), [['My profile', 1], ['Side', 2]]);
  assert.throws(() => store.parseBackupFile(JSON.stringify({ profiles: [{ name: 'Bad', records: [{ id: 'x' }] }] })), /Profile “Bad”/);
  assert.throws(() => store.parseBackupFile(JSON.stringify({ profiles: [] })), /no profiles/);
});
