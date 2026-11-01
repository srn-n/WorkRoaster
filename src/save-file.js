/*
 * save-file.js — one way to hand a finished file to the person.
 *
 * Website: the browser download, exactly as before.
 * Android app: a WebView ignores <a download>, so the file goes to Android's
 * "Save as" dialog instead (native.js). Either way the file is made on the
 * device and goes only where the person puts it.
 *
 * Resolves to 'downloaded' (website), 'saved' (app) or 'cancelled' (the
 * person closed the app's save dialog), so messages can say what happened.
 */
import { isNativeApp } from './platform.js';

export async function saveBlob(blob, filename) {
  if (isNativeApp()) {
    const native = await import('./native.js');
    return (await native.saveBlob(blob, filename)) ? 'saved' : 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
