/*
 * native.js — Android-app-only helpers. Never loaded on the website (see
 * platform.js). Everything here stays on the phone: the app has no INTERNET
 * permission, so none of these calls could send anything even if they tried.
 */
import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';

// App-local plugin (android/.../SaveFilePlugin.java): Android's own
// "Save as" dialog, so the person picks the folder (or Drive) themselves.
const SaveFile = registerPlugin('SaveFile');
// App-local plugin (android/.../VibratePlugin.java): a short buzz on taps,
// made with the phone's vibrator directly (see vibration.js).
const Vibrate = registerPlugin('Vibrate');

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

/** Resolves true when the file was saved, false when the person cancelled. */
export async function saveBlob(blob, filename) {
  const data = await blobToBase64(blob);
  const result = await SaveFile.save({ filename, data, mimeType: blob.type || 'application/octet-stream' });
  return Boolean(result && result.saved);
}

/** One short buzz: 'light' | 'medium' | 'strong'. Never throws or waits. */
export function vibrateTap(strength) {
  Vibrate.tap({ strength }).catch(() => {});
}

/** Android back button / gesture. The handler decides what "back" means. */
export function onBackButton(handler) {
  App.addListener('backButton', () => handler());
}

/** Back on the main screen: leave the app the way Android apps do, keeping it
 *  in recents (minimise rather than kill, so nothing in progress is lost). */
export function leaveApp() {
  App.minimizeApp().catch(() => {});
}

/** Status / navigation bar icons: light icons on a dark page, dark on light. */
export function setBarsForDarkPage(isDark) {
  SystemBars.setStyle({ style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

// "Still clocked in?" reminder. A local notification scheduled on the phone
// itself (no server, no internet): Android shows it at the given time even
// when the app is closed, and restores it after a restart.
const CLOCK_REMINDER_ID = 1201;

/** Ask for the notifications permission (Android 13+ asks the person once). */
export async function ensureNotificationPermission() {
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleClockReminder(atMs) {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: CLOCK_REMINDER_ID }] });
    if (!(await ensureNotificationPermission())) return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: CLOCK_REMINDER_ID,
        title: 'Still clocked in?',
        body: "You've been clocked in for 12 hours. Open WorkRoaster to clock out.",
        schedule: { at: new Date(atMs), allowWhileIdle: true },
      }],
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelClockReminder() {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: CLOCK_REMINDER_ID }] });
  } catch {
    /* nothing scheduled */
  }
}
