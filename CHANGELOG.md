# Changelog

All notable changes to WorkRoaster are listed here.

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
