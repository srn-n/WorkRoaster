/*
 * native.js — Android-app-only helpers. Never loaded on the website (see
 * platform.js). Everything here stays on the phone: the app has no INTERNET
 * permission, so none of these calls could send anything even if they tried.
 */
import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';

// App-local plugin (android/.../SaveFilePlugin.java): Android's own
// "Save as" dialog, so the person picks the folder (or Drive) themselves.
const SaveFile = registerPlugin('SaveFile');

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
