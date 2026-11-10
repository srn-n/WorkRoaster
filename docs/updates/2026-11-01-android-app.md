# Android app for Google Play (Capacitor 8)

- **Date:** 2026-11-01
- **Commit(s):** `35149c1`
- **Version:** 1.0.0 (pre-versioning; became 0.0.1 on 2026-11-02)
- **Done by:** Claude Code

## What changed and why
- Wrapped the website as an Android app with Capacitor 8.6 (target/compile SDK 36, min 24), because Play requires API 36.
- App ID `com.simplymadestudio.workroaster` (permanent). Icons, themed icon, light/dark launch screen.
- The promises are enforced by the platform: no `INTERNET` permission, `allowBackup="false"`, no storage permission, no tracking or sign-in libraries.
- WebView fixes:
  - Exports and backups use Android "Save as" (`SaveFilePlugin`), because a WebView ignores `<a download>`.
  - Back button handling.
  - Status-bar style follows the theme.
  - Safe-area insets.
  - Import accepts files Android labels as text or octet-stream.
  - App wording ("this device", not "this browser").
- Workflow: debug APK on push to `main`; signed AAB + APK on `v*` tags.

## Files touched
- `android/` (new, committed), `capacitor.config.json`, `assets/`
- `src/platform.js`, `src/native.js`, `src/save-file.js` (new); `src/app.js`, `src/export.js`, `src/storage.js`, `src/guide.js`, `src/styles.css`, `public/boot.js`, `index.html`
- `.github/workflows/build-android-apk.yml`, `docs/android-release.md`, `tests/unit/android-promises.test.mjs`, `tests/unit/platform.test.mjs`

## How it was verified
- `npm test` 81/81; clean `npm ci --ignore-scripts` → test → build → `cap sync`.
- Browser checks on the website (exports still download, layout pixel-identical) and on a simulated app using Capacitor's real `native-bridge.js` (34/34).
- Java compiled against stubs; CI run #9 green (debug APK, no INTERNET permission).

## Decisions
- Android cloud backup off. No sign-in. Personal Play account, so a closed test with 12+ testers for 14 days is needed.

## Open / next
- Real-device testing; signing secrets; Play listing.
