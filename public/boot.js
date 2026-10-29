/*
 * boot.js — runs before the first paint (a plain, synchronous script in
 * <head>; the CSP allows only same-origin scripts, never inline ones).
 *
 * It copies the saved appearance (light/dark, colour theme, motion) onto
 * <html> so the loading screen — and the first frame of the app — already
 * look like the theme the person chose, with no flash of the default look.
 * app.js sets the same attributes again once it starts; if anything here
 * fails, the page simply starts in the default look.
 *
 * Keys and precedence mirror storage.js: shared appearance lives in the
 * profiles index once there are several profiles, otherwise in the open
 * profile's settings.
 */
(function () {
  try {
    var SETTINGS = 'modern_work_hours_tracker_v1_settings';
    var PROFILES = 'modern_work_hours_tracker_v1_profiles';
    var read = function (key) {
      try {
        var v = JSON.parse(localStorage.getItem(key));
        return v && typeof v === 'object' ? v : {};
      } catch (e) {
        return {};
      }
    };
    var index = read(PROFILES);
    var id = typeof index.active === 'string' && /^[a-z0-9-]+$/.test(index.active) ? index.active : 'default';
    var settings = read(id === 'default' ? SETTINGS : SETTINGS + '__' + id);
    var pick = function (key) {
      return index[key] !== undefined ? index[key] : settings[key];
    };
    var root = document.documentElement;
    var theme = pick('theme');
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    var visual = pick('visualTheme');
    if (visual === 'sky' || visual === 'sage' || visual === 'plum') root.setAttribute('data-visual', visual);
    var motion = pick('motionStyle');
    root.setAttribute('data-motion', motion === 'smooth' || motion === 'minimal' ? motion : 'bouncy');
  } catch (e) {
    /* Storage blocked (private mode, WebView settings): default look. */
  }
})();
