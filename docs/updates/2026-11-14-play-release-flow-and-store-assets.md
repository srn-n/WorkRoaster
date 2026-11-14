# Play-ready release flow, store assets and two small-phone layout fixes

- **Date:** 2026-11-14
- **Commit(s):** see `git log` (the commit that adds this note)
- **Version:** 0.0.1 (unchanged; versionCode 1)
- **Done by:** Claude Code

## What changed and why
- The owner asked for the same release flow as Bouncy Calculator: CI builds
  the release unsigned, it's signed on his computer with the key in
  `.signing\`, and a Play-ready folder `C:\Working Projects\WorkRoasterApp`
  holds the AAB, APK, `PLAY-STORE-UPLOAD.md` and the store assets.
- **Workflow:** a `v*` tag now builds the release **unsigned** unless the
  `WORKROASTER_KEYSTORE_BASE64` secret exists (`HAS_SIGNING`), and the
  artifact adds `apksigner.jar` and `SHA256SUMS.txt`. The debuggable and
  INTERNET checks still run; the signature check runs only when CI signed.
- **Upload key:** already present in `.signing\` (created 14 Nov 13:37 local,
  alias `workroaster-upload`, RSA 4096, CN/O Simply Made Studio, valid to
  2054). Checked with keytool; both passwords in `keystore.properties` work.
  Not regenerated. `.gitignore` lists `.signing/`, `*.jks`, `*.keystore`,
  `keystore.properties`; a new unit test fails if any line goes missing.
- **Store assets** in `release/store/`: `LISTING.md` (name, short and full
  description, settings, every App content answer, release steps),
  `icon-512.png` (from `assets/icon-only.png`), `feature-graphic-1024x500.png`,
  8 phone screenshots 1080×2160 (app mode, en-AU, made-up café shifts).
- **Layout fixes found while taking screenshots** (website and app, 360–420px):
  date + pay cycle stack below 421px (`.date-cycle-grid`), starting time +
  working time stack below 400px (`.start-duration-grid`). At 360px the
  minutes box was 26px wide and showed "30" as "3"; now 113px.
- AGENTS.md rule 11 updated: the key lives in `.signing\` locally; CI secrets
  optional.

## Files touched
- `.github/workflows/build-android-apk.yml`, `.gitignore`
- `src/app.js` (two grid classes), `src/styles.css` (two media rules)
- `release/store/**` (new)
- `tests/unit/android-promises.test.mjs` (key can't be committed; unsigned path)
- `docs/android-release.md` (local signing A / CI secrets B, release steps 3–7)
- `AGENTS.md`, `CHANGELOG.md`

## How it was verified
- `npm test`: 109/109. `npm run build`: OK. Workflow YAML parses.
- Browser suites: run, features, attack, wording, haptics all pass.
- Hour/minute box widths measured at 360 / 390 / 412px: 113 / 128 / 51px.

## Decisions
- Sign locally by default (the key never leaves the owner's computer).

## Open / next
- Owner pushes, then tags `v0.0.1`; sign the artifact locally and fill
  `WorkRoasterApp`. Then Play Console: create app, closed testing.
