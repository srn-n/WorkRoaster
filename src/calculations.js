// Pure work-hour and earnings calculations. No DOM or storage dependencies.

export const durationMinutes = (hours, minutes) => {
  const h = Math.max(0, Number(hours) || 0);
  const m = Math.max(0, Math.min(59, Number(minutes) || 0));
  return Math.round(h * 60 + m);
};

export const recordMinutes = (record) => {
  if (Number.isFinite(Number(record?.workingMinutes))) return Number(record.workingMinutes);
  return Math.round((Number(record?.workingHours) || 0) * 60);
};

export const decimalHoursFromMinutes = (minutes) =>
  Math.round((Number(minutes) || 0) / 60 * 100) / 100;

export const hourlyRate = (pay, minutes) => {
  const hours = decimalHoursFromMinutes(minutes);
  return hours > 0 ? Number(pay || 0) / hours : 0;
};

export const moneyPerHour = (pay, minutes) => {
  const rate = hourlyRate(pay, minutes);
  return rate > 0 ? `$${rate.toFixed(2)}/hr` : '—';
};

export const durationLabel = (minutes) => {
  const value = Math.round(decimalHoursFromMinutes(minutes) * 100) / 100;
  return `${value.toString().replace(/\.00$/, '')}h`;
};

export const dateValue = (date) =>
  new Date(`${date || ''}T00:00:00`).getTime() || 0;

export const cycleStartDate = (records, cycle) => {
  const dates = records
    .filter((record) => (record.cycle || 'Unassigned') === cycle)
    .map((record) => dateValue(record.date));
  return dates.length ? Math.min(...dates) : 0;
};

export const cycleHours = (records, cycle) =>
  records
    .filter((record) => (record.cycle || 'Unassigned') === cycle)
    .reduce((total, record) => total + recordMinutes(record), 0);

export const averageStartTime = (records) => {
  const valid = records.filter((record) => /^\d{2}:\d{2}$/.test(record.start || ''));
  if (!valid.length) return '—';

  const total = valid.reduce((sum, record) => {
    const [hours, minutes] = record.start.split(':').map(Number);
    return sum + hours * 60 + minutes;
  }, 0);

  const minutes = Math.round(total / valid.length);
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export const totalWorkingMinutes = (records) =>
  records.reduce((total, record) => total + recordMinutes(record), 0);

export const totalPay = (records) =>
  records.reduce((total, record) => total + (Number(record.paymentAmount) || 0), 0);

export const overallRate = (records) =>
  hourlyRate(totalPay(records), totalWorkingMinutes(records));
