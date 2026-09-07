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
  theme: 'light',
};

const clone = (value) => JSON.parse(JSON.stringify(value));

export const getSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return {
      ...clone(DEFAULTS),
      ...(saved || {}),
      dayTypes: Array.isArray(saved?.dayTypes) && saved.dayTypes.length ? saved.dayTypes : clone(DEFAULTS.dayTypes),
      payTypes: Array.isArray(saved?.payTypes) && saved.payTypes.length ? saved.payTypes : clone(DEFAULTS.payTypes),
    };
  } catch {
    return clone(DEFAULTS);
  }
};

const save = (settings) => localStorage.setItem(KEY, JSON.stringify(settings));
const listKey = (kind) => kind === 'dayTypes' ? 'dayTypes' : 'payTypes';

export const updateSetting = (key, value) => {
  const settings = getSettings();
  settings[key] = value;
  save(settings);
  return settings;
};

export const addOption = (kind, name) => {
  const settings = getSettings();
  const key = listKey(kind);
  if (!name?.trim()) return settings;
  if (!settings[key].some((item) => item.name.toLowerCase() === name.trim().toLowerCase())) {
    settings[key].push({ name: name.trim(), retired: false });
  }
  save(settings);
  return settings;
};

export const renameOption = (kind, oldName, newName) => {
  const settings = getSettings();
  const key = listKey(kind);
  const item = settings[key].find((entry) => entry.name === oldName);
  if (item && newName?.trim()) item.name = newName.trim();
  save(settings);
  return settings;
};

export const reorderOptions = (kind, orderedNames) => {
  const settings = getSettings();
  const key = listKey(kind);
  const existing = settings[key];
  const reordered = orderedNames.map((name) => existing.find((item) => item.name === name)).filter(Boolean);
  const remainder = existing.filter((item) => !orderedNames.includes(item.name));
  settings[key] = [...reordered, ...remainder];
  save(settings);
  return settings;
};

export const retireOption = (kind, name) => {
  const settings = getSettings();
  const key = listKey(kind);
  const item = settings[key].find((entry) => entry.name === name);
  if (item) item.retired = true;
  save(settings);
  return settings;
};

export const defaults = clone(DEFAULTS);
