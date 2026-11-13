/*
 * vibration.js — the Android app's "vibrate on taps" choice.
 *
 * Kept per phone (its own storage key), not per profile and not in backups:
 * how a phone buzzes belongs to that phone. Off until the person turns it on.
 * The buzz itself is made by android/.../VibratePlugin.java, which uses the
 * phone's vibrator directly, so it works even when Android's own "touch
 * vibration" is off (Android still keeps it silent if all vibration is off).
 */

export const VIBRATION_KEY = 'modern_work_hours_tracker_v1_vibration';

export const VIBRATION_STRENGTHS = [
  { id: 'light', name: 'Light', blurb: 'A soft tick.' },
  { id: 'medium', name: 'Medium', blurb: 'A clear tap.' },
  { id: 'strong', name: 'Strong', blurb: 'A firm buzz.' },
];
export const DEFAULT_VIBRATION = Object.freeze({ enabled: false, strength: 'medium' });

const STRENGTH_IDS = VIBRATION_STRENGTHS.map((s) => s.id);

export function normalizeVibration(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: value.enabled === true,
    strength: STRENGTH_IDS.includes(value.strength) ? value.strength : DEFAULT_VIBRATION.strength,
  };
}

export function loadVibration(storage = globalThis.localStorage) {
  try {
    return normalizeVibration(JSON.parse(storage.getItem(VIBRATION_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_VIBRATION };
  }
}

/** Returns false when storage is unavailable (the choice then lasts this session). */
export function saveVibration(value, storage = globalThis.localStorage) {
  try {
    storage.setItem(VIBRATION_KEY, JSON.stringify(normalizeVibration(value)));
    return true;
  } catch {
    return false;
  }
}
