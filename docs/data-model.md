# Data model & migration notes

## Records — `localStorage["modern_work_hours_tracker_v1"]`

A JSON array. Each record:

```jsonc
{
  "id": "string",              // stable unique id
  "date": "YYYY-MM-DD",
  "start": "HH:MM",            // 24-hour
  "cycle": "string",           // LEGACY ONLY — see "Pay cycles" below
  "workingMinutes": 142,       // whole minutes, net of any break — e.g. 2h22m is
                                // stored as 142, not 2.22. See "Break time" below.
  "breakMinutes": 0,           // whole minutes already deducted from the gross
                                // shift span to produce workingMinutes above.
                                // 0 = no break. Always present (see below).
  "mapNumber": "string",
  "dayType": "string",         // one of settings.dayTypes[].label at time of entry
  "paymentType": "string",     // one of settings.paymentTypes[].label at time of entry
  "paymentAmount": 60,         // number — always the source of truth for this record's pay
  "hourlyRate": 24,            // OPTIONAL — only present if this record was entered in
                                // "hourlyRate" pay-calculation mode; see below
  "end": "17:30",               // OPTIONAL — only present if this record was entered
                                // through the Ending-time workflow; see "Ending time" below
  "notes": "string",

  // --- Jobs — all OPTIONAL, only present when a job was selected when
  // this record was entered. See "Jobs" below.
  "jobId": "westfield-cleaning",        // references settings.jobs[].id
  "baseRateAtEntry": 31.20,             // the job's base rate AT THE TIME this record was saved
  "weekendRuleAtEntry": { "type": "percent", "value": 50 },
  "additionalRuleAtEntry": { "type": "percent", "value": 10 },
  "effectiveRateAtEntry": 51.48,        // base -> weekend -> additional, already resolved
  "weekendOverride": { "mode": "default" }, // "default" | "none" | "custom" (+ "rule" if custom)
  "expectedRateAtEntry": 46.80,         // direct-payment mode only — what the job predicted
  "expectedPaymentAtEntry": 187.20,     // direct-payment mode only — for comparison against paymentAmount

  // --- Fixed pay (salaried job) — only on records saved with a
  // monthlyFixed / yearlyFixed job. See "Fixed-pay jobs" below.
  "fixedPayAtEntry": {
    "mode": "monthlyFixed",             // "monthlyFixed" | "yearlyFixed"
    "amount": 5500,                     // the job's salary AT THE TIME this record was saved
    "workingDays": [1, 2, 3, 4, 5],     // 0 = Sunday … 6 = Saturday
    "start": "09:00", "end": "17:00", "breakMinutes": 30,
    "scheduledDays": 22,                // scheduled working days in that calendar month (year for yearlyFixed)
    "dayShare": 250,                    // this date's allocated share in whole cents (see "Fixed-pay jobs")
    "counted": true,                    // false → this record carries $0 (see reason)
    "reason": "scheduled"               // "scheduled" | "unscheduled" | "already-counted"
  }
}
```

**Backward compatibility:** an even older record shape stored duration as
a decimal `workingHours` field (e.g. `2.5` for 2h30m) instead of
`workingMinutes`. `calculations.js#recordMinutes()` and
`storage.js#loadRecords()` read either shape transparently — a record is
never rewritten just to "normalize" it, so nothing is lost or altered by
opening the app.

## Break time

`breakMinutes` is one of `0 | 15 | 30 | 60`, entered on the record form
(Time fieldset) alongside the existing Duration inputs. It is deducted
from the *gross* shift span **once, at save time**, to produce the
`workingMinutes` that gets stored:

```
gross duration (start → end, or manually typed hours/minutes)
  − breakMinutes
  = workingMinutes (stored, net — the same field every calculation already read)
```

Example: start `09:00`, end `17:00` → gross 480 minutes; a 30-minute break
→ stored `workingMinutes: 450`, `breakMinutes: 30`.

**Save-time validation (Phase 11).** `submitForm()` refuses to save a
record whose working time would be 0: a gross duration of 0 (0h 0m, or
an identical start and end), or a break that is **equal to or longer
than** the shift (`breakMinutes >= gross`). Typed minutes must be a whole
number 0–59 and hours can't be negative — out-of-range input is reported,
never clamped (`calculations.js#durationMinutes` still clamps, but the
form validates before calling it). Records saved before this rule (e.g. an
old 0-minute record) are loaded and shown unchanged.

**`workingMinutes` remains the single field every calculation reads** —
`calculations.js#recordMinutes()` is completely unchanged by this
feature. Break time is applied once, in `app.js#submitForm()`, before the
record is saved; every downstream consumer (pay-cycle totals, the
dashboard, the weighted average rate, exports, the live rate/payment
panel) automatically sees the net figure with no further changes, exactly
like every other value that flows through `recordMinutes()`.

**Backward compatibility:** an older record simply has no `breakMinutes`
key at all. `storage.js#migrateRecord()` fills it in as `0` for every
record that doesn't already have it — this is not a guess, it's the
literal historical fact (no break feature existed, so none was deducted)
— and `workingMinutes` on that record is never touched, recalculated or
reinterpreted.

**Validation (`app.js#submitForm`):** a break can never be negative (the
selector only offers `0/15/30/60`) and can never exceed the gross
duration for that entry — attempting to save one that would produce a
negative net duration shows a validation message and the record is not
saved, the same pattern used for the form's other required-field checks.

**Editing:** the form always reconstructs the *gross* span for its inputs
— for the Ending-time workflow this falls out naturally from the
record's stored `start`/`end` clock times; for the manual hours/minutes
workflow, the inputs are pre-filled with `workingMinutes + breakMinutes`
(not the raw stored net value) so that re-submitting without changes
reproduces the exact same stored `workingMinutes`. The Break selector
itself is pre-filled from the record's own `breakMinutes`.

**Overnight shifts:** unaffected — `calculations.js#minutesFromTimes()`
already resolves the correct gross span for an overnight shift before
break time is ever subtracted from it, so e.g. `22:00 → 06:00` with a
30-minute break still correctly nets to 7h30m from an 8h gross span.

## Pay cycles (automatic)

Records no longer carry a manually-typed cycle. Instead, every record's
pay cycle is *calculated* from its `date` and the `payCycleLengthDays`
setting, every time it's needed — nothing cycle-related is written back
to the record. The form only asks for a date; the calculated cycle is
shown next to it as a live, read-only preview.

The calculation (`calculations.js#getCycleForDate`) is a pure function of
`(date, cycleLengthDays, anchor)`:

```
blockIndex = floor((date - anchor) / cycleLengthDays)
cycleStart = anchor + blockIndex * cycleLengthDays
cycleEnd   = cycleStart + cycleLengthDays - 1
```

`anchor` is the `payCycleAnchor` setting (see "Pay cycle start" below),
which defaults to `DEFAULT_CYCLE_ANCHOR = "1970-01-12"` — a fixed
reference **Monday**. Because the anchor is a Monday and both 7 and 14
divide evenly into a week, this one formula produces:

- **7-day cycles:** the Monday–Sunday week containing the date.
- **14-day cycles:** two consecutive Monday–Sunday weeks, paired
  consistently because they're counted from the same fixed anchor.
- **30-day cycles:** plain 30-day blocks counted from the same anchor —
  not a weekly interpretation, just a deterministic day count. They are
  **rolling** blocks, **not calendar months**: e.g. 2026-09-15 falls in
  `2026-09-15 → 2026-10-14`.
- **365-day cycles:** rolling 365-day blocks from the same anchor, **not
  calendar years** (no reset on 1 January, no leap-day adjustment): e.g.
  2026-06-15 falls in `2025-12-29 → 2026-12-28`. Settings labels this
  option "365 days (rolling year)".

All arithmetic runs in UTC internally, so daylight-saving clock changes
can never shift a date into the wrong cycle. The same date, cycle length
and anchor always resolve to the same cycle — changing
`payCycleLengthDays` in Settings re-buckets every record's *display*
grouping instantly, without touching a single stored record.

**Why 1970-01-12 and not some other Monday?** Any Monday gives identical
7-day weeks, but a 14-day (fortnightly) cycle has two possible Monday
"parities" — which one is correct depends on which week the employer's
pay schedule actually starts on, and the wrong choice silently splits
real fortnightly pay periods in half instead of grouping them together.
1970-01-12 was picked because it's the parity that matches this
tracker's real historical fortnights (verified against previously
recorded pay periods, e.g. Mon 29 Jun 2026 – Sun 12 Jul 2026). To switch
parity for a different pay schedule, shift the anchor by exactly ±7 days
— 7-day cycles are unaffected, and 30-day cycles simply shift their
(otherwise arbitrary) block boundaries.

**What happened to the old `cycle` field?** Records created before this
feature may still have a manually-typed `cycle` string (e.g. `"24 Aug –
6 Sep"`). That field is never deleted or rewritten — it's preserved
exactly as-is, but the app stops reading it for grouping, sorting or
totals. If a record's old text no longer matches its freshly computed
cycle, the record row shows a small "Was: *original text*" note so the
history stays visible rather than silently disappearing. New records
never set this field at all.

`dayType` and `paymentType` are stored as the option's **label text**,
not an id. This mirrors the original tracker's behaviour and is what
makes archiving (rather than deleting) safe: a record's stored string
never depends on a settings entry continuing to exist.

## Pay calculation mode

A pay calculation mode is `"payment" | "hourlyRate"`. **Each job has its
own** (`job.payCalculationMode`, see "Jobs" below), so an hourly job and
an actual-payment job coexist in one account. The global
`settings.payCalculationMode` (default: `"payment"`) now applies only to
records saved with **no job**, and is the starting choice for a new job.
A job saved before jobs had this field inherits the global mode on load
(`storage.js#loadSettings`) — exactly how it was being used — so nothing
changes for existing data.

For a new record, the form follows the selected job's mode (or the
global mode with no job) and swaps its Pay inputs in place when the job
changes. The two modes calculate in opposite directions:

- **`"payment"`** ("Actual payment", the original default) — the user
  types what they were actually paid (required: a number ≥ 0, never
  saved from a blank entry); the effective hourly rate is calculated
  (`paymentAmount ÷ working hours`, `calculations.js#recordEffectiveRate`
  — shown as "—", never Infinity, when working time is zero). With a job
  selected, the job's rate only produces `expectedRateAtEntry`/
  `expectedPaymentAtEntry` for comparison; it never replaces the amount.
- **`"hourlyRate"`** — the user types an hourly rate; the payment amount
  shown next to it is calculated (`hourlyRate × working hours`, rounded
  to whole cents via `calculations.js#paymentFromHourlyRate`) and that
  calculated number — not the rate — is what actually gets stored in the
  record's `paymentAmount` field.

**`paymentAmount` is always the one number every other part of the app
reads** — pay-cycle totals, the dashboard, the weighted average rate,
CSV/PDF/JPG/Excel exports. Nothing downstream needs to know or care which
mode produced it. A record saved in `"hourlyRate"` mode additionally
carries an optional `hourlyRate` field purely so the form can show the
right UI and value if that record is edited again later — it's context,
not a second source of truth, and a `"payment"`-mode record (old or new)
never gets this key at all.

**A record's mode is its own history.** `calculations.js#recordPayMode`
reads it from the record itself — `hourlyRate` present means it was saved
hourly — never from its job's or the global mode as they are today. So
switching a job from Hourly to Actual payment (or back) changes only the
records added afterwards; every saved record keeps the mode, rate
snapshot and `paymentAmount` it was entered with. No extra per-record
field was needed: `hourlyRate` already was that snapshot.

**Changing the setting never touches existing records.** It only decides
which inputs the form shows for the *next* record you add — flipping it
back and forth does not recalculate, rewrite, or re-derive any
`paymentAmount` already saved. When editing an existing record, the form
doesn't follow the current global setting either: it shows whichever
pay-entry UI matches how *that record* was actually saved (does it have
a stored `hourlyRate`, or not?), pre-filled with its real stored value —
so opening an old `$100 for 4h` record for editing always still shows
$100, never a value re-derived from today's global mode.

## Ending time (optional)

`settings.calculateDurationFromEndTime` is a boolean (default: `false`)
that lets a record's `workingMinutes` be calculated automatically from a
Starting time and an Ending time, instead of typed in as hours/minutes.
It's purely an alternate way to *fill in* `workingMinutes` — the field
itself, and everything downstream that reads it (pay-cycle totals, the
dashboard, exports, the weighted average rate), is completely unchanged.

- **Off** (the default) — the record form shows the original hours +
  minutes inputs. Nothing about this workflow is visible.
- **On** — the record form instead shows Starting time, Ending time and a
  read-only calculated Working time. The user can't type a duration
  directly while this is active; it's always `end - start`, computed by
  `calculations.js#minutesFromTimes()` and rounded to whole minutes, the
  same as every other duration in this app.

**Overnight shifts:** if the ending time is earlier than the starting
time, it's treated as falling on the *following* day (e.g. `22:00` →
`06:00` is 8 hours, `23:30` → `00:30` is 1 hour) — this never requires a
separate end-date field. An ending time *equal* to the starting time is
a 0-minute span and is rejected at save (Phase 11). A missing Starting or Ending time never produces
a guessed duration; `minutesFromTimes()` returns `null` and the form
shows a validation message instead of saving.

**Interaction with pay-calculation mode:** for a brand-new record, the
Ending-time workflow is also shown by default whenever
`settings.payCalculationMode` is `"hourlyRate"` (entering a start/end
time alongside an hourly rate is the natural way to fill that form in) —
see `app.js#durationModeForForm()`. This is a render-time default only:
switching `payCalculationMode` never writes to
`calculateDurationFromEndTime` or vice versa, so the two settings stay
independently toggleable and neither permanently forces the other.

**Editing an existing record** always follows *that record's own*
history rather than the current global setting: if it has a stored `end`,
the form restores the Ending-time inputs and recalculates its working
time from them; if it doesn't, the form shows the original manual
hours/minutes UI, pre-filled with its existing `workingMinutes` —
unchanged, never invented, never re-derived. Turning the global setting
on or off never rewrites, recalculates or touches any already-saved
record — exactly like `payCalculationMode` (see above), only the *next*
record you add or edit is affected.

## Jobs

`settings.jobs` (default: `[]`) is a first-class list of jobs, each with
its own base rate and automatic weekend rules:

```jsonc
{
  "id": "westfield-cleaning",   // stable, slug-derived, never reused
  "name": "Westfield Cleaning",
  "employer": "GLAD Group",
  "baseRate": 31.20,             // hourly: required (> 0); actual payment: optional expected rate
  "payCalculationMode": "hourlyRate", // "hourlyRate" | "payment" | "monthlyFixed" | "yearlyFixed"
  "fixedPay": {                  // used only by monthlyFixed / yearlyFixed; defaults kept for every job
    "amount": 0,                 // monthly or yearly salary (> 0 required for a fixed-pay job)
    "workingDays": [1, 2, 3, 4, 5], // any subset of 0–6 (Sun–Sat), at least one for a fixed-pay job
    "start": "09:00", "end": "17:00", "breakMinutes": 30 // 0 | 15 | 30 | 60
  },
  "active": true,                // false = archived, see below
  "saturdayRule": { "type": "none" | "percent" | "multiplier" | "custom", "value": 0 },
  "sundayRule":   { "type": "none" | "percent" | "multiplier" | "custom", "value": 0 },
  "additionalRule": { "type": "none" | "percent" | "multiplier" | "custom", "value": 0 },
  "notes": ""
}
```

A rule's `type` decides how `value` is used
(`calculations.js#ruleMultiplier`/`calculateEffectiveRate`):

- **`"percent"`** — `+value%`, e.g. `{ type: "percent", value: 50 }` is
  `+50%` (multiplier `1.50`).
- **`"multiplier"`** — the multiplier directly, e.g.
  `{ type: "multiplier", value: 1.5 }`. `percent` and `multiplier` are
  two equivalent spellings of the same calculation — `+50%` and `1.50×`
  always produce the same effective rate.
- **`"custom"`** — a flat dollar figure. On a weekend rule this
  *replaces* the base rate outright for that day; on the additional
  rule it's *added* as a flat per-hour top-up after the weekend
  adjustment.
- **`"none"`** — no adjustment.

**Calculation order** (`calculations.js#calculateEffectiveRate`), always:
base rate → weekend adjustment → additional adjustment. Example: base
`$31.20`, Sunday `+50%` → `$46.80`, additional loading `+10%` → effective
rate `$51.48/hr`. Each step is rounded to whole cents.

**A job with records is never hard-deleted** — only archived
(`active: false`) and restored. `jobs.js#deleteUnusedJob` removes a job
only while `jobUsageCount` is 0 (it returns the list unchanged
otherwise), so no record can ever point at a missing job; Settings → Jobs
shows *Delete* only for such jobs and asks for confirmation. An archived
job disappears from the job picker offered for *new* records, but every
record that already references it keeps working exactly as before, and
`jobs.js#jobsForSelect` still includes it in the dropdown when editing a
record that's actually assigned to it.

**Editing a job's rates never silently touches existing records.** Every
record that had a job selected when it was saved carries its own snapshot
— `baseRateAtEntry`, `weekendRuleAtEntry`, `additionalRuleAtEntry`,
`effectiveRateAtEntry` — captured at the moment it was entered. The
record, not the job, is the source of truth for its own history: if
Westfield Cleaning's base rate later changes from `$31.20` to `$33.00`,
past records keep their `$31.20`-derived figures unless the person
explicitly chooses to update them (next section).

### Changing pay settings on a job that has records

Saving a job edit whose *pay* settings changed — `jobs.js#payRulesChanged`:
base rate, pay method, Saturday/Sunday/additional rule, or salary and
schedule (`fixedPay`) — while at least one record uses the job opens a
confirmation dialog before anything is written (`app.js
showJobPayChangeDialog`). Editing only the name, employer or notes, or
editing a job no record uses, saves straight away as before. The dialog
lists what changed and offers two choices:

- **Update existing records** — `jobs.js#repriceJobRecords(records, job)`
  re-rates that job's records with the new settings, exactly as saving
  each record again would:
  - the base rate and the resolved weekend and additional rules and
    effective rate are rewritten in the record's snapshot fields;
  - the record's own `weekendOverride` (default / none / custom) is kept,
    and a record whose `additionalRuleAtEntry` is `none` keeps the
    additional loading **off** — adding a loading to the job never applies
    it to past records retroactively;
  - each record keeps its **own pay method** (`recordPayMode`): hourly
    records get a new `hourlyRate` and a recalculated `paymentAmount`;
    actual-payment records keep the `paymentAmount` that was entered and
    only `expectedRateAtEntry` / `expectedPaymentAtEntry` change. A
    record is never converted from one method to the other, even when the
    job's own method changed;
  - **salaried records are never re-rated** — a fixed-pay record's
    `fixedPayAtEntry` day share depends on the other scheduled days in its
    period (see "Fixed-pay jobs" below), so it keeps its saved allocation.
    The dialog says so; when every record of the job is salaried this
    choice is disabled;
  - dates, times, durations, breaks, notes, day/payment types, ids and
    other jobs' records are never touched.
- **Keep old records, start a new version** — `jobs.js#createJobVersion`
  leaves the current job exactly as it is (id, settings, records) and
  archives it, then adds a new active job with the edited settings. The new
  version gets a unique name (`jobs.js#jobVersionName`): the edited name if
  no job — active or archived — already uses it, otherwise the first free
  `" (n)"` suffix, e.g. `Westfield` → `Westfield (2)` → `Westfield (3)`.
  Names are compared the way backup imports compare them (trimmed, spaces
  collapsed, case-insensitive), so versions show as distinct groups in the
  pay-cycle history and an import's name matching can never pick the wrong
  version. Records are unchanged; new records use the new version because
  the archived one is no longer offered.

**Cancel** (the button, Escape or closing the dialog) writes nothing and
leaves the editor open with what was typed; Escape closes only the dialog,
not the Settings window behind it. Records and settings are saved
together, and if the browser refuses either write both are restored to
their previous values.

**Record-level weekend override** (`weekendOverride`): lets one record
diverge from its job's own configured Saturday/Sunday rule without
changing that job's stored default — `resolveWeekendRule(job, date,
override)` in `calculations.js` is the pure function that resolves the
three modes (`"default"` = use the job's rule for that day-of-week,
`"none"` = force no adjustment, `"custom"` = use `override.rule`
instead). A one-off override on a single record never writes back to
`settings.jobs`.

**Direct-payment mode + a job selected:** the payment amount the user
types remains the record's real, authoritative `paymentAmount` — a job
never silently overrides it. `expectedRateAtEntry`/
`expectedPaymentAtEntry` are recorded purely so the record can later show
"expected vs. actual" (e.g. expected `$187.20` from the job's rate,
actually paid `$190.00`, a `+$2.80` difference) without needing to
recompute against the job's *current* (possibly since-changed)
configuration.

**Fixed-pay jobs** (`monthlyFixed` / `yearlyFixed`, Phase 10). A salary
is never converted to an hourly rate. Instead each record for a salaried
job on one of the job's `workingDays` carries that day's share of the
salary (`calculations.js#fixedPayDayShare`):

- monthly: `amount ÷ scheduled working days in the record's calendar month`
- yearly: `amount ÷ scheduled working days in the record's calendar year`

**Exact allocation (post-Phase 11).** The division is done in whole cents
(`calculations.js#allocateMinorUnits`): with `C` = salary in cents and `N`
scheduled dates in the period, every date gets `floor(C / N)` cents and
the first `C mod N` scheduled dates of the period (in calendar order) get
one extra cent. A date's share therefore depends only on the pay
configuration and the date — never on the order records are entered —
and the shares of all scheduled dates in a complete month (or year) add
up to the salary exactly (e.g. May 2026, 21 weekdays at $5,500: ten dates
of $261.91 and eleven of $261.90). Records saved before this change keep
their stored `dayShare` / `paymentAmount` (snapshots are authoritative);
re-saving such a record via Edit recomputes its share from its own
snapshot's salary and schedule.

The share is stored as the record's `paymentAmount`, so totals, cycles,
graphs and exports need no special case. A record on a day that isn't
one of the job's working days is saved with `paymentAmount: 0`
(`reason: "unscheduled"`); a second record for the same job and date is
also `0` (`reason: "already-counted"`) so a split shift never counts the
day twice. That `0` is only valid while the carrying record exists: when
the carrier is deleted, or edited onto another date/job,
`app.js#reassignFixedPayDay()` gives the day to the next same-day
`already-counted` record — `counted: true`, `reason: "scheduled"`,
`paymentAmount` = **its own** `fixedPayAtEntry.dayShare` (its salary at
entry, never the job's current salary). `unscheduled` records are never
promoted. The effective hourly rate shown for these records
(`recordEffectiveRate` = `paymentAmount ÷ worked hours`) is analytical
only. `fixedPayAtEntry` snapshots the salary and schedule, so a salary
change (e.g. `$5,500 → $5,800`) affects only records saved afterwards;
editing a saved salaried record recomputes its share from its **own**
snapshot, not the job's current salary. `recordPayMode()` returns the
snapshot's mode. The standard `start`/`end`/`breakMinutes` only pre-fill
the record form when the job is chosen — the saved record keeps whatever
times were actually entered.

Migration: none needed. Existing jobs gain a default `fixedPay` block
(ignored unless the job is switched to a fixed-pay mode); existing
records have no `fixedPayAtEntry` and behave exactly as before.
`settings.payCalculationMode` (records without a job) still only accepts
`"payment"` / `"hourlyRate"` — a salaried record always has a job.

**Pre-Jobs records** (or any record saved with "No job" selected) simply
never get any of these fields — `recordJobName()` in `app.js` falls back
to showing "No job" and every calculation behaves exactly as it did
before Jobs existed. Nothing about the original manual hourly-rate or
direct-payment workflow changes when no job is selected.

## Settings — `localStorage["modern_work_hours_tracker_v1_settings"]`

```jsonc
{
  "schemaVersion": 1,
  "currency": "AUD",            // an active ISO 4217 code (src/currency.js); see below
  "theme": "system",            // "system" | "light" | "dark"
  "payCycleLengthDays": 14,     // 7 | 14 | 30 | 365 — see "Pay cycles (automatic)" above
  "payCycleAnchor": "1970-01-12", // YYYY-MM-DD any day a cycle starts on — see "Pay cycle start"
  "payCalculationMode": "payment", // "payment" | "hourlyRate" — see "Pay calculation mode" above
  "calculateDurationFromEndTime": false, // see "Ending time (optional)" above
  "dayTypes": [
    { "id": "day", "label": "Day", "archived": false }
  ],
  "paymentTypes": [
    { "id": "normal", "label": "Normal", "archived": false }
  ],
  "defaults": {
    "dayType": "Day",
    "paymentType": "Normal",
    "startTime": "09:00"
  },
  "jobs": []                    // see "Jobs" above
}
```

`payCalculationMode` here governs only records saved without a job; each
job carries its own (see "Pay calculation mode").

```text
Record presentation (website + PDF/JPG/Excel) — display only, no fields:
  Active hour = "Start – End" from the record's own start/end
                (calculations.js#formatActiveHour); overnight reads
                "10:00 PM – 2:00 AM"; a manual-duration record with no
                `end` reads "From 9:00 AM" — an end is never invented.
```

This key is new. If it doesn't exist (first run, or an upgrade from the
original single-file tracker, which had no settings), it's created with
defaults that match that original tracker's hard-coded lists exactly —
`Day / Afternoon / Night / Overnight` and
`Normal / Overtime / Weekend / Public Holiday / Casual loading` — so an
upgrade changes nothing about what's in the dropdowns until you edit
them yourself.

**Export visibility.** `settings.exportVisibility` =
`{ baseSalary, time, hours, amount }`, all `true` by default (an older
settings object without it loads with all four on; anything that isn't a
real boolean also reads as on). It sets the starting choices of the
Export options dialog shown before every PDF / JPG / Excel report; the
dialog can change them for one file without saving. `export.js` leaves
switched-off information out of the file entirely: *time* drops the
Active hour column; *hours* drops Duration, Break, the working-time line
and the duration total; *amount* drops Pay, Rate/hr, Total pay, the
average rate, every money total and the base salary; *baseSalary* drops
the "Base salary — Job: A$… / month|year" line(s), which are built from
each salaried record's own `fixedPayAtEntry` snapshot. When neither
Duration nor any money column remains, the closing Total row is left out.
JSON backups and CSV ignore this setting.

`storage.js#loadSettings()` merges whatever is stored over the defaults
field-by-field, so a settings object saved by an older version of this
app (missing a field a newer version added) is filled in rather than
rejected.

**Currency.** Settings only saves an active ISO 4217 code from the list
in `src/currency.js` (a code Intl can merely *format*, like `ZZZ`, is not
enough). Invalid input shows a message and nothing is saved. A code
already stored by an older version is never rewritten on load — amounts
keep the label the user has been seeing — and Settings shows a note
asking them to pick a valid code.

## Pay cycle start — `payCycleAnchor`

`payCycleAnchor` is the `anchor` of the cycle formula above: any date on
which a cycle starts. A missing or invalid value (not a real `YYYY-MM-DD`)
falls back to `DEFAULT_CYCLE_ANCHOR` (`calculations.js#normalizeCycleAnchor`),
so older settings keep Monday-based cycles exactly as before.

Settings → General asks for it in the way that fits the cycle length:

- **7 days:** a weekday. `cycleAnchorForWeekday(0–6)` turns it into the
  first such day on or after 1970-01-12 (Tuesday → `1970-01-13`), and
  `cycleStartWeekday(anchor)` reads it back.
- **14 / 30 / 365 days:** the date the *current* cycle started. That date
  itself is stored; because the formula counts in whole cycles from the
  anchor both ways, every past and future cycle follows from it.

Every grouping (`groupByCycle`, `getCycleForDate`), the graph, history,
cycle exports and CSV pass `state.settings.payCycleAnchor`. Changing it
regroups the display only; no record is written.

## Profiles

A profile is a separate set of records and settings. The index lives in
`localStorage["modern_work_hours_tracker_v1_profiles"]`:

```jsonc
{
  "active": "side-job",                 // the profile opened on load
  "profiles": [
    { "id": "default", "name": "My profile" },
    { "id": "side-job", "name": "Side job" } // id: [a-z0-9-], ≤ 24 chars, from the name
  ],
  "theme": "dark"                        // shared by every profile
}
```

- The `default` profile uses the **original keys** (`…_v1` and
  `…_v1_settings`), so existing data is the first profile with no
  migration. Other profiles use `…_v1__<id>` and `…_v1_settings__<id>`.
- The index is only written once a second profile is created; a
  single-profile user's storage is exactly as before. A missing or broken
  index reads as just the default profile; an unknown `active` id falls
  back to `default`.
- `default` can be renamed but not deleted. Deleting another profile
  removes both of its keys.
- `theme` is shared: `saveSettings` also writes it to the index, and
  `loadSettingsFor` overlays it on each profile's own settings.
- Two open tabs listen to the active profile's keys and the index; if the
  open profile is deleted in another tab, the page falls back to `default`.

## Backups (JSON import)

`storage.js#parseBackup` validates the whole file **before** anything is
imported, and is all-or-nothing: if the JSON, the `records` array, the
`settings` section or **any** record is invalid, it throws a user-facing
message naming the record(s) and reason (e.g. `Record 2 (2026-09-16): its
working time is 0 minutes or less`) and the app's records and settings
stay exactly as they were — for both *Import & merge* and *Import &
replace all*. Per-record rules (`backupRecordProblem`) mirror the record
form: real `YYYY-MM-DD` date, `HH:MM` start, working time > 0 minutes
(`workingMinutes`, or legacy decimal `workingHours`), break 0–1439
minutes, payment ≥ 0, valid optional `end` / `hourlyRate`, text-only
optional fields, and no duplicate ids within the file. Legacy backups
still import: an `app` field of `"WorkTrack"`, numeric strings, decimal
hours, or a missing `id` / `breakMinutes` are all accepted as before. New
backups say `"app": "WorkRoaster"`. Records already in the browser are
never re-validated or rewritten.

A backup's `settings` go through the same `storage.js#normalizeSettings`
as settings loaded from the browser: an unknown cycle length, theme or pay
mode falls back to the default, a currency that isn't a 3-letter code
falls back to AUD, entries in `jobs` / `dayTypes` / `paymentTypes` that
aren't proper objects are dropped (a list that isn't a list is replaced by
the default), and a bad `defaults.startTime` becomes 09:00. If anything
still fails while the import is applied, the records and settings are put
back exactly as they were.

### What a backup contains

`buildBackup` writes `{ app, schemaVersion, exportedAt, profile?, records,
settings }`. `profile` (the profile's name) is only present when there is
more than one profile. Each record is written as stored, plus two
read-only labels that make the file understandable on its own:

- `jobName` — the name of the record's job at export time (records without
  a job have none).
- `weekendRuleSource` — which rule `weekendRuleAtEntry` came from:
  `saturday`, `sunday`, `saturday-override`, `sunday-override`,
  `weekday-override` or `none` (`storage.js#weekendRuleSourceOf`).

The legacy `"cycle": "Unassigned"` (and empty `cycle`) is no longer
written; an old hand-typed cycle label is kept. Stored records are never
changed by an export, and the extra labels are ignored on import except
`jobName` (below).

An **all-profiles** backup is `{ app, schemaVersion, exportedAt,
profiles: [{ name, records, settings }] }`. `parseBackupFile` tells the
two apart; each profile is validated like a single backup (errors start
with `Profile “name”:`) and an empty `profiles` list is rejected.

### How importing applies a backup — `importBackup`

`storage.js#importBackup(current, parsed, mode)` is pure: it returns
`{ records, settings, summary }` and the app saves them.

- **Replace:** records become the file's; settings are the file's,
  normalised over the current ones.
- **Merge:** the device's own settings are kept. Each job in the file is
  matched to a device job by **same id and same name**, otherwise by
  **name** (trimmed, spaces collapsed, case-insensitive). A match is
  reused **as-is** — never overwritten. Anything unmatched is added with
  all of its settings (pay mode, base rate, Saturday/Sunday/additional
  rules, salary), under a new id if its id is taken by a different job.
  No prompts and no "Westfield 2".
- Records are re-pointed at the matched or added job. A record whose job
  isn't in the file's settings but has a `jobName` is matched by that
  name, or a minimal job is rebuilt from its own rate snapshot. Records
  without a job stay without one. Snapshots (`baseRateAtEntry`,
  `weekendRuleAtEntry`, `paymentAmount`…) are never changed.
- Merge skips records already present by `id` **or** by content
  (date, start, end, minutes, break, pay and resolved job), so the same
  shift entered on two devices is only kept once.
- Merge adds `dayTypes` / `paymentTypes` whose labels the device doesn't
  have (case-insensitive).
- `summary` = `{ added, duplicates, jobsAdded, jobsMatched, optionsAdded }`,
  shown as the import toast.

All-profiles imports match each profile by name (case-insensitive) and
import into it in the chosen mode. A profile the device doesn't have is
created and given the file's settings in full (pay cycle, currency…).

## If you change the schema

1. Never rename `RECORDS_KEY` in `storage.js`, and never write a shape
   under it that a plain array-of-records reader can't parse.
2. Add new record fields as optional — read with a fallback (see
   `migrateRecord()` in `storage.js`), don't require them.
3. If a field's meaning changes (not just a rename), give `settings`
   (or a new key) a `schemaVersion` bump and write a small migration
   function, the same way `recordMinutes()` already bridges the old
   `workingHours` decimal format.
4. Add a case to the Playwright/manual test that seeds the *old* shape
   in `localStorage` before load, to prove the migration path still
   works — that's how the pay-cycle-ordering and decimal-hours
   compatibility were verified for this version.
