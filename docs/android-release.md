# Android release guide

How WorkRoaster goes from this repo to Google Play. Do the one-time setup
once, then every release is: tag → download → upload.

## How the build works

```
npm run build (dist/)  →  npx cap sync android  →  Gradle  →  .apk / .aab
```

GitHub Actions does all of this (`.github/workflows/build-android-apk.yml`):

| You push… | You get (Actions → the run → Artifacts) |
|---|---|
| a commit to `main` | `WorkRoaster-debug-APK`: install on your own phone to test |
| a tag like `v0.0.1` | `WorkRoaster-0.0.1-release`: `app-release.aab` (for Play) + `app-release.apk` |

Every build runs the unit tests first, and checks the finished APK has no
`INTERNET` permission. A failed check stops the build.

## One-time setup: the upload key

Google Play needs every upload signed with *your* key. Google then re-signs
the app for phones with its own app key (Play App Signing), so if the upload
key is ever lost, it can be reset through Play Console support. Still treat it
like a password.

1. **Create the key** (PowerShell; `keytool` comes with Java or Android Studio).
   Keep it **outside** the repo folder:

   ```powershell
   mkdir C:\Keys
   keytool -genkeypair -v -keystore C:\Keys\workroaster-upload.jks -alias workroaster-upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   It asks for a keystore password and your name/organisation (e.g.
   "Simply Made Studio"). Use the same password for the key when asked.

2. **Back it up**: copy `workroaster-upload.jks` and the password into your
   password manager or another safe place. Never commit it: the repo is public.

3. **Turn it into text for GitHub:**

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Keys\workroaster-upload.jks")) | Set-Clipboard
   ```

4. **Add four repository secrets**: GitHub → WorkRoaster → Settings →
   Secrets and variables → Actions → *New repository secret*:

   | Name | Value |
   |---|---|
   | `WORKROASTER_KEYSTORE_BASE64` | the clipboard text from step 3 |
   | `WORKROASTER_KEYSTORE_PASSWORD` | the keystore password |
   | `WORKROASTER_KEY_ALIAS` | `workroaster-upload` |
   | `WORKROASTER_KEY_PASSWORD` | the key password (same as above if you reused it) |

   Secrets can't be read back by anyone, including you, and never appear in logs.

## Testing on your phone (debug APK)

1. Push to `main`, wait for the Actions run, download `WorkRoaster-debug-APK`.
2. Copy `app-debug.apk` to the phone and open it. Android asks to allow
   installing from that app (Files / Chrome) the first time.
3. Run through the checklist at the end of this page.

The debug app and the Play app share the same app ID but are signed with
different keys, so Android won't update one with the other. **Export a backup
first**, uninstall the debug app, then install from Play and restore.

## Each release

1. Set the version in `package.json` (`"version": "0.0.1"` for the first one;
   `npm version 0.0.2 --no-git-tag-version` later), commit and push. It is the
   one version for the website and the app, and shows in Settings → Privacy &
   terms. Go higher every time (`0.0.2` for fixes, `0.1.0` for features):
   Play rejects a version code it has already seen. The workflow turns `1.2.3`
   into version code `10203` (so `0.0.1` is `1`).
2. Tag that exact version and push the tag:

   ```bash
   git tag v0.0.1
   git push origin v0.0.1
   ```

   A tag that doesn't match `package.json` stops the build with a clear message.
3. Download the `WorkRoaster-0.0.1-release` artifact and upload `app-release.aab`
   in Play Console (see below).

## Google Play Console (first release)

1. **Create app**: name *WorkRoaster*, App, Free, default language English (Australia).
2. **App signing**: accept Play App Signing (Google-generated app key) when you
   upload the first `.aab`.
3. **Store listing**:
   - App icon: 512 × 512 PNG (`assets/icon-only.png` resized).
   - Feature graphic: 1024 × 500.
   - Phone screenshots: 2–8.
   - Short description (80 characters) and full description.
   - Category: Productivity.
4. **App content** forms:
   - Privacy policy: `https://www.simplymadestudio.net/privacy#workroaster`
   - Ads: **No**.
   - App access: **All functionality available without special access** (no login).
   - Data safety: **No data collected, no data shared**. The app has no
     network permission, and data is stored on the device only.
   - Content rating questionnaire: utility / productivity, no sensitive content.
   - Target audience: 18+.
   - Financial features: **none** (it records pay; it doesn't move money or give advice).
5. **Closed testing** (required for new personal accounts):
   - Testing → Closed testing → create a track → upload the `.aab`.
   - Add testers by their Google account email (an email list).
   - Share the opt-in link.
   - At least **12 testers must stay opted in for 14 days in a row**. Invite
     15–20 so drop-outs don't reset the count.
   - You can upload newer builds to the same track during the 14 days.
6. **Apply for production** once the 14 days are done. Google reviews the
   application (usually within about a week), then you can publish.

## Device checklist (before each release)

- [ ] App opens offline (flight mode on) and shows your records.
- [ ] Add, edit, delete a record; switch profiles.
- [ ] Export PDF, Excel, JPG: the "Save as" dialog opens, the file saves to Downloads and to Drive, and opens correctly.
- [ ] Cancelling "Save as" shows no "saved" message.
- [ ] Backup → uninstall → reinstall → Import & replace restores everything.
- [ ] Back button: closes the date/time/job pickers, then Settings/Data/Guide dialogs, then leaves Notes, then leaves the app.
- [ ] Light, dark and each colour theme: status-bar icons stay readable; nothing hides under the status bar or gesture bar (phone and, if possible, tablet).
- [ ] Rotate the phone; large system font size.
- [ ] Privacy/Terms links open the browser; Send feedback opens the email app.
- [ ] Settings → Apps → WorkRoaster → Permissions shows **no permissions**.
