// Self-healing stylesheet.
//
// Hashed files under /assets/ are served with a one-year "immutable" cache
// header. If a browser ever fetches the stylesheet at a bad moment and gets
// a 404 (or a broken copy), it can keep that bad answer for a year and show
// the page unstyled until its cache is cleared — which is what Brave did.
//
// Pending stylesheets block module scripts, so by the time this runs the
// stylesheet has either applied or failed. styles.css sets --wr-styles: 1 on
// :root; if that marker is missing, fetch the stylesheet again past the
// browser cache (which also repairs the cached copy for next time) and add a
// fresh <link>. If even that fails, reload the page once per tab session.
const MARKER = '--wr-styles';
const RELOAD_FLAG = 'wr_style_heal_reload';

export function stylesApplied(doc = document) {
  return doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue(MARKER).trim() === '1';
}

function reloadOnce(win) {
  try {
    if (win.sessionStorage.getItem(RELOAD_FLAG)) return;
    win.sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    return; // no sessionStorage: never risk a reload loop
  }
  win.location.reload();
}

export function healStylesheet(doc = document) {
  if (stylesApplied(doc)) {
    try { doc.defaultView.sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
    return false;
  }
  const win = doc.defaultView;
  const link = doc.querySelector('link[rel="stylesheet"]');
  if (!link) return false;
  const href = link.getAttribute('href');
  // Refresh the browser's cached copy of the original URL for the next visit.
  try { win.fetch(href, { cache: 'reload', credentials: 'same-origin' }).catch(() => {}); } catch { /* ignore */ }
  const fresh = doc.createElement('link');
  fresh.rel = 'stylesheet';
  fresh.href = `${href}${href.includes('?') ? '&' : '?'}retry=${Date.now()}`;
  fresh.addEventListener('load', () => { if (!stylesApplied(doc)) reloadOnce(win); });
  fresh.addEventListener('error', () => reloadOnce(win));
  link.after(fresh);
  return true;
}

if (typeof document !== 'undefined') healStylesheet();
