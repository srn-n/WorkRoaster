import {
  averageStartTime,
  cycleHours,
  cycleStartDate,
  dateValue,
  durationLabel,
  durationMinutes,
  hourlyRate,
  moneyPerHour,
  recordMinutes,
  totalPay,
  totalWorkingMinutes,
  overallRate,
} from './calculations.js';
import { loadRecords, saveRecords } from './storage.js';
import {
  getSettings,
  addOption,
  renameOption,
  reorderOptions,
  retireOption,
  updateSetting,
} from './settings.js';
import './styles.css';

const records = loadRecords();
const settings = getSettings();
let editing = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const money = (value) => `$${(Number(value) || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const today = () => new Date().toISOString().slice(0, 10);
const dayName = (date) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const dateName = (date) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const updateCalculatedRate = () => {
  const pay = Number(document.getElementById('pay')?.value || 0);
  const hours = document.getElementById('workingHours')?.value || 0;
  const minutes = document.getElementById('workingMinutes')?.value || 0;
  const totalMinutes = durationMinutes(hours, minutes);
  const element = document.getElementById('calculatedRate');
  if (element) element.value = pay > 0 && totalMinutes > 0 ? moneyPerHour(pay, totalMinutes) : '—';
};

const render = () => {
  const current = editing ? records.find((record) => record.id === editing) : null;
  const totalMinutes = totalWorkingMinutes(records);
  const totalEarnings = totalPay(records);
  const rate = hourlyRate(totalEarnings, totalMinutes);
  const cycles = {};

  [...records]
    .sort((a, b) => dateValue(b.date) - dateValue(a.date) || String(b.start || '').localeCompare(String(a.start || '')))
    .forEach((record) => {
      const cycle = record.cycle || 'Unassigned';
      (cycles[cycle] ??= []).push(record);
    });

  const cycleOrder = Object.keys(cycles).sort((a, b) => cycleStartDate(records, b) - cycleStartDate(records, a));
  const dayTypes = settings.dayTypes;
  const payTypes = settings.payTypes;

  document.getElementById('app').innerHTML = `
    <header class="app-header">
      <div>
        <h1>WorkTrack</h1>
        <p class="subtitle">Track your shifts, working time and earnings.</p>
      </div>
      <button class="header-btn" id="settingsBtn">Settings</button>
    </header>

    <section class="panel entry-panel">
      <div class="panel-title">
        <div>
          <h2>${current ? 'Edit work record' : 'Add work record'}</h2>
          <p class="hint">Log the shift details once and let WorkTrack calculate the rate.</p>
        </div>
      </div>
      ${current ? `<div class="editing">Editing ${esc(dateName(current.date))}</div>` : ''}
      <div class="grid">
        <div class="field"><label>Date</label><input id="date" type="date" value="${current ? current.date : today()}"></div>
        <div class="field"><label>Starting time</label><input id="start" type="time" value="${current ? current.start : '09:00'}"></div>
        <div class="field"><label>Working hours</label><div class="duration-input"><input id="workingHours" type="number" min="0" step="1" placeholder="2" value="${current ? Math.floor(recordMinutes(current) / 60) : ''}"><span>hr</span><input id="workingMinutes" type="number" min="0" max="59" step="1" placeholder="22" value="${current ? recordMinutes(current) % 60 : ''}"><span>m</span></div></div>
        <div class="field"><label>Fortnight / pay cycle</label><input id="cycle" placeholder="e.g. Fortnight 1" value="${current ? esc(current.cycle || '') : ''}"></div>
        <div class="field"><label>Map number</label><input id="map" placeholder="e.g. Grid B4" value="${current ? esc(current.mapNumber || '') : ''}"></div>
        <div class="field"><label>Day type</label><select id="dayType">${dayTypes.filter((item) => !item.retired).map((item) => `<option value="${esc(item.name)}" ${current?.dayType === item.name ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Payment type</label><select id="payType">${payTypes.filter((item) => !item.retired).map((item) => `<option value="${esc(item.name)}" ${current?.paymentType === item.name ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Payment amount</label><input id="pay" type="number" min="0" step="0.01" placeholder="0.00" value="${current ? current.paymentAmount : ''}"></div>
        <div class="field"><label>Earned per hour</label><input id="calculatedRate" class="rate-input" type="text" value="—" readonly><small class="duration-help">Calculated automatically.</small></div>
        <div class="field"><label>Role / notes</label><input id="notes" placeholder="e.g. Floor, Store 12" value="${current ? esc(current.notes || '') : ''}"></div>
      </div>
      <div class="error" id="error"></div>
      <div class="actions"><button class="btn primary" id="submit">${current ? 'Save changes' : 'Add record'}</button>${current ? '<button class="btn secondary" id="cancel">Cancel</button>' : ''}</div>
    </section>

    <section class="summary">
      <div class="stat stat-primary"><div class="stat-label">Latest fortnight hours</div><div class="stat-value">${durationLabel(cycleOrder.length ? cycleHours(records, cycleOrder[0]) : 0)}</div></div>
      <div class="stat"><div class="stat-label">Overall working hours</div><div class="stat-value">${durationLabel(totalMinutes)}</div></div>
      <div class="stat stat-primary"><div class="stat-label">Latest fortnight pay</div><div class="stat-value">${money(cycleOrder.length ? totalPay(cycles[cycleOrder[0]]) : 0)}</div></div>
      <div class="stat"><div class="stat-label">Total pay</div><div class="stat-value">${money(totalEarnings)}</div></div>
      <div class="stat"><div class="stat-label">Records</div><div class="stat-value">${records.length}</div></div>
      <div class="stat stat-accent"><div class="stat-label">Average earning per hour</div><div class="stat-value">${rate > 0 ? `$${rate.toFixed(2)}/hr` : '—'}</div></div>
    </section>

    <section class="calendar-panel panel">
      <div class="panel-title"><div><h2>Work calendar</h2><p class="hint">A quick view of the days you've logged.</p></div></div>
      ${renderCalendar(records)}
    </section>

    <section class="records-section">
      ${!records.length ? '<div class="empty">No work records yet.<br>Add your first record above.</div>' : cycleOrder.map((cycle) => `
        <section class="cycle">
          <div class="cycle-head"><div><span class="cycle-name">${esc(cycle)}</span><span class="cycle-info"> · ${cycles[cycle].length} record${cycles[cycle].length === 1 ? '' : 's'}</span></div><span class="cycle-total">${durationLabel(cycleHours(records, cycle))} · ${money(totalPay(cycles[cycle]))}</span></div>
          <div class="week">${cycles[cycle].map((record) => `
            <div class="row">
              <div class="row-main">
                <div><div class="day">${dayName(record.date)}</div><div class="date">${dateName(record.date)}</div></div>
                <div class="start">Start ${esc(record.start)}</div>
                <div class="notes">${esc(record.notes || '')}</div>
                <div class="hours">${durationLabel(recordMinutes(record))}</div>
                <div class="row-actions"><button class="icon edit" data-id="${record.id}">Edit</button><button class="icon delete" data-id="${record.id}">Delete</button></div>
              </div>
              <div class="meta"><span class="tag">${esc(record.dayType || 'Day')}</span><span>Cycle: <b>${esc(record.cycle || 'Unassigned')}</b></span><span>Working: <b>${durationLabel(recordMinutes(record))}</b></span>${record.mapNumber ? `<span>Map: <b>${esc(record.mapNumber)}</b></span>` : ''}<span>${esc(record.paymentType || 'Normal')}: <b>${money(record.paymentAmount)}</b></span><span>Earned/hr: <b class="record-rate">${moneyPerHour(record.paymentAmount, recordMinutes(record))}</b></span></div>
            </div>`).join('')}</div>
        </section>`).join('')}
    </section>

    <section class="insights">
      <div class="insight-card"><div class="insight-label">Usual starting time</div><div class="insight-value">${averageStartTime(records)}</div><div class="insight-note">Average start time across all recorded work days.</div></div>
      <div class="insight-card"><div class="insight-label">Average earning per hour</div><div class="insight-value">${rate > 0 ? `$${rate.toFixed(2)}/hr` : '—'}</div><div class="insight-note">Based on total earnings divided by total working time.</div></div>
    </section>`;

  document.getElementById('submit').onclick = submit;
  ['pay', 'workingHours', 'workingMinutes'].forEach((id) => document.getElementById(id)?.addEventListener('input', updateCalculatedRate));
  updateCalculatedRate();
  document.getElementById('settingsBtn').onclick = renderSettings;
  if (document.getElementById('cancel')) document.getElementById('cancel').onclick = () => { editing = null; render(); };
  document.querySelectorAll('.edit').forEach((button) => button.onclick = () => { editing = button.dataset.id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.querySelectorAll('.delete').forEach((button) => button.onclick = () => { if (confirm('Delete this work record?')) { const index = records.findIndex((record) => record.id === button.dataset.id); if (index >= 0) records.splice(index, 1); saveRecords(records); render(); } });
};

function renderCalendar(items) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const days = [];
  for (let index = 0; index < offset; index++) days.push('<div class="calendar-day empty-day"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const matches = items.filter((record) => record.date === key);
    days.push(`<div class="calendar-day ${matches.length ? 'has-work' : ''}"><span class="calendar-number">${day}</span>${matches.length ? `<span class="calendar-dot"></span><small>${matches.length} shift${matches.length > 1 ? 's' : ''}</small>` : ''}</div>`);
  }
  return `<div class="calendar-title">${now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div><div class="calendar-weekdays">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${days.join('')}</div>`;
}

function submit() {
  const hoursValue = document.getElementById('workingHours').value;
  const minutesValue = document.getElementById('workingMinutes').value;
  const data = {
    date: document.getElementById('date').value,
    start: document.getElementById('start').value,
    cycle: document.getElementById('cycle').value.trim() || 'Unassigned',
    workingMinutes: durationMinutes(hoursValue, minutesValue),
    mapNumber: document.getElementById('map').value.trim(),
    dayType: document.getElementById('dayType').value,
    paymentType: document.getElementById('payType').value,
    paymentAmount: Number(document.getElementById('pay').value) || 0,
    notes: document.getElementById('notes').value.trim(),
  };
  const error = document.getElementById('error');
  if (!data.date || !data.start || hoursValue === '' || minutesValue === '') {
    error.textContent = 'Date, starting time, hours and minutes are required.';
    return;
  }
  error.textContent = '';
  if (editing) {
    const existing = records.find((record) => record.id === editing);
    if (existing) Object.assign(existing, data);
    editing = null;
  } else {
    records.push({ id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36), ...data });
  }
  saveRecords(records);
  render();
}

function renderSettings() {
  alert('Settings are available in the project and can be expanded here without changing your work records.');
}

render();
