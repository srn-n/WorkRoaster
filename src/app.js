const KEY = 'modern_work_hours_tracker_v1_settings';

const DEFAULTS = {
  dayTypes: [
    { name: 'Day', retired: false },
    { name: 'Afternoon', retired: false },
    { name: 'Night', retired: false },
    { name: 'Overnight', retired: false },
  ],
  payTypes: [
    { name: 'Normal', retired: false },
    { name: 'Overtime', retired: false },
    { name: 'Weekend', retired: false },
    { name: 'Public Holiday', retired: false },
    { name: 'Casual loading', retired: false },
  ],
  currency: 'AUD',
  theme: 'system',
  defaults: { dayType: 'Day', paymentType: 'Normal', startTime: '09:00' },
};

const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULTS));

const safeParse = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) ?? fallback; }
  catch { return fallback; }
};

const save = (settings) => localStorage.setItem(KEY, JSON.stringify(settings));

export const getSettings = () => {
  const stored = safeParse(localStorage.getItem(KEY), null);
  if (!stored || typeof stored !== 'object') {
    const defaults = cloneDefaults();
    save(defaults);
    return defaults;
  }
  const base = cloneDefaults();
  return {
    ...base,
    ...stored,
    dayTypes: Array.isArray(stored.dayTypes) && stored.dayTypes.length ? stored.dayTypes : base.dayTypes,
    payTypes: Array.isArray(stored.payTypes) && stored.payTypes.length ? stored.payTypes : base.payTypes,
    defaults: { ...base.defaults, ...(stored.defaults || {}) },
  };
};

export const updateSetting = (key, value) => {
  const settings = getSettings();
  settings[key] = value;
  save(settings);
  return settings;
};

const uniqueName = (items, desired) => {
  const name = String(desired || '').trim();
  return name && !items.some((item) => item.name === name) ? name : null;
};

export const addOption = (kind, name) => {
  const settings = getSettings();
  const key = kind === 'day' ? 'dayTypes' : 'payTypes';
  const clean = uniqueName(settings[key], name);
  if (!clean) return settings;
  settings[key].push({ name: clean, retired: false });
  save(settings);
  return settings;
};

export const renameOption = (kind, index, name) => {
  const settings = getSettings();
  const key = kind === 'day' ? 'dayTypes' : 'payTypes';
  if (!settings[key][index]) return settings;
  const clean = String(name || '').trim();
  if (clean) settings[key][index].name = clean;
  save(settings);
  return settings;
};

export const reorderOptions = (kind, fromIndex, toIndex) => {
  const settings = getSettings();
  const key = kind === 'day' ? 'dayTypes' : 'payTypes';
  const items = settings[key];
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return settings;
  const [item] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, item);
  save(settings);
  return settings;
};

export const retireOption = (kind, index) => {
  const settings = getSettings();
  const key = kind === 'day' ? 'dayTypes' : 'payTypes';
  if (settings[key][index]) settings[key][index].retired = true;
  save(settings);
  return settings;
};
