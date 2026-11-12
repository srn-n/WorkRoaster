# Notion "Up next": currency, tax estimate, clock-in, themed pickers, Guide

- **Date:** 2026-11-12
- **Commit(s):** see `git log` for "Add currency choice, tax estimate, live clock-in and themed pickers"
- **Version:** 0.0.1 (unreleased changes)
- **Done by:** Claude Code

## What changed and why
The five "Up next" tasks from the owner's Notion board (WorkRoaster project):

1. **Currency.** A menu of 25 major currencies by name (AUD default), "Other code…" (any ISO code) and "Custom" (own symbol + name, sanitised: no `< > & " ' \``). The owner decided: no conversion and no live rates, so amounts are only labelled.
2. **Tax estimate.** Settings → *Tax estimate* (off by default).
   - Countries: AU, US, UK, KR, JP, MY, BD with current-year rules, researched 12 Nov 2026 and linked in-app.
   - Each cycle's pay is annualised, taxed, then divided back.
   - Shown on the current-cycle card ("Est. tax · after tax") and in pay-cycle history.
   - Each country's tab explains its system, shows its bands, lists what's excluded, and links the sources.
3. **Live clock-in.**
   - Clock in/out bar above the current cycle; per-profile, survives reloads.
   - Clock out fills date, start and working time (or end time); the person checks and saves.
   - After 12 h:
     - an Android local notification (even when closed; the owner approved the permission);
     - a browser notification on the website while it's open;
     - an in-page warning.
4. **Android pickers.**
   - In the app, date/time inputs with a themed popover are read-only and tap-to-open, so Android's system dialog no longer appears there.
   - Android's own dialogs (remaining date picker, confirm/alert, menus) use WorkRoaster colours, light and dark (`styles.xml`, `workroaster_colors.xml`).
5. **Guide.**
   - New *Currency & tax* section.
   - New topics: *Clocking in live*, *Quick notes*, *Feedback, version and privacy*.
   - Exports note "Save as" in the app.

## Files touched
- New: `src/tax.js`, `tests/unit/tax.test.mjs`, `tests/unit/custom-currency.test.mjs`, `android/app/src/main/res/values{,-night}/workroaster_colors.xml`, `android/app/src/main/res/drawable/workroaster_dialog_background.xml`
- `src/app.js`:
  - currency menu and handlers, `displayCurrency()`;
  - tax tab and hero/history estimate;
  - clock bar, timers and clock in/out;
  - `useThemedPickersInApp()`.
- `src/currency.js`: `MAJOR_CURRENCIES`, `currencyName`, `normalizeCustomCurrency`.
- `src/calculations.js`: `formatMoney` with a custom currency.
- `src/export.js`: Excel number format for a custom symbol.
- `src/storage.js`: `customCurrency`, `tax`, `loadClock`/`saveClock`.
- `src/native.js`: local-notification reminder.
- `src/guide.js`, `src/styles.css`
- `android/app/src/main/AndroidManifest.xml`: exact alarms removed; permission comment.
- `android/app/src/main/res/values/styles.xml`: themed dialogs.
- `package.json`: adds `@capacitor/local-notifications@8.3.1`.
- `.github/workflows/build-android-apk.yml`: warns on any permission outside the allowed list.
- `tests/unit/android-promises.test.mjs`: exact permission list.
- `AGENTS.md`, `CHANGELOG.md`, `README.md`, `docs/android-release.md`

## How it was verified
- `npm test` **100/100**, including tax results against the sources' worked examples:
  - AU $100k → $20,520 + $2,000;
  - US $85k single → $9,870;
  - UK £60k → £11,432;
  - JP ¥4M deduction ¥1.24M.
- Browser (website and simulated Android app with Capacitor's real `native-bridge.js`):
  - **49/49** new-feature checks: currency, tax, clock-in incl. notification schedule/cancel, pickers, Guide;
  - **34/34** earlier behaviour checks;
  - **13/13** wording checks;
  - **17/17** hostile-backup attack checks, now also with markup in `customCurrency` and `tax` settings.
- Screens checked visually: clock bar + estimate, Tax tab, currency menu.
- Not verifiable here: the Android build itself (no SDK in this workspace). CI compiles it, and the device checklist covers the native dialogs and the reminder.

## Decisions
- Currency: labels only, no conversion (owner).
- Notifications permission approved for the reminder (owner); exact alarms removed (Play policy).
- Tax estimate is optional, off by default, and never stored on records or exports.

## Open / next
- Push, confirm CI is green, then run the updated device checklist.
- Reword the studio privacy page (feedback opens email; optional local reminder notification).
- Tax figures need a yearly refresh (see `AGENTS.md` §5).
