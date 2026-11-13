# Springy touch presses and optional vibration

- **Date:** 2026-11-13
- **Commit(s):** see `git log` (the commit that adds this note)
- **Version:** 0.0.1 (unchanged)
- **Done by:** Claude Code

## What changed and why
- Notion "Up next" task: the app's taps and option switches should be bouncy
  like the website, and there should be a vibration setting with three
  modes that doesn't depend on the phone's system settings.
- **Root cause of the missing bounce:** on a touchscreen a tapped control
  also matches `:hover`, and the `@media (hover: none)` block (which stops
  controls staying lifted after a tap) set `transform: none` *later* in the
  stylesheet than the `:active` press rule, so it cancelled the squeeze on
  every phone (website and app). On top of that, the WebView delays `:active`
  on quick taps.
- New `src/press.js`: a touch adds `.is-pressed` at once, keeps it ≥110 ms,
  then releases so the spring transition bounces back; a drag (scroll)
  releases immediately. The press rules (and the `:active` forms) now sit at
  the end of `styles.css`, after the hover-none block.
- Switching a radio card, weekday chip or tick box adds a one-shot
  `.is-switched` pop, found again after a redraw.
- Motion "Minimal" and the device's reduce-motion setting still stop all of it.
- **Vibration (Android app only):** Settings → Appearance → Vibration: a tick
  box (off by default) plus Light / Medium / Strong. One buzz per tap;
  choosing a strength previews it. `VibratePlugin.java` uses the vibrator
  directly (not view haptic feedback), so it works with the phone's
  touch-vibration switch off. Android's master "vibration off" still wins.

## Files touched
- `src/press.js` (new), `src/vibration.js` (new): press/pop and the per-phone choice.
- `src/app.js`: installs press feedback; Vibration fieldset (app only) and its wiring.
- `src/native.js`: `vibrateTap(strength)`.
- `src/styles.css`: `.is-pressed` / `.is-switched` rules at the end of the file; calc-key spring.
- `src/guide.js`: Appearance topic mentions vibration in the app.
- `android/.../VibratePlugin.java` (new), `MainActivity.java` (registers it),
  `AndroidManifest.xml` (`VIBRATE`).
- `tests/unit/android-promises.test.mjs` (pinned list now includes `VIBRATE`),
  `tests/unit/vibration.test.mjs`, `tests/unit/press.test.mjs` (new).
- `.github/workflows/build-android-apk.yml`: `VIBRATE` allowed in the APK check.
- `AGENTS.md`, `CHANGELOG.md`, `README.md`, `docs/android-release.md`, `docs/data-model.md`.

## How it was verified
- `npm test`: 108/108. `npm run build`: OK.
- Browser harness with real CDP touch events, website and simulated app
  (30/30): press squeezes to 0.94 at once; an instant tap holds ~110 ms;
  springs back; drag doesn't press; Motion switch pops after the redraw;
  vibration off by default, one preview buzz on turning on, Strong previews
  once, taps buzz once, silent when off, survives restart, not in profile
  settings; reduced motion → no squeeze; no errors, same-origin only.
- Existing suites still pass: run 34/34, features 49/49, attack 17/17, wording all pass.
- Java not compiled locally (no Android SDK here): CI builds it.

## Decisions
- Vibration is app-only, off by default, per phone (own key
  `modern_work_hours_tracker_v1_vibration`), not in backups.
- `VIBRATE` is now an allowed permission (normal permission: no prompt, not
  shown in the app's permission screen, no Play declaration).
- The press fix applies to the website on phones too (same cause, same fix).

## Open / next
- Check the CI build compiles `VibratePlugin.java`, then feel it on a real
  phone (device checklist has two new items). Durations/amplitudes are in
  `VibratePlugin.java` if Light/Strong need tuning.
