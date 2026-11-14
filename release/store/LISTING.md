# Google Play listing: WorkRoaster

Everything Play Console asks for, ready to paste. The same files are in
`C:\Working Projects\WorkRoasterApp\store\`.

## Main store listing

**App name** (30 max)
WorkRoaster

**Short description** (80 max)
Log your shifts and see what you earned each pay cycle. Private, no account.

**Full description** (4,000 max, plain paragraphs, no Markdown or bullets)

WorkRoaster is a simple, private ledger for the work you do and what it pays. Log a shift in seconds and see exactly how many hours you worked and what you earned, grouped into your pay cycles.

Add a shift with the date, start time and how long you worked, in hours and minutes. Enter what you were paid and WorkRoaster works out your real hourly rate, or set up a job with its rates and let it calculate the pay for you. Weekend, overtime and other rates, breaks, and monthly or yearly salaries are all supported.

Your current pay cycle sits at the top: what you have earned so far, the hours you have worked, and a bar for every shift. A work calendar marks the days you worked, and the pay-cycle history keeps every earlier cycle a tap away, split by job.

Working right now? Tap Clock in to start a live timer, and Clock out fills in the shift for you. WorkRoaster can remind you if you forget to clock out.

Turn on the tax estimate to see roughly what you take home each cycle, using this year's rules for Australia, the United States, the United Kingdom, South Korea, Japan, Malaysia or Bangladesh. Pick your currency, or name your own.

Export any pay cycle as a PDF, an Excel sheet or an image to check against your payslip or send to your manager. Save a full backup at any time and restore it on a new phone.

Keep separate profiles for different jobs or people, write quick notes, use the built-in calculator, and choose from four colour themes, each with light and dark versions. A complete guide inside the app explains every feature.

Private by design. WorkRoaster has no internet access, no account, no ads and no tracking. Your records are stored only on your phone and leave it only when you export or back them up yourself.

Made in Sydney by Simply Made Studio.

## Store settings

| Field | Value |
|---|---|
| App or game | App |
| Free or paid | Free |
| App category | Productivity |
| Tags | Productivity, Business, Finance (pick what Play offers) |
| Contact email | samiiiur@yahoo.com (the in-app feedback address) |
| Website | https://www.simplymadestudio.net/ |
| Privacy policy | https://www.simplymadestudio.net/privacy#workroaster |
| Default language | English (Australia) – en-AU |

## Graphics (in this folder)

| Asset | File | Play requirement |
|---|---|---|
| App icon | `icon-512.png` | 512 × 512 PNG |
| Feature graphic | `feature-graphic-1024x500.png` | 1024 × 500 PNG/JPEG |
| Phone screenshots | `screenshots/01…08.png` | 1080 × 2160, 2–8 required |

The screenshots use made-up sample shifts (a casual café job), never real records.

1. `01-current-cycle`: the current pay cycle, tax estimate and shift bars
2. `02-add-record`: adding a shift
3. `03-calendar`: the work calendar
4. `04-history`: pay-cycle history with PDF, JPG and Excel export
5. `05-backup-export`: backup, restore and reset
6. `06-themes`: colour themes
7. `07-dark`: dark mode
8. `08-clock-in`: the live clock-in timer

## App content answers

| Section | Answer |
|---|---|
| **Privacy policy** | URL above |
| **Ads** | No, the app does not contain ads |
| **App access** | All functionality is available without special access (no login) |
| **Content rating** | Questionnaire category *Utility, Productivity, Communication or Other*. No violence, sexuality, language, gambling, user-to-user interaction or location sharing, so expect *Everyone / PEGI 3* |
| **Target audience** | 18 and over (it records work and pay). Choosing under-13 would bring in the Families policy. |
| **News app** | No |
| **Data safety** | **No data collected. No data shared.** The app has no INTERNET permission. Records stay on the device; exports and backups go only where the user saves them. Feedback opens the user's own email app, and nothing is sent by WorkRoaster. |
| **Government app** | No |
| **Financial features** | None. It records pay and estimates tax; it doesn't move money, give advice or offer credit. |
| **Health** | None |
| **Permissions Play shows** | Notifications (clock-in reminder, asked only when you clock in), run at startup and prevent sleep (keep that reminder after a restart), control vibration (optional tap vibration). None involve user data. |

## Release steps

1. Play Console → **Create app** → name *WorkRoaster*, App, Free, English (Australia).
2. Complete the **App content** answers above and the **Main store listing**.
3. **Testing → Closed testing** → create a track (e.g. "Closed testers") → **Create release** → upload `WorkRoaster-0.0.1.aab`.
   - When asked about **Play App Signing**, accept *"Let Google manage and protect your app signing key"*. Your `.signing\upload.jks` becomes the upload key.
   - Release notes: see `PLAY-STORE-UPLOAD.md`.
4. **Testers:** add an email list (or your Google Group) and share the opt-in link.
5. New personal developer accounts need a **closed test with at least 12 testers opted in for 14 days in a row** before production access. Invite 15–20 so drop-outs don't reset the count.
6. **Apply for production** when the 14 days are done, then publish.
