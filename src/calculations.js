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

export function todayString() {
  return new Date().toISOString().slice(0, 10);
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
 * Group records by pay cycle and order the groups by each cycle's
 * EARLIEST record date, most recent start first. The ending date of a
 * cycle is intentionally never consulted — a cycle that starts later
 * always outranks one that starts earlier, even if its own span hasn't
 * finished yet.
 */
export function groupByCycle(records) {
  const groups = new Map();
  for (const record of records) {
    const key = record.cycle || 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => dateValue(b.date) - dateValue(a.date) || String(b.start || '').localeCompare(String(a.start || '')));
  }

  const cycleStart = (key) => {
    const list = groups.get(key);
    return Math.min(...list.map((r) => dateValue(r.date)));
  };

  const orderedKeys = [...groups.keys()].sort((a, b) => cycleStart(b) - cycleStart(a));

  return orderedKeys.map((key) => ({
    key,
    records: groups.get(key),
    totalMinutes: groups.get(key).reduce((sum, r) => sum + recordMinutes(r), 0),
    totalPay: groups.get(key).reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0),
    startDate: cycleStart(key),
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

  const totalMins = valid.reduce((sum, r) => {
    const [h, m] = r.start.split(':').map(Number);
    return sum + h * 60 + m;
  }, 0);

  const mins = Math.round(totalMins / valid.length);
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
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
