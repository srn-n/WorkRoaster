# Offensive test of the Android app, hardening, version 0.0.1

- **Date:** 2026-11-02
- **Commit(s):** `5f0b4f2`
- **Version:** 0.0.1
- **Done by:** Claude Code

## What changed and why
- Attacked the app build:
  - hostile backups with injection payloads in every field, id and profile name;
  - exports of that hostile data;
  - malformed and oversized files;
  - intent/deep-link abuse;
  - access to the JavaScript bridge;
  - the WebView configuration.

  **No working attack.** Full report: project doc `android-offensive-test-0.0.1.md`.
- Hardening:
  - Blocked Capacitor's internal `/_capacitor_file_` and `/_capacitor_content_` routes in `MainActivity`.
  - `taskAffinity=""`.
  - SaveFile accepts only the 5 WorkRoaster file types, cleans names and caps size.
  - All workflow actions pinned to commit SHAs; Gradle wrapper validation added.
- Version **0.0.1**:
  - `package.json` is the single source.
  - Shown in Settings → Privacy & terms and in feedback device details.
  - The release tag must match it.
  - Debug builds are named `0.0.1-debug.<run>`.
- App buttons say "Save"; long profile names wrap.

## Files touched
- `android/app/src/main/AndroidManifest.xml`, `MainActivity.java`, `SaveFilePlugin.java`, `android/app/build.gradle`
- `.github/workflows/build-android-apk.yml`, `vite.config.js`, `package.json`, `src/app.js`, `src/feedback.js`, `src/guide.js`, `src/styles.css`
- `tests/unit/android-promises.test.mjs`, `docs/android-release.md`, `CHANGELOG.md`

## How it was verified
- `npm test` 85/85.
- Browser suites: 34/34 behaviour, 13/13 wording, 17/17 attack.
- Route matcher and filename cleaning checked in Java.
- CI run #10 green.

## Decisions
- Version numbering starts at 0.0.1.

## Open / next
- Device checklist on a real phone.
- Binary check of the built APK.
- Signing secrets, then tag `v0.0.1`.
