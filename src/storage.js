/**
 * storage.js
 * -----------------------------------------------------------------------
 * Everything that touches localStorage, plus JSON/CSV import & export.
 *
 * DATA-SAFETY CONTRACT (read this before changing anything in here):
 *   - RECORDS_KEY is the exact key the original single-file tracker
 *     used ('modern_work_hours_tracker_v1'). It is never renamed and
 *     the array shape stored under it is never restructured. Anyone
 *     upgrading from the old HTML file keeps every record.
 *   - Settings live under a SEPARATE key. A brand-new key can't
 *     collide with or overwrite anything that already exists.
 *   - migrateRecord() only ever ADDS a normalized `id`/shape when one
 *     is missing; it never deletes a field it doesn't understand, so
 *     unknown/future fields round-trip untouched.
 * -----------------------------------------------------------------------
 */
import { recordMinutes, getCycleForDate, hasEndTime, normalizeRule, normalizeFixedPay, isFixedPayMode } from './calculations.js';
import { normalizeJob, findJob } from './jobs.js';

export const RECORDS_KEY = 'modern_work_hours_tracker_v1';
export const SETTINGS_KEY = 'modern_work_hours_tracker_v1_settings';
const SCHEMA_VERSION = 1;

const slugify = (label) =>
  String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `option-${Math.random().toString(36).slice(2, 8)}`;

function defaultSettings() {
  // These labels intentionally match the original hard-coded arrays
  // from the single-file version, so an upgrade changes nothing about
  // what a returning user sees in the dropdowns.
  const dayTypeLabels = ['Day', 'Afternoon', 'Night', 'Overnight'];
  const paymentTypeLabels = ['Normal', 'Overtime', 'Weekend', 'Public Holiday', 'Casual loading'];

  return {
    schemaVersion: SCHEMA_VERSION,
    currency: 'AUD',
    theme: 'system', // 'system' | 'light' | 'dark'
    // Pay-cycle length in days: 7 | 14 | 30. Drives calculations.js's
    // automatic cycle grouping — see getCycleForDate(). 14 (fortnight)
    // matches the app's original hard-coded assumption, so an upgrade
    // changes nothing about existing grouping until this is changed.
    payCycleLengthDays: 14,
    // How the Pay section of the record form is entered: "payment" (type
    // in the final amount, hourly rate is calculated — the original
    // behaviour) or "hourlyRate" (type in a rate, payment is calculated).
    // This only controls how a NEW record's inputs are labelled/computed;
    // it's never used to reinterpret a record's already-stored
    // `paymentAmount` — see docs/data-model.md.
    payCalculationMode: 'payment',
    // Optional workflow: when true, a NEW record's working time is
    // calculated automatically from Starting time + Ending time instead
    // of manually typed hours/minutes. Off by default so an upgrade
    // changes nothing until the user opts in — see
    // calculations.js#minutesFromTimes and docs/data-model.md "Ending
    // time". Never flipped automatically by this app itself (e.g. when
    // payCalculationMode changes) — only ever set by the user via the
    // Settings toggle.
    calculateDurationFromEndTime: false,
    dayTypes: dayTypeLabels.map((label) => ({ id: slugify(label), label, archived: false })),
    paymentTypes: paymentTypeLabels.map((label) => ({ id: slugify(label), label, archived: false })),
    defaults: { dayType: dayTypeLabels[0], paymentType: paymentTypeLabels[0], startTime: '09:00' },
    // First-class Jobs list — see jobs.js. Empty by default so an
    // upgrade changes nothing: every existing workflow (manual hourly
    // rate entry, direct payment entry) keeps working identically when
    // no job is selected on a record. See docs/data-model.md "Jobs".
    jobs: [],
    // What PDF / JPG / Excel reports include by default (each export can
    // still change these for that one file). All on = the report exactly
    // as before this setting existed. JSON backups and CSV are unaffected.
    exportVisibility: defaultExportVisibility(),
  };
}

export const EXPORT_VISIBILITY_KEYS = ['baseSalary', 'time', 'hours', 'amount'];
export function defaultExportVisibility() {
  return { baseSalary: true, time: true, hours: true, amount: true };
}
/** Keep only the four known switches, each a real boolean (missing → on). */
export function normalizeExportVisibility(value) {
  const src = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = defaultExportVisibility();
  for (const key of EXPORT_VISIBILITY_KEYS) if (typeof src[key] === 'boolean') out[key] = src[key];
  return out;
}

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    console.warn('WorkRoaster: could not parse stored data, ignoring it rather than overwriting it.');
    return fallback;
  }
}

/** Fill in an id/shape gap on an old record without discarding anything. */
function migrateRecord(record) {
  const migrated = {
    id: record.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)),
    date: record.date || '',
    start: record.start || '',
    cycle: record.cycle || 'Unassigned',
    workingMinutes: recordMinutes(record),
    mapNumber: record.mapNumber || '',
    dayType: record.dayType || '',
    paymentType: record.paymentType || '',
    paymentAmount: Number(record.paymentAmount) || 0,
    notes: record.notes || '',
  };
  // Optional context field: only present on records entered in
  // "hourlyRate" pay-calculation mode (see settings.payCalculationMode).
  // A plain "payment"-mode record — old or new — never gets this key at
  // all, so it round-trips through JSON exactly as before.
  if (record.hourlyRate !== undefined && record.hourlyRate !== null && record.hourlyRate !== '' && Number.isFinite(Number(record.hourlyRate))) {
    migrated.hourlyRate = Number(record.hourlyRate);
  }
  // Optional context field: only present on records entered through the
  // ending-time workflow (see settings.calculateDurationFromEndTime). A
  // record without a valid stored `end` — old or new — never gets this
  // key, and nothing is ever invented or derived from workingMinutes to
  // fill it in. `workingMinutes` above remains the source of truth for
  // duration either way.
  if (hasEndTime(record)) {
    migrated.end = record.end;
  }
  // Break time (minutes) already deducted from the gross shift span to
  // produce the `workingMinutes` above at the moment this record was
  // saved — see app.js#submitForm and docs/data-model.md "Break time".
  // Unlike the optional fields above, this one is always given a value
  // (defaulting to 0) rather than left absent: every part of the app that
  // displays a record's break annotation ("Break: 30 min" / "Break: —")
  // can then read `record.breakMinutes` directly without its own
  // fallback. A record saved before this feature existed simply never
  // had a break subtracted, so `0` here is not a guess — it is the
  // correct, exact historical value, and workingMinutes above is left
  // completely untouched either way.
  migrated.breakMinutes = Number.isFinite(Number(record.breakMinutes)) && Number(record.breakMinutes) >= 0 ? Number(record.breakMinutes) : 0;
  // Optional Jobs fields — see jobs.js and docs/data-model.md "Jobs".
  // Every single one of these is only ever copied through if already
  // present on the raw stored record; nothing here is ever invented.
  // A pre-Jobs record (or a record saved with no job selected) simply
  // never gets any of these keys, and behaves exactly as it always has.
  if (record.jobId) {
    migrated.jobId = String(record.jobId);
  }
  // Historical rate snapshot: the base rate, the weekend rule, and the
  // additional rule actually used to compute this record's rate/pay at
  // the moment it was entered. These are captured so that editing a
  // job's rates later (see jobs.js#updateJob) can NEVER retroactively
  // change what an already-saved record shows or is worth — the record
  // is the source of truth for its own history, not the job.
  if (record.baseRateAtEntry !== undefined && record.baseRateAtEntry !== null && Number.isFinite(Number(record.baseRateAtEntry))) {
    migrated.baseRateAtEntry = Number(record.baseRateAtEntry);
  }
  if (record.weekendRuleAtEntry) {
    migrated.weekendRuleAtEntry = normalizeRule(record.weekendRuleAtEntry);
  }
  if (record.additionalRuleAtEntry) {
    migrated.additionalRuleAtEntry = normalizeRule(record.additionalRuleAtEntry);
  }
  if (record.effectiveRateAtEntry !== undefined && record.effectiveRateAtEntry !== null && Number.isFinite(Number(record.effectiveRateAtEntry))) {
    migrated.effectiveRateAtEntry = Number(record.effectiveRateAtEntry);
  }
  // Record-level weekend override the user chose at entry time (Use job
  // default / No adjustment / Custom) — preserved so re-opening the
  // record for editing shows the same choice instead of silently
  // resetting to "Use job default". Never mutates job.saturdayRule /
  // job.sundayRule — see calculations.js#resolveWeekendRule.
  if (record.weekendOverride && typeof record.weekendOverride === 'object' && record.weekendOverride.mode) {
    const mode = ['default', 'none', 'custom'].includes(record.weekendOverride.mode) ? record.weekendOverride.mode : 'default';
    migrated.weekendOverride = mode === 'custom' ? { mode, rule: normalizeRule(record.weekendOverride.rule) } : { mode };
  }
  // Direct-payment-mode "expected vs actual" comparison snapshot — only
  // present when a job was selected while the record was entered in
  // payment mode. The user's typed paymentAmount above always remains
  // the source of truth for what they were actually paid; these two
  // fields only ever annotate it for comparison, never replace it.
  if (record.expectedRateAtEntry !== undefined && record.expectedRateAtEntry !== null && Number.isFinite(Number(record.expectedRateAtEntry))) {
    migrated.expectedRateAtEntry = Number(record.expectedRateAtEntry);
  }
  if (record.expectedPaymentAtEntry !== undefined && record.expectedPaymentAtEntry !== null && Number.isFinite(Number(record.expectedPaymentAtEntry))) {
    migrated.expectedPaymentAtEntry = Number(record.expectedPaymentAtEntry);
  }
  // Fixed-pay snapshot — only on records saved against a monthly/yearly
  // fixed-pay job: the salary configuration in force at entry time plus
  // the day's salary share it produced. Copied through as-is (normalized)
  // so a later salary or schedule change can never reprice history.
  if (record.fixedPayAtEntry && typeof record.fixedPayAtEntry === 'object' && isFixedPayMode(record.fixedPayAtEntry.mode)) {
    const fp = record.fixedPayAtEntry;
    migrated.fixedPayAtEntry = {
      mode: fp.mode,
      ...normalizeFixedPay(fp),
      scheduledDays: Number(fp.scheduledDays) || 0,
      dayShare: Number(fp.dayShare) || 0,
      counted: fp.counted === true,
      reason: ['scheduled', 'unscheduled', 'already-counted'].includes(fp.reason) ? fp.reason : fp.counted ? 'scheduled' : 'unscheduled',
    };
  }
  return migrated;
}

export function loadRecords() {
  const raw = safeParse(localStorage.getItem(RECORDS_KEY), []);
  const list = Array.isArray(raw) ? raw : [];
  return list.map(migrateRecord);
}

export function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

export function loadSettings() {
  const stored = safeParse(localStorage.getItem(SETTINGS_KEY), null);
  return normalizeSettings(stored);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Option lists (day types / payment types): keep only real entries. */
function normalizeOptionList(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  const clean = list
    .filter((o) => isObject(o) && typeof o.label === 'string' && o.label.trim())
    .map((o) => ({ ...o, id: typeof o.id === 'string' && o.id ? o.id : slugify(o.label), archived: o.archived === true }));
  return clean.length ? clean : fallback;
}

/**
 * Turn whatever is stored (or arrives in an imported backup) into a valid
 * settings object. Merges rather than replaces, so a settings file from an
 * older version that's missing a newer field still works, and anything
 * malformed — a cycle length of 0, jobs that aren't a list, a theme the app
 * doesn't have — falls back to the default instead of breaking the app.
 */
export function normalizeSettings(stored) {
  const base = defaultSettings();
  if (!isObject(stored)) return base;
  const defaults = isObject(stored.defaults) ? stored.defaults : {};
  const currency = typeof stored.currency === 'string' && /^[A-Za-z]{3}$/.test(stored.currency.trim()) ? stored.currency.trim().toUpperCase() : base.currency;

  return {
    ...base,
    ...stored,
    currency,
    theme: ['system', 'light', 'dark'].includes(stored.theme) ? stored.theme : base.theme,
    dayTypes: normalizeOptionList(stored.dayTypes, base.dayTypes),
    paymentTypes: normalizeOptionList(stored.paymentTypes, base.paymentTypes),
    payCycleLengthDays: [7, 14, 30, 365].includes(Number(stored.payCycleLengthDays)) ? Number(stored.payCycleLengthDays) : base.payCycleLengthDays,
    payCalculationMode: ['payment', 'hourlyRate'].includes(stored.payCalculationMode) ? stored.payCalculationMode : base.payCalculationMode,
    calculateDurationFromEndTime:
      typeof stored.calculateDurationFromEndTime === 'boolean' ? stored.calculateDurationFromEndTime : base.calculateDurationFromEndTime,
    exportVisibility: normalizeExportVisibility(stored.exportVisibility),
    defaults: {
      ...base.defaults,
      ...defaults,
      dayType: typeof defaults.dayType === 'string' ? defaults.dayType : base.defaults.dayType,
      paymentType: typeof defaults.paymentType === 'string' ? defaults.paymentType : base.defaults.paymentType,
      startTime: typeof defaults.startTime === 'string' && TIME_HHMM.test(defaults.startTime) ? defaults.startTime : base.defaults.startTime,
    },
    // Normalize every stored job through normalizeJob() so a job saved
    // by an older build of this app (missing a field added since) never
    // breaks — same defensive pattern as migrateRecord() for records.
    // A job saved before jobs had their own payCalculationMode inherits the
    // global mode it was actually being used under, so existing jobs keep
    // behaving exactly as before. Only fills a missing field; never
    // touches records. Entries that aren't job objects are dropped.
    jobs: Array.isArray(stored.jobs)
      ? stored.jobs
          .filter(isObject)
          .map((j) =>
            normalizeJob(
              j.payCalculationMode
                ? j
                : { ...j, payCalculationMode: ['payment', 'hourlyRate'].includes(stored.payCalculationMode) ? stored.payCalculationMode : base.payCalculationMode }
            )
          )
          .map((j) => ({ ...j, id: String(j.id) }))
      : base.jobs,
  };
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, schemaVersion: SCHEMA_VERSION }));
}

export function makeOptionId(label) {
  return slugify(label);
}

// ---------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------

export function buildBackup(records, settings) {
  return {
    app: 'WorkRoaster',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    records,
    settings,
  };
}

/**
 * Parse+validate a backup file's contents. Throws a descriptive error
 * rather than silently accepting something malformed — an import is a
 * destructive-adjacent action and deserves a clear failure.
 */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || v === '';
const finiteNumber = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));

function isRealDate(text) {
  const m = DATE_RE.exec(text);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/**
 * Why a raw backup record can't be imported, or null if it's acceptable.
 * Mirrors the record form's save rules (app.js#submitForm): a real date
 * and start time, more than 0 minutes of working time, a valid break and
 * a non-negative payment. Legacy shapes stay valid — e.g. duration stored
 * as decimal `workingHours` instead of `workingMinutes`, numbers stored as
 * numeric strings, or a missing id / breakMinutes (both are filled in on
 * import exactly as before). Optional fields are type-checked only.
 */
export function backupRecordProblem(record) {
  if (!isPlainObject(record)) return `it is ${record === null ? 'empty (null)' : Array.isArray(record) ? 'a list, not a record' : `a ${typeof record}, not a record`}`;
  if (typeof record.date !== 'string' || !isRealDate(record.date)) return 'its date is missing or not a real YYYY-MM-DD date';
  if (typeof record.start !== 'string' || !TIME_RE.test(record.start)) return 'its start time is missing or not a valid HH:MM time';
  const hasMinutes = !isBlank(record.workingMinutes);
  const hasHours = !isBlank(record.workingHours);
  if (!hasMinutes && !hasHours) return 'it has no working time';
  if (hasMinutes && !finiteNumber(record.workingMinutes)) return 'its working time is not a number';
  if (!hasMinutes && !finiteNumber(record.workingHours)) return 'its working time is not a number';
  if (!(recordMinutes(record) > 0)) return 'its working time is 0 minutes or less';
  if (!isBlank(record.breakMinutes) && (!finiteNumber(record.breakMinutes) || Number(record.breakMinutes) < 0 || Number(record.breakMinutes) >= 24 * 60)) return 'its break is not a valid number of minutes';
  if (!finiteNumber(record.paymentAmount) || Number(record.paymentAmount) < 0) return 'its payment amount is missing, not a number, or negative';
  if (!isBlank(record.hourlyRate) && (!finiteNumber(record.hourlyRate) || Number(record.hourlyRate) < 0)) return 'its hourly rate is not a valid amount';
  if (!isBlank(record.end) && (typeof record.end !== 'string' || !TIME_RE.test(record.end))) return 'its end time is not a valid HH:MM time';
  if (!isBlank(record.id) && typeof record.id !== 'string' && typeof record.id !== 'number') return 'its id is not text';
  for (const key of ['notes', 'dayType', 'paymentType', 'mapNumber', 'jobId', 'cycle']) {
    if (!isBlank(record[key]) && typeof record[key] !== 'string' && typeof record[key] !== 'number') return `its ${key} field is not text`;
  }
  return null;
}

/**
 * Parse and validate a JSON backup. All-or-nothing: if the file or ANY
 * record in it is invalid, this throws a user-facing Error naming the
 * record(s) and the reason, and the caller imports nothing — existing
 * data is never partially merged or replaced. Backups from older versions
 * (including ones whose `app` field says "WorkTrack") import normally.
 */
export function parseBackup(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isPlainObject(data) || !Array.isArray(data.records)) {
    throw new Error('That file does not look like a WorkRoaster backup (missing a "records" array). Nothing was imported.');
  }
  const problems = [];
  const seenIds = new Map();
  data.records.forEach((record, index) => {
    const problem = backupRecordProblem(record);
    const label = `Record ${index + 1}${isPlainObject(record) && typeof record.date === 'string' && record.date ? ` (${record.date})` : ''}`;
    if (problem) {
      problems.push(`${label}: ${problem}`);
      return;
    }
    if (!isBlank(record.id)) {
      const id = String(record.id);
      if (seenIds.has(id)) problems.push(`${label}: it has the same id as record ${seenIds.get(id) + 1}`);
      else seenIds.set(id, index);
    }
  });
  if (problems.length) {
    const shown = problems.slice(0, 3).join('; ');
    const more = problems.length > 3 ? `; and ${problems.length - 3} more` : '';
    throw new Error(`This backup can't be imported — ${shown}${more}. Nothing was imported; your current records are unchanged.`);
  }
  if (data.settings !== undefined && data.settings !== null && !isPlainObject(data.settings)) {
    throw new Error('This backup can\'t be imported — its settings section is not valid. Nothing was imported; your current records are unchanged.');
  }
  return {
    records: data.records.map(migrateRecord),
    settings: isPlainObject(data.settings) ? data.settings : null,
  };
}

/** Merge imported records into the current set, skipping duplicate ids. */
export function mergeRecords(existing, incoming) {
  const existingIds = new Set(existing.map((r) => r.id));
  const merged = [...existing];
  let added = 0;
  for (const record of incoming) {
    if (!existingIds.has(record.id)) {
      merged.push(record);
      existingIds.add(record.id);
      added += 1;
    }
  }
  return { merged, added };
}

// ---------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------

function csvCell(value) {
  const str = String(value ?? '');
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Neutralise spreadsheet formula injection in a TEXT cell (OWASP CSV
 * injection guidance). Excel / Google Sheets / LibreOffice treat a cell
 * starting with = + - @ (or a leading tab / carriage return) as a formula —
 * e.g. a note like `=HYPERLINK("http://…")`. Such text is prefixed with a
 * single quote so it is shown literally as text. A value that is simply a
 * plain number (e.g. a map number "-5" or "+61") is left untouched, so
 * ordinary data isn't altered. Numeric columns WorkRoaster generates itself
 * (hours, minutes, amounts) never go through this.
 */
export function sanitizeCsvText(value) {
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str) && !/^[+-]?\d+(\.\d+)?$/.test(str)) return `'${str}`;
  return str;
}

// Columns of recordsToCSV that hold numbers WorkRoaster computed itself.
const CSV_NUMERIC_COLUMNS = new Set([2, 3, 4, 9, 10]);

/**
 * @param {number} [cycleLengthDays] Current payCycleLengthDays setting,
 *   used to fill the "Cycle" column with the same automatically
 *   calculated cycle the rest of the app shows (see
 *   calculations.js#getCycleForDate). Defaults to 14 (fortnight) if
 *   omitted, matching the app's default setting.
 * @param {Array} [jobs] Current settings.jobs list, used only to resolve
 *   a record's jobId to a human-readable name for the trailing "Job"
 *   column. Omitting it (or a record having no jobId) simply yields an
 *   empty Job cell — the column is purely additive and never required.
 */
export function recordsToCSV(records, cycleLengthDays = 14, jobs = []) {
  const headers = [
    'Date', 'Start Time', 'Working Hours', 'Working Minutes', 'Duration (min)',
    'Cycle', 'Map Number', 'Day Type', 'Payment Type', 'Payment Amount',
    'Earned Per Hour', 'Notes', 'Job',
  ];

  const rows = records.map((r) => {
    const mins = recordMinutes(r);
    const rate = mins > 0 ? (Number(r.paymentAmount) || 0) / (mins / 60) : 0;
    const cyc = getCycleForDate(r.date, cycleLengthDays);
    const job = r.jobId ? findJob(jobs, r.jobId) : null;
    return [
      r.date,
      r.start,
      Math.floor(mins / 60),
      mins % 60,
      mins,
      cyc ? cyc.cycleLabel : 'Unassigned',
      r.mapNumber || '',
      r.dayType || '',
      r.paymentType || '',
      (Number(r.paymentAmount) || 0).toFixed(2),
      rate.toFixed(2),
      r.notes || '',
      job ? job.name : (r.jobId || ''),
    ];
  });

  const safeRows = rows.map((row) => row.map((cell, i) => (CSV_NUMERIC_COLUMNS.has(i) ? cell : sanitizeCsvText(cell))));
  return [headers, ...safeRows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
