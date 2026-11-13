import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeVibration, loadVibration, saveVibration, VIBRATION_KEY, VIBRATION_STRENGTHS, DEFAULT_VIBRATION } from '../../src/vibration.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
};

test('vibration is off by default, with three strengths', () => {
  assert.deepEqual(normalizeVibration(undefined), { enabled: false, strength: 'medium' });
  assert.equal(DEFAULT_VIBRATION.enabled, false);
  assert.deepEqual(VIBRATION_STRENGTHS.map((s) => s.id), ['light', 'medium', 'strong']);
});

test('only true turns it on; unknown strengths fall back to medium', () => {
  assert.equal(normalizeVibration({ enabled: 'yes' }).enabled, false);
  assert.equal(normalizeVibration({ enabled: true }).enabled, true);
  assert.equal(normalizeVibration({ strength: 'max' }).strength, 'medium');
  assert.equal(normalizeVibration({ strength: 'strong' }).strength, 'strong');
});

test('saved per phone under its own key and read back', () => {
  const storage = memoryStorage();
  assert.equal(saveVibration({ enabled: true, strength: 'light', extra: '<x>' }, storage), true);
  assert.deepEqual(JSON.parse(storage.map.get(VIBRATION_KEY)), { enabled: true, strength: 'light' });
  assert.deepEqual(loadVibration(storage), { enabled: true, strength: 'light' });
});

test('broken or blocked storage never throws', () => {
  const broken = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(loadVibration(broken), { enabled: false, strength: 'medium' });
  assert.equal(saveVibration({ enabled: true }, broken), false);
});

test('the Android plugin buzzes directly and only needs VIBRATE', () => {
  const java = fs.readFileSync(new URL('../../android/app/src/main/java/com/simplymadestudio/workroaster/VibratePlugin.java', import.meta.url), 'utf8');
  assert.match(java, /@CapacitorPlugin\(name = "Vibrate"\)/);
  // Haptic feedback on a view obeys the phone's touch-vibration switch; the vibrator does not.
  assert.doesNotMatch(java, /performHapticFeedback/);
  assert.doesNotMatch(java, /java\.net|HttpURLConnection|Socket/);
  const main = fs.readFileSync(new URL('../../android/app/src/main/java/com/simplymadestudio/workroaster/MainActivity.java', import.meta.url), 'utf8');
  assert.match(main, /registerPlugin\(VibratePlugin\.class\)/);
});
