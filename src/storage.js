export const RECORDS_KEY = 'modern_work_hours_tracker_v1';
export const SETTINGS_KEY = 'modern_work_hours_tracker_v1_settings';

const normaliseRecord = (record) => ({
  ...record,
  id: record?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  cycle: record?.cycle || 'Unassigned',
  workingMinutes: Number.isFinite(Number(record?.workingMinutes))
    ? Number(record.workingMinutes)
    : Math.round((Number(record?.workingHours) || 0) * 60),
  paymentAmount: Number(record?.paymentAmount) || 0,
});

export const loadRecords = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECORDS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normaliseRecord) : [];
  } catch {
    return [];
  }
};

export const saveRecords = (records) => {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
};

export const createBackup = (records, settings = null) => JSON.stringify({
  version: 1,
  exportedAt: new Date().toISOString(),
  records,
  settings,
}, null, 2);

export const parseBackup = (text) => {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.records)) throw new Error('Invalid WorkTrack backup file.');
  return {
    records: data.records.map(normaliseRecord),
    settings: data.settings || null,
  };
};

export const recordsToCsv = (records) => {
  const columns = ['id', 'date', 'start', 'cycle', 'workingMinutes', 'mapNumber', 'dayType', 'paymentType', 'paymentAmount', 'notes'];
  const quote = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(','), ...records.map((record) => columns.map((column) => quote(record[column])).join(','))].join('\n');
};
