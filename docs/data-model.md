# Data model & migration notes

## Records — `localStorage["modern_work_hours_tracker_v1"]`

A JSON array. Each record:

```jsonc
{
  "id": "string",              // stable unique id
  "date": "YYYY-MM-DD",
  "start": "HH:MM",            // 24-hour
  "cycle": "string",           // free-text pay cycle/fortnight label; "Unassigned" if blank
  "workingMinutes": 142,       // whole minutes — e.g. 2h22m is stored as 142, not 2.22
  "mapNumber": "string",
  "dayType": "string",         // one of settings.dayTypes[].label at time of entry
  "paymentType": "string",     // one of settings.paymentTypes[].label at time of entry
  "paymentAmount": 60,         // number
  "notes": "string"
}
```

**Backward compatibility:** an even older record shape stored duration as
a decimal `workingHours` field (e.g. `2.5` for 2h30m) instead of
`workingMinutes`. `calculations.js#recordMinutes()` and
`storage.js#loadRecords()` read either shape transparently — a record is
never rewritten just to "normalize" it, so nothing is lost or altered by
opening the app.

`dayType` and `paymentType` are stored as the option's **label text**,
not an id. This mirrors the original tracker's behaviour and is what
makes archiving (rather than deleting) safe: a record's stored string
never depends on a settings entry continuing to exist.

## Settings — `localStorage["modern_work_hours_tracker_v1_settings"]`

```jsonc
{
  "schemaVersion": 1,
  "currency": "AUD",            // any ISO 4217 code
  "theme": "system",            // "system" | "light" | "dark"
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
  }
}
```

This key is new. If it doesn't exist (first run, or an upgrade from the
original single-file tracker, which had no settings), it's created with
defaults that match that original tracker's hard-coded lists exactly —
`Day / Afternoon / Night / Overnight` and
`Normal / Overtime / Weekend / Public Holiday / Casual loading` — so an
upgrade changes nothing about what's in the dropdowns until you edit
them yourself.

`storage.js#loadSettings()` merges whatever is stored over the defaults
field-by-field, so a settings object saved by an older version of this
app (missing a field a newer version added) is filled in rather than
rejected.

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
