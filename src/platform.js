/*
 * platform.js — "are we inside the Android app?"
 *
 * The app's native layer (Capacitor) defines window.Capacitor before any page
 * script runs. On the website it is absent, so nothing app-only ever loads
 * there: native.js is only fetched through a dynamic import() when this
 * returns true.
 */
export function isNativeApp(win = typeof window !== 'undefined' ? window : undefined) {
  try {
    return Boolean(win && win.Capacitor && typeof win.Capacitor.isNativePlatform === 'function' && win.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}
