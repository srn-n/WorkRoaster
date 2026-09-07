# Data model & migration notes

## Records — `localStorage["modern_work_hours_tracker_v1"]`

A JSON array. Each record contains `id`, `date`, `start`, `cycle`, `workingMinutes`, `mapNumber`, `dayType`, `paymentType`, `paymentAmount`, and `notes`.

Working time is stored as whole minutes. Older records that stored decimal `workingHours` are still read through the calculation layer so existing data remains compatible.

## Settings — `localStorage["modern_work_hours_tracker_v1_settings"]`

Settings contain day types, payment types, currency, theme, and defaults. The settings key is separate from the original records key.

## Data safety

Never rename the existing records storage key. If the stored shape changes later, add a migration path rather than assuming existing users already have the new shape.
