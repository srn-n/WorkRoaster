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
import { recordMinutes, getCycleForDate, hasEndTime, normalizeRule, normalizeFixedPay, isFixedPayMode, dateRuleKind, normalizeCycleAnchor, DEFAULT_CYCLE_ANCHOR } from './calculations.js';
import { normalizeJob, findJob, makeJobId } from './jobs.js';
import { safeId } from './ids.js';

export const RECORDS_KEY = 'modern_work_hours_tracker_v1';
export const SETTINGS_KEY = 'modern_work_hours_tracker_v1_settings';
export const NOTES_KEY = 'modern_work_hours_tracker_v1_notes';
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
    // Visual theme (colour family) on top of light/dark — see APPEARANCE.
    visualTheme: 'classic', // 'classic' | 'sky' | 'sage' | 'plum'
    // Top bar glass: 0 = most solid … 100 = most see-through.
    headerTransparency: DEFAULT_HEADER_TRANSPARENCY,
    // Interaction feel: springy 'bouncy' (default), calmer 'smooth', or
    // 'minimal' (no movement, like the device's reduce-motion setting).
    motionStyle: DEFAULT_MOTION_STYLE,
    // Pay-cycle length in days: 7 | 14 | 30. Drives calculations.js's
    // automatic cycle grouping — see getCycleForDate(). 14 (fortnight)
    // matches the app's original hard-coded assumption, so an upgrade
    // changes nothing about existing grouping until this is changed.
    payCycleLengthDays: 14,
    // A date that started a pay cycle; every cycle is counted from it. The
    // default is a Monday, giving Monday–Sunday weeks / fortnights — the
    // grouping the app always used, so nothing changes until it's set.
    payCycleAnchor: DEFAULT_CYCLE_ANCHOR,
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
    id: safeId(record.id) || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)),
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
    migrated.jobId = safeId(record.jobId);
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

// ---------------------------------------------------------------------
// Profiles — separate workspaces (records, jobs and settings each) on one
// device. The first profile is the data that was always here: it keeps the
// original two keys, so nothing moves and older versions still read it.
// Other profiles store under the same keys plus "__<profile id>". The list
// of profiles (and the theme, which all profiles share) lives in
// PROFILES_KEY, which only exists once a second profile has been made.
// ---------------------------------------------------------------------
export const PROFILES_KEY = 'modern_work_hours_tracker_v1_profiles';
export const DEFAULT_PROFILE_ID = 'default';
export const DEFAULT_PROFILE_NAME = 'My profile';
let activeProfileId = DEFAULT_PROFILE_ID;

export const recordsKeyFor = (id) => (id === DEFAULT_PROFILE_ID ? RECORDS_KEY : `${RECORDS_KEY}__${id}`);
export const settingsKeyFor = (id) => (id === DEFAULT_PROFILE_ID ? SETTINGS_KEY : `${SETTINGS_KEY}__${id}`);
export const notesKeyFor = (id) => (id === DEFAULT_PROFILE_ID ? NOTES_KEY : `${NOTES_KEY}__${id}`);

/** { active, profiles: [{ id, name }], theme?, visualTheme?, headerTransparency?, motionStyle? }
 *  — always at least the first profile. */
export function loadProfiles() {
  const raw = safeParse(localStorage.getItem(PROFILES_KEY), null);
  const list = Array.isArray(raw?.profiles)
    ? raw.profiles
        .filter((p) => isObject(p) && typeof p.id === 'string' && /^[a-z0-9-]+$/.test(p.id))
        .map((p) => ({ id: p.id, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 40) : 'Profile' }))
    : [];
  if (!list.some((p) => p.id === DEFAULT_PROFILE_ID)) list.unshift({ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME });
  const active = list.some((p) => p.id === raw?.active) ? raw.active : DEFAULT_PROFILE_ID;
  return { active, profiles: list, ...pickAppearance(raw) };
}

export function saveProfiles(index) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(index));
}

export const getActiveProfileId = () => activeProfileId;

/** Which profile loadRecords / saveRecords / loadSettings / saveSettings use. */
export function setActiveProfile(id) {
  activeProfileId = loadProfiles().profiles.some((p) => p.id === id) ? id : DEFAULT_PROFILE_ID;
  return activeProfileId;
}

/** Add a profile (empty records and notes; settings start from the defaults
 *  with the current appearance and currency). Returns the new profile. */
export function createProfile(name, { theme, visualTheme, headerTransparency, motionStyle, currency } = {}) {
  const index = loadProfiles();
  const clean = String(name || '').trim().slice(0, 40) || 'New profile';
  const ids = index.profiles.map((p) => p.id);
  let id = slugify(clean).slice(0, 24) || 'profile';
  if (id === DEFAULT_PROFILE_ID || ids.includes(id)) {
    let n = 2;
    while (ids.includes(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  const profile = { id, name: clean };
  const appearance = pickAppearance({ theme, visualTheme, headerTransparency, motionStyle });
  const settings = normalizeSettings({ ...appearance, ...(currency ? { currency } : {}) });
  localStorage.setItem(recordsKeyFor(id), '[]');
  localStorage.setItem(settingsKeyFor(id), JSON.stringify({ ...settings, schemaVersion: SCHEMA_VERSION }));
  localStorage.setItem(notesKeyFor(id), '[]');
  saveProfiles({ ...index, profiles: [...index.profiles, profile], ...appearance });
  return profile;
}

export function renameProfile(id, name) {
  const index = loadProfiles();
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) return false;
  saveProfiles({ ...index, profiles: index.profiles.map((p) => (p.id === id ? { ...p, name: clean } : p)) });
  return true;
}

/** Permanently remove a profile and its data. The first profile and the
 *  last remaining one can't be deleted. */
export function deleteProfile(id) {
  const index = loadProfiles();
  if (id === DEFAULT_PROFILE_ID || index.profiles.length < 2 || !index.profiles.some((p) => p.id === id)) return false;
  localStorage.removeItem(recordsKeyFor(id));
  localStorage.removeItem(settingsKeyFor(id));
  localStorage.removeItem(notesKeyFor(id));
  const profiles = index.profiles.filter((p) => p.id !== id);
  saveProfiles({ ...index, profiles, active: index.active === id ? DEFAULT_PROFILE_ID : index.active });
  if (activeProfileId === id) activeProfileId = DEFAULT_PROFILE_ID;
  return true;
}

/** Remember which profile opens next time (per device). */
export function rememberActiveProfile(id) {
  if (!localStorage.getItem(PROFILES_KEY) && id === DEFAULT_PROFILE_ID) return;
  saveProfiles({ ...loadProfiles(), active: id });
}

/** Records / settings of any profile (for "All profiles" backups). */
export function loadRecordsFor(id) {
  const raw = safeParse(localStorage.getItem(recordsKeyFor(id)), []);
  return (Array.isArray(raw) ? raw : []).map(migrateRecord);
}
export function loadSettingsFor(id) {
  const settings = normalizeSettings(safeParse(localStorage.getItem(settingsKeyFor(id)), null));
  // Shared appearance (kept in the profiles index once there are several).
  const { theme, visualTheme, headerTransparency, motionStyle } = loadProfiles();
  return { ...settings, ...pickAppearance({ theme, visualTheme, headerTransparency, motionStyle }) };
}

export function loadRecords() {
  return loadRecordsFor(activeProfileId);
}

export function saveRecordsFor(id, records) {
  localStorage.setItem(recordsKeyFor(id), JSON.stringify(records));
}

export function saveRecords(records) {
  saveRecordsFor(activeProfileId, records);
}

export function loadSettings() {
  return loadSettingsFor(activeProfileId);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------
// Appearance — light/dark `theme`, the `visualTheme` colour family, the
// top bar's `headerTransparency` and the `motionStyle` interaction feel.
// All four are shared by every profile
// (like the theme always was): once a second profile exists they are kept
// in the profiles index and laid over each profile's own settings.
// ---------------------------------------------------------------------
// Retro / Modern / Cyberpunk were replaced by Sky / Sage / Plum; a saved
// old theme isn't in this list, so it falls back to the classic look.
export const VISUAL_THEMES = ['classic', 'sky', 'sage', 'plum'];
export const DEFAULT_HEADER_TRANSPARENCY = 45;
export const MOTION_STYLES = ['bouncy', 'smooth', 'minimal'];
export const DEFAULT_MOTION_STYLE = 'bouncy';
const THEMES = ['system', 'light', 'dark'];
export function normalizeHeaderTransparency(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && value !== '' && value !== null ? Math.min(100, Math.max(0, n)) : DEFAULT_HEADER_TRANSPARENCY;
}
/** Only the valid appearance fields of `src` (missing/invalid ones left out). */
function pickAppearance(src) {
  const out = {};
  if (!isObject(src)) return out;
  if (THEMES.includes(src.theme)) out.theme = src.theme;
  if (VISUAL_THEMES.includes(src.visualTheme)) out.visualTheme = src.visualTheme;
  if (MOTION_STYLES.includes(src.motionStyle)) out.motionStyle = src.motionStyle;
  if (src.headerTransparency !== undefined && src.headerTransparency !== null && Number.isFinite(Number(src.headerTransparency))) {
    out.headerTransparency = normalizeHeaderTransparency(src.headerTransparency);
  }
  return out;
}
/** The appearance part of a settings object, for sharing between profiles. */
export function appearanceOf(settings) {
  return pickAppearance(settings);
}

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Option lists (day types / payment types): keep only real entries. */
function normalizeOptionList(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  const clean = list
    .filter((o) => isObject(o) && typeof o.label === 'string' && o.label.trim())
    .map((o) => ({ ...o, id: safeId(o.id) || slugify(o.label), archived: o.archived === true }));
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
    visualTheme: VISUAL_THEMES.includes(stored.visualTheme) ? stored.visualTheme : base.visualTheme,
    motionStyle: MOTION_STYLES.includes(stored.motionStyle) ? stored.motionStyle : base.motionStyle,
    headerTransparency: stored.headerTransparency === undefined ? base.headerTransparency : normalizeHeaderTransparency(stored.headerTransparency),
    dayTypes: normalizeOptionList(stored.dayTypes, base.dayTypes),
    paymentTypes: normalizeOptionList(stored.paymentTypes, base.paymentTypes),
    payCycleLengthDays: [7, 14, 30, 365].includes(Number(stored.payCycleLengthDays)) ? Number(stored.payCycleLengthDays) : base.payCycleLengthDays,
    payCycleAnchor: normalizeCycleAnchor(stored.payCycleAnchor),
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
          .map((j) => ({ ...j, id: safeId(j.id) || makeJobId(j.name || 'job') }))
      : base.jobs,
  };
}

export function saveSettingsFor(id, settings) {
  localStorage.setItem(settingsKeyFor(id), JSON.stringify({ ...settings, schemaVersion: SCHEMA_VERSION }));
}

export function saveSettings(settings) {
  saveSettingsFor(activeProfileId, settings);
  // Appearance is shared by all profiles once there is more than one.
  const index = localStorage.getItem(PROFILES_KEY) ? loadProfiles() : null;
  if (!index) return;
  const shared = pickAppearance(settings);
  if (Object.keys(shared).some((k) => index[k] !== shared[k])) saveProfiles({ ...index, ...shared });
}

// ---------------------------------------------------------------------
// Quick notes — a short to-do style list per profile, stored like records
// (NOTES_KEY for the first profile, NOTES_KEY__<id> for others).
// { id, text, done, createdAt, updatedAt, doneAt? }
// ---------------------------------------------------------------------
export const NOTE_MAX_LENGTH = 2000;

/** Clean any stored/imported list: drops entries without text, trims and
 *  caps text, fills missing ids/dates, and never repeats an id. */
export function normalizeNotes(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (!isObject(raw) || typeof raw.text !== 'string') continue;
    const text = raw.text.trim().slice(0, NOTE_MAX_LENGTH);
    if (!text) continue;
    let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 64) : makeNoteId();
    while (seen.has(id)) id = makeNoteId();
    seen.add(id);
    const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : new Date(0).toISOString();
    const updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : createdAt;
    const note = { id, text, done: raw.done === true, createdAt, updatedAt };
    if (note.done && typeof raw.doneAt === 'string' && !Number.isNaN(Date.parse(raw.doneAt))) note.doneAt = raw.doneAt;
    out.push(note);
  }
  return out;
}

export function makeNoteId() {
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Notes still to do — the number on the Notes badge. */
export function pendingNoteCount(notes) {
  return (Array.isArray(notes) ? notes : []).filter((n) => n && !n.done).length;
}

export function loadNotesFor(id) {
  return normalizeNotes(safeParse(localStorage.getItem(notesKeyFor(id)), []));
}
export function saveNotesFor(id, notes) {
  localStorage.setItem(notesKeyFor(id), JSON.stringify(normalizeNotes(notes)));
}
export function loadNotes() {
  return loadNotesFor(activeProfileId);
}
export function saveNotes(notes) {
  saveNotesFor(activeProfileId, notes);
}

export function makeOptionId(label) {
  return slugify(label);
}

// ---------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------

export function buildBackup(records, settings, profileName = null, notes = null) {
  const jobs = Array.isArray(settings?.jobs) ? settings.jobs : [];
  return {
    app: 'WorkRoaster',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...(profileName ? { profile: profileName } : {}),
    records: records.map((r) => backupRecord(r, jobs)),
    settings,
    // Quick notes (newer backups). Older files have none — see importBackup.
    ...(Array.isArray(notes) ? { notes: normalizeNotes(notes) } : {}),
  };
}

/** One file with every profile on this device: { profiles: [{ name, records, settings }] }. */
export function buildAllProfilesBackup() {
  const { profiles } = loadProfiles();
  return {
    app: 'WorkRoaster',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profiles: profiles.map((p) => {
      const settings = loadSettingsFor(p.id);
      const one = buildBackup(loadRecordsFor(p.id), settings, null, loadNotesFor(p.id));
      return { name: p.name, records: one.records, settings, notes: one.notes };
    }),
  };
}

/**
 * Parse any WorkRoaster backup: a single-profile file (records + settings,
 * optionally naming its profile) or an "All profiles" file. Each profile is
 * validated exactly like a single backup — all-or-nothing.
 * Returns { kind: 'single', parsed, profileName } or
 *         { kind: 'all', profiles: [{ name, parsed }] }.
 */
export function parseBackupFile(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (isPlainObject(data) && Array.isArray(data.profiles) && !Array.isArray(data.records)) {
    if (!data.profiles.length) throw new Error('That backup has no profiles in it. Nothing was imported.');
    return {
      kind: 'all',
      profiles: data.profiles.map((p, i) => {
        const name = isPlainObject(p) && typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 40) : `Profile ${i + 1}`;
        try {
          return { name, parsed: parseBackup(JSON.stringify(p)) };
        } catch (err) {
          throw new Error(`Profile “${name}”: ${err.message}`);
        }
      }),
    };
  }
  const parsed = parseBackup(jsonText);
  const profileName = isPlainObject(data) && typeof data.profile === 'string' && data.profile.trim() ? data.profile.trim().slice(0, 40) : null;
  return { kind: 'single', parsed, profileName };
}

/**
 * Which weekend rule a record's `weekendRuleAtEntry` came from, worked out
 * from fields the record already stores (its date and `weekendOverride`):
 *   "saturday" / "sunday"            the job's own Saturday / Sunday rule
 *   "saturday-override" / "sunday-override" / "weekday-override"
 *                                    a custom rule chosen for that shift
 *   "none"                           no weekend rule applied
 * Only for records saved against a job; null otherwise. Informational —
 * import never reads it, so it can't change any pay.
 */
export function weekendRuleSourceOf(record) {
  if (!record || !record.jobId || !record.weekendRuleAtEntry) return null;
  const kind = dateRuleKind(record.date);
  const mode = record.weekendOverride?.mode;
  if (mode === 'custom') return `${kind}-override`;
  if (mode === 'none') return 'none';
  return kind === 'weekday' ? 'none' : kind;
}

/** One record as written into a backup file: the stored record plus a
 *  readable `jobName` and `weekendRuleSource`, so the file explains itself
 *  without the app. The legacy free-text `cycle` field is only written
 *  when it actually holds something (very old records); the default
 *  "Unassigned" looked like a job problem to anyone reading the file. */
function backupRecord(record, jobs) {
  const out = { ...record };
  if (out.cycle === 'Unassigned' || !out.cycle) delete out.cycle;
  if (record.jobId) {
    const job = findJob(jobs, record.jobId);
    if (job && job.name) out.jobName = job.name;
  }
  const source = weekendRuleSourceOf(record);
  if (source) out.weekendRuleSource = source;
  return out;
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
  for (const key of ['notes', 'dayType', 'paymentType', 'mapNumber', 'jobId', 'jobName', 'cycle']) {
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
      const id = safeId(record.id);
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
    // Readable job name written next to each record by newer backups (see
    // buildBackup) — lets import put a record under the right job even
    // when the file's job list is missing it.
    jobNames: data.records.map((r) => (typeof r.jobName === 'string' && r.jobName.trim() ? r.jobName.trim() : null)),
    // Quick notes: null when the file has none (an older backup), so import
    // can tell "no notes in this file" from "an empty notes list".
    notes: Array.isArray(data.notes) ? normalizeNotes(data.notes) : null,
  };
}

// ---------------------------------------------------------------------
// Import: put a backup's records under the right jobs
// ---------------------------------------------------------------------

const nameKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The fields that make two records "the same shift", whatever their ids. */
function shiftKey(r) {
  return [r.date, r.start, r.end || '', recordMinutes(r), Number(r.breakMinutes) || 0, Number(r.paymentAmount) || 0, r.jobId || ''].join('|');
}

/** Add any day-type / payment-type options the device doesn't have yet
 *  (matched by label, ignoring case), keeping the device's own list and order. */
function mergeOptionList(existing, incoming) {
  const list = Array.isArray(existing) ? [...existing] : [];
  const added = [];
  const have = new Set(list.map((o) => nameKey(o.label)));
  const ids = new Set(list.map((o) => o.id));
  for (const o of Array.isArray(incoming) ? incoming : []) {
    if (!o || typeof o.label !== 'string' || !o.label.trim() || have.has(nameKey(o.label))) continue;
    let id = safeId(o.id) && !ids.has(safeId(o.id)) ? safeId(o.id) : slugify(o.label);
    while (ids.has(id)) id = `${id}-2`;
    list.push({ id, label: o.label.trim(), archived: o.archived === true });
    have.add(nameKey(o.label));
    ids.add(id);
    added.push(o.label.trim());
  }
  return { list, added };
}

/**
 * Bring a parsed backup into the app. Jobs come with it automatically:
 * every job in the file is matched to a job on this device with the same
 * id and name, otherwise one with the same name (ignoring case and extra
 * spaces), otherwise it is created from the file's own settings (pay
 * method, base rate, Saturday / Sunday / additional rules, salary) — so a
 * fresh device needs no setup. An existing job is never overwritten, and
 * every record keeps the rates it was saved with. A record with no job
 * stays "No job".
 *
 *   mode "merge"   adds the file's records to the device's, skipping any
 *                  already there (same id, or same date, times, hours,
 *                  pay and job); the device's settings are kept, plus any
 *                  jobs and day / payment types it was missing.
 *   mode "replace" uses the file's records and settings (as before), and
 *                  still links records by job name where needed.
 *
 * Pure: returns { records, settings, summary } and changes nothing itself.
 */
export function importBackup(current, parsed, mode) {
  const fileSettings = parsed.settings && isPlainObject(parsed.settings) ? parsed.settings : null;
  const fileJobs = Array.isArray(fileSettings?.jobs) ? fileSettings.jobs.filter(isPlainObject).map(normalizeJob) : [];
  let settings = mode === 'replace' && fileSettings ? normalizeSettings({ ...current.settings, ...fileSettings }) : normalizeSettings(current.settings);
  const jobs = [...settings.jobs];
  const summary = { added: 0, duplicates: 0, jobsAdded: [], jobsMatched: [], optionsAdded: [], notesAdded: 0 };
  const idMap = new Map(); // file job id -> job id on this device

  const findByName = (name) => jobs.find((j) => nameKey(j.name) === nameKey(name) && nameKey(name));
  const createJob = (template) => {
    const job = normalizeJob({ ...template, id: makeJobId(template.name || 'job', jobs.map((j) => j.id)) });
    jobs.push(job);
    summary.jobsAdded.push(job.name);
    return job;
  };

  if (mode !== 'replace') {
    for (const fj of fileJobs) {
      const sameId = jobs.find((j) => j.id === fj.id);
      if (sameId && nameKey(sameId.name) === nameKey(fj.name)) {
        idMap.set(fj.id, sameId.id);
        continue;
      }
      const byName = findByName(fj.name);
      if (byName) {
        idMap.set(fj.id, byName.id);
        summary.jobsMatched.push(byName.name);
      } else {
        idMap.set(fj.id, createJob(fj).id);
      }
    }
  }

  // Records: point each at the right job on this device.
  const incoming = parsed.records.map((r, i) => {
    if (!r.jobId) return r;
    if (idMap.has(r.jobId)) return { ...r, jobId: idMap.get(r.jobId) };
    if (jobs.some((j) => j.id === r.jobId)) return r;
    // A job the file's list doesn't describe: use the readable name newer
    // backups write next to the record.
    const name = parsed.jobNames?.[i];
    if (!name) return r;
    const job =
      findByName(name) ||
      createJob({
        name,
        payCalculationMode: r.fixedPayAtEntry ? r.fixedPayAtEntry.mode : r.hourlyRate !== undefined ? 'hourlyRate' : 'payment',
        baseRate: r.baseRateAtEntry ?? r.hourlyRate ?? 0,
        fixedPay: r.fixedPayAtEntry,
      });
    idMap.set(r.jobId, job.id);
    return { ...r, jobId: job.id };
  });

  settings = { ...settings, jobs };
  if (mode !== 'replace' && fileSettings) {
    const day = mergeOptionList(settings.dayTypes, fileSettings.dayTypes);
    const pay = mergeOptionList(settings.paymentTypes, fileSettings.paymentTypes);
    settings = { ...settings, dayTypes: day.list, paymentTypes: pay.list };
    summary.optionsAdded = [...day.added, ...pay.added];
  }

  let records;
  if (mode === 'replace') {
    records = incoming;
    summary.added = incoming.length;
  } else {
    records = [...current.records];
    const ids = new Set(records.map((r) => r.id));
    const keys = new Set(records.map(shiftKey));
    for (const r of incoming) {
      const key = shiftKey(r);
      if (ids.has(r.id) || keys.has(key)) {
        summary.duplicates += 1;
        continue;
      }
      records.push(r);
      ids.add(r.id);
      keys.add(key);
      summary.added += 1;
    }
  }
  summary.jobsAdded = [...new Set(summary.jobsAdded)];
  summary.jobsMatched = [...new Set(summary.jobsMatched)];
  // Quick notes. A backup without notes (made before notes existed) imports
  // none and leaves this profile's notes as they are, in either mode.
  // Replace swaps in the file's notes; merge adds the ones not already here
  // (same id, or the same text and done state).
  const currentNotes = normalizeNotes(current.notes);
  let notes = currentNotes;
  if (Array.isArray(parsed.notes)) {
    if (mode === 'replace') {
      notes = normalizeNotes(parsed.notes);
      summary.notesAdded = notes.length;
    } else {
      const ids = new Set(currentNotes.map((n) => n.id));
      const keys = new Set(currentNotes.map((n) => `${n.done}|${nameKey(n.text)}`));
      const added = [];
      for (const n of normalizeNotes(parsed.notes)) {
        const key = `${n.done}|${nameKey(n.text)}`;
        if (ids.has(n.id) || keys.has(key)) continue;
        ids.add(n.id);
        keys.add(key);
        added.push(n);
      }
      notes = [...currentNotes, ...added];
      summary.notesAdded = added.length;
    }
  }
  return { records, settings: normalizeSettings(settings), summary, notes };
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
export function recordsToCSV(records, cycleLengthDays = 14, jobs = [], cycleAnchor = DEFAULT_CYCLE_ANCHOR) {
  const headers = [
    'Date', 'Start Time', 'Working Hours', 'Working Minutes', 'Duration (min)',
    'Cycle', 'Map Number', 'Day Type', 'Payment Type', 'Payment Amount',
    'Earned Per Hour', 'Notes', 'Job',
  ];

  const rows = records.map((r) => {
    const mins = recordMinutes(r);
    const rate = mins > 0 ? (Number(r.paymentAmount) || 0) / (mins / 60) : 0;
    const cyc = getCycleForDate(r.date, cycleLengthDays, cycleAnchor);
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
