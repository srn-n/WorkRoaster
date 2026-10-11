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
 * working exactly as before — see docs/data-model.md "Jobs". Editing a
 * job's rates only ever affects records entered AFTER the edit; each
 * record snapshots the rate/rule figures that were actually used at
 * entry time (see storage.js#migrateRecord), so a later rate change can
 * never silently reprice history.
 * -----------------------------------------------------------------------
 */
import { normalizeRule, normalizePayMode, normalizeFixedPay, fixedScheduleMinutes, minutesFromTimes } from './calculations.js';

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
    id: src.id || makeJobId(src.name || 'job'),
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
