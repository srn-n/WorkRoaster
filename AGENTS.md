# AGENTS.md — WorkRoaster project context

Read this first. It is the working brief for any AI coding agent (Codex,
Claude Code, others) or new contributor picking up this repo. It covers what
the project is, the rules that must not break, how the code fits together, and
where things stand. The history of each change is in [`docs/updates/`](docs/updates/).

> **Standing rule: every update ships with a Markdown note.** See
> [Update log](#update-log-required-for-every-change) at the end. A change
> without its `docs/updates/` note is not finished.

---

## 1. What this is

**WorkRoaster** is a personal work-hours and earnings tracker. People log
shifts across one or more jobs (hourly, per-task or salaried), and the app
works out pay and the real hourly rate. Everything is grouped by pay cycle,
with PDF / Excel / JPG / CSV / JSON exports.

| | |
|---|---|
| Brand | **Simply Made Studio** (credit the studio, never an individual) |
| Website | https://work-roaster.vercel.app (Vercel, deploys from `main`) |
| Android app | Capacitor 8 wrapper of the same code, app ID `com.simplymadestudio.workroaster` (permanent), heading to Google Play |
| Repo | `srn-n/WorkRoaster`, **public on purpose** (transparency) |
| Version | `0.0.1` (in `package.json`, the single source of truth) |
| Licence | MIT |
| Stack | Vanilla JS (ES modules) + Vite 7, no framework, no backend. jsPDF, jspdf-autotable, ExcelJS |

## 2. Non-negotiable rules

Break any of these and the change is wrong, however good it looks.

### Product promises (also stated in the app's Privacy tab and the studio privacy page)
1. **No accounts, no sign-in, ever.** Profiles are local and are not logins.
2. **No backend, no network calls, no analytics, ads or tracking.** Data lives
   in `localStorage` on the device and leaves only when the person exports it.
   The only outbound actions are links the person taps (privacy/terms pages,
   the studio site) and the feedback `mailto:`.
3. **The Android app has no `INTERNET` permission** and `allowBackup="false"`.
   `tests/unit/android-promises.test.mjs` and the build workflow both enforce
   this. Never add Firebase, Google Play services, sign-in, push, analytics,
   `@capacitor/http`, `@capacitor/browser`, or any library that phones home.
4. Feedback goes **only** to `samiiiur@yahoo.com` through the person's own
   email app (`src/feedback.js`). Nothing is sent by the app itself.

### Content and branding
5. Example text, placeholders and sample data must be **generic**. Never use
   the owner's own jobs, employers, records or personal details.
6. Credit **Simply Made Studio** (https://www.simplymadestudio.net/). No
   personal-name credit, and **never** the GitHub repo URL inside the app or
   its exports.

### Security
7. **Every** value interpolated into HTML goes through `esc()` (`src/app.js`).
   Ids from storage or imports go through `safeId()` (`src/ids.js`). Never add
   inline event handlers (`onclick=` etc.); wire listeners in JS.
8. The CSP is defined **once**, in `vercel.json`. `vite.config.js` copies it
   into a `<meta>` tag at build time (for the Android WebView). Keep
   `script-src 'self'`. Don't add external origins.
9. Imports are untrusted: keep the 25 MB size guard, the schema checks and the
   id hardening. Re-run the hostile-backup checks after touching
   import/render code (see §6).

### Android
10. **Never change the app ID** (`com.simplymadestudio.workroaster`) or the
    upload signing setup. Play would treat it as a different app.
11. Signing keys and passwords **never** go in the repo (it's public). They
    live in GitHub Actions secrets only (see `docs/android-release.md`).
12. Android needs target SDK 36 for Play (in place). Don't downgrade Capacitor
    below 8.

### Git and process
13. Build **on top of** the existing commits. Never rewrite or force-push
    `main`.
14. Commits are authored as the repo owner, **Samiur Rahman**. **No AI
    attribution of any kind**: no `Co-Authored-By`, no "Generated with …"
    trailers, no AI names in commit messages. The owner doesn't want AI
    tools in the contributor list.
15. The owner usually gets changes as a git bundle or zip and pushes them
    himself. Don't push unless asked.
16. `npm test` must pass before handing anything over.

## 3. Commands

```bash
npm ci                 # install (CI uses: npm ci --ignore-scripts)
npm run dev            # Vite dev server
npm test               # unit tests (node:test), currently 85, must all pass
npm run build          # production build → dist/ (adds CSP meta, version)
npm run preview        # serve dist/ locally (port 4173)
npx cap sync android   # copy dist/ into the Android project
node tests/perf/perf-check.mjs   # optional perf smoke (Playwright)
```

Android builds run in GitHub Actions, not locally (`.github/workflows/build-android-apk.yml`):
- a push to `main` → **debug APK** artifact (version `0.0.1-debug.<run>`);
- a tag `v<package.json version>` → **signed release AAB + APK**.

## 4. Repo map

```
index.html              # app shell; status-bar scrim; #app root
public/boot.js          # pre-paint: theme, boot loader, html.is-native flag for the app
src/app.js              # main controller (~5.9k lines): state, render(), events, modals, export flow,
                        #   back button & system bars for Android (bottom of file)
src/calculations.js     # pure maths: durations, pay, cycles, insights, CSV helpers
src/storage.js          # localStorage, profiles, backup build/parse/import, migrations, downloadFile()
src/jobs.js             # job model: rates, weekend/additional rules, fixed pay (monthly/yearly)
src/settings.js         # day/payment-type option lists (add/rename/archive)
src/export.js           # PDF (jsPDF), Excel (ExcelJS), JPG (canvas). Lazy-loaded on first export
src/save-file.js        # ONE way to hand over a file: browser download, or Android "Save as"
src/platform.js         # isNativeApp(): true only inside the Android app
src/native.js           # Android-only helpers (dynamic import; never loaded on the website)
src/guide.js            # in-app Guide text (website vs app wording via IN_APP)
src/feedback.js         # feedback mailto builder (encoded; length-capped)
src/calculator.js       # built-in calculator (tokenised, no eval)
src/currency.js, ids.js, style-heal.js
src/styles.css          # all styles; themes; safe-area rules; :where(html.is-native) app rules
tests/unit/*.test.mjs   # unit tests (incl. android-promises, ids-injection, platform)
docs/data-model.md      # storage keys, record/settings shapes, migration rules — READ before touching data
docs/android-release.md # signing key, secrets, tagging, Play Console steps, device checklist
docs/updates/           # one Markdown note per change (required, see the end of this file)
android/                # committed Capacitor Android project
  app/src/main/AndroidManifest.xml        # promises: no INTERNET (tools:node="remove"), allowBackup=false, taskAffinity=""
  app/src/main/java/.../MainActivity.java # registers SaveFile; blocks /_capacitor_file_ & /_capacitor_content_
  app/src/main/java/.../SaveFilePlugin.java # Android "Save as" (SAF): type allowlist, name cleaning, size cap
  app/build.gradle      # versionName from package.json; signing from env vars only
assets/                 # icon + splash sources (regenerate with @capacitor/assets)
capacitor.config.json   # appId, webDir dist, SystemBars insets → CSS vars
vercel.json             # security headers + CSP (single source), asset caching
CHANGELOG.md            # user-facing changes, newest first
```

## 5. How it works

- **Rendering.** No framework. `state` is a plain object. `render()` rebuilds
  the UI from template strings and re-attaches listeners. Focus is restored via
  `focusAfterRender`. Keep that pattern; don't introduce a framework.
- **Data.** All in `localStorage`; see `docs/data-model.md` for keys and shapes.
  - Base keys: `modern_work_hours_tracker_v1` (records), `…_settings`,
    `…_notes`, `…_profiles` (profile index). Each profile has its own keyed
    copies.
  - `SCHEMA_VERSION = 1`.
  - Old shapes are read transparently and **never rewritten just to normalise
    them**. Records keep their rates "at entry" so later setting changes never
    alter history.
- **Backups.** JSON, either the active profile or all profiles. Import merges or
  replaces, and every import goes through `storage.js` normalisation.
- **Exports.** `export.js` is lazy-loaded. Every file goes through
  `save-file.js#saveBlob()`, which returns `'downloaded'` (website), `'saved'`
  (app) or `'cancelled'`. Toasts use `fileToast()` in `app.js`.
- **Website vs app.** `isNativeApp()` (`platform.js`) is the only switch.
  - App-only code lives in `native.js` and is loaded with a dynamic `import()`,
    so the website never fetches it.
  - Wording differs only where it must ("browser" vs "app/device",
    "Download" vs "Save"); see `FILE_VERB` and `IN_APP`.
- **Android layer (Capacitor 8.6).**
  - Exports use the app-local `SaveFile` plugin. The back button is wired via
    `@capacitor/app`. Status-bar icon colour follows the theme
    (`SystemBars.setStyle`).
  - Edge-to-edge insets come in as `--safe-area-inset-*` CSS variables.
  - Links and `mailto:` leave the WebView automatically (Capacitor hands them
    to the system).
  - `confirm()`/`alert()` work in the app: Capacitor shows them as native
    dialogs.
- **Version.** `package.json` → `__APP_VERSION__` (Vite define).
  - It shows as "Version x.y.z" in Settings → Privacy & terms and in feedback
    device details.
  - It also becomes Android's `versionName` (`build.gradle` reads
    `package.json`).
  - Play `versionCode` = `major*10000 + minor*100 + patch` (0.0.1 → 1).

## 6. Testing expectations

- `npm test` for every change.
- `tests/unit/android-promises.test.mjs` guards:
  - the app ID;
  - no permissions / `INTERNET` removed;
  - no backup;
  - no tracking libraries;
  - FileProvider only exposing the cache;
  - only the launcher activity exported, and `taskAffinity`;
  - the internal file routes blocked;
  - one version source.

  Don't weaken it; extend it.
- UI changes: check the website at 412 px and 1280 px, light and dark, and
  the app mode.
  - App mode can be simulated in a browser by loading Capacitor's
    `node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`
    with a fake `window.androidBridge`. That's how the app-mode checks were
    run.
- Import/render changes: re-run a hostile-backup check. Put HTML/script
  payloads in every string field, ids and profile names, import them, walk
  every view, and expect no injected elements, execution or CSP violations.
- Java changes can't be compiled without the Android SDK. The GitHub workflow
  is the real compile check, so push and watch the run.

## 7. Release and deployment

- **Website:** Vercel deploys `main` automatically.
- **Android:**
  1. Bump `package.json` version (`npm version x.y.z --no-git-tag-version`).
  2. Push.
  3. `git tag vX.Y.Z && git push origin vX.Y.Z`. The workflow refuses a tag
     that doesn't match `package.json`.
  4. Upload the `.aab` artifact to Play Console.
- **Play account:** personal, so the first release needs a **closed test with
  ≥12 testers opted in for 14 consecutive days** before applying for
  production. Full steps: `docs/android-release.md`.

## 8. Current status (keep this section up to date)

_Last updated: 2026-11-10_

**Done**
- Website live; security audit (29 Oct) fixes shipped; phases 1–23 of
  features/polish.
- Android app (Capacitor 8.6, API 36) with save/share, back button, insets,
  icons and splash.
- Offensive security test of the app (2 Nov), with hardening shipped in
  `5f0b4f2`.
- Version 0.0.1 set; CI debug build green (run #10).

**Next (in order)**
1. Install the debug APK on a real phone and run the device checklist in
   `docs/android-release.md`. Not done yet; so far only the simulated
   app-mode checks have run.
2. Binary-level check of the built APK: merged manifest, exported
   components, signature, dex strings.
3. Create the upload keystore and add the 4 GitHub secrets, then tag `v0.0.1`
   for the first signed release.
4. Play listing assets: feature graphic 1024×500, screenshots, descriptions.
   Recruit 15–20 closed testers.
5. Closed test (14 days), then the production application.

**Known, accepted, or deferred**
- `npm audit`: moderate advisories in exceljs's Node-only dependency chain
  (minimatch/glob). That code is **not in the shipped bundle**: Vite uses
  exceljs's prebuilt browser build.
  - A `minimatch` override was tested and **breaks `glob@7`**, so don't add it.
  - The real fix would be replacing ExcelJS with a lighter XLSX writer
    (future).
- CSP `style-src 'unsafe-inline'`: 16 inline `style=""` values (chart bars,
  calendar intensity…). Low risk; optional cleanup someday.
- The studio privacy page still says the feedback form "isn't connected to
  anything", but it now opens the email app. Reword on the studio site.
- `CHANGELOG.md` has user-facing entries; `docs/updates/` has the full trail.

## 9. Key decisions (why things are the way they are)

| Date | Decision |
|---|---|
| Oct 2026 | Repo `srn-n/WorkRoaster` is the fresh primary repo; older repos don't count. Public for transparency. |
| Oct 2026 | Branding moved to Simply Made Studio. Feedback goes to samiiiur@yahoo.com. |
| 29 Oct 2026 | CSP shipped both as a header and as a build-time meta tag (needed by the WebView). Id hardening on import. |
| 1 Nov 2026 | Android via Capacitor 8 (Play needs API 36). App ID `com.simplymadestudio.workroaster`. Android cloud backup **off**. No sign-in; users install from Play with their phone's Google account. |
| 1 Nov 2026 | Files are saved through Android's "Save as" (SAF), not a share sheet and not storage permissions. |
| 1 Nov 2026 | The `INTERNET` permission is removed; the website and the app keep identical promises. |
| 2 Nov 2026 | Version numbering starts at **0.0.1**; `package.json` is the single source. |
| 2 Nov 2026 | Third-party security report reviewed. No minimatch override (breaks glob, no shipped code affected). Trusted Types passthrough rejected (it gives no protection). HSTS is already sent by Vercel. |

---

## Update log (required for every change)

**Every update, however small, must:**

1. **Add a note** at `docs/updates/YYYY-MM-DD-short-title.md` using the
   template in [`docs/updates/README.md`](docs/updates/README.md). Cover:
   what changed and why, the files touched, how it was verified, and anything
   left open.
2. **Update §8 "Current status"** (and §9 if a decision was made) in this
   file, including the "Last updated" date.
3. **Add a `CHANGELOG.md` entry** if the change is visible to users.
4. Bump the version in `package.json` only when cutting a release (§7).

The next agent (Codex, Claude, or a person) should be able to continue from
`AGENTS.md` + the newest `docs/updates/` notes alone, without the chat history
that produced them.
