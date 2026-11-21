# Changelog

All notable changes to WorkRoaster are listed here.

## Unreleased — 2026-11-21

- **Overtime after a daily limit:** a job paid by the hour can count time over a daily limit (for example 8 hours, your workplace's rule) as overtime — turn it on when adding a job or by editing one. When a shift goes over, WorkRoaster asks for the overtime rate for the extra time and adds it to the pay (8h × $30 + 2h × $45 = $330). The rate is remembered for next time, and old records never change.
- **Every box matches your theme:** the custom weekend adjustment type, the job editor's rule types, the salary break, Light or dark, the Guide's examples and the pay-cycle start date now use WorkRoaster's own themed pickers instead of the phone's or browser's plain ones. Yes/no questions and renames now appear in a themed dialog too.
- **Android app — notifications:** a one-time "Allow notifications?" card on first start; **Turn on notifications** shows Android's prompt when it can, or opens Android's settings when it can't; Settings → General → Notifications shows exactly what Android reports, with help if its switch is greyed out.

## 0.0.2 — 2026-11-16

- **Android app — clocked-in notification:** while you're clocked in, a small WorkRoaster icon stays in the status bar, and the notification panel shows the time counting up second by second with a **Clock out** button. It stays until you clock out (swiping it away brings it back) and returns after a restart.
- **Android app — notifications you can fix:** Settings → General → Notifications shows whether they're on, with **Turn on notifications** (Android's prompt, or its notification settings if you said no before). If they're off while you're clocked in, the clock bar says so with a **Turn on** link.
- **Android app — home-screen widgets:** *Clock in* (one tap to clock in, with a live timer and Clock out) and *Pay cycle* (this cycle's dates, earned so far, hours and the after-tax estimate if it's on).

## Earlier — 2026-11-14

- **Small phones:** on screens 360–420px wide, the date and its pay cycle, and the starting time and working time, now sit one under the other. Before, the pay cycle was squeezed into a narrow column and the minutes box was too small to show "30".
- **Springy taps on phones and tablets:** buttons, tabs and option cards now squeeze and bounce back under your finger, like they do with a mouse, even on a quick tap. Switching an option or ticking a box gives it a small pop. (A phone-only rule had been cancelling the press.) Settings → Appearance → Motion and your device's reduce-motion setting still apply.
- **Android app — vibration (optional, off by default):** Settings → Appearance → Vibration. Choose Light, Medium or Strong. It works even when your phone's own touch vibration is off; it stays off if vibration is switched off for the whole phone. Saved on that phone only.

## Earlier in this release — 2026-11-12

- **Currency menu:** pick a major currency by name (AUD default), any other ISO code, or your own symbol and name. Labels only; nothing is converted.
- **Tax estimate (optional, off by default):** estimated tax and after-tax pay per pay cycle for Australia, the USA, the UK, South Korea, Japan, Malaysia and Bangladesh.
  - Uses current-year rates.
  - Settings explains each country's system, what's included and the official sources.
- **Live clock-in:** a running timer per profile. Clock out fills the record form for you to check and save. A reminder comes if you're still clocked in after 12 hours: a phone notification in the app, or a browser notification on the website while it's open.
- **Android app:** date and time fields open WorkRoaster's own pickers. Android's own dialogs (confirmations, menus) use WorkRoaster's colours in light and dark.
- **Guide:** new *Currency & tax* section, plus topics for clocking in, quick notes, feedback/version, and Save as in the app.

## 0.0.1 — 2026-11-02 (first Android release)

Version numbers start here: `package.json` holds the one version for the
website and the app, shown in Settings → Privacy & terms.

- Security hardening from an offensive test of the Android app:
  - Capacitor's internal file routes (`/_capacitor_file_`, `/_capacitor_content_`) are closed.
  - The main screen can't be hijacked by another app's task (`taskAffinity=""`).
  - "Save as" only accepts WorkRoaster's own file types, cleans file names and refuses absurd sizes.
  - Build actions are pinned to commit SHAs and the Gradle wrapper is verified.
- Release tags must match the `package.json` version; test builds are named `<version>-debug.<run>`.
- In the app, backup buttons say "Save" instead of "Download".
- Long profile names no longer push the backup button off a phone screen.
- Feedback device details include the WorkRoaster version.

## 2026-11-01

- Android app project (Capacitor 8, targets Android 16 / API 36, as Google Play requires).
- App ID `com.simplymadestudio.workroaster`; app icon, themed icon and light/dark launch screen.
- No `INTERNET` permission and no cloud backup in the app; a test and the build workflow guard both.
- Exports and backups use Android's "Save as" dialog in the app; the website still downloads as before.
- Android back button closes pickers and dialogs first, then leaves Notes, then leaves the app.
- Status-bar icons follow the light/dark theme; layout clears the status and navigation bars on phones and tablets.
- Backup import in the app also accepts files Android labels as text or generic data.
- Build workflow: debug APK on every push, signed `.aab` + `.apk` for `v*` tags.

## 2026-10-29 – 2026-10-30

- Imports hardened against markup in ids; CSP shipped in the build; dependencies patched.
- Phone-browser optimisations, email feedback, Simply Made Studio credit, themed loading screen.
- Work calendar, date picker, rate values and Editing badge follow the colour theme.

## 2026-10-28

- Live address is now https://work-roaster.vercel.app.
- Link previews, `sitemap.xml` and `robots.txt` point to the new address.

## 2026-10-25

- Sky, Sage and Plum themes, liquid-glass surfaces and bouncy motion settings.
- Android APK build workflow.
