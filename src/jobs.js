/**
 * jobs.js
 * -----------------------------------------------------------------------
 * CRUD for the Jobs list — mirrors the safety rules already established
 * in settings.js for day-type/payment-type options, applied to the new
 * first-class "Job" concept (name, employer, base rate, Saturday/Sunday/
 * additional rate rules).
 *
 * The core safety rule: a job is NEVER hard-deleted. It can only be
 * archived (active: false), which hides it from the job picker offered
 * for NEW records while every existing record that references it keeps
 * working exactly as before — see docs/data-model.md "Jobs". Each record
 * snapshots the rate/rule figures that were actually used at entry time
 * (see storage.js#migrateRecord), so a later rate change never silently
 * reprices history: when a job with records gets new pay settings, the
 * person explicitly chooses to re-rate those records (repriceJobRecords)
 * or to keep them and start a new version of the job (createJobVersion).
 * -----------------------------------------------------------------------
 */
import { normalizeRule, normalizePayMode, normalizeFixedPay, fixedScheduleMinutes, minutesFromTimes, getRateBreakdown, recordMinutes, recordPayMode } from './calculations.js';
import { safeId } from './ids.js';

const slugBase = (label) =>
  String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** A job id that doesn't collide with any id already in use. */
export function makeJobId(name, existingIds = []) {
  const base = slugBase(name) || `job-${Math.random().toString(36).slice(2, 8)}`;
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Fill in a safe, complete job shape from a possibly-partial/legacy
 *  value — never throws, never drops a field it doesn't recognise (any
 *  extra keys on the input object are intentionally NOT copied here,
 *  since a job is a fixed, fully-enumerated shape unlike a record). */
export function normalizeJob(job) {
  const src = job && typeof job === 'object' ? job : {};
  return {
    id: safeId(src.id) || makeJobId(src.name || 'job'),
    name: String(src.name || '').trim(),
    employer: String(src.employer || '').trim(),
    baseRate: Number.isFinite(Number(src.baseRate)) ? Math.max(0, Number(src.baseRate)) : 0,
    // How THIS job's new records are paid: 'hourlyRate' (rate x time),
    // 'payment' (actual amount entered), 'monthlyFixed' or 'yearlyFixed'
    // (a salary — see calculations.js "Fixed pay"). The first two match
    // the global settings.payCalculationMode, which only governs records
    // saved without a job. A job stored before this field existed is
    // given the global mode on load (storage.js#loadSettings), so nothing
    // changes for existing users; 'payment' is only the last-resort default.
    payCalculationMode: normalizePayMode(src.payCalculationMode),
    // Salary + standard schedule, used only by the fixed-pay modes. Always
    // present with safe defaults (so switching a job's mode never meets a
    // missing field); ignored by the hourly/actual-payment modes.
    fixedPay: normalizeFixedPay(src.fixedPay),
    active: src.active !== false,
    saturdayRule: normalizeRule(src.saturdayRule),
    sundayRule: normalizeRule(src.sundayRule),
    additionalRule: normalizeRule(src.additionalRule),
    notes: String(src.notes || ''),
  };
}

export function activeJobs(jobs) {
  return (jobs || []).filter((j) => j.active !== false);
}

export function findJob(jobs, jobId) {
  if (!jobId) return null;
  return (jobs || []).find((j) => j.id === jobId) || null;
}

/**
 * Jobs to offer in a job <select>: active jobs, plus (if editing a
 * record) whichever job it currently references even if that job has
 * since been archived — mirrors settings.js#optionsForSelect, so an old
 * record never silently loses visibility of which job it was actually
 * logged against.
 */
export function jobsForSelect(jobs, currentJobId) {
  const active = activeJobs(jobs);
  if (currentJobId && !active.some((j) => j.id === currentJobId)) {
    const known = findJob(jobs, currentJobId);
    if (known) return [...active, known];
  }
  return active;
}

export function jobUsageCount(records, jobId) {
  if (!jobId) return 0;
  return (records || []).filter((r) => r.jobId === jobId).length;
}

/** What each payment method needs to be usable. An hourly job pays rate
 *  x time, so it needs a real rate; an actual-payment job's rate is only
 *  an optional expectation, so $0 is fine there; a fixed-pay job needs a
 *  salary, at least one working day, and a real standard shift. */
function jobConfigError(data) {
  const mode = normalizePayMode(data && data.payCalculationMode);
  if (mode === 'hourlyRate') {
    return Number(data.baseRate) > 0 ? null : 'An hourly job needs a base hourly rate above zero.';
  }
  if (mode === 'monthlyFixed' || mode === 'yearlyFixed') {
    const fp = normalizeFixedPay(data.fixedPay);
    const period = mode === 'monthlyFixed' ? 'monthly' : 'yearly';
    if (!(fp.amount > 0)) return `Enter the ${period} pay for this job (above zero).`;
    if (!fp.workingDays.length) return 'Choose at least one working day.';
    const gross = minutesFromTimes(fp.start, fp.end);
    if (!gross) return 'Standard start and end times must be different.';
    if (fixedScheduleMinutes(fp) <= 0) return 'The break must be shorter than the standard shift.';
  }
  return null;
}

export function addJob(jobs, data) {
  const name = String((data && data.name) || '').trim();
  if (!name) return { jobs, error: 'Enter a job name.', job: null };
  if ((jobs || []).some((j) => j.name.toLowerCase() === name.toLowerCase() && j.active !== false)) {
    return { jobs, error: `An active job named "${name}" already exists.`, job: null };
  }
  const rateError = jobConfigError(data);
  if (rateError) return { jobs, error: rateError, job: null };
  const existingIds = (jobs || []).map((j) => j.id);
  const job = normalizeJob({ ...data, name, id: undefined });
  job.id = makeJobId(name, existingIds);
  return { jobs: [...(jobs || []), job], error: null, job };
}

/** Edit an existing job's fields. `patch` may contain any subset of
 *  name/employer/baseRate/saturdayRule/sundayRule/additionalRule/notes
 *  — id and active are never changed here (see archiveJob/restoreJob). */
export function updateJob(jobs, id, patch) {
  if (patch && patch.name !== undefined && !String(patch.name).trim()) {
    return { jobs, error: 'Job name cannot be empty.' };
  }
  const current = findJob(jobs, id);
  const rateError = current ? jobConfigError({ ...current, ...patch }) : null;
  if (rateError) return { jobs, error: rateError };
  const next = (jobs || []).map((j) => (j.id === id ? normalizeJob({ ...j, ...patch, id: j.id, active: j.active }) : j));
  return { jobs: next, error: null };
}

export function archiveJob(jobs, id) {
  return (jobs || []).map((j) => (j.id === id ? { ...j, active: false } : j));
}

export function restoreJob(jobs, id) {
  return (jobs || []).map((j) => (j.id === id ? { ...j, active: true } : j));
}

/** Remove a job for good — only allowed while no record uses it, so a
 *  deletion can never orphan a saved shift. Returns the list unchanged
 *  (same array) when the job is in use or doesn't exist. */
export function deleteUnusedJob(jobs, records, id) {
  const list = jobs || [];
  if (!list.some((j) => j.id === id) || jobUsageCount(records, id) > 0) return list;
  return list.filter((j) => j.id !== id);
}

/* -----------------------------------------------------------------------
 * Changing a job's pay settings when records already use it
 * -----------------------------------------------------------------------
 * The default (and still the only automatic behaviour) is that saved
 * records keep the rates they were entered with. When a job that has
 * records gets new pay settings, the app asks first and these helpers do
 * the chosen thing — never silently.
 */

const sameRule = (a, b) => {
  const x = normalizeRule(a);
  const y = normalizeRule(b);
  return x.type === y.type && x.value === y.value;
};

/** True when the pay-related settings differ (rate, mode, weekend and
 *  additional rules, salary). Name, employer and notes don't count. */
export function payRulesChanged(before, after) {
  const a = normalizeJob(before);
  const b = normalizeJob(after);
  return (
    a.baseRate !== b.baseRate ||
    a.payCalculationMode !== b.payCalculationMode ||
    !sameRule(a.saturdayRule, b.saturdayRule) ||
    !sameRule(a.sundayRule, b.sundayRule) ||
    !sameRule(a.additionalRule, b.additionalRule) ||
    JSON.stringify(a.fixedPay) !== JSON.stringify(b.fixedPay)
  );
}

/** A job's records split by what "apply to existing records" can do with
 *  them: hourly and actual-payment records can be re-rated; salaried
 *  (fixed-pay) records carry a day share of a salary period that depends
 *  on other records, so they always keep their saved allocation. */
export function jobRecordCounts(records, jobId) {
  const own = (records || []).filter((r) => r.jobId === jobId);
  const fixed = own.filter((r) => r.fixedPayAtEntry).length;
  const hourly = own.filter((r) => !r.fixedPayAtEntry && recordPayMode(r) === 'hourlyRate').length;
  return { total: own.length, fixed, hourly, payment: own.length - fixed - hourly };
}

/**
 * Re-rate a job's existing records with its new settings — the "apply to
 * existing records" choice. Mirrors exactly what saving the record again
 * would store (see app.js submitForm):
 * - the record's own weekend override (default / none / custom) is kept;
 * - a record saved without the additional loading keeps it off;
 * - hourly records get the new effective rate AND a recalculated amount;
 * - actual-payment records keep the payment that was entered; only the
 *   expected rate/payment used for comparison is refreshed;
 * - salaried records, other jobs' records and every other field (date,
 *   times, duration, break, notes, types, id) are left untouched.
 * Returns a new array (input never mutated) and how many records changed.
 */
export function repriceJobRecords(records, job) {
  const target = normalizeJob(job);
  let changed = 0;
  const next = (records || []).map((r) => {
    if (r.jobId !== target.id || r.fixedPayAtEntry) return r;
    const keepsNoAdditional = r.additionalRuleAtEntry && normalizeRule(r.additionalRuleAtEntry).type === 'none';
    const rateJob = keepsNoAdditional ? { ...target, additionalRule: { type: 'none', value: 0 } } : target;
    const override = r.weekendOverride && r.weekendOverride.mode ? r.weekendOverride : { mode: 'default' };
    const b = getRateBreakdown(rateJob, r.date, override, recordMinutes(r));
    const out = { ...r, baseRateAtEntry: target.baseRate, weekendRuleAtEntry: b.weekendRule, additionalRuleAtEntry: b.additionalRule, effectiveRateAtEntry: b.effectiveRate };
    if (recordPayMode(r) === 'hourlyRate') {
      out.hourlyRate = b.effectiveRate;
      out.paymentAmount = b.payment;
    } else {
      out.expectedRateAtEntry = b.effectiveRate;
      out.expectedPaymentAtEntry = b.payment;
    }
    if (JSON.stringify(out) !== JSON.stringify(r)) changed += 1;
    return out;
  });
  return { records: next, changed };
}

const nameKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The name a new version of a job gets: the edited name when no job (active
 * or archived) already uses it, otherwise that name with the first free
 * " (n)" suffix — "Westfield" → "Westfield (2)", "Westfield (2)" →
 * "Westfield (3)". Names compare like backup imports do (trimmed, spaces
 * collapsed, case-insensitive), so every version stays distinguishable in
 * pay-cycle groups and an import can never match the wrong version.
 */
export function jobVersionName(jobs, name) {
  const typed = String(name || '').trim().replace(/\s+/g, ' ');
  const taken = new Set((jobs || []).map((j) => nameKey(j.name)));
  if (!taken.has(nameKey(typed))) return typed;
  const base = typed.replace(/\s*\(\d+\)$/, '') || typed;
  let n = 2;
  while (taken.has(nameKey(`${base} (${n})`))) n += 1;
  return `${base} (${n})`;
}

/**
 * The "keep old records, start a new version" choice: the current job is
 * left exactly as it is (same id, settings and records) but archived, so
 * it stays on its history and is no longer offered for new records; a new
 * job with the edited settings — under a unique name (jobVersionName) —
 * takes its place for future records.
 */
export function createJobVersion(jobs, id, patch) {
  const list = jobs || [];
  const current = findJob(list, id);
  if (!current) return { jobs: list, error: 'That job no longer exists.', job: null };
  const merged = { ...current, ...patch };
  if (!String(merged.name || '').trim()) return { jobs: list, error: 'Job name cannot be empty.', job: null };
  const name = jobVersionName(list, merged.name);
  const rateError = jobConfigError(merged);
  if (rateError) return { jobs: list, error: rateError, job: null };
  const job = normalizeJob({ ...merged, name, active: true });
  job.id = makeJobId(name, list.map((j) => j.id));
  const archived = list.map((j) => (j.id === id ? { ...j, active: false } : j));
  return { jobs: [...archived, job], error: null, job };
}
