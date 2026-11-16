# Clocked-in notification, notification permission, home-screen widgets; AGENTS.md kept local

- **Date:** 2026-11-16
- **Commit(s):** see `git log` (the commit that adds this note)
- **Version:** 0.0.1 (unchanged; the next Play upload needs 0.0.2 / code 2)
- **Done by:** Claude Code

## What changed and why
Four Notion "Up next" tasks.

1. **AGENTS.md (and CLAUDE.md) leave the repo** and live only on the owner's
   computer: `git rm --cached`, added to `.gitignore`, a unit test checks
   both lines. README, `docs/updates/README.md` and a workflow message no
   longer point at the file. (Earlier versions remain in git history.)
2. **Notification permission "not working properly"** (owner's
   clarification: the notification, not animation). Before, the app asked
   once at clock-in and said nothing if refused; after "Don't allow" Android
   never asks again, so there was no way back. Now:
   - Settings → General → **Notifications** (app only): On/Off status,
     **Turn on notifications** (Android's prompt, else opens this app's
     notification settings), **Notification settings** when on.
   - Clock-in asks, and says plainly if they stay off; while clocked in with
     them off, the clock bar shows a note with **Turn on**.
   - Status refreshes whenever you return to the app.
3. **Clocked-in notification** (`ClockNotification.java`): channel
   "Clocked in" (low importance, silent); small status-bar icon; header
   chronometer plus an expanded view with a large timer counting seconds;
   "Clock out" action (opens the app and fills the record, same as the
   in-app button). Ongoing; Android 14+ allows swiping ongoing
   notifications, so the delete intent reposts it (`ClockReceiver`) while
   still clocked in; reposted after reboot/app update. Guide text added:
   it "stays there until you clock out".
4. **Widgets**: `ClockWidget` (Clock in → live chronometer + Clock out) and
   `SummaryWidget` (current pay cycle: dates, earned, hours, after-tax
   estimate). Widget clock-in is stored natively and adopted by the app on
   return (same profile only). Pushes from the app happen only when the
   app's own clock/summary changes, so a render before adoption can't wipe
   a widget clock-in.

`ClockPlugin` bridges JS ↔ Android (`sync`, `get`, `setSummary`,
`notificationStatus`, `openNotificationSettings`, `takeAction`, event
`action`). No new permissions. Exported components are now MainActivity +
the two widget providers (Android requires widget providers to be
exported); they handle only `APPWIDGET_UPDATE`, and every PendingIntent is
immutable — both enforced by tests.

## Files touched
- Android: `ClockStore`, `ClockNotification`, `ClockReceiver`, `ClockWidget`,
  `SummaryWidget`, `ClockPlugin` (new); `MainActivity` (registers it);
  `AndroidManifest.xml` (receivers); `res/layout/widget_clock.xml`,
  `widget_summary.xml`, `notification_clock_big.xml`; `res/xml/widget_*_info.xml`;
  `res/drawable/widget_background.xml`, `widget_button.xml`; `values/strings.xml`.
- Web: `src/native.js` (Clock bridge, resume/action listeners, tolerant of a
  missing plugin), `src/app.js` (sync/adopt, permission UI, summary push),
  `src/guide.js` (notification paragraph + widgets topic, app only),
  `src/styles.css`.
- Tests: `tests/unit/android-promises.test.mjs` (exported components exact,
  widget filters, immutable PendingIntents, ongoing + delete intent,
  AGENTS.md ignored).
- Docs: `docs/data-model.md`, `CHANGELOG.md`, README, `docs/updates/README.md`,
  `.gitignore`, workflow message.

## How it was verified
- `npm test`: 111/111. `npm run build`: OK.
- **Compiled locally** with the Android SDK (platform 36, build-tools
  36.0.0): `assembleDebug`, `assembleRelease`, `bundleRelease` OK;
  `:app:lintDebug` 0 errors (warnings: API-31-only widget attributes,
  hard-coded English strings). aapt2 on the release APK: permissions
  unchanged; exported = MainActivity, ClockWidget, SummaryWidget (+ AndroidX
  ProfileInstallReceiver behind the system DUMP permission).
- New browser suite `clock-native` (fake bridge, 22/22): permission off →
  Settings shows Off; Turn on → prompt then opens Android settings; back →
  On; clock-in pushes start time and still schedules the 12 h reminder;
  notifications off while clocked in → note; notification Clock out → form
  filled, Android told; widget clock-in survives renders and is adopted on
  resume; widget summary has range/earned/hours; guide text; website shows
  none of it; no errors, same-origin only.
- Existing suites: run 34/34, features 49/49, attack 17/17, haptics 30/30,
  wording all pass.
- **Not yet seen on a real phone**: the notification and widgets need a
  device (no emulator here). Device checklist items added.

## Decisions
- AGENTS.md is local-only (owner).
- Notification reposts itself when dismissed rather than using a foreground
  service (no extra permission or Play declaration, no battery cost).
- Notification and widgets follow the active profile.

## Open / next
- Push, then install the debug APK on a phone: run the new checklist items.
- Next Play upload: `npm version 0.0.2 --no-git-tag-version`, tag `v0.0.2`.
