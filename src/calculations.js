/**
 * calculations.js
 * -----------------------------------------------------------------------
 * Pure, framework-free math helpers. Nothing in this file touches
 * localStorage or the DOM, so it can be unit-tested in isolation.
 *
 * The one rule every function here respects: working time is always
 * carried around as *minutes* (an integer), never as a hand-rolled
 * decimal like "2.22" for 2h22m. Decimal hours only exist at the very
 * last step, right before something is displayed or divided.
 * -----------------------------------------------------------------------
 */

/** Clamp+round a (hours, minutes) pair from the form into whole minutes. */
export function durationMinutes(h, m) {
  const hoursValue = Math.max(0, Number(h) || 0);
  const minutesValue = Math.max(0, Math.min(59, Number(m) || 0));
  return Math.round(hoursValue * 60 + minutesValue);
}

/**
 * Resolve a record's working time to minutes, whatever legacy shape it
 * was saved in. This is the single compatibility shim that lets old
 * records (some tracker versions stored decimal hours) keep working
 * without a destructive migration.
 */
export function recordMinutes(record) {
  if (Number.isFinite(Number(record.workingMinutes))) {
    return Number(record.workingMinutes);
  }
  if (Number.isFinite(Number(record.workingHours))) {
    return Math.round(Number(record.workingHours) * 60);
  }
  return 0;
}

/** Split whole minutes back into {hours, minutes} for form pre-fill. */
export function minutesToParts(totalMinutes) {
  const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
  return { hours: Math.floor(m / 60), minutes: m % 60 };
}

export function decimalHoursFromMinutes(minutes) {
  return (Number(minutes) || 0) / 60;
}

/** Earnings per hour, guarding against divide-by-zero. */
export function hourlyRate(pay, minutes) {
  const h = decimalHoursFromMinutes(minutes);
  return h > 0 ? (Number(pay) || 0) / h : 0;
}

/** Round a monetary value to whole cents — avoids float artefacts like
 *  $62.499999999 creeping into a stored/displayed payment amount. */
export function roundCurrency(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/**
 * The inverse of hourlyRate(): payment for a given hourly rate and
 * working time, rounded to whole cents. Used by "hourly rate" pay-entry
 * mode (see app.js) to derive `paymentAmount` before a record is saved —
 * everything downstream (cycle totals, exports, dashboard) keeps reading
 * the plain `paymentAmount` field either way, never this rate directly.
 * Negative rates are clamped to 0 rather than producing a negative
 * payment; zero minutes or a zero rate both correctly resolve to $0.00,
 * never NaN/Infinity.
 */
export function paymentFromHourlyRate(rateValue, minutes) {
  const h = decimalHoursFromMinutes(minutes);
  const r = Math.max(0, Number(rateValue) || 0);
  return roundCurrency(r * h);
}

/**
 * Does this record carry a usable optional "end" (ending time) value?
 * Only records saved through the ending-time workflow have this field
 * at all — a record entered with manual hours/minutes (old or new)
 * never gets it. See docs/data-model.md "Ending time".
 */
export function hasEndTime(record) {
  return typeof record?.end === 'string' && /^\d{2}:\d{2}$/.test(record.end);
}

/**
 * Working minutes between a "HH:MM" starting time and a "HH:MM" ending
 * time. Handles overnight shifts: whenever the ending time is not later
 * than the starting time, it's treated as falling on the following day
 * (e.g. 22:00 -> 06:00 is 8 hours, not a negative duration) — this never
 * requires a separate end date from the user. Returns null, rather than
 * 0 or a guess, when either time is missing or not a valid "HH:MM"
 * string, so a caller can tell "not enough info yet" apart from a real
 * zero-length shift and avoid calculating a misleading duration.
 */
export function minutesFromTimes(start, end) {
  if (!/^\d{2}:\d{2}$/.test(start || '') || !/^\d{2}:\d{2}$/.test(end || '')) return null;
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal < startTotal) endTotal += 24 * 60; // overnight: end falls on the next day
  return endTotal - startTotal;
}

export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatMoney(amount, currency = 'AUD', locale = undefined) {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Unknown/invalid currency code typed into settings — fall back
    // rather than throwing and blanking the whole dashboard.
    return `$${value.toFixed(2)}`;
  }
}

export function formatRate(pay, minutes, currency) {
  const rate = hourlyRate(pay, minutes);
  return rate > 0 ? `${formatMoney(rate, currency)}/hr` : '—';
}

/** Epoch ms for a plain "YYYY-MM-DD" string, timezone-safe (local midnight). */
export function dateValue(dateString) {
  if (!dateString) return 0;
  const t = new Date(`${dateString}T00:00:00`).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Today's date as YYYY-MM-DD in the user's OWN time zone. (It used to be
 *  the UTC date, so before ~10–11am in Australia "today" was yesterday.) */
export function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayName(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
}

export function dateLabel(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function shortDateLabel(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Automatic pay-cycle calculation.
 * -----------------------------------------------------------------------
 * A cycle is a deterministic function of (date, cycleLengthDays, anchor):
 * the same inputs always resolve to the same cycle, so changing the
 * configured cycle length re-buckets every record consistently without
 * anything being stored per record.
 *
 * DEFAULT_CYCLE_ANCHOR ('1970-01-12') is a fixed reference Monday. All
 * cycle math counts whole cycleLengthDays-sized blocks forward/backward
 * from this date:
 *
 *   blockIndex = floor((date - anchor) / cycleLengthDays)
 *   cycleStart = anchor + blockIndex * cycleLengthDays
 *   cycleEnd   = cycleStart + cycleLengthDays - 1
 *
 * Because the anchor is a Monday and 7 and 14 both divide evenly into a
 * week, this single formula naturally produces Monday-anchored weekly
 * (7-day) and fortnightly (14-day, two consecutive Mon–Sun weeks) cycles
 * with no special-casing. For 30-day cycles the same formula is used
 * as-is — a plain deterministic 30-day block count from the same anchor,
 * not a weekly interpretation. All arithmetic runs in UTC internally so
 * daylight-saving transitions can never shift a date across a cycle
 * boundary.
 *
 * Why this specific Monday, and not any other: for a 7-day cycle every
 * Monday gives the same weeks, but for a 14-day (fortnightly) cycle there
 * are two possible Monday "parities" — real fortnightly pay cycles fall
 * on one or the other depending on which week the employer started
 * paying on, and picking the wrong one silently splits every real pay
 * period in half. 1970-01-12 was chosen (over the equally-valid
 * 1970-01-05, exactly one week earlier) because it's the parity that
 * matches this tracker's actual historical pay records — confirmed by
 * lining up computed cycles against previously recorded fortnights
 * (e.g. Mon 29 Jun 2026 – Sun 12 Jul 2026). If this ever needs to change
 * for a different pay schedule, shift the anchor by ±7 days to flip
 * fortnightly parity (7-day cycles are unaffected either way; 30-day
 * cycles will shift their block boundaries, which is harmless since they
 * have no real-world weekly reference to preserve).
 */
export const DEFAULT_CYCLE_ANCHOR = '1970-01-12';
const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_CYCLE_LENGTHS = [7, 14, 30, 365];

function parseDateUTC(dateString) {
  const [y, m, d] = String(dateString).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function formatDateUTC(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Human label for a cycle span, e.g. "21 Sep – 27 Sep 2026" or, when it
 *  crosses a year boundary, "28 Dec 2026 – 3 Jan 2027". */
function cycleRangeLabel(cycleStart, cycleEnd) {
  const sameYear = cycleStart.slice(0, 4) === cycleEnd.slice(0, 4);
  const start = sameYear ? shortDateLabel(cycleStart) : dateLabel(cycleStart);
  return `${start} – ${dateLabel(cycleEnd)}`;
}

/**
 * Resolve which pay cycle a date belongs to. Pure function — no DOM, no
 * storage. Returns null for a missing/unparseable date so callers can
 * fall back to an "Unassigned" bucket instead of throwing.
 */
// getCycleForDate() is called for every record on every render, and its
// label formatting (toLocaleDateString) is the expensive part — so results
// are memoised per date/length/anchor. Pure function of its inputs; a copy
// is returned so callers can never mutate the cached value.
const cycleCache = new Map();
const CYCLE_CACHE_LIMIT = 20000;

export function getCycleForDate(dateString, cycleLengthDays, anchorDateString = DEFAULT_CYCLE_ANCHOR) {
  if (!dateString) return null;
  const cacheKey = `${dateString}|${cycleLengthDays}|${anchorDateString}`;
  const cached = cycleCache.get(cacheKey);
  if (cached !== undefined) return cached ? { ...cached } : null;
  const result = computeCycleForDate(dateString, cycleLengthDays, anchorDateString);
  if (cycleCache.size >= CYCLE_CACHE_LIMIT) cycleCache.clear();
  cycleCache.set(cacheKey, result);
  return result ? { ...result } : null;
}

function computeCycleForDate(dateString, cycleLengthDays, anchorDateString) {
  const length = VALID_CYCLE_LENGTHS.includes(Number(cycleLengthDays)) ? Number(cycleLengthDays) : 14;
  const anchorMs = parseDateUTC(anchorDateString || DEFAULT_CYCLE_ANCHOR);
  const dateMs = parseDateUTC(dateString);
  if (!Number.isFinite(dateMs)) return null;

  const diffDays = Math.floor((dateMs - anchorMs) / DAY_MS);
  const blockIndex = Math.floor(diffDays / length);
  const cycleStartMs = anchorMs + blockIndex * length * DAY_MS;
  const cycleEndMs = cycleStartMs + (length - 1) * DAY_MS;

  const cycleStart = formatDateUTC(cycleStartMs);
  const cycleEnd = formatDateUTC(cycleEndMs);
  return { cycleStart, cycleEnd, key: cycleStart, cycleLabel: cycleRangeLabel(cycleStart, cycleEnd) };
}

const MONTH_PREFIXES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Best-effort parse of a legacy free-text cycle label like "Sep 7 to Sep 20"
 * or "Aug 24 to Sep 06" into { startMonth, startDay, endMonth, endDay }
 * (1-indexed months). Returns null if the text doesn't match this shape —
 * callers should treat that as "can't confirm", not "definitely differs".
 */
function parseLegacyCycleRange(text) {
  const m = /^([A-Za-z]{3,9})\s+(\d{1,2})\s+to\s+([A-Za-z]{3,9})\s+(\d{1,2})$/i.exec(String(text || '').trim());
  if (!m) return null;
  const startMonth = MONTH_PREFIXES.indexOf(m[1].slice(0, 3).toLowerCase());
  const endMonth = MONTH_PREFIXES.indexOf(m[3].slice(0, 3).toLowerCase());
  if (startMonth === -1 || endMonth === -1) return null;
  return { startMonth: startMonth + 1, startDay: Number(m[2]), endMonth: endMonth + 1, endDay: Number(m[4]) };
}

/**
 * Does a legacy free-text cycle label (e.g. "Sep 7 to Sep 20", typed before
 * automatic cycles existed) describe the SAME period as a computed cycle
 * (e.g. { cycleStart: "2026-09-07", cycleEnd: "2026-09-20" })? This is a
 * semantic comparison, not string equality — the two will almost never be
 * byte-identical (legacy text never carries a year and uses "to" instead of
 * "–"), so comparing raw strings would flag nearly every legacy record as a
 * mismatch even when it describes the exact same fortnight. The legacy
 * text's year is assumed from the computed cycle's own start/end years
 * (free text never states one), so this only confirms month+day agreement.
 * Returns false — "does not match", so the caller still surfaces it as a
 * legacy note — whenever the text doesn't parse or a real caller should
 * treat as unconfirmed rather than silently trusting a coincidental parse.
 */
export function legacyCycleMatchesComputed(legacyText, computedCycle) {
  if (!legacyText || !computedCycle) return false;
  const parsed = parseLegacyCycleRange(legacyText);
  if (!parsed) return false;
  const startYear = computedCycle.cycleStart.slice(0, 4);
  const endYear = computedCycle.cycleEnd.slice(0, 4);
  const parsedStart = `${startYear}-${String(parsed.startMonth).padStart(2, '0')}-${String(parsed.startDay).padStart(2, '0')}`;
  const parsedEnd = `${endYear}-${String(parsed.endMonth).padStart(2, '0')}-${String(parsed.endDay).padStart(2, '0')}`;
  return parsedStart === computedCycle.cycleStart && parsedEnd === computedCycle.cycleEnd;
}

/**
 * Group records by their AUTOMATICALLY CALCULATED pay cycle (from each
 * record's date + the configured cycle length — see getCycleForDate),
 * and order the groups by cycle start date, most recent first. A record
 * without a usable date falls into a single "Unassigned" bucket, sorted
 * last. Any legacy free-text `record.cycle` value is intentionally never
 * consulted here — it's historical display-only data now (see
 * docs/data-model.md), not a grouping key.
 */
export function groupByCycle(records, cycleLengthDays = 14, anchorDateString = DEFAULT_CYCLE_ANCHOR) {
  const groups = new Map();
  const UNASSIGNED_KEY = '\u0000unassigned';

  for (const record of records) {
    const cyc = getCycleForDate(record.date, cycleLengthDays, anchorDateString);
    const key = cyc ? cyc.key : UNASSIGNED_KEY;
    if (!groups.has(key)) {
      groups.set(
        key,
        cyc
          ? { key: cyc.key, cycleStart: cyc.cycleStart, cycleEnd: cyc.cycleEnd, cycleLabel: cyc.cycleLabel, records: [] }
          : { key: UNASSIGNED_KEY, cycleStart: null, cycleEnd: null, cycleLabel: 'Unassigned', records: [] }
      );
    }
    groups.get(key).records.push(record);
  }

  for (const group of groups.values()) {
    group.records.sort((a, b) => dateValue(b.date) - dateValue(a.date) || String(b.start || '').localeCompare(String(a.start || '')));
  }

  const ordered = [...groups.values()].sort((a, b) => {
    if (!a.cycleStart) return 1;
    if (!b.cycleStart) return -1;
    return dateValue(b.cycleStart) - dateValue(a.cycleStart);
  });

  return ordered.map((group) => ({
    key: group.key,
    cycleStart: group.cycleStart,
    cycleEnd: group.cycleEnd,
    cycleLabel: group.cycleLabel,
    records: group.records,
    totalMinutes: group.records.reduce((sum, r) => sum + recordMinutes(r), 0),
    totalPay: group.records.reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0),
    startDate: group.cycleStart ? dateValue(group.cycleStart) : 0,
  }));
}

export function totalMinutes(records) {
  return records.reduce((sum, r) => sum + recordMinutes(r), 0);
}

export function totalPay(records) {
  return records.reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);
}

/**
 * Weighted overall hourly rate: total earnings / total working hours.
 * NOT an average of each day's individual rate — a handful of very
 * short high-rate shifts must not skew the headline number.
 */
export function weightedAverageRate(records) {
  return hourlyRate(totalPay(records), totalMinutes(records));
}

/** Average clock-in time across all records with a valid "HH:MM" start. */
export function averageStartTime(records) {
  const valid = records.filter((r) => /^\d{2}:\d{2}$/.test(r.start || ''));
  if (!valid.length) return null;
  const mins = valid.map((r) => { const [h, m] = r.start.split(':').map(Number); return h * 60 + m; });

  // Clock times wrap at midnight, so a plain average of 23:00 and 01:00 would
  // say 12:00 (midday). Find the circular mean first, then average each time
  // "unwrapped" to within 12h of it. For starts that all fall inside one
  // 12-hour window (the usual day shift) this is exactly the ordinary
  // average; for night workers it lands around midnight instead of midday.
  const DAY = 24 * 60;
  const sin = mins.reduce((s, x) => s + Math.sin((2 * Math.PI * x) / DAY), 0);
  const cos = mins.reduce((s, x) => s + Math.cos((2 * Math.PI * x) / DAY), 0);
  const centre = Math.abs(sin) < 1e-9 && Math.abs(cos) < 1e-9 ? 0 : ((((Math.atan2(sin, cos) * DAY) / (2 * Math.PI)) % DAY) + DAY) % DAY;
  const unwrapped = mins.map((x) => (x - centre > DAY / 2 ? x - DAY : centre - x > DAY / 2 ? x + DAY : x));
  const avg = Math.round(unwrapped.reduce((s, x) => s + x, 0) / unwrapped.length);
  const total = ((avg % DAY) + DAY) % DAY;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format a 24h "HH:MM" as a friendly 12h label, e.g. "4:32 PM". */
export function formatTime12h(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * A record's "Active hour" — one Start – End label, the single source for
 * the website ledger and every export. Overnight shifts read naturally
 * ("10:00 PM – 2:00 AM") with no date. A record saved with a manual
 * duration has no `end`, and none is ever invented for it: it reads
 * "From 3:00 PM" (its duration is shown in its own column).
 */
export function formatActiveHour(record) {
  const start = formatTime12h(record?.start);
  if (hasEndTime(record)) return `${start} – ${formatTime12h(record.end)}`;
  return start === '—' ? '—' : `From ${start}`;
}

/**
 * -----------------------------------------------------------------------
 * Pay calculation mode
 * -----------------------------------------------------------------------
 * Four modes. The first two are also settings.payCalculationMode's values
 * (the global mode for records saved without a job); the fixed-pay modes
 * exist only on jobs (jobs.js#normalizeJob) because they need a salary
 * and a schedule:
 *
 *   'hourlyRate'   — rate x working time -> payment
 *   'payment'      — actual payment is entered -> effective hourly rate
 *   'monthlyFixed' — a monthly salary; each scheduled working day logged
 *                    carries that day's share of the month's salary
 *   'yearlyFixed'  — an annual salary; each scheduled working day logged
 *                    carries that day's share of the year's salary
 *
 * Which mode a SAVED record used is never re-derived from its job (whose
 * mode may have changed since): a fixed-pay record carries its
 * `fixedPayAtEntry` snapshot, an hourly record carries `hourlyRate` (the
 * rate actually applied), and an actual-payment record carries neither.
 * Those fields are the record's historical mode snapshot — see
 * docs/data-model.md "Pay calculation mode".
 */
export const PAY_MODES = ['payment', 'hourlyRate', 'monthlyFixed', 'yearlyFixed'];
export const FIXED_PAY_MODES = ['monthlyFixed', 'yearlyFixed'];

export function normalizePayMode(mode, fallback = 'payment') {
  return PAY_MODES.includes(mode) ? mode : fallback;
}

export function isFixedPayMode(mode) {
  return FIXED_PAY_MODES.includes(mode);
}

export function recordPayMode(record) {
  if (record && record.fixedPayAtEntry && isFixedPayMode(record.fixedPayAtEntry.mode)) return record.fixedPayAtEntry.mode;
  return record && record.hourlyRate !== undefined && record.hourlyRate !== null && Number.isFinite(Number(record.hourlyRate))
    ? 'hourlyRate'
    : 'payment';
}

/**
 * The hourly rate a record actually represents: the applied rate for an
 * hourly record; for an actual-payment record, payment ÷ working hours —
 * never the job's expected rate. For a fixed-pay record it is the day's
 * salary share ÷ working hours: an ANALYTICAL figure only — the salary is
 * the compensation, and more hours never change it. Returns 0 (callers
 * show "—") when there is no working time or no share, so nothing ever
 * yields Infinity/NaN.
 */
export function recordEffectiveRate(record) {
  if (recordPayMode(record) === 'hourlyRate') return Math.max(0, Number(record.hourlyRate) || 0);
  return hourlyRate(record.paymentAmount, recordMinutes(record));
}

/**
 * -----------------------------------------------------------------------
 * Fixed pay (monthly / yearly salary)
 * -----------------------------------------------------------------------
 * A fixed-pay job's configuration (job.fixedPay, and each record's
 * fixedPayAtEntry snapshot of it):
 *   { amount, workingDays: [0..6] (0 = Sunday), start: 'HH:MM',
 *     end: 'HH:MM', breakMinutes }
 * The salary is never turned into an hourly rate. Instead each record on
 * a SCHEDULED working day carries that day's share of the salary period
 * it falls in, so a fully logged month adds up to the month's salary and
 * pay-cycle totals, the graph and exports stay meaningful:
 *   monthly: amount ÷ scheduled working days in that calendar month
 *   yearly:  amount ÷ scheduled working days in that calendar year
 * Working longer doesn't change the share (a salary doesn't grow with
 * hours); a day outside the schedule carries no share.
 */
export const FIXED_PAY_BREAK_OPTIONS = [0, 15, 30, 60];
const HHMM = /^\d{2}:\d{2}$/;

export function normalizeFixedPay(config) {
  const src = config && typeof config === 'object' ? config : {};
  const days = Array.isArray(src.workingDays) ? src.workingDays : [1, 2, 3, 4, 5];
  const workingDays = [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  const breakMinutes = Number(src.breakMinutes);
  return {
    amount: Number.isFinite(Number(src.amount)) ? Math.max(0, Number(src.amount)) : 0,
    workingDays,
    start: HHMM.test(src.start || '') ? src.start : '09:00',
    end: HHMM.test(src.end || '') ? src.end : '17:00',
    breakMinutes: FIXED_PAY_BREAK_OPTIONS.includes(breakMinutes) ? breakMinutes : 30,
  };
}

/** Standard working time of a fixed-pay schedule (end − start − break;
 *  overnight schedules handled the same way as records). */
export function fixedScheduleMinutes(config) {
  const c = normalizeFixedPay(config);
  const gross = minutesFromTimes(c.start, c.end);
  return gross === null ? 0 : Math.max(0, gross - c.breakMinutes);
}

/** How many scheduled working days (weekdays in `workingDays`) fall in a
 *  calendar month (monthIndex 0–11) or, with monthIndex null, a year. */
export function scheduledWorkingDays(workingDays, year, monthIndex = null) {
  const set = new Set(workingDays || []);
  if (!set.size) return 0;
  const startMonth = monthIndex === null ? 0 : monthIndex;
  const endMonth = monthIndex === null ? 11 : monthIndex;
  let count = 0;
  for (let m = startMonth; m <= endMonth; m += 1) {
    const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    for (let d = 1; d <= days; d += 1) if (set.has(new Date(Date.UTC(year, m, d)).getUTCDay())) count += 1;
  }
  return count;
}

/**
 * The salary share for one date under a fixed-pay configuration.
 * Returns { scheduledDay, scheduledDays, periodLabel, share } — `share`
 * is the day's portion of the period's salary (rounded to the cent) and
 * `scheduledDay` says whether the date is one of the configured working
 * days at all (callers give an unscheduled day no share).
 */
/**
 * Split `totalMinor` minor units (cents) across `count` slots so the parts
 * always add up exactly: every slot gets floor(total / count), and the
 * first (total mod count) slots get one extra unit. Pure integer arithmetic
 * — no floating-point drift — and deterministic for a given slot index.
 */
export function allocateMinorUnits(totalMinor, count, index) {
  if (!(count > 0) || index < 0 || index >= count) return 0;
  const total = Math.round(totalMinor);
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return base + (index < remainder ? 1 : 0);
}

/** How many of `workingDays` fall in the period (calendar month, or whole
 *  year when monthIndex is null) strictly BEFORE `day` (1-based) of
 *  `throughMonth` — i.e. this date's 0-based position among the period's
 *  scheduled days. */
function scheduledDayIndex(workingDays, year, monthIndex, throughMonth, day) {
  const set = new Set(workingDays || []);
  let index = 0;
  const firstMonth = monthIndex === null ? 0 : monthIndex;
  for (let m = firstMonth; m <= throughMonth; m += 1) {
    const last = m === throughMonth ? day - 1 : new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    for (let d = 1; d <= last; d += 1) if (set.has(new Date(Date.UTC(year, m, d)).getUTCDay())) index += 1;
  }
  return index;
}

/**
 * A salaried date's share of its period's pay (calendar month for
 * monthlyFixed, calendar year for yearlyFixed).
 *
 * The salary is allocated in whole cents across the period's scheduled
 * dates (allocateMinorUnits): each date's share depends only on the pay
 * configuration and the date's position in the period — never on the
 * order records are entered — and the shares of every scheduled date in a
 * complete period add up to the salary exactly. A date that isn't a
 * working day has no allocation (records on it are saved at $0); its
 * `share` is the period's average day rate, for display only.
 */
export function fixedPayDayShare(mode, config, dateString) {
  const c = normalizeFixedPay(config);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '');
  if (!m || !isFixedPayMode(mode)) return { scheduledDay: false, scheduledDays: 0, periodLabel: '', share: 0 };
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
  const monthly = mode === 'monthlyFixed';
  const scheduledDays = scheduledWorkingDays(c.workingDays, year, monthly ? monthIndex : null);
  const periodLabel = monthly
    ? new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : String(year);
  const scheduledDay = c.workingDays.includes(weekday);
  const averageShare = scheduledDays > 0 ? roundCurrency(c.amount / scheduledDays) : 0;
  if (!scheduledDay || scheduledDays === 0) return { scheduledDay, scheduledDays, periodLabel, share: averageShare, averageShare };
  const dayIndex = scheduledDayIndex(c.workingDays, year, monthly ? monthIndex : null, monthIndex, day);
  const share = allocateMinorUnits(Math.round(c.amount * 100), scheduledDays, dayIndex) / 100;
  return { scheduledDay, scheduledDays, periodLabel, share, averageShare, dayIndex };
}

/**
 * -----------------------------------------------------------------------
 * Jobs / weekend & additional rate rules / effective rate
 * -----------------------------------------------------------------------
 * Pure, framework-free payroll math — no DOM, no storage, unit-testable
 * in isolation, same discipline as the rest of this file. This is the
 * ONLY place effective-rate math is allowed to live; app.js must call
 * into these functions rather than re-deriving a rate calculation.
 *
 * A "rule" (a job's Saturday rule, Sunday rule, or additional-loading
 * rule, or a record-level override) is always the plain shape:
 *   { type: 'none' | 'percent' | 'multiplier' | 'custom', value: number }
 * - 'none': no adjustment.
 * - 'percent': value is a percentage addition, e.g. 25 means "+25%"
 *   (equivalent to a 1.25× multiplier — see ruleMultiplier()).
 * - 'multiplier': value is applied directly, e.g. 1.5 means "1.50×"
 *   (equivalent to "+50%" — these two types are deliberately just two
 *   spellings of the same underlying multiplication).
 * - 'custom': value is a flat dollar figure. For a weekend rule this
 *   REPLACES the base rate outright for that day (a fixed weekend rate)
 *   rather than multiplying it. For the additional-loading rule it is
 *   instead ADDED, as a flat per-hour amount, after the weekend step —
 *   see calculateEffectiveRate()'s doc comment for the exact order.
 * -----------------------------------------------------------------------
 */

const RULE_TYPES = ['none', 'percent', 'multiplier', 'custom'];
const DEFAULT_RULE = Object.freeze({ type: 'none', value: 0 });

/** 'saturday' | 'sunday' | 'weekday' for a plain "YYYY-MM-DD" date string.
 *  Uses local time, exactly like dayName()/dateLabel() above and the
 *  dashboard calendar's own date-string handling, so a record's weekend
 *  status is always read the same way everywhere in the app. */
export function dateRuleKind(dateString) {
  if (!dateString) return 'weekday';
  const day = new Date(`${dateString}T00:00:00`).getDay();
  if (day === 6) return 'saturday';
  if (day === 0) return 'sunday';
  return 'weekday';
}

/** Fill in a safe, complete rule shape from a possibly-partial/legacy
 *  value — never throws, never returns something calculateEffectiveRate
 *  can't handle. */
export function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') return { ...DEFAULT_RULE };
  const type = RULE_TYPES.includes(rule.type) ? rule.type : 'none';
  const value = Number.isFinite(Number(rule.value)) ? Number(rule.value) : 0;
  return { type, value };
}

/**
 * The multiplier a rule represents. Returns 1 (no change) for 'none' and
 * for 'custom' — 'custom' isn't a multiplier at all (it's a flat
 * replacement/addition handled directly in calculateEffectiveRate), so
 * callers must special-case rule.type === 'custom' themselves rather
 * than relying on this returning something meaningful for it.
 */
export function ruleMultiplier(rule) {
  const r = normalizeRule(rule);
  if (r.type === 'percent') return 1 + r.value / 100;
  if (r.type === 'multiplier') return r.value;
  return 1;
}

/** Human label for a rule, e.g. "+50%", "1.50×", "$40.00 flat", or
 *  "No adjustment" — used by the rate-breakdown UI and the Jobs settings
 *  list so the same rule always reads identically everywhere. */
export function formatRuleLabel(rule, currency) {
  const r = normalizeRule(rule);
  if (r.type === 'percent') return `${r.value >= 0 ? '+' : ''}${r.value}%`;
  if (r.type === 'multiplier') return `${r.value.toFixed(2)}×`;
  if (r.type === 'custom') return `${formatMoney(r.value, currency)} flat`;
  return 'No adjustment';
}

/**
 * Which weekend rule actually applies to a record, honoring an optional
 * record-level override:
 *   - no override (undefined/null), or override.mode === 'default':
 *     follow the date automatically — job.saturdayRule on a Saturday,
 *     job.sundayRule on a Sunday, no adjustment on a weekday.
 *   - override.mode === 'none': force no adjustment regardless of date.
 *   - override.mode === 'custom': use override.rule instead of the job's
 *     own Saturday/Sunday rule for this one record, without ever writing
 *     back to (or changing) the job's own configured rule.
 * Returns { rule, source } where source records which of the above
 * actually produced `rule`, for display ("Sunday", "Custom", "Override:
 * no adjustment", ...).
 */
export function resolveWeekendRule(job, dateString, override) {
  if (override && override.mode === 'none') {
    return { rule: { ...DEFAULT_RULE }, source: 'override-none' };
  }
  if (override && override.mode === 'custom') {
    return { rule: normalizeRule(override.rule), source: 'override-custom' };
  }
  const kind = dateRuleKind(dateString);
  if (kind === 'saturday') return { rule: normalizeRule(job && job.saturdayRule), source: 'saturday' };
  if (kind === 'sunday') return { rule: normalizeRule(job && job.sundayRule), source: 'sunday' };
  return { rule: { ...DEFAULT_RULE }, source: 'weekday' };
}

/**
 * base rate -> weekend adjustment -> additional adjustment, in that
 * fixed order (see docs/data-model.md "Effective rate"). This order is
 * deliberate and never varies: an additional loading is a percentage
 * (or flat top-up) of the ALREADY weekend-adjusted rate, not of the
 * plain base rate, so a Sunday-plus-additional shift compounds rather
 * than just adding the two percentages together.
 *
 *   afterWeekend = weekendRule.type === 'custom'
 *     ? weekendRule.value                    // flat weekend rate
 *     : baseRate * ruleMultiplier(weekendRule)
 *
 *   effective = additionalRule.type === 'custom'
 *     ? afterWeekend + additionalRule.value   // flat additional loading
 *     : afterWeekend * ruleMultiplier(additionalRule)
 *
 * Both intermediate and final rates are rounded to whole cents with the
 * same roundCurrency() used for every other money value in the app, so
 * a rate computed here and a rate re-derived later from stored snapshot
 * fields always agree to the cent.
 */
export function calculateEffectiveRate({ baseRate, weekendRule, additionalRule }) {
  const base = Math.max(0, Number(baseRate) || 0);
  const wRule = normalizeRule(weekendRule);
  const afterWeekend = wRule.type === 'custom' ? roundCurrency(Math.max(0, wRule.value)) : roundCurrency(base * ruleMultiplier(wRule));

  const aRule = normalizeRule(additionalRule);
  const effective =
    aRule.type === 'custom' ? roundCurrency(afterWeekend + Math.max(0, aRule.value)) : roundCurrency(afterWeekend * ruleMultiplier(aRule));

  return { afterWeekend, effective };
}

/** Payment for a given effective rate and working minutes. This is
 *  exactly paymentFromHourlyRate() under a name that matches how the
 *  Jobs feature talks about it (see docs/data-model.md "Effective
 *  rate") — kept as a thin, explicitly-named alias rather than a
 *  reimplementation, so there is still only one payment formula in the
 *  whole app. */
export function calculatePaymentFromEffectiveRate(effectiveRate, minutes) {
  return paymentFromHourlyRate(effectiveRate, minutes);
}

/**
 * One-stop breakdown assembler used by both the hourly-rate-mode rate
 * panel and the direct-payment-mode "expected vs actual" comparison —
 * everything either UI needs to display, computed once, the same way,
 * from a job, a date, an optional record-level weekend override, and a
 * working-minutes figure. Pure: reads only the plain data passed in,
 * never state.records/state.settings directly.
 */
export function getRateBreakdown(job, dateString, override, minutes) {
  const baseRate = Math.max(0, Number(job && job.baseRate) || 0);
  const { rule: weekendRule, source: weekendSource } = resolveWeekendRule(job, dateString, override);
  const additionalRule = normalizeRule(job && job.additionalRule);
  const { afterWeekend, effective } = calculateEffectiveRate({ baseRate, weekendRule, additionalRule });
  const mins = Math.max(0, Number(minutes) || 0);
  const payment = mins > 0 ? calculatePaymentFromEffectiveRate(effective, mins) : 0;
  return { baseRate, weekendRule, weekendSource, afterWeekend, additionalRule, effectiveRate: effective, minutes: mins, payment };
}
