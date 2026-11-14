# Android release guide

How WorkRoaster goes from this repo to Google Play. Do the one-time setup
once, then every release is: tag → download → sign → upload.

## How the build works

```
npm run build (dist/)  →  npx cap sync android  →  Gradle  →  .apk / .aab
```

GitHub Actions does all of this (`.github/workflows/build-android-apk.yml`):

| You push… | You get (Actions → the run → Artifacts) |
|---|---|
| a commit to `main` | `WorkRoaster-debug-APK`: install on your own phone to test |
| a tag like `v0.0.1` | `WorkRoaster-0.0.1-release`: `app-release.aab` (for Play), the APK, `apksigner.jar` and `SHA256SUMS.txt` |

Every build runs the unit tests first, and checks the finished APK has no
`INTERNET` permission and isn't debuggable. A failed check stops the build.

The release is **unsigned** unless the four `WORKROASTER_*` signing secrets
are set (option B below). The default is option A: you sign on your own
computer, the same way as Bouncy Calculator, and the key never leaves it.

## One-time setup: the upload key

Google Play needs every upload signed with *your* key. Google then re-signs
the app for phones with its own app key (Play App Signing), so if the upload
key is ever lost, it can be reset through Play Console support. Still treat it
like a password.

### A. Sign locally (default)

The key lives in the repo folder but is git-ignored (`.signing/`, `*.jks`,
`keystore.properties`; a unit test fails if those lines go missing):

```
C:\Working Projects\WorkRoasterFolder\.signing\
  upload.jks             the upload key (alias "workroaster-upload", RSA 4096, valid to 2054)
  keystore.properties    storeFile, storePassword, keyAlias, keyPassword
```

- **Back both files up** (password manager or an encrypted drive). Losing
  them means a key reset through Play support before the next update.
- Never print the passwords, never move the key out of `.signing\`, and
  delete any temporary copy made for signing.
- `git status` must never show `.signing`. If it does, stop and fix
  `.gitignore` before committing anything.

### B. Sign in CI (optional)

Put the same key into four repository secrets: GitHub → WorkRoaster →
Settings → Secrets and variables → Actions → *New repository secret*:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Working Projects\WorkRoasterFolder\.signing\upload.jks")) | Set-Clipboard
```

| Name | Value |
|---|---|
| `WORKROASTER_KEYSTORE_BASE64` | the clipboard text |
| `WORKROASTER_KEYSTORE_PASSWORD` | `storePassword` from keystore.properties |
| `WORKROASTER_KEY_ALIAS` | `workroaster-upload` |
| `WORKROASTER_KEY_PASSWORD` | `keyPassword` |

With them set, tagged builds come out signed and step 4 below is skipped.

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
3. Download the `WorkRoaster-<version>-release` artifact and check it:
   `sha256sum -c SHA256SUMS.txt`.
4. **Sign** (option A) with the key in `.signing\` (alias `workroaster-upload`):

   ```
   jarsigner -keystore upload.jks -sigalg SHA256withRSA -digestalg SHA-256 app-release.aab workroaster-upload
   java -jar apksigner.jar sign --ks upload.jks --ks-key-alias workroaster-upload --out WorkRoaster-<version>.apk app-release-unsigned.apk
   ```

   Rename the AAB to `WorkRoaster-<version>.aab` and delete the `.idsig` file
   apksigner leaves behind.
5. **Verify:** `jarsigner -verify` says "jar verified" (a self-signed
   certificate warning is normal); `apksigner verify --print-certs` shows the
   upload certificate SHA-256 recorded in `PLAY-STORE-UPLOAD.md`; the package
   is `com.simplymadestudio.workroaster` with the right version code and name.
6. **Deliver** to `C:\Working Projects\WorkRoasterApp\`: the AAB, the APK and
   an updated `PLAY-STORE-UPLOAD.md` (version, code, checksums). Delete the
   previous version's AAB/APK, the downloaded CI zip and every temporary copy
   of the key.
7. Upload the AAB in Play Console (below).

## Google Play Console (first release)

1. **Create app**: name *WorkRoaster*, App, Free, default language English (Australia).
2. **App signing**: accept Play App Signing (Google-generated app key) when you
   upload the first `.aab`.
3. **Store listing**:
   - Everything is ready in `C:\Working Projects\WorkRoasterApp\store\`
     (mirrored in this repo under `release/store/`): `LISTING.md` with the
     text and every App content answer, `icon-512.png`, the
     `feature-graphic-1024x500.png` and phone screenshots (1080 × 2160).
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
- [ ] Tapping the date or a time field opens WorkRoaster's own picker (not Android's). Settings' "pay cycle started on" date opens Android's picker in WorkRoaster colours.
- [ ] Clock in → Android asks once for notifications → clock out fills the form. To test the reminder, clock in, then set the phone clock 12 hours ahead (or wait): the notification appears with the app closed.
- [ ] Settings → Tax estimate: turn on, try a few countries; amounts appear on the current cycle and in history.
- [ ] Taps squeeze and spring back (Settings → Appearance → Motion: Bouncy); switching an option or ticking a box pops. With Android's "Remove animations" on, nothing moves (by design).
- [ ] Settings → Appearance → Vibration: off by default. Turn on → one buzz; Light / Medium / Strong each feel different; taps buzz once. Turn Android's own *touch vibration* off: WorkRoaster still buzzes. Turn it off in WorkRoaster: silent.
- [ ] Settings → Apps → WorkRoaster → Permissions shows **only Notifications** (vibration needs no prompt and isn't listed there).
