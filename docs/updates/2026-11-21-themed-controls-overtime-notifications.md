# Themed controls everywhere, daily overtime, notification permission fix

- **Date:** 2026-11-21
- **Commit(s):** see `git log` (the commit that adds this note)
- **Version:** 0.0.2 (unchanged in this commit; the next commit sets 0.0.3)
- **Done by:** Claude Code

## What changed and why
Four Notion "Up next" tasks.

1. **Every box matches the theme.** The record form's custom weekend
   adjustment "Type" was a plain `<select>`, so phones drew their own
   system dropdown. Converted to the themed picker (`themedSelect`):
   that one, the job editor's rule types (Saturday/Sunday/Additional), the
   salary standard break, Settings → Light or dark, and the Guide's break
   example (its times now use the themed time picker too). The pay-cycle
   start date in Settings now has the themed calendar: the date picker was
   generalised (`datePickerTarget`, `dpIds()`, `dateFieldMarkup()`), and its
   body wiring is scoped to the open picker. The browser's grey
   `confirm()`/`prompt()` (14 places) are replaced by `src/dialog.js`
   (`askConfirm`, `askText`): themed, text-only (`textContent`), Escape /
   backdrop / Android back cancel, focus kept inside and restored. Number
   boxes lose the browser's spin arrows. A browser check confirms no
   visible system `<select>` is left on the main page or in any Settings tab.
2. **Overtime after a daily limit (job setting).** New job field
   `overtime { enabled, afterMinutes, lastRate }` (off by default, 8 h),
   edited in Add/Edit job (hourly jobs only), shown as a badge on the job
   card. Turning it on or changing it never asks to reprice old records.
3. **Overtime rate when a shift goes over.** With overtime on, the record
   form counts the job's other records that day; past the limit it shows
   an Overtime box asking for the overtime $/hr (pre-filled with the last
   one), and the Rate panel and calculated payment include it. Saving
   without the rate is refused in place. The record stores
   `overtimeMinutesAtEntry`, `overtimeRateAtEntry`,
   `overtimeAfterMinutesAtEntry`; the list shows "2h overtime at $45/hr".
   Re-rating a job keeps each record's split and overtime rate.
4. **Notification switch grey on a Samsung (APK file install).** Checked
   the delivered APK: it declares `POST_NOTIFICATIONS` and targets 36, so
   the manifest isn't the cause. The phone wasn't reproducible here, so the
   fix covers the likely causes and makes the next test diagnosable:
   - `ClockPlugin` now declares the permission itself and has
     `requestNotifications` (Android's prompt while it can still be shown)
     and a full `notificationStatus` (enabled, permission
     granted/prompt/prompt-with-rationale/denied, Android version, maker,
     installer package). Channels are created at plugin load.
   - A one-time "Allow notifications?" card on first start (app only),
     so Android has been asked at least once (some phones only unlock the
     switch after that).
   - **Turn on** asks when Android still allows it, otherwise opens
     Android's notification settings.
   - Settings → General → Notifications shows the status line and, while
     off, what to do if the switch is grey (ask first; if still grey and
     installed from a file, install from the Play testing link and send
     feedback with the status line).

## Files touched
- `src/dialog.js` (new); `src/app.js` (themed selects, date picker
  generalisation, dialogs, overtime form/editor/list, notification card
  and status); `src/calculations.js` (`normalizeOvertime`,
  `splitOvertime`, `paymentWithOvertime`); `src/jobs.js` (overtime field,
  reprice keeps split); `src/storage.js` (overtime snapshot on records);
  `src/native.js` (`notificationState`, `requestNotificationPermission`);
  `src/guide.js` (Daily overtime limit topic); `src/styles.css`.
- `android/.../ClockPlugin.java` (permission alias, request, status).
- `tests/unit/overtime.test.mjs` (new, 7 tests).
- `docs/data-model.md`, `docs/android-release.md`, `CHANGELOG.md`.

## How it was verified
- `npm test`: 118/118. `npm run build`: OK.
- Android compiled locally: `assembleRelease`, `bundleRelease`,
  `:app:lintDebug` → 0 errors.
- New browser suite `theme-overtime` (website dark + app, 58/58): no
  visible system dropdowns on the page or any Settings tab; custom
  adjustment, Light or dark, cycle-start calendar and the Guide example
  work through themed pickers; overtime box, refusal without a rate,
  $330 total in the box and the Rate panel, saved split, list tag, second
  record that day all overtime with the last rate offered, job without
  overtime never asks, editing an existing job's limit (7h 30m) with no
  reprice question, 0-minute limit refused in place; themed delete dialog
  (Escape cancels, Delete deletes, no browser dialogs).
- `clock-native` (28/28): first-start card → Allow shows the prompt once;
  "Not now" remembered; refused for good → Turn on opens Android
  settings; status line and greyed-switch advice shown.
- Existing suites: run 34/34, features 49/49, attack 18/18 (new check:
  hostile profile names in the themed confirm stay text), haptics 30/30,
  wording all pass.

## Decisions
- Overtime rate is entered as $/hr for the extra time (asked per shift,
  last value remembered), not a fixed multiplier.
- Overtime applies only to jobs paid by the hour (not actual-payment or
  salaried jobs).
- Notifications: ask once at first start via a card (not straight away
  with the system prompt), and always explain before sending people to
  Android's settings.

## Open / next
- Install the new build on the Samsung and report the status line from
  Settings → General → Notifications if the switch is still grey.
- Exports (PDF/Excel) show the total pay including overtime but no
  separate overtime column yet.
