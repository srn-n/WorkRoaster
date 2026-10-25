/**
 * app.js
 * -----------------------------------------------------------------------
 * Main controller. No framework: state lives in a plain object, the UI
 * is rebuilt from a template string on every meaningful change, and
 * event listeners are re-attached after each render. For an app this
 * size that's simpler to read and debug than introducing a reactive
 * framework — see README.md "Why vanilla JS" for the full reasoning.
 * -----------------------------------------------------------------------
 */
import './style-heal.js'; // first: repairs an unstyled page caused by a bad cached stylesheet
import * as calc from './calculations.js';
import * as store from './storage.js';
import * as opts from './settings.js';
import * as jobs from './jobs.js';
import { submitFeedback } from './feedback.js';
import { GUIDE_INTRO, GUIDE_SECTIONS } from './guide.js';
import { renderCalculator, wireCalculator } from './calculator.js';
import { isSupportedCurrency, normalizeCurrencyInput } from './currency.js';
// export.js pulls in jsPDF (which itself bundles html2canvas/DOMPurify)
// and ExcelJS — a few hundred KB the core tracker doesn't need just to
// add a record. Loaded lazily, on first export click, so page load stays
// light for the common case.

const root = document.getElementById('app');

// Open the profile used last on this device (the first profile if none).
store.setActiveProfile(store.loadProfiles().active);

const state = {
  records: store.loadRecords(),
  settings: store.loadSettings(),
  editingId: null,
  formError: '',
  modal: null, // null | 'settings' | 'data' | 'guide' | 'export'
  // The PDF/JPG/Excel export waiting in the export-options dialog:
  // { kind: 'cycle' | 'job', format, cycleKey, jobKey, scopeLabel, choices }.
  exportRequest: null,
  settingsTab: 'general', // 'general' | 'appearance' | 'workflow' | 'options'
  optionField: 'dayTypes', // which list the Options tab is showing
  toast: null,
  // The graph's active pay cycle, by IDENTITY: the `key` of one of
  // calc.groupByCycle()'s cycles (its cycleStart date) — never an array
  // position, which shifts whenever a newer cycle appears or one empties.
  // null = follow the newest cycle. The graph and the pay-cycle history
  // both resolve it through focusedCycle(), so they always show the same
  // cycle. Pure UI state: never persisted, never touches a record.
  // cycleNavDirection drives a one-shot directional slide-in animation
  // and is cleared after every render.
  focusedCycleKey: null,
  cycleNavDirection: null, // null | 'left' | 'right'
  // Which job (if any) is expanded for inline editing in Settings > Jobs.
  jobEditingId: null,
  // The page on screen: 'home' (dashboard + records) or 'notes'. Follows
  // the URL hash (#notes), so reload and the browser's Back button work.
  view: viewFromHash(),
  // This profile's quick notes, and the one being edited inline (if any).
  notes: store.loadNotes(),
  noteEditingId: null,
};

function viewFromHash() {
  return typeof location !== 'undefined' && location.hash === '#notes' ? 'notes' : 'home';
}

// ---------------------------------------------------------------------
// Transient, non-persisted UI state that must survive independently of
// render() — mutating any of this NEVER calls the full render(), only a
// scoped DOM patch (see updateJobAwareCalc/patchDatePicker below). If
// this lived on `state` and a change to it called render(), every other
// field the user is mid-typing into the record form (notes, hours,
// minutes, map number…) would be wiped, because renderForm() rebuilds
// those fields from `editingRecord`/defaults, not from live DOM values.
// ---------------------------------------------------------------------
let datePickerOpen = false;
let datePickerNavYear = null;
let datePickerNavMonth = null;
// Custom Job listbox — mirrors the date picker's approach: the real
// <select id="f-job"> stays the authoritative value/event source (see
// selectJobOption below), this is just which option is keyboard-active
// while the popover is open.
let jobPickerOpen = false;
let jobPickerActiveIndex = -1;
// Custom Time picker — one popover implementation shared by every
// time input (#f-start, #f-end, #s-default-start); timePickerTargetId
// says which input's popover is currently open, since only one can be
// open at a time.
let timePickerOpen = false;
let timePickerTargetId = null;
// Record-level weekend override the user is currently choosing in the
// form — see calculations.js#resolveWeekendRule. Reset to the editing
// record's own stored override (or the default) every time renderForm()
// runs a full render; mutated only by the override chips, which then
// call updateJobAwareCalc() rather than render().
let formOverrideMode = 'default'; // 'default' | 'none' | 'custom'
let formOverrideRule = { type: 'percent', value: 0 };
let formAdditionalOverrideMode = 'default'; // 'default' | 'none'
let rateConfirmationDialog = null;
// Pay-cycle history expand/collapse — presentation only. Holds only the
// cycles the user has explicitly toggled (cycle key -> open?); anything
// absent falls back to the graph's cycle (see renderRecords). Never persisted, never
// written to a record, never read by any calculation or export, and it
// lives here (not on `state`) so toggling patches the DOM instead of
// calling render(). Module-level so it still survives the full render()
// that follows adding/editing/deleting a record.
const cycleExpansion = new Map();

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (amount) => calc.formatMoney(amount, state.settings.currency);
const rate = (pay, minutes) => calc.formatRate(pay, minutes, state.settings.currency);

// ---------------------------------------------------------------------
// Icon system — one consistent set of hand-authored, stroke-based
// glyphs (no icon library dependency). Every icon shares the same
// viewBox, stroke width and line caps so nothing looks borrowed from a
// different design language. See src/styles.css ".icon".
// ---------------------------------------------------------------------
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>',
  settings: '<line x1="4" y1="6" x2="20" y2="6"></line><circle cx="9" cy="6" r="2"></circle><line x1="4" y1="12" x2="20" y2="12"></line><circle cx="15" cy="12" r="2"></circle><line x1="4" y1="18" x2="20" y2="18"></line><circle cx="9" cy="18" r="2"></circle>',
  download: '<path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M4 19h16"></path>',
  close: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  edit: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>',
  trash: '<path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><line x1="16" y1="3" x2="16" y2="7"></line><line x1="8" y1="3" x2="8" y2="7"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
  plus: '<line x1="12" y1="6" x2="12" y2="18"></line><line x1="6" y1="12" x2="18" y2="12"></line>',
  arrowUp: '<line x1="12" y1="19" x2="12" y2="5"></line><path d="M5 12l7-7 7 7"></path>',
  arrowDown: '<line x1="12" y1="5" x2="12" y2="19"></line><path d="M19 12l-7 7-7-7"></path>',
  restore: '<path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path>',
  check: '<path d="M20 6L9 17l-5-5"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"></path>',
  moon: '<path d="M20.8 14.4A8.5 8.5 0 0 1 9.6 3.2 8.8 8.8 0 1 0 20.8 14.4z"></path>',
  payment: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18M7 15h3"></path>',
  arrowLeft: '<path d="M19 12H5"></path><path d="M11 18l-6-6 6-6"></path>',
  arrowRight: '<path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"></path><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"></path><line x1="8" y1="8" x2="16" y2="8"></line>',
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line>',
  note: '<path d="M5 4h10l4 4v12H5z"></path><path d="M15 4v4h4"></path><path d="M8.5 12.5h7M8.5 16h5"></path>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3z"></path><circle cx="7.5" cy="11" r="1"></circle><circle cx="10" cy="7.5" r="1"></circle><circle cx="14.5" cy="7.5" r="1"></circle>',
};

function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// A <input type="time"> stays the real, directly-typable, authoritative
// element (its own native picker icon is hidden via
// ::-webkit-calendar-picker-indicator in styles.css) — this just adds a
// themed trigger + popover next to it as an alternative way to set the
// same value. See renderTimePickerBody()/wireTimePicker() below, which
// operate on the input purely by id and don't care which of these three
// call sites rendered it.
function timeFieldMarkup(id, value, ariaLabel, required = true) {
  return `
              <div class="time-field-row">
                <input id="${id}" type="time" ${required ? 'required' : ''} value="${value}">
                <button type="button" class="icon-btn time-picker-trigger" id="btn-${id}-time" aria-label="${esc(ariaLabel)}" aria-haspopup="dialog" aria-expanded="false">${icon('clock', 'icon-sm')}</button>
              </div>
              <div class="time-picker-popover" id="${id}-time-popover" role="dialog" aria-label="${esc(ariaLabel)}">
                <div id="${id}-time-body"></div>
              </div>`;
}

function recordTypeIcon(value, kind) {
  const label = String(value || '').toLowerCase();
  if (label.includes('holiday')) return 'calendar';
  if (kind === 'day') {
    if (label.includes('night')) return 'moon';
    if (/weekend|saturday|sunday/.test(label)) return 'sun';
    return 'calendar';
  }
  if (/overtime|extra|night/.test(label)) return 'clock';
  if (/weekend/.test(label)) return 'sun';
  return 'payment';
}

// Set when the last persist() failed, so the success toast that usually
// follows a save is replaced by an honest error for that same action.
let persistFailedAt = 0;

/** Save records + settings. If the browser refuses (storage full, blocked,
 *  private mode), nothing is left half-saved on screen: the in-memory state
 *  is rolled back to what is actually stored and the user is told. */
function persist() {
  try {
    store.saveRecords(state.records);
    store.saveSettings(state.settings);
    return true;
  } catch (err) {
    console.warn('WorkRoaster: could not save to browser storage', err);
    state.records = store.loadRecords();
    state.settings = store.loadSettings();
    persistFailedAt = Date.now();
    // Actions that don't show their own toast still need to tell the user.
    setTimeout(() => { if (persistFailedAt) { persistFailedAt = 0; showToast(PERSIST_FAILED_MESSAGE, 'error'); } }, 0);
    return false;
  }
}

const PERSIST_FAILED_MESSAGE = 'That change couldn’t be saved — this browser’s storage is full or blocked. Nothing was changed; free up space or leave private browsing, then try again.';

let toastTimer = null;
// Modal entry animation plays only on the render where a modal actually
// OPENS (state.modal changed). Any later full render() while it stays
// open — saving a job, a toast expiring, a theme change — rebuilds the
// modal's DOM without the class, so nothing replays. See .is-entering.
let lastRenderedModal = null;
// Two-tab sync: a change made in another tab that hasn't been rendered yet.
let externalChangePending = false;
// True once the person has typed or picked something in the record form
// since it was last rendered — i.e. the form holds unsaved input that a
// re-render would throw away. Reset by every render (the form is rebuilt).
let formDirty = false;
// Ids of record-form fields the person has changed since the form was last
// reset (saved, cancelled or opened for editing). A full render — opening
// Settings or the Guide, switching theme, another tab's change — rebuilds
// the form, so these values are carried over instead of being lost.
const dirtyFieldIds = new Set();
// Keyboard focus across full renders: which control opened the current
// dialog (focus goes back to it when the dialog closes), and an element to
// focus once the next render has finished (set by edit/delete).
let modalOpenerId = null;
let focusAfterRender = null;
const FOCUSABLE_SELECTOR = 'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), output[tabindex]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';
const isVisible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
let modalEntering = false;
const modalEnterClass = () => (modalEntering ? 'is-entering' : '');
let settingsMotionFallbackTimer = null;
// Must match --motion-standard in styles.css — the whole Settings tab
// choreography (content swap, rail indicator, active-tab color) shares
// this one duration so no part of it can visibly drift from the others.
// A plain setTimeout stands in for a transition-finished event, since
// navigateSettingsTab() drives this with CSS/keyframes rather than the
// View Transitions API (see its own comment for why).
const SETTINGS_MOTION_MS = 240;
function showToast(message, tone = 'success') {
  // A save that just failed must never be followed by "Record added." etc.
  if (persistFailedAt && Date.now() - persistFailedAt < 1000) {
    message = PERSIST_FAILED_MESSAGE;
    tone = 'error';
    persistFailedAt = 0;
  }
  state.toast = { message, tone };
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = null;
    render();
  }, 3400);
}

function applyTheme() {
  const root = document.documentElement;
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  else root.removeAttribute('data-theme');
  // Visual theme: the classic WorkRoaster look has no attribute at all.
  const visual = state.settings.visualTheme;
  if (visual && visual !== 'classic') root.setAttribute('data-visual', visual);
  else root.removeAttribute('data-visual');
  setHeaderTransparencyVar(state.settings.headerTransparency);
  setMotionStyle(state.settings.motionStyle);
}

/** Interaction feel → <html data-motion> (styles.css swaps the easing curves). */
function setMotionStyle(value) {
  const style = store.MOTION_STYLES.includes(value) ? value : store.DEFAULT_MOTION_STYLE;
  document.documentElement.setAttribute('data-motion', style);
}

/** One-shot "just chosen" pop on a radio's card (only on the render that
 *  follows the choice, so later re-renders never replay it). Returns the input. */
function justSelected(input) {
  const card = input?.closest('label');
  if (card && !motionReduced()) {
    card.classList.add('is-just-selected');
    card.addEventListener('animationend', () => card.classList.remove('is-just-selected'), { once: true });
  }
  return input;
}

/** True when movement should be skipped: the device asks for reduced
 *  motion, or Settings → Appearance → Motion is "Minimal". */
function motionReduced() {
  return state.settings?.motionStyle === 'minimal' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** 0 … 100 → --header-transparency 0 … 1 (styles.css turns it into tint and blur). */
function setHeaderTransparencyVar(value) {
  const n = store.normalizeHeaderTransparency(value);
  document.documentElement.style.setProperty('--header-transparency', String(n / 100));
}

const VISUAL_THEME_CHOICES = [
  { id: 'classic', name: 'WorkRoaster', blurb: 'Warm paper and bronze — the original look.' },
  { id: 'sky', name: 'Sky', blurb: 'Cool blue glass over soft graphite — crisp and calm.' },
  { id: 'sage', name: 'Sage', blurb: 'Misty green surfaces with a deep emerald accent.' },
  { id: 'plum', name: 'Plum', blurb: 'Rosy glass and a rich plum accent, warm in both modes.' },
];
const MOTION_STYLE_CHOICES = [
  { id: 'bouncy', name: 'Bouncy', blurb: 'Springy presses, pop-in menus and dialogs.' },
  { id: 'smooth', name: 'Smooth', blurb: 'The same motion, gently eased with no overshoot.' },
  { id: 'minimal', name: 'Minimal', blurb: 'No movement — things appear instantly.' },
];
const headerTransparencyLabel = (v) => {
  const n = store.normalizeHeaderTransparency(v);
  return `${n}% — ${n < 25 ? 'mostly solid' : n < 60 ? 'balanced glass' : 'very clear glass'}`;
};

// ---------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------

/**
 * WorkRoaster's mark: four quarter-ticks around a fixed point, read
 * clockwise as TIME (12 o'clock) -> WORK (3 o'clock) -> CYCLE (6
 * o'clock, the closed arc beneath) -> PAY (9 o'clock, the filled tick).
 * Every stroke uses currentColor and only one of the four ticks is a
 * solid fill — the mark has to read correctly with zero color
 * information (print, monochrome favicon, a colorblind viewer), so nothing
 * about its meaning depends on the accent color. Deliberately not
 * another circular-gradient logo: no gradient, no glow, flat geometry.
 */
function brandMark() {
  return `
    <svg class="brand-mark" viewBox="0 0 26 26" aria-hidden="true" fill="none">
      <circle cx="13" cy="13" r="10.5" stroke="currentColor" stroke-width="1.6"></circle>
      <path d="M13 13V4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
      <path d="M13 13L20 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
      <path d="M6.7 17.8A8 8 0 0 1 13 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="1.6 3"></path>
      <circle cx="6.7" cy="17.8" r="2.1" fill="currentColor"></circle>
    </svg>`;
}

function renderHeader() {
  const nextTheme = state.settings.theme === 'dark' ? 'light' : 'dark';
  const themeIcon = state.settings.theme === 'dark' ? 'sun' : 'moon';
  return `
    <header class="command-bar">
      <div class="brand">
        ${brandMark()}
        <div class="brand-text">
          <h1 class="brand-name">WorkRoaster</h1>
          <span class="brand-tagline">Time tracked. Cycle mapped. Pay earned.</span>
        </div>
      </div>
      <div class="command-actions">
        <button class="icon-btn" id="btn-theme" type="button" title="Toggle theme" aria-label="Switch to ${nextTheme} theme">${icon(themeIcon)}</button>
        <button class="btn secondary" id="btn-guide" type="button">${icon('book', 'icon-sm')}<span class="btn-label">Guide</span></button>
        ${renderNotesNavButton()}
        <button class="btn secondary" id="btn-data" type="button">${icon('download', 'icon-sm')}<span class="btn-label">Backup &amp; export</span></button>
        <button class="btn secondary" id="btn-settings" type="button">${icon('settings', 'icon-sm')}<span class="btn-label">Settings</span></button>
      </div>
    </header>`;
}

/** Header "Notes" item: a real page link with the pending-note count. */
function renderNotesNavButton() {
  const pending = store.pendingNoteCount(state.notes);
  const onNotes = state.view === 'notes';
  const label = `Notes${pending ? `, ${pending} pending` : ''}`;
  return `<a class="btn secondary nav-notes ${onNotes ? 'is-current' : ''}" id="btn-notes" href="#notes" ${onNotes ? 'aria-current="page"' : ''} aria-label="${label}">
          ${icon('note', 'icon-sm')}<span class="btn-label">Notes</span>
          <span class="nav-badge ${pending ? '' : 'is-empty'}" id="notes-badge" aria-hidden="true">${pending}</span>
        </a>`;
}

// ---------------------------------------------------------------------
// Quick Notes page — a short to-do list per profile (store.loadNotes()).
// ---------------------------------------------------------------------
const noteTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function renderNoteItem(note) {
  const editing = state.noteEditingId === note.id;
  const when = note.done && note.doneAt ? `Done ${noteTime(note.doneAt)}` : noteTime(note.createdAt) ? `Added ${noteTime(note.createdAt)}` : '';
  return `
    <li class="note-item ${note.done ? 'is-done' : ''} ${editing ? 'is-editing' : ''}" data-note-id="${esc(note.id)}">
      <label class="note-check" title="${note.done ? 'Mark as not done' : 'Mark as done'}">
        <input type="checkbox" id="note-done-${esc(note.id)}" data-note-toggle="${esc(note.id)}" ${note.done ? 'checked' : ''}>
        <span class="note-check-box" aria-hidden="true">${icon('check', 'icon-sm')}</span>
        <span class="visually-hidden">${note.done ? 'Done' : 'Not done'}: ${esc(note.text.slice(0, 80))}</span>
      </label>
      ${
        editing
          ? `<form class="note-edit-form" data-note-edit-form="${esc(note.id)}">
              <label class="visually-hidden" for="note-edit-${esc(note.id)}">Edit note</label>
              <textarea id="note-edit-${esc(note.id)}" rows="2" maxlength="${store.NOTE_MAX_LENGTH}" required>${esc(note.text)}</textarea>
              <div class="note-edit-actions">
                <button class="btn primary small" type="submit">${icon('check', 'icon-sm')}Save</button>
                <button class="btn secondary small" type="button" data-note-action="cancel-edit" data-id="${esc(note.id)}">Cancel</button>
              </div>
            </form>`
          : `<div class="note-body">
              <p class="note-text">${esc(note.text)}</p>
              ${when ? `<span class="note-meta">${esc(when)}</span>` : ''}
            </div>
            <div class="note-actions">
              <button class="icon-btn small" type="button" id="note-edit-btn-${esc(note.id)}" data-note-action="edit" data-id="${esc(note.id)}" title="Edit" aria-label="Edit note">${icon('edit', 'icon-sm')}</button>
              <button class="icon-btn small danger" type="button" data-note-action="delete" data-id="${esc(note.id)}" title="Delete" aria-label="Delete note">${icon('trash', 'icon-sm')}</button>
            </div>`
      }
    </li>`;
}

function renderNotesPage() {
  const pending = state.notes.filter((n) => !n.done);
  const done = state.notes.filter((n) => n.done);
  const profileName = hasProfiles() ? activeProfile().name : '';
  return `
    <section class="panel notes-page" aria-labelledby="notes-title">
      <div class="notes-head">
        <a class="btn secondary small notes-back" href="#" id="btn-notes-back">${icon('arrowLeft', 'icon-sm')}Records</a>
        <div class="notes-title-wrap">
          <h2 class="notes-title" id="notes-title">Quick notes</h2>
          <p class="notes-sub">${profileName ? `For <b>${esc(profileName)}</b> · ` : ''}<span id="notes-summary">${pending.length} pending${done.length ? ` · ${done.length} done` : ''}</span></p>
        </div>
      </div>
      <form class="note-capture" id="note-capture-form" autocomplete="off">
        <label class="visually-hidden" for="note-new">New note</label>
        <textarea id="note-new" rows="1" maxlength="${store.NOTE_MAX_LENGTH}" placeholder="Write a quick note…" aria-describedby="notes-hint"></textarea>
        <button class="btn primary" type="submit" id="btn-note-add">${icon('plus', 'icon-sm')}Add</button>
      </form>
      <p class="notes-hint" id="notes-hint">Enter adds the note · Shift+Enter starts a new line</p>
      ${
        !state.notes.length
          ? `<div class="empty-state notes-empty">
              <div class="empty-icon" aria-hidden="true">${icon('note')}</div>
              <h3>No notes yet</h3>
              <p>Jot down things to remember — a shift swap, a missing payslip, a rate to check. Tick them off when they're done.</p>
            </div>`
          : `
      <div class="notes-section">
        <h3 class="notes-section-title">To do <span class="notes-count tnum">${pending.length}</span></h3>
        ${
          pending.length
            ? `<ul class="note-list" id="notes-pending">${pending.map(renderNoteItem).join('')}</ul>`
            : `<div class="notes-allclear">${icon('check', 'icon-sm')}All caught up — nothing pending.</div>`
        }
      </div>
      ${
        done.length
          ? `<div class="notes-section">
              <h3 class="notes-section-title">Completed <span class="notes-count tnum">${done.length}</span></h3>
              <ul class="note-list is-done-list" id="notes-done">${done.map(renderNoteItem).join('')}</ul>
            </div>`
          : ''
      }`
      }
    </section>`;
}

/** Save notes, rolling back (and saying so) if the browser refuses. */
function commitNotes(nextNotes, message) {
  const prev = state.notes;
  state.notes = nextNotes;
  try {
    store.saveNotes(nextNotes);
  } catch (err) {
    console.warn('WorkRoaster: could not save notes', err);
    state.notes = prev;
    showToast(PERSIST_FAILED_MESSAGE, 'error');
    return false;
  }
  if (message) showToast(message);
  else render();
  return true;
}

function addNote(text) {
  const clean = String(text || '').trim();
  if (!clean) {
    document.getElementById('note-new')?.focus();
    return;
  }
  const now = new Date().toISOString();
  const note = { id: store.makeNoteId(), text: clean.slice(0, store.NOTE_MAX_LENGTH), done: false, createdAt: now, updatedAt: now };
  lastAddedNoteId = note.id;
  notesCaptureCleared = true;
  focusAfterRender = focusById('note-new');
  commitNotes([note, ...state.notes], 'Note added.');
}

function toggleNote(id, done) {
  const now = new Date().toISOString();
  const next = state.notes.map((n) => {
    if (n.id !== id) return n;
    const out = { ...n, done, updatedAt: now };
    if (done) out.doneAt = now;
    else delete out.doneAt;
    return out;
  });
  const left = store.pendingNoteCount(next);
  lastToggledNoteId = id;
  focusAfterRender = focusById(`note-done-${id}`);
  commitNotes(next, done ? `Done — ${left} note${left === 1 ? '' : 's'} left.` : 'Moved back to To do.');
}

function saveNoteEdit(id, text) {
  const clean = String(text || '').trim();
  if (!clean) return showToast('A note needs some text — or delete it instead.', 'error');
  const now = new Date().toISOString();
  state.noteEditingId = null;
  focusAfterRender = focusById(`note-edit-btn-${id}`);
  commitNotes(state.notes.map((n) => (n.id === id ? { ...n, text: clean.slice(0, store.NOTE_MAX_LENGTH), updatedAt: now } : n)), 'Note updated.');
}

function deleteNote(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  if (!confirm(`Delete this note?\n\n“${note.text.slice(0, 120)}${note.text.length > 120 ? '…' : ''}”`)) return;
  if (state.noteEditingId === id) state.noteEditingId = null;
  focusAfterRender = focusById('note-new');
  commitNotes(state.notes.filter((n) => n.id !== id), 'Note deleted.');
}

let lastAddedNoteId = null;
let lastToggledNoteId = null;
/** Focus the element with this id after the next render. */
const focusById = (id) => () => document.getElementById(id);

function wireNotesEvents() {
  const capture = document.getElementById('note-capture-form');
  if (!capture) return;
  const input = document.getElementById('note-new');
  capture.addEventListener('submit', (e) => {
    e.preventDefault();
    addNote(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      addNote(input.value);
    }
  });
  // Grow the capture box with its text (up to a few lines).
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; };
  input.addEventListener('input', grow);
  document.querySelectorAll('[data-note-toggle]').forEach((box) =>
    box.addEventListener('change', () => toggleNote(box.dataset.noteToggle, box.checked))
  );
  document.querySelectorAll('[data-note-action]').forEach((b) =>
    b.addEventListener('click', () => {
      const { noteAction: action, id } = b.dataset;
      if (action === 'edit') {
        state.noteEditingId = id;
        focusAfterRender = focusById(`note-edit-${id}`);
        render();
      } else if (action === 'cancel-edit') {
        state.noteEditingId = null;
        focusAfterRender = focusById(`note-edit-btn-${id}`);
        render();
      } else if (action === 'delete') deleteNote(id);
    })
  );
  document.querySelectorAll('[data-note-edit-form]').forEach((form) => {
    const id = form.dataset.noteEditForm;
    const area = form.querySelector('textarea');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveNoteEdit(id, area.value);
    });
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        saveNoteEdit(id, area.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        state.noteEditingId = null;
        focusAfterRender = focusById(`note-edit-btn-${id}`);
        render();
      }
    });
  });
  // One-shot feedback: the note just added slides in, the one just ticked pops.
  if (lastAddedNoteId) document.querySelector(`[data-note-id="${CSS.escape(lastAddedNoteId)}"]`)?.classList.add('is-new');
  if (lastToggledNoteId) document.querySelector(`[data-note-id="${CSS.escape(lastToggledNoteId)}"]`)?.classList.add('is-just-toggled');
  lastAddedNoteId = null;
  lastToggledNoteId = null;
  document.getElementById('btn-notes-back')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('home');
  });
}

/** Move between the dashboard and the Notes page (keeps the URL hash in step). */
function navigateTo(view) {
  if (view === state.view) return;
  if (view === 'notes') {
    if (location.hash !== '#notes') location.hash = 'notes'; // hashchange renders
    else { state.view = 'notes'; render(); }
    return;
  }
  history.pushState(null, '', location.pathname + location.search);
  state.view = 'home';
  state.noteEditingId = null;
  focusAfterRender = focusById('btn-notes');
  render();
  window.scrollTo({ top: 0 });
}

function onHashChange() {
  const view = viewFromHash();
  if (view === state.view) return;
  state.view = view;
  state.noteEditingId = null;
  focusAfterRender = focusById(view === 'notes' ? 'note-new' : 'btn-notes');
  render();
  window.scrollTo({ top: 0 });
}

/** Add n days to a plain "YYYY-MM-DD" string, in local time — the same
 *  technique buildMonthGrid() already uses below, kept here so the cycle
 *  bar chart can walk a cycle's real date range without needing a new
 *  UTC-safe date helper from calculations.js. */
function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** How far through ITS OWN date range a cycle is, today — null when
 *  today falls outside that cycle (a past cycle, or a future one), so
 *  the progress rail only ever shows a marker on the one cycle that's
 *  actually live. */
function cycleProgressFraction(cycle) {
  if (!cycle || !cycle.cycleStart || !cycle.cycleEnd) return null;
  const today = calc.todayString();
  if (today < cycle.cycleStart || today > cycle.cycleEnd) return null;
  const startMs = calc.dateValue(cycle.cycleStart);
  const endMs = calc.dateValue(cycle.cycleEnd);
  const span = endMs - startMs || 1;
  return Math.min(1, Math.max(0, (calc.dateValue(today) - startMs) / span));
}

/** A real temporal object, not decoration: a hairline track spanning the
 *  focused cycle's actual date range, with a marker only when today
 *  genuinely falls inside it. */
function renderCycleRail(cycle, lengthDays) {
  if (!cycle || !cycle.cycleStart) return '';
  const frac = cycleProgressFraction(cycle);
  const days = Math.max(2, Number(lengthDays) || 14);
  const ticks = Array.from({ length: days - 1 }, (_, i) => ((i + 1) / days) * 100);
  return `
    <div class="cycle-rail">
      <div class="cycle-rail-track">
        ${ticks.map((pct) => `<span class="cycle-rail-tick" style="left:${pct}%"></span>`).join('')}
        ${frac !== null ? `<span class="cycle-rail-marker" style="left:${(frac * 100).toFixed(2)}%" title="Today"></span>` : ''}
      </div>
    </div>`;
}

/** Real-data daily-earnings bar chart for the focused cycle — every bar
 *  height comes straight from that day's actual paymentAmount total
 *  (already-stored data, summed here for display, never recalculated). */
function renderCycleBars(cycle) {
  if (!cycle || !cycle.cycleStart || !cycle.cycleEnd) return '';
  const startMs = calc.dateValue(cycle.cycleStart);
  const endMs = calc.dateValue(cycle.cycleEnd);
  const dayCount = Math.round((endMs - startMs) / 86400000) + 1;
  const byDate = new Map();
  for (const r of cycle.records) {
    if (!r.date) continue;
    byDate.set(r.date, (byDate.get(r.date) || 0) + (Number(r.paymentAmount) || 0));
  }
  let max = 0;
  const days = [];
  for (let i = 0; i < dayCount; i += 1) {
    const dateStr = addDaysStr(cycle.cycleStart, i);
    const amount = byDate.get(dateStr) || 0;
    if (amount > max) max = amount;
    days.push({ dateStr, amount });
  }
  const showLabels = dayCount <= 14;
  return `
    <div class="cycle-bars" role="img" aria-label="Daily earnings across this pay cycle">
      ${days
        .map((d) => {
          const pct = max > 0 ? Math.max(d.amount > 0 ? 6 : 2, (d.amount / max) * 100) : 2;
          const dayNum = Number(d.dateStr.slice(8, 10));
          const isToday = d.dateStr === calc.todayString();
          return `
        <div class="cycle-bar ${isToday ? 'is-today' : ''}" title="${esc(calc.shortDateLabel(d.dateStr))}: ${esc(money(d.amount))}">
          <div class="cycle-bar-fill" style="--bar-h:${pct.toFixed(1)}%"></div>
          ${showLabels ? `<span class="cycle-bar-label">${dayNum}</span>` : ''}
        </div>`;
        })
        .join('')}
    </div>`;
}

/**
 * Dashboard: a hero built around a pay-cycle NAVIGATOR (paging through
 * calc.groupByCycle()'s existing output via state.focusedCycleKey —
 * pure UI state, nothing persisted or recalculated) plus a quieter
 * typographic band of overall totals below it. Every number here already
 * existed in the previous flat card layout — groupByCycle(),
 * totalMinutes/totalPay/weightedAverageRate()/hourlyRate() are the same
 * calculations, just given real spatial hierarchy and, for the focused
 * cycle, a real progress rail and daily bar chart.
 */
/** The graph's active cycle: the cycle whose key is state.focusedCycleKey,
 *  else the newest. The single place both the graph and the pay-cycle
 *  history resolve "which cycle is active". */
function focusedCycle(cycles) {
  return cycles.find((c) => c.key === state.focusedCycleKey) || cycles[0] || null;
}

function renderStats(cycles) {
  const focused = focusedCycle(cycles);
  const idx = focused ? cycles.indexOf(focused) : 0;

  const overallMinutes = calc.totalMinutes(state.records);
  const overallPay = calc.totalPay(state.records);
  const overallRate = calc.weightedAverageRate(state.records);
  const focusedRate = focused ? calc.hourlyRate(focused.totalPay, focused.totalMinutes) : 0;
  const isLive = idx === 0;
  const navClass = state.cycleNavDirection === 'left' ? 'nav-from-left' : state.cycleNavDirection === 'right' ? 'nav-from-right' : '';

  const heroInner = !cycles.length
    ? `
      <div class="cycle-focus is-empty">
        <div class="hero-head">
          <div class="hero-eyebrow-group">
            <span class="hero-eyebrow">${icon('calendar', 'icon-sm')} No cycle yet</span>
          </div>
        </div>
        <div class="hero-metrics">
          <div class="hero-metric-primary">
            <span class="hero-metric-value">Nothing logged yet</span>
            <span class="hero-metric-label">Add your first shift to start a pay cycle</span>
          </div>
        </div>
        <div class="hero-foot">
          <div class="hero-cta"><button class="btn primary" id="btn-quick-add" type="button">${icon('plus', 'icon-sm')}Add work</button></div>
        </div>
      </div>`
    : `
      <div class="cycle-focus ${navClass}">
        <div class="hero-head">
          <div class="hero-eyebrow-group">
            <span class="hero-eyebrow">${isLive ? 'Current cycle' : 'Past cycle'}</span>
            <span class="hero-cycle-range">${esc(focused.cycleLabel)}</span>
          </div>
          <div class="cycle-nav" role="group" aria-label="Browse pay cycles">
            <button class="cycle-nav-btn" id="btn-cycle-prev" type="button" aria-label="Older cycle" ${idx >= cycles.length - 1 ? 'disabled' : ''}>${icon('arrowLeft', 'icon-sm')}</button>
            <span class="cycle-nav-count tnum">${idx + 1} / ${cycles.length}</span>
            <button class="cycle-nav-btn" id="btn-cycle-next" type="button" aria-label="Newer cycle" ${idx <= 0 ? 'disabled' : ''}>${icon('arrowRight', 'icon-sm')}</button>
          </div>
        </div>
        <div class="hero-metrics">
          <div class="hero-metric-primary">
            <span class="hero-metric-value tnum">${money(focused.totalPay)}</span>
            <span class="hero-metric-label">Earned this cycle</span>
          </div>
          <div class="hero-metric-secondary">
            <span class="hero-metric-value-sm tnum">${calc.formatDuration(focused.totalMinutes)}</span>
            <span class="hero-metric-label">Worked</span>
          </div>
        </div>
        <div class="cycle-viz">
          ${renderCycleRail(focused, state.settings.payCycleLengthDays)}
          ${renderCycleBars(focused)}
        </div>
        <div class="hero-foot">
          <span class="hero-foot-stat">Rate this cycle <b>${focusedRate > 0 ? `${money(focusedRate)}/hr` : '—'}</b></span>
          <span class="hero-foot-stat">${focused.records.length} record${focused.records.length === 1 ? '' : 's'}</span>
          <div class="hero-cta"><button class="btn primary" id="btn-quick-add" type="button">${icon('plus', 'icon-sm')}Add work</button></div>
        </div>
      </div>`;

  return `
    <section class="dashboard" aria-label="Pay cycle summary">
      <div class="period-card">${heroInner}</div>
      <div class="stats-band" aria-label="Overall totals">
        <div class="stat-metric"><span class="stat-metric-value tnum">${calc.formatDuration(overallMinutes)}</span><span class="stat-metric-label">Total hours</span></div>
        <div class="stat-divider" aria-hidden="true"></div>
        <div class="stat-metric"><span class="stat-metric-value tnum">${money(overallPay)}</span><span class="stat-metric-label">Total pay</span></div>
        <div class="stat-divider" aria-hidden="true"></div>
        <div class="stat-metric"><span class="stat-metric-value tnum">${overallRate > 0 ? `${money(overallRate)}/hr` : '—'}</span><span class="stat-metric-label">Avg rate</span></div>
        <div class="stat-divider" aria-hidden="true"></div>
        <div class="stat-metric"><span class="stat-metric-value tnum">${state.records.length}</span><span class="stat-metric-label">Records</span></div>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------
// Work calendar (visual, read-only — no new state, no interactions yet)
// ---------------------------------------------------------------------

const CALENDAR_WEEKDAY_LABELS = Array.from({ length: 7 }, (_, i) =>
  // Jan 1 2023 was a Sunday, so this reliably yields Sun..Sat regardless
  // of what "today" is, in the viewer's own locale.
  new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' })
);

/** Build a Sun-start 6/7-row grid for the given month, padded with the
 *  edges of the neighbouring months so the calendar is a clean rectangle. */
function buildMonthGrid(year, month, dayStatsByDate) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const todayStr = calc.todayString();
  const cells = [];

  for (let i = 0; i < totalCells; i += 1) {
    const dayOffset = i - firstWeekday + 1;
    const cellDate = new Date(year, month, dayOffset);
    const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
    const stats = dayStatsByDate.get(dateStr);
    cells.push({
      dayNum: cellDate.getDate(),
      dateStr,
      inMonth: dayOffset >= 1 && dayOffset <= daysInMonth,
      isToday: dateStr === todayStr,
      count: stats ? stats.count : 0,
      minutes: stats ? stats.minutes : 0,
    });
  }
  return cells;
}

// Work calendar — navigable, and connected to the record form: clicking a
// day sets the form's Date exactly as the date picker does. Its viewed
// month is transient UI state (never persisted); month changes patch only
// the calendar (no render()). null = follow the form's date.
let calendarView = null; // { year, month } (month 0–11)

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYMD = (str) => { const [y, m, d] = (str || '').split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

/** The date the record form is (or will be) set to — the calendar's selection. */
function calendarSelectedDate() {
  const input = document.getElementById('f-date');
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input.value)) return input.value;
  const editing = state.editingId ? state.records.find((r) => r.id === state.editingId) : null;
  return editing?.date || calc.todayString();
}

function calendarViewMonth() {
  if (!calendarView) {
    const sel = parseYMD(calendarSelectedDate());
    calendarView = { year: sel.getFullYear(), month: sel.getMonth() };
  }
  return calendarView;
}

/** The pay cycle the calendar outlines: the one the dashboard graph is
 *  showing (same focusedCycle() lookup), else the cycle containing today. */
function calendarActiveCycle() {
  const cycles = calc.groupByCycle(state.records, state.settings.payCycleLengthDays, state.settings.payCycleAnchor);
  const focused = focusedCycle(cycles);
  return focused && focused.cycleStart ? focused : calc.getCycleForDate(calc.todayString(), state.settings.payCycleLengthDays, state.settings.payCycleAnchor);
}

function renderCalendarBody(focusDate = null) {
  const { year, month } = calendarViewMonth();
  // Per-date real worked minutes (calc.recordMinutes — the same
  // legacy-aware duration resolver used everywhere else), not just a
  // record count: this is what drives each work day's background
  // intensity below, so a longer shift always reads as a stronger cell.
  const dayStats = new Map();
  for (const r of state.records) {
    if (!r.date) continue;
    const cur = dayStats.get(r.date) || { count: 0, minutes: 0 };
    cur.count += 1;
    cur.minutes += calc.recordMinutes(r);
    dayStats.set(r.date, cur);
  }
  const cells = buildMonthGrid(year, month, dayStats);
  const selected = calendarSelectedDate();
  const activeCycle = calendarActiveCycle();
  const maxMinutes = cells.reduce((m, c) => (c.minutes > m ? c.minutes : m), 0) || 1;
  // Roving tabindex: one day is in the tab order — the requested focus
  // target, else the selected date, else today, else the 1st.
  const tabTarget = [focusDate, selected, calc.todayString(), `${year}-${pad2(month + 1)}-01`].find((d) => d && cells.some((c) => c.dateStr === d && c.inMonth));
  return `
      <div class="calendar-weekday-row" aria-hidden="true">
        ${CALENDAR_WEEKDAY_LABELS.map((d) => `<div class="calendar-weekday">${d}</div>`).join('')}
      </div>
      <div class="calendar-grid" id="calendar-grid" role="group" aria-label="${esc(new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}">
        ${cells
          .map((c) => {
            const inCycle = !!(activeCycle && c.dateStr >= activeCycle.cycleStart && c.dateStr <= activeCycle.cycleEnd);
            // Real-data intensity, floored so any worked day is at least
            // visibly tinted rather than nearly invisible next to a
            // single outlier long shift.
            const intensity = c.minutes > 0 ? Math.min(1, Math.max(0.22, c.minutes / maxMinutes)) : 0;
            const styleAttr = c.count > 0 ? ` style="--intensity:${intensity.toFixed(2)}"` : '';
            const isSelected = c.dateStr === selected;
            const label = `${parseYMD(c.dateStr).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${c.count ? `, ${c.count} record${c.count === 1 ? '' : 's'}` : ''}${c.isToday ? ', today' : ''}${isSelected ? ', selected' : ''}`;
            return `
          <button type="button" class="calendar-day ${c.inMonth ? '' : 'is-outside'} ${c.isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${c.count > 0 ? 'has-work' : ''} ${inCycle ? 'in-current-cycle' : ''}"${styleAttr}
            data-cal-date="${c.dateStr}" tabindex="${c.dateStr === tabTarget ? '0' : '-1'}" aria-label="${esc(label)}" aria-pressed="${isSelected}" ${c.isToday ? 'aria-current="date"' : ''}>
            <span class="calendar-daynum" aria-hidden="true">${c.dayNum}</span>
            ${c.count === 1 ? '<span class="calendar-dot" aria-hidden="true"></span>' : ''}
            ${c.count > 1 ? `<span class="calendar-pill" aria-hidden="true">${c.count}</span>` : ''}
          </button>`;
          })
          .join('')}
      </div>`;
}

function calendarHint() {
  const { year, month } = calendarViewMonth();
  const prefix = `${year}-${pad2(month + 1)}-`;
  const days = new Set(state.records.filter((r) => (r.date || '').startsWith(prefix)).map((r) => r.date)).size;
  return `${days ? `${days} work day${days === 1 ? '' : 's'} logged` : 'No work days logged'} this month. Pick a day to set the record's date.`;
}

function calendarMonthLabel() {
  const { year, month } = calendarViewMonth();
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function renderCalendar() {
  return `
    <section class="panel calendar-panel" aria-labelledby="calendar-heading">
      <div class="panel-head">
        <div>
          <h2 id="calendar-heading">Work calendar</h2>
          <p class="panel-hint" id="calendar-hint">${esc(calendarHint())}</p>
        </div>
        <span class="calendar-legend">
          <span class="calendar-legend-item"><span class="calendar-dot" aria-hidden="true"></span>Work day</span>
          <span class="calendar-legend-item"><span class="calendar-legend-swatch" aria-hidden="true"></span>Active cycle</span>
        </span>
      </div>
      <div class="calendar-nav" role="group" aria-label="Calendar month">
        <button class="cycle-nav-btn" id="btn-cal-prev" type="button" aria-label="Previous month">${icon('arrowLeft', 'icon-sm')}</button>
        <span class="calendar-month-label" id="calendar-month-label" aria-live="polite">${esc(calendarMonthLabel())}</span>
        <button class="cycle-nav-btn" id="btn-cal-next" type="button" aria-label="Next month">${icon('arrowRight', 'icon-sm')}</button>
        <button class="icon-btn small calendar-today-btn" id="btn-cal-today" type="button" aria-label="Go to today">Today</button>
      </div>
      <div class="calendar-body" id="calendar-body">${renderCalendarBody()}</div>
    </section>`;
}

/** Re-draw just the calendar (month label, hint, grid) — never render().
 *  `direction` (-1/1) plays the subtle directional month slide; `focusDate`
 *  moves keyboard focus to that day after the swap. */
function refreshCalendar({ direction = 0, focusDate = null } = {}) {
  const body = document.getElementById('calendar-body');
  if (!body) return;
  body.innerHTML = renderCalendarBody(focusDate);
  const label = document.getElementById('calendar-month-label');
  if (label) label.textContent = calendarMonthLabel();
  const hint = document.getElementById('calendar-hint');
  if (hint) hint.textContent = calendarHint();
  const grid = document.getElementById('calendar-grid');
  if (direction && grid && !motionReduced()) {
    grid.classList.add(direction < 0 ? 'is-nav-prev' : 'is-nav-next');
  }
  if (focusDate) body.querySelector(`[data-cal-date="${focusDate}"]`)?.focus();
}

function shiftCalendarMonth(delta, focusDate = null) {
  const { year, month } = calendarViewMonth();
  const d = new Date(year, month + delta, 1);
  calendarView = { year: d.getFullYear(), month: d.getMonth() };
  refreshCalendar({ direction: Math.sign(delta), focusDate });
}

/** Show `dateStr`'s month (sliding in the right direction) if it isn't the one on screen. */
function showCalendarMonthOf(dateStr, focusDate = null) {
  const target = parseYMD(dateStr);
  const { year, month } = calendarViewMonth();
  const delta = (target.getFullYear() - year) * 12 + (target.getMonth() - month);
  if (delta) shiftCalendarMonth(delta, focusDate);
  else refreshCalendar({ focusDate });
}

/** Today: bring today's month into view and put focus on today — without
 *  changing the record's selected date or creating anything. */
function calendarGoToday() {
  const today = calc.todayString();
  showCalendarMonthOf(today, today);
  const cell = document.querySelector(`#calendar-body [data-cal-date="${today}"]`);
  if (cell) {
    cell.classList.remove('is-flash');
    void cell.offsetWidth;
    cell.classList.add('is-flash');
  }
}

/** Clicking a day = choosing the record's date, exactly like the date
 *  picker: write #f-date and fire its real input/change events, so the
 *  pay-cycle preview, rates and fixed-pay share all update as usual. */
function selectCalendarDate(dateStr) {
  const input = document.getElementById('f-date');
  if (!input) return;
  input.value = dateStr;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // #f-date's input listener re-syncs the calendar (syncCalendarToFormDate);
  // only do it here if that didn't already put this date on screen.
  if (!document.querySelector(`#calendar-body [data-cal-date="${dateStr}"].is-selected`)) showCalendarMonthOf(dateStr, dateStr);
}

/** Keep the calendar's selection (and month) in step when the date is
 *  typed or picked elsewhere. */
function syncCalendarToFormDate() {
  const value = document.getElementById('f-date')?.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) { refreshCalendar(); return; }
  const focused = document.activeElement?.dataset?.calDate ? value : null;
  showCalendarMonthOf(value, focused);
}

function handleCalendarKeydown(e) {
  const cell = e.target.closest?.('[data-cal-date]');
  if (!cell) return;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  if (step !== undefined) {
    e.preventDefault();
    const d = parseYMD(cell.dataset.calDate);
    d.setDate(d.getDate() + step);
    const target = ymd(d);
    const inView = document.querySelector(`#calendar-body [data-cal-date="${target}"]:not(.is-outside)`);
    if (inView) {
      document.querySelectorAll('#calendar-body [data-cal-date]').forEach((b) => { b.tabIndex = b === inView ? 0 : -1; });
      inView.focus();
    } else {
      showCalendarMonthOf(target, target);
    }
  } else if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault();
    // Same day number in the adjacent month, clamped (31 Aug → 30 Sep).
    const cur = parseYMD(cell.dataset.calDate);
    const first = new Date(cur.getFullYear(), cur.getMonth() + (e.key === 'PageUp' ? -1 : 1), 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const target = ymd(new Date(first.getFullYear(), first.getMonth(), Math.min(cur.getDate(), lastDay)));
    showCalendarMonthOf(target, target);
  }
}

function wireCalendarEvents() {
  document.getElementById('btn-cal-prev')?.addEventListener('click', () => shiftCalendarMonth(-1));
  document.getElementById('btn-cal-next')?.addEventListener('click', () => shiftCalendarMonth(1));
  document.getElementById('btn-cal-today')?.addEventListener('click', calendarGoToday);
  const body = document.getElementById('calendar-body');
  // Delegated on the persistent container, so month swaps need no re-wiring.
  body?.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-cal-date]');
    if (cell) selectCalendarDate(cell.dataset.calDate);
  });
  body?.addEventListener('keydown', handleCalendarKeydown);
  body?.addEventListener('animationend', (e) => e.target.classList?.remove('is-nav-prev', 'is-nav-next', 'is-flash'));
}

/**
 * Day type / Payment type control. The real <select> is unchanged — same
 * options, same values, same id, still read by submitForm() and still
 * firing the same change events — it's just visually hidden, exactly like
 * the Job picker's #f-job. A themed trigger + listbox popover (the Job
 * picker's own classes, so all record-form dropdowns share one look)
 * writes to it. See the "Option picker" functions below.
 */
function optionSelect(id, field, currentValue) {
  const list = opts.optionsForSelect(state.settings[field], currentValue);
  const leadingIcon = field === 'dayTypes' ? 'calendar' : 'clock';
  const fieldLabel = field === 'dayTypes' ? 'day type' : 'payment type';
  const options = list.length
    ? list.map((o) => `<option value="${esc(o.label)}" ${o.label === currentValue ? 'selected' : ''}>${esc(o.label)}${o.archived ? ' (archived)' : ''}</option>`).join('')
    : '<option>No options configured</option>';
  const selected = list.find((o) => o.label === currentValue) || list[0];
  const triggerText = selected ? `${selected.label}${selected.archived ? ' (archived)' : ''}` : 'No options configured';
  return `
    <div class="select-control option-picker" data-option-picker="${id}">
      <span class="select-leading" aria-hidden="true">${icon(leadingIcon, 'icon-sm')}</span>
      <select id="${id}" class="visually-hidden-input" tabindex="-1" aria-hidden="true" ${list.length ? '' : 'disabled'}>${options}</select>
      <button type="button" class="job-select-trigger" id="btn-${id}-picker" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-picker-popover" aria-label="Choose ${fieldLabel}: ${esc(triggerText)}" ${list.length ? '' : 'disabled'}>${esc(triggerText)}</button>
      <span class="select-chevron" aria-hidden="true"></span>
      <div class="job-picker-popover option-picker-popover" id="${id}-picker-popover" role="listbox" aria-label="Choose ${fieldLabel}">
        <div id="${id}-picker-body"></div>
      </div>
    </div>`;
}

/**
 * A fixed-choice field (Break, Pay cycle length) drawn with the same themed
 * trigger + listbox popover as Day type / Payment type, instead of the
 * browser's own dropdown. The real <select> still holds the value and
 * fires the usual change events.
 *   choices: [{ value, label }]   fieldLabel: words for "Choose …: <value>"
 */
function themedSelect(id, choices, currentValue, fieldLabel, { leadingIcon = null } = {}) {
  const current = choices.find((c) => String(c.value) === String(currentValue)) || choices[0];
  const options = choices.map((c) => `<option value="${esc(c.value)}" ${c === current ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
  return `
    <div class="select-control option-picker ${leadingIcon ? '' : 'select-plain'}" data-option-picker="${id}">
      ${leadingIcon ? `<span class="select-leading" aria-hidden="true">${icon(leadingIcon, 'icon-sm')}</span>` : ''}
      <select id="${id}" class="visually-hidden-input" tabindex="-1" aria-hidden="true">${options}</select>
      <button type="button" class="job-select-trigger" id="btn-${id}-picker" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-picker-popover" aria-label="Choose ${esc(fieldLabel)}: ${esc(current.label)}">${esc(current.label)}</button>
      <span class="select-chevron" aria-hidden="true"></span>
      <div class="job-picker-popover option-picker-popover" id="${id}-picker-popover" role="listbox" aria-label="Choose ${esc(fieldLabel)}">
        <div id="${id}-picker-body"></div>
      </div>
    </div>`;
}

const BREAK_CHOICES = [
  { value: 0, label: 'No break' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
];
// "Monday – Sunday", "Tuesday – Monday", … — weekly pay-cycle start choices.
const WEEKDAY_LONG = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'long' }));
const CYCLE_START_DAY_CHOICES = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: `${WEEKDAY_LONG[d]} – ${WEEKDAY_LONG[(d + 6) % 7]}` }));

const CYCLE_LENGTH_CHOICES = [
  { value: 7, label: '7 days (weekly)' },
  { value: 14, label: '14 days (fortnightly)' },
  { value: 30, label: '30 days (rolling)' },
  { value: 365, label: '365 days (rolling year)' },
];

// ---------------------------------------------------------------------
// Option picker (Day type / Payment type) — same mechanics as the Job
// picker: one open at a time, keyboard support on the trigger, and the
// shared click-outside/Escape handling in initPickerGlobalListeners().
// ---------------------------------------------------------------------
let optionPickerOpenId = null;
let optionPickerActiveIndex = -1;

function renderOptionPickerBody(id) {
  const select = document.getElementById(id);
  if (!select) return '';
  return [...select.options]
    .map((opt, i) => {
      const cls = ['job-picker-option', opt.selected ? 'is-selected' : '', i === optionPickerActiveIndex ? 'is-active' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" role="option" aria-selected="${opt.selected}" tabindex="-1" data-op-index="${i}">${esc(opt.textContent)}</button>`;
    })
    .join('');
}

function refreshOptionPickerBody() {
  const id = optionPickerOpenId;
  const body = id && document.getElementById(`${id}-picker-body`);
  if (!body) return;
  body.innerHTML = renderOptionPickerBody(id);
  body.querySelectorAll('[data-op-index]').forEach((btn) => {
    btn.addEventListener('click', () => selectOptionPickerIndex(id, Number(btn.dataset.opIndex)));
    btn.addEventListener('mouseenter', () => {
      optionPickerActiveIndex = Number(btn.dataset.opIndex);
      body.querySelectorAll('.job-picker-option').forEach((el) => el.classList.toggle('is-active', el === btn));
    });
  });
  body.querySelector('.job-picker-option.is-active')?.scrollIntoView({ block: 'nearest' });
}

function syncOptionPickerLabel(id) {
  const select = document.getElementById(id);
  const trigger = document.getElementById(`btn-${id}-picker`);
  if (!select || !trigger) return;
  const text = select.options[select.selectedIndex]?.textContent || '';
  trigger.textContent = text;
  trigger.setAttribute('aria-label', trigger.getAttribute('aria-label').replace(/:.*$/, `: ${text}`));
}

function selectOptionPickerIndex(id, index) {
  const select = document.getElementById(id);
  const opt = select?.options[index];
  if (select && opt && !opt.selected) {
    select.selectedIndex = index;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeOptionPicker();
  document.getElementById(`btn-${id}-picker`)?.focus();
}

function openOptionPicker(id) {
  if (optionPickerOpenId && optionPickerOpenId !== id) closeOptionPicker();
  const select = document.getElementById(id);
  if (!select || select.disabled) return;
  optionPickerOpenId = id;
  optionPickerActiveIndex = Math.max(0, select.selectedIndex);
  refreshOptionPickerBody();
  document.getElementById(`${id}-picker-popover`)?.classList.add('is-open');
  document.getElementById(`btn-${id}-picker`)?.setAttribute('aria-expanded', 'true');
}

function closeOptionPicker() {
  const id = optionPickerOpenId;
  if (!id) return;
  document.getElementById(`${id}-picker-popover`)?.classList.remove('is-open');
  document.getElementById(`btn-${id}-picker`)?.setAttribute('aria-expanded', 'false');
  optionPickerOpenId = null;
  optionPickerActiveIndex = -1;
}

function handleOptionPickerKeydown(e, id) {
  const open = optionPickerOpenId === id;
  const count = document.getElementById(id)?.options.length || 0;
  const move = (index) => {
    optionPickerActiveIndex = Math.min(count - 1, Math.max(0, index));
    refreshOptionPickerBody();
  };
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open) openOptionPicker(id);
    else move(optionPickerActiveIndex + (e.key === 'ArrowDown' ? 1 : -1));
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!open) openOptionPicker(id);
    else selectOptionPickerIndex(id, optionPickerActiveIndex);
  } else if (open && e.key === 'Escape') {
    e.preventDefault();
    closeOptionPicker();
  } else if (open && (e.key === 'Home' || e.key === 'End')) {
    e.preventDefault();
    move(e.key === 'Home' ? 0 : count - 1);
  } else if (open && e.key === 'Tab') {
    closeOptionPicker();
  }
}

function wireOptionPickers() {
  document.querySelectorAll('[data-option-picker]').forEach((wrap) => {
    // Called for the whole page and again when a Settings pane is swapped
    // in — never bind the same picker twice.
    if (wrap.dataset.wired) return;
    wrap.dataset.wired = '1';
    const id = wrap.dataset.optionPicker;
    const trigger = document.getElementById(`btn-${id}-picker`);
    trigger?.addEventListener('click', () => (optionPickerOpenId === id ? closeOptionPicker() : openOptionPicker(id)));
    trigger?.addEventListener('keydown', (e) => handleOptionPickerKeydown(e, id));
    document.getElementById(id)?.addEventListener('change', () => syncOptionPickerLabel(id));
  });
}

/** The global mode — now only for records saved WITHOUT a job, and the
 *  default a new job starts with. */
function globalPayMode() {
  return calc.normalizePayMode(state.settings.payCalculationMode);
}

/** A job's own pay mode. Falls back to the global mode for a job object
 *  that somehow lacks the field (e.g. straight out of a replace-import). */
function jobPayMode(job) {
  return calc.normalizePayMode(job && job.payCalculationMode, globalPayMode());
}

/**
 * Which pay-entry UI to show in the record form: "payment" (type the
 * actual amount, hourly rate is calculated) or "hourlyRate" (payment is
 * calculated from a rate). For an EXISTING record it always follows how
 * THAT record was entered (calculations.js#recordPayMode) — never its
 * job's or the global mode as they are today — so changing a job's mode
 * can never reinterpret history. A NEW record follows the selected job's
 * own mode, or the global mode when no job is selected. See
 * docs/data-model.md "Pay calculation mode".
 */
function payModeForForm(editingRecord, job = null) {
  if (editingRecord) return calc.recordPayMode(editingRecord);
  if (job) return jobPayMode(job);
  return globalPayMode();
}

function payModeLabel(mode) {
  return { hourlyRate: 'Hourly', payment: 'Actual payment', monthlyFixed: 'Monthly fixed pay', yearlyFixed: 'Yearly fixed pay' }[mode] || 'Actual payment';
}

function formPayHint(mode) {
  if (mode === 'hourlyRate') return 'Hourly: pay is calculated from the rate × your working time.';
  if (calc.isFixedPayMode(mode)) return 'Fixed pay: your salary is the pay — this day carries its share of it. Standard hours are filled in; change them if today was different.';
  return 'Actual payment: enter what you were paid — your effective hourly rate is calculated.';
}

function jobSubtitle(job) {
  if (!job) return 'No job selected — enter your rate or payment manually below.';
  const mode = jobPayMode(job);
  if (mode === 'hourlyRate') return `Hourly · ${money(job.baseRate)} base rate`;
  if (calc.isFixedPayMode(mode)) return `${payModeLabel(mode)} · ${fixedPayAmountLabel(mode, job.fixedPay)} · ${fixedScheduleLabel(job.fixedPay)}`;
  return `Actual payment${job.baseRate > 0 ? ` · ${money(job.baseRate)}/hr expected` : ''}`;
}

const WEEKDAY_SHORT = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));
// Monday-first order for working-day pickers and labels (values stay 0 = Sunday … 6 = Saturday).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function fixedPayAmountLabel(mode, fixedPay) {
  return `${money(fixedPay?.amount || 0)}${mode === 'monthlyFixed' ? '/month' : '/year'}`;
}

/** "Mon–Fri 9:00 AM – 5:00 PM" style summary of a fixed-pay schedule. */
function fixedScheduleLabel(fixedPay) {
  const fp = calc.normalizeFixedPay(fixedPay);
  const days = WEEKDAY_ORDER.filter((d) => fp.workingDays.includes(d));
  let dayText = days.map((d) => WEEKDAY_SHORT[d]).join(', ');
  // Collapse a consecutive Monday-first run ("Mon–Fri") when it is one.
  const idx = days.map((d) => WEEKDAY_ORDER.indexOf(d));
  if (days.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)) dayText = `${WEEKDAY_SHORT[days[0]]}–${WEEKDAY_SHORT[days[days.length - 1]]}`;
  return `${dayText} ${calc.formatTime12h(fp.start)} – ${calc.formatTime12h(fp.end)}`;
}

/**
 * Whether the record form should show the Ending-time workflow (Starting
 * time + Ending time, working time calculated automatically) instead of
 * the original manual hours/minutes inputs. Mirrors payModeForForm's
 * split between editing and adding:
 *
 * - Editing an existing record always follows that record's own history
 *   — does it carry a stored `end`? A record without one never invents
 *   or switches to Ending-time mode just because the global setting is
 *   on, so opening an old manual-duration record for editing always
 *   still shows its manual duration, untouched. See docs/data-model.md
 *   "Ending time".
 * - A brand-new record follows settings.calculateDurationFromEndTime,
 *   OR'd with the record defaulting to Ending-time mode whenever
 *   settings.payCalculationMode is "hourlyRate" (Ending time is
 *   particularly useful there — see the settings docs). This is a
 *   render-time default only: nothing is written back to
 *   calculateDurationFromEndTime when payCalculationMode changes, so the
 *   two settings never permanently force each other.
 */
function durationModeForForm(editingRecord) {
  if (editingRecord) {
    return calc.hasEndTime(editingRecord);
  }
  return state.settings.calculateDurationFromEndTime || payModeForForm(null) === 'hourlyRate';
}

function weekendSourceLabel(source) {
  return { saturday: 'Saturday', sunday: 'Sunday', weekday: 'Weekend', 'override-none': 'Weekend', 'override-custom': 'Weekend' }[source] || 'Weekend';
}

/** Read the record form's currently-selected job, or null when "No job
 *  (manual entry)" is chosen — the option that preserves 100% of the
 *  original manual hourly-rate / direct-payment behaviour. */
function selectedFormJob() {
  const id = document.getElementById('f-job')?.value || '';
  return id ? jobs.findJob(state.settings.jobs, id) : null;
}

/** The weekend-override object as calculations.js#resolveWeekendRule
 *  expects it, built from the transient formOverrideMode/formOverrideRule
 *  the override chips maintain. */
function currentFormOverride() {
  if (formOverrideMode === 'custom') return { mode: 'custom', rule: formOverrideRule };
  if (formOverrideMode === 'none') return { mode: 'none' };
  return { mode: 'default' };
}

function jobWithFormAdditionalOverride(job) {
  return formAdditionalOverrideMode === 'none' ? { ...job, additionalRule: { type: 'none', value: 0 } } : job;
}

/** The full job-aware rate breakdown for whatever the form currently
 *  shows, or null when no job is selected / there isn't enough
 *  information yet (no date). Pure read of live DOM + calculations.js —
 *  never writes anything until submit. */
function currentFormBreakdown(job) {
  const dateVal = document.getElementById('f-date')?.value;
  if (!job || !dateVal) return null;
  const minsRaw = currentFormNetMinutes();
  const mins = minsRaw === null ? 0 : minsRaw;
  return calc.getRateBreakdown(jobWithFormAdditionalOverride(job), dateVal, currentFormOverride(), mins);
}

function renderRatePanelBody(job, b, payMode = 'hourlyRate') {
  if (!job) return '';
  return `
    <div class="rate-live-panel">
      <div class="rate-live-row"><span class="rate-live-label">Job</span><span class="rate-live-value">${esc(job.name)}</span></div>
      <div class="rate-live-row"><span class="rate-live-label">Base rate</span><span class="rate-live-value tnum">${money(job.baseRate)}/hr</span></div>
      <div class="rate-live-row is-adjustment"><span class="rate-live-label">${esc(b ? weekendSourceLabel(b.weekendSource) : 'Weekend')}</span><span class="rate-live-value tnum">${b ? esc(calc.formatRuleLabel(b.weekendRule, state.settings.currency)) : '—'}</span></div>
      <div class="rate-live-row is-adjustment"><span class="rate-live-label">Additional</span><span class="rate-live-value tnum">${b ? esc(calc.formatRuleLabel(b.additionalRule, state.settings.currency)) : '—'}</span></div>
      <div class="rate-live-row is-effective"><span class="rate-live-label">Effective rate</span><span class="rate-live-value tnum">${b ? `${money(b.effectiveRate)}/hr` : '—'}</span></div>
      <div class="rate-live-row"><span class="rate-live-label">Working time</span><span class="rate-live-value tnum">${b ? calc.formatDuration(b.minutes) : '—'}</span></div>
      <div class="rate-live-row is-total"><span class="rate-live-label">${payMode === 'hourlyRate' ? 'Calculated payment' : 'Expected payment'}</span><span class="rate-live-value tnum">${b ? money(b.payment) : '—'}</span></div>
    </div>`;
}

/** Direct-payment mode + a job selected: compares what the job's
 *  configured rate predicts against the amount the user actually typed.
 *  The typed payment (#f-pay) always remains the record's real value —
 *  this only ever annotates it, never replaces it. */
function renderPayComparison(b) {
  if (!b) return '';
  const actual = Number(document.getElementById('f-pay')?.value) || 0;
  const mins = b.minutes;
  const actualRate = mins > 0 && actual > 0 ? calc.hourlyRate(actual, mins) : 0;
  const diff = actual - b.payment;
  const diffClass = actual <= 0 ? '' : Math.abs(diff) < 0.005 ? 'is-match' : diff > 0 ? 'is-over' : 'is-under';
  return `
    <div class="pay-comparison">
      <div class="pay-comparison-item"><span class="pay-comparison-label">Expected rate</span><span class="pay-comparison-value tnum">${money(b.effectiveRate)}/hr</span></div>
      <div class="pay-comparison-item"><span class="pay-comparison-label">Expected payment</span><span class="pay-comparison-value tnum">${money(b.payment)}</span></div>
      <div class="pay-comparison-item pay-comparison-diff ${diffClass}"><span class="pay-comparison-label">Difference</span><span class="pay-comparison-value tnum">${actual > 0 ? `${diff >= 0 ? '+' : ''}${money(diff)}` : '—'}</span></div>
      <div class="pay-comparison-item"><span class="pay-comparison-label">Actual effective rate</span><span class="pay-comparison-value tnum">${actualRate > 0 ? `${money(actualRate)}/hr` : '—'}</span></div>
    </div>`;
}

/** The pay inputs that differ by mode — rendered on their own so a NEW
 *  record can swap them in place when the selected job's mode differs
 *  (see syncFormPayModeToJob), without a full render() wiping the rest of
 *  the form. Markup is unchanged from before per-job modes existed. */
function renderPayModeFields(payMode, job, editingRecord, useEndTime) {
  const currencyPrefix = money(0).replace(/[0-9.,]/g, '').trim() || '$';
  if (calc.isFixedPayMode(payMode)) {
    return `
            <div class="field">
              <label for="f-fixed-share">Salary share for this day</label>
              <output id="f-fixed-share" class="rate-output" for="f-date f-job">—</output>
              <small class="field-help">Your salary divided across its scheduled working days.</small>
            </div>
            <div class="field">
              <label for="f-rate">Effective rate <span class="optional">analytical</span></label>
              <span class="calc-relation">${icon('arrowRight')}share ÷ time</span>
              <output id="f-rate" class="rate-output" for="f-date ${useEndTime ? 'f-start f-end' : 'f-hours f-minutes'}">—</output>
              <small class="field-help">For tracking only — hours never change a salary.</small>
            </div>`;
  }
  if (payMode === 'hourlyRate') {
    return `
            <div class="field job-pay-manual-field ${job ? 'is-hidden' : ''}">
              <label for="f-hourly-rate">Hourly rate</label>
              <div class="prefix-input">
                <span class="prefix">${currencyPrefix}</span>
                <input id="f-hourly-rate" type="number" min="0" step="0.01" placeholder="25.00" value="${editingRecord && !job ? editingRecord.hourlyRate : ''}">
              </div>
            </div>
            <div class="field job-pay-manual-field ${job ? 'is-hidden' : ''}">
              <label for="f-rate">Payment amount</label>
              <span class="calc-relation">${icon('arrowRight')}rate × time</span>
              <output id="f-rate" class="rate-output" for="${useEndTime ? 'f-hourly-rate f-start f-end' : 'f-hourly-rate f-hours f-minutes'}">—</output>
              <small class="field-help">Hourly rate × actual working time. Updates live.</small>
            </div>`;
  }
  return `
            <div class="field">
              <label for="f-pay">Actual payment</label>
              <div class="prefix-input">
                <span class="prefix">${currencyPrefix}</span>
                <input id="f-pay" type="number" min="0" step="0.01" placeholder="0.00" value="${editingRecord ? editingRecord.paymentAmount : ''}">
              </div>
            </div>
            <div class="field">
              <label for="f-rate">Effective hourly rate</label>
              <span class="calc-relation">${icon('arrowRight')}pay ÷ time</span>
              <output id="f-rate" class="rate-output" for="${useEndTime ? 'f-pay f-start f-end' : 'f-pay f-hours f-minutes'}">—</output>
              <small class="field-help">Actual payment ÷ working time. Updates live.</small>
            </div>`;
}

function renderPayModeExtra(payMode, job, breakdown) {
  if (calc.isFixedPayMode(payMode)) return '<div class="fixed-pay-panel" id="fixed-pay-panel" aria-live="polite"></div>';
  if (payMode === 'hourlyRate') {
    return `
          <div class="field job-pay-fromjob ${job ? '' : 'is-hidden'}" id="job-pay-fromjob" style="margin-top:14px">
            <label for="f-job-calculated-pay">Calculated payment</label>
            <output id="f-job-calculated-pay" class="rate-output">${breakdown ? money(breakdown.payment) : '—'}</output>
            <small class="field-help">From the job's effective rate × working time — see Rate above.</small>
          </div>`;
  }
  return `<div id="pay-panel-root" style="margin-top:14px">${job ? renderPayComparison(breakdown) : ''}</div>`;
}

/** Which pay UI the form is currently showing. */
function currentFormPayMode() {
  return calc.normalizePayMode(document.getElementById('pay-fieldset')?.dataset.payMode);
}

/**
 * NEW records only: when the selected job's mode differs from the pay UI
 * on screen, swap just the mode-specific pay inputs (scoped patch — the
 * rest of the form keeps whatever the user typed). Editing never swaps:
 * a saved record keeps the mode it was entered with.
 */
function syncFormPayModeToJob() {
  if (state.editingId) return;
  const fieldset = document.getElementById('pay-fieldset');
  if (!fieldset) return;
  const job = selectedFormJob();
  const mode = payModeForForm(null, job);
  if (fieldset.dataset.payMode === mode) return;
  fieldset.dataset.payMode = mode;
  const useEndTime = !!document.getElementById('f-end');
  const fields = document.getElementById('pay-mode-fields');
  const extra = document.getElementById('pay-mode-extra');
  if (fields) fields.innerHTML = renderPayModeFields(mode, job, null, useEndTime);
  if (extra) extra.innerHTML = renderPayModeExtra(mode, job, currentFormBreakdown(job));
  fieldset.classList.remove('is-mode-switching');
  void fieldset.offsetWidth; // restart the one-shot fade
  fieldset.classList.add('is-mode-switching');
  const badge = document.getElementById('pay-mode-badge');
  if (badge) badge.textContent = payModeLabel(mode);
  const hint = document.getElementById('form-pay-hint');
  if (hint) hint.textContent = formPayHint(mode);
  wirePayInputs();
}

/** Live-calc listeners for whichever mode-specific pay input exists. */
function wirePayInputs() {
  ['f-pay', 'f-hourly-rate'].forEach((id) =>
    document.getElementById(id)?.addEventListener('input', () => {
      updateLiveRate();
      updateJobAwareCalc();
    })
  );
}

function renderForm() {
  const editingRecord = state.editingId ? state.records.find((r) => r.id === state.editingId) : null;
  // The manual hours/minutes inputs are the GROSS entry the user typed —
  // pre-fill them from workingMinutes + breakMinutes (not the raw stored
  // net value), so re-submitting an untouched edit reproduces the exact
  // same stored workingMinutes. See docs/data-model.md "Break time".
  const parts = editingRecord
    ? calc.minutesToParts(calc.recordMinutes(editingRecord) + (Number(editingRecord.breakMinutes) || 0))
    : { hours: '', minutes: '' };
  const currentBreakMinutes = editingRecord ? Number(editingRecord.breakMinutes) || 0 : 0;
  const d = state.settings.defaults;
  const useEndTime = durationModeForForm(editingRecord);

  // Reset the transient (non-persisted) weekend-override selection for
  // THIS full render — see the module-level formOverrideMode/Rule
  // declaration for why this never lives on `state`.
  if (editingRecord && editingRecord.weekendOverride && editingRecord.weekendOverride.mode) {
    formOverrideMode = editingRecord.weekendOverride.mode;
    formOverrideRule = editingRecord.weekendOverride.rule ? calc.normalizeRule(editingRecord.weekendOverride.rule) : { type: 'percent', value: 0 };
  } else {
    formOverrideMode = 'default';
    formOverrideRule = { type: 'percent', value: 0 };
  }
  formAdditionalOverrideMode = editingRecord?.additionalRuleAtEntry?.type === 'none' ? 'none' : 'default';

  const currentJobId = editingRecord ? editingRecord.jobId || '' : '';
  const job = currentJobId ? jobs.findJob(state.settings.jobs, currentJobId) : null;
  const jobOptions = jobs.jobsForSelect(state.settings.jobs, currentJobId);
  const payMode = payModeForForm(editingRecord, job);
  const breakdown = job
    ? calc.getRateBreakdown(
        jobWithFormAdditionalOverride(job),
        editingRecord ? editingRecord.date : calc.todayString(),
        currentFormOverride(),
        editingRecord ? calc.recordMinutes(editingRecord) : 0
      )
    : null;

  return `
    <section class="panel form-panel" aria-labelledby="form-heading">
      <div class="panel-head">
        <div>
          <h2 id="form-heading">${editingRecord ? 'Edit record' : 'Add a work record'}</h2>
          <p class="panel-hint" id="form-pay-hint">${esc(formPayHint(payMode))}</p>
        </div>
        ${editingRecord ? `<span class="editing-badge">${icon('edit', 'icon-sm')}Editing ${esc(calc.shortDateLabel(editingRecord.date))}</span>` : ''}
      </div>

      <form id="record-form" novalidate>
        <fieldset class="field-group">
          <legend>Job</legend>
          <div class="field">
            <label for="f-job">Job <span class="optional">optional</span></label>
            <div class="select-control">
              <span class="select-leading" aria-hidden="true">${icon('briefcase', 'icon-sm')}</span>
              <select id="f-job" class="visually-hidden-input" tabindex="-1" aria-hidden="true">
                <option value="">No job (manual entry)</option>
                ${jobOptions.map((j) => `<option value="${j.id}" ${j.id === currentJobId ? 'selected' : ''} ${j.active ? '' : 'data-archived="true"'}>${esc(j.name)}${j.active ? '' : ' (archived)'}</option>`).join('')}
              </select>
              <button type="button" class="job-select-trigger" id="btn-job-picker" aria-haspopup="listbox" aria-expanded="false" aria-label="Choose job">${job ? `${esc(job.name)}${job.active ? '' : ' (archived)'}` : 'No job (manual entry)'}</button>
              <span class="select-chevron" aria-hidden="true"></span>
              <div class="job-picker-popover" id="job-picker-popover" role="listbox" aria-label="Choose job">
                <div id="job-picker-body"></div>
              </div>
            </div>
            <output id="f-job-subtitle" class="field-help" style="display:block;margin-top:6px" for="f-job">${esc(jobSubtitle(job))}</output>
          </div>
        </fieldset>

        <fieldset class="field-group">
          <legend>Date</legend>
          <div class="grid grid-2">
            <div class="field">
              <label for="f-date">Date</label>
              <div class="date-field-row">
                <input id="f-date" type="date" required value="${editingRecord ? editingRecord.date : calc.todayString()}">
                <button class="icon-btn date-picker-trigger" id="btn-date-picker" type="button" aria-label="Open calendar" aria-haspopup="dialog" aria-expanded="false">${icon('calendar', 'icon-sm')}</button>
              </div>
              <div class="date-picker-popover" id="date-picker-popover" role="dialog" aria-label="Choose a date">
                <div id="date-picker-body"></div>
              </div>
            </div>
            <div class="field">
              <label for="f-cycle-preview">Pay cycle</label>
              <output id="f-cycle-preview" class="rate-output" for="f-date">—</output>
              <small class="field-help">Calculated automatically from the date and your configured cycle length.</small>
            </div>
          </div>
        </fieldset>

        <fieldset class="field-group" data-duration-mode="${useEndTime ? 'end-time' : 'manual'}">
          <legend>Time</legend>
          ${
            useEndTime
              ? `
          <div class="time-timeline">
            <div class="timeline-endpoint field">
              <label for="f-start">${icon('clock', 'icon-sm')}Start</label>
              ${timeFieldMarkup('f-start', editingRecord ? editingRecord.start : d.startTime, 'Open time picker for start time')}
            </div>
            <div class="timeline-connector" aria-hidden="true">
              <span class="timeline-dot"></span>
              <span class="timeline-line"></span>
              <output id="f-duration-output" class="timeline-duration-badge" for="f-start f-end">—</output>
              <span class="timeline-line"></span>
              <span class="timeline-dot"></span>
            </div>
            <div class="timeline-endpoint field">
              <label for="f-end">${icon('clock', 'icon-sm')}End</label>
              ${timeFieldMarkup('f-end', editingRecord && calc.hasEndTime(editingRecord) ? editingRecord.end : '', 'Open time picker for end time')}
            </div>
          </div>`
              : `
          <div class="grid grid-2">
            <div class="field">
              <label for="f-start">${icon('clock', 'icon-sm')}Starting time</label>
              ${timeFieldMarkup('f-start', editingRecord ? editingRecord.start : d.startTime, 'Open time picker for starting time')}
            </div>
            <div class="field">
              <label for="f-hours" id="f-duration-label">Working time</label>
              <div class="duration-row" role="group" aria-labelledby="f-duration-label">
                <input id="f-hours" type="number" min="0" step="1" inputmode="numeric" placeholder="7" value="${parts.hours}" aria-labelledby="f-duration-label f-hours-unit">
                <span class="duration-unit" id="f-hours-unit"><span aria-hidden="true">hr</span><span class="visually-hidden">hours</span></span>
                <input id="f-minutes" type="number" min="0" max="59" step="1" inputmode="numeric" placeholder="30" value="${parts.minutes}" aria-labelledby="f-duration-label f-minutes-unit">
                <span class="duration-unit" id="f-minutes-unit"><span aria-hidden="true">min</span><span class="visually-hidden">minutes (0–59)</span></span>
              </div>
            </div>
          </div>`
          }
          <div class="grid grid-2" style="margin-top:16px">
            <div class="field">
              <label for="f-daytype">Day type</label>
              ${optionSelect('f-daytype', 'dayTypes', editingRecord ? editingRecord.dayType : d.dayType)}
            </div>
            <div class="field">
              <label for="f-map">Period <span class="optional">optional</span></label>
              <input id="f-map" placeholder="e.g. Week 1" value="${editingRecord ? esc(editingRecord.mapNumber) : ''}">
            </div>
          </div>
          <div class="grid grid-2" style="margin-top:16px">
            <div class="field">
              <label for="f-break">Break</label>
              ${themedSelect('f-break', BREAK_CHOICES, currentBreakMinutes, 'break', { leadingIcon: 'clock' })}
            </div>
            <div class="field">
              <label for="f-break-net">Net paid time</label>
              <output id="f-break-net" class="rate-output" for="f-break f-start f-end f-hours f-minutes">—</output>
            </div>
          </div>
        </fieldset>

        <fieldset class="field-group ${job && !calc.isFixedPayMode(payMode) ? '' : 'is-hidden'}" id="rate-fieldset">
          <legend>Rate</legend>
          <div class="field">
            <label id="override-label">Weekend adjustment</label>
            <div class="override-row" role="radiogroup" aria-labelledby="override-label">
              <button type="button" class="override-chip ${formOverrideMode === 'default' ? 'is-active' : ''}" data-override-mode="default">Use job default</button>
              <button type="button" class="override-chip ${formOverrideMode === 'none' ? 'is-active' : ''}" data-override-mode="none">No adjustment</button>
              <button type="button" class="override-chip ${formOverrideMode === 'custom' ? 'is-active' : ''}" data-override-mode="custom">Custom</button>
            </div>
            <div class="grid grid-2" id="override-custom-fields" style="margin-top:8px;${formOverrideMode === 'custom' ? '' : 'display:none'}">
              <div class="field">
                <label for="f-override-type">Type</label>
                <select id="f-override-type">
                  <option value="percent" ${formOverrideRule.type === 'percent' ? 'selected' : ''}>Percentage (+%)</option>
                  <option value="multiplier" ${formOverrideRule.type === 'multiplier' ? 'selected' : ''}>Multiplier (×)</option>
                  <option value="custom" ${formOverrideRule.type === 'custom' ? 'selected' : ''}>Flat rate ($)</option>
                </select>
              </div>
              <div class="field">
                <label for="f-override-value">Value</label>
                <input id="f-override-value" type="number" step="0.01" min="0" value="${formOverrideRule.value}">
              </div>
            </div>
          </div>
          <div id="rate-panel-root">${renderRatePanelBody(job, breakdown, payMode)}</div>
        </fieldset>

        <fieldset class="field-group" id="pay-fieldset" data-pay-mode="${payMode}">
          <legend>Pay <span class="pay-mode-badge" id="pay-mode-badge">${esc(payModeLabel(payMode))}</span></legend>
          <div class="grid grid-3">
            <div class="field">
              <label for="f-paytype">Payment type</label>
              ${optionSelect('f-paytype', 'paymentTypes', editingRecord ? editingRecord.paymentType : d.paymentType)}
            </div>
            <div class="pay-mode-fields" id="pay-mode-fields">${renderPayModeFields(payMode, job, editingRecord, useEndTime)}</div>
          </div>
          <div id="pay-mode-extra">${renderPayModeExtra(payMode, job, breakdown)}</div>
        </fieldset>

        <fieldset class="field-group">
          <legend>Notes</legend>
          <div class="field">
            <label for="f-notes">Role / notes <span class="optional">optional</span></label>
            <input id="f-notes" placeholder="e.g. Covered a colleague's shift" value="${editingRecord ? esc(editingRecord.notes) : ''}">
          </div>
        </fieldset>

        <div class="form-error" id="form-error" role="alert">${esc(state.formError)}</div>
        <div class="form-actions">
          <button class="btn primary" type="submit">${editingRecord ? 'Save changes' : 'Add record'}</button>
          ${editingRecord ? '<button class="btn secondary" type="button" id="btn-cancel-edit">Cancel</button>' : ''}
        </div>
      </form>
    </section>`;
}

function recordJobName(r) {
  if (!r.jobId) return null;
  const job = jobs.findJob(state.settings.jobs, r.jobId);
  return job ? job.name : 'Unassigned job';
}

/**
 * A record's historical rate breakdown, built ONLY from what was
 * snapshotted on the record at entry time (baseRateAtEntry,
 * weekendRuleAtEntry, additionalRuleAtEntry, effectiveRateAtEntry) —
 * never from the job's current, possibly since-changed configuration.
 * This is what keeps an old record's shown math immutable even after a
 * job's base rate is edited later. Returns null when the record has no
 * snapshot (no job was selected when it was entered).
 */
function recordRateBreakdownLine(r, mins) {
  if (r.fixedPayAtEntry && calc.isFixedPayMode(r.fixedPayAtEntry.mode)) {
    // Built only from the record's own snapshot — a later salary change
    // never alters what an old record shows.
    const fp = r.fixedPayAtEntry;
    const period = calc.fixedPayDayShare(fp.mode, fp, r.date).periodLabel;
    const why = { scheduled: 'carried by this record', unscheduled: `not a scheduled working day — salary unchanged, so ${money(0)} here`, 'already-counted': 'already carried by another record that day' }[fp.reason] || '';
    const eff = calc.recordEffectiveRate(r);
    return [
      `${fixedPayAmountLabel(fp.mode, fp)} ÷ ${fp.scheduledDays} scheduled day${fp.scheduledDays === 1 ? '' : 's'} (${period}) = ${money(fp.dayShare)} for this date — ${why}`,
      `Schedule at entry: ${fixedScheduleLabel(fp)}, ${fp.breakMinutes ? `${fp.breakMinutes} min break` : 'no break'}`,
      `${calc.formatDuration(mins)} tracked${eff > 0 ? ` → ${money(eff)}/hr effective (analytical)` : ''}`,
    ].map(esc).join('<br>');
  }
  if (r.baseRateAtEntry === undefined || r.baseRateAtEntry === null) return null;
  const segments = [`${money(r.baseRateAtEntry)} base`];
  if (r.weekendRuleAtEntry && r.weekendRuleAtEntry.type !== 'none') {
    segments.push(esc(calc.formatRuleLabel(r.weekendRuleAtEntry, state.settings.currency)));
  }
  if (r.additionalRuleAtEntry && r.additionalRuleAtEntry.type !== 'none') {
    segments.push(`${esc(calc.formatRuleLabel(r.additionalRuleAtEntry, state.settings.currency))} additional`);
  }
  const effective = r.effectiveRateAtEntry !== undefined ? r.effectiveRateAtEntry : r.baseRateAtEntry;
  if (calc.recordPayMode(r) === 'payment') {
    // Actual-payment record: the pay was entered, not calculated — show
    // how the effective rate falls out of it, then the job's rate at
    // entry purely as the expectation it was compared against.
    const actualRate = calc.recordEffectiveRate(r);
    const actualLine = `Actual payment ${money(r.paymentAmount)} ÷ ${calc.formatDuration(mins)} = ${actualRate > 0 ? `${money(actualRate)}/hr effective` : '— (no working time)'}`;
    segments.push(`${money(effective)}/hr expected`);
    let expectedLine = '';
    if (r.expectedPaymentAtEntry !== undefined) {
      const diff = r.paymentAmount - r.expectedPaymentAtEntry;
      expectedLine = `<br>Expected ${money(r.expectedPaymentAtEntry)} from job rate — actual payment ${diff >= 0 ? '+' : ''}${money(diff)} vs. expected.`;
    }
    return `${esc(actualLine)}<br>Job rate at entry: ${segments.map(esc).join('<span class="sep">·</span>')}${expectedLine}`;
  }
  segments.push(`${money(effective)} effective rate`);
  segments.push(`${calc.formatDuration(mins)} × ${money(effective)} = ${money(r.paymentAmount)}`);
  let expected = '';
  if (r.expectedPaymentAtEntry !== undefined) {
    const diff = r.paymentAmount - r.expectedPaymentAtEntry;
    expected = `<br>Expected ${money(r.expectedPaymentAtEntry)} from job rate — actual payment ${diff >= 0 ? '+' : ''}${money(diff)} vs. expected.`;
  }
  return segments.map(esc).join('<span class="sep">·</span>') + expected;
}

function rateBreakdownWidget(r, mins) {
  const line = recordRateBreakdownLine(r, mins);
  if (!line) return '';
  return `
    <div class="rate-breakdown" data-id="${r.id}">
      <button type="button" class="rate-breakdown-toggle" data-rb-toggle>${icon('arrowRight', 'icon-sm')}Rate breakdown</button>
      <div class="rate-breakdown-detail is-hidden">${line}</div>
    </div>`;
}

function recordMetaTags(r) {
  const computedCycle = r.date ? calc.getCycleForDate(r.date, state.settings.payCycleLengthDays, state.settings.payCycleAnchor) : null;
  // Compare semantically, not as raw strings: legacy text like "Sep 7 to
  // Sep 20" and the computed label "Sep 7 – Sep 20, 2026" describe the same
  // period but are never byte-identical, so a strict !== check here would
  // flag nearly every legacy record as a mismatch. See
  // calculations.js#legacyCycleMatchesComputed.
  const legacyCycle =
    r.cycle && r.cycle !== 'Unassigned' && !(computedCycle && calc.legacyCycleMatchesComputed(r.cycle, computedCycle)) ? r.cycle : null;
  return `
    <span class="tag pay-mode-tag">${esc(payModeLabel(calc.recordPayMode(r)))}</span>
    <span class="tag">${icon(recordTypeIcon(r.dayType, 'day'), 'icon-sm')}${esc(r.dayType || 'Unspecified')}</span>
    <span class="tag muted-tag">${icon(recordTypeIcon(r.paymentType, 'payment'), 'icon-sm')}${esc(r.paymentType || 'Unspecified')}</span>
    ${r.mapNumber ? `<span class="meta-item">Period <b>${esc(r.mapNumber)}</b></span>` : ''}
    ${legacyCycle ? `<span class="meta-item legacy-cycle" title="Manually entered before automatic cycles were added">Was <b>${esc(legacyCycle)}</b></span>` : ''}`;
}

/** A record's hourly rate for display: the applied rate (hourly) or
 *  actual pay ÷ working time (actual payment) — calculations.js decides,
 *  so the ledger and every export agree. "—" when there's no working time. */
function recordRateLabel(r) {
  const value = calc.recordEffectiveRate(r);
  return value > 0 ? `${money(value)}/hr` : '—';
}

/** Desktop ledger: DATE | JOB | ACTIVE HOUR | DURATION | RATE | PAY | ACTIONS,
 *  as a real <table> — a data instrument to scan, not a stack of cards.
 *  A second row per record holds notes/tags/the rate breakdown, spanning
 *  every column, so the primary row stays a single clean line. */
function renderLedgerRow(r) {
  const mins = calc.recordMinutes(r);
  const isToday = r.date === calc.todayString();
  const isEditing = r.id === state.editingId;
  const rowClasses = ['ledger-row', isToday ? 'is-today' : '', isEditing ? 'is-editing' : ''].filter(Boolean).join(' ');
  const jobName = recordJobName(r);

  return `
    <tr class="${rowClasses}" data-id="${r.id}">
      <td class="ledger-date">
        <span class="ledger-day">${calc.dayName(r.date)}</span>
        <span class="ledger-date-sub">${calc.shortDateLabel(r.date)}</span>
      </td>
      <td>
        <span class="ledger-job ${jobName ? '' : 'is-unassigned'}">${icon('briefcase', 'icon-sm')}${jobName ? esc(jobName) : 'No job'}</span>
      </td>
      <td class="ledger-time">
        <span class="ledger-time-main">${icon('clock', 'icon-sm')}<span>${esc(calc.formatActiveHour(r))}</span></span>
        ${r.breakMinutes ? `<span class="ledger-time-break">Break <b>${esc(calc.formatDuration(r.breakMinutes))}</b></span>` : ''}
      </td>
      <td class="ledger-duration tnum">${calc.formatDuration(mins)}</td>
      <td class="ledger-rate tnum">${recordRateLabel(r)}</td>
      <td class="ledger-pay tnum">${money(r.paymentAmount)}</td>
      <td class="ledger-actions">
        <div class="record-actions">
          <button class="icon-btn small" data-action="edit" data-id="${r.id}" title="Edit" aria-label="Edit record from ${esc(calc.shortDateLabel(r.date))}">${icon('edit', 'icon-sm')}</button>
          <button class="icon-btn small danger" data-action="delete" data-id="${r.id}" title="Delete" aria-label="Delete record from ${esc(calc.shortDateLabel(r.date))}">${icon('trash', 'icon-sm')}</button>
        </div>
      </td>
    </tr>
    <tr class="ledger-meta-row">
      <td colspan="7">
        <div class="record-meta">${recordMetaTags(r)}</div>
        ${r.notes ? `<div class="ledger-notes-row" style="padding:4px 0 0">${esc(r.notes)}</div>` : ''}
        ${rateBreakdownWidget(r, mins)}
      </td>
    </tr>`;
}

/** Mobile: a compact two-line item per record — never a shrunk table. */
function renderLedgerMobileRow(r) {
  const mins = calc.recordMinutes(r);
  const isEditing = r.id === state.editingId;
  const rateLabel = recordRateLabel(r);

  return `
    <li>
      <div class="ledger-mobile-row ${isEditing ? 'is-editing' : ''}" data-id="${r.id}">
        <div class="ledger-mobile-top">
          <span class="ledger-mobile-date">${calc.dayName(r.date)} ${calc.shortDateLabel(r.date)}</span>
          <span class="ledger-mobile-pay tnum">${money(r.paymentAmount)}</span>
        </div>
        <div class="ledger-mobile-bottom">
          <span class="ledger-mobile-summary">
            <span class="ledger-time-main">${icon('clock', 'icon-sm')}<span>${esc(calc.formatActiveHour(r))}</span></span>
            <span class="ledger-mobile-part">${calc.formatDuration(mins)}</span>
            ${r.breakMinutes ? `<span class="ledger-mobile-part ledger-time-break">Break <b>${esc(calc.formatDuration(r.breakMinutes))}</b></span>` : ''}
            ${rateLabel !== '—' ? `<span class="ledger-mobile-part"><b>${rateLabel}</b></span>` : ''}
          </span>
          <div class="record-actions">
            <button class="icon-btn small" data-action="edit" data-id="${r.id}" title="Edit" aria-label="Edit record from ${esc(calc.shortDateLabel(r.date))}">${icon('edit', 'icon-sm')}</button>
            <button class="icon-btn small danger" data-action="delete" data-id="${r.id}" title="Delete" aria-label="Delete record from ${esc(calc.shortDateLabel(r.date))}">${icon('trash', 'icon-sm')}</button>
          </div>
        </div>
        <div class="record-meta">${recordMetaTags(r)}</div>
        ${r.notes ? `<div class="ledger-notes-row" style="padding:2px 0 0;color:var(--text-muted);font-size:12px">${esc(r.notes)}</div>` : ''}
        ${rateBreakdownWidget(r, mins)}
      </div>
    </li>`;
}

function groupRecordsByJob(records) {
  const groups = new Map();
  for (const record of records) {
    const key = record.jobId || '__no_job__';
    if (!groups.has(key)) {
      groups.set(key, { key, name: recordJobName(record) || 'No job', records: [] });
    }
    groups.get(key).records.push(record);
  }
  return [...groups.values()];
}

function renderRecords(cycles) {
  if (!state.records.length) {
    return `
      <section class="panel">
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">${icon('calendar')}</div>
          <h3>No work records yet</h3>
          <p>Add your first shift above and it will appear here, grouped by time frame and job.</p>
          <button class="btn secondary" id="btn-sample-data" type="button">Load sample data</button>
        </div>
      </section>`;
  }

  // The graph's active cycle — same cycles array, same focusedCycle()
  // lookup, so the linked group is matched by the exact same cycle key
  // the graph is showing. It's listed first and opens by default; every
  // other cycle keeps groupByCycle()'s order underneath, and records
  // inside each keep theirs. Presentation only — nothing is stored.
  const linkedKey = focusedCycle(cycles)?.key;
  const ordered = [...cycles.filter((c) => c.key === linkedKey), ...cycles.filter((c) => c.key !== linkedKey)];
  const defaultOpenKey = linkedKey;

  return `
    <section class="records-panel" aria-label="Work records by pay cycle">
      <div class="records-heading">
        <h2 tabindex="-1">Pay-cycle history</h2>
        <p class="panel-hint">Grouped by pay cycle, then by job. Open a cycle to see its records.</p>
      </div>
      ${ordered
        .map((c, i) => {
          const open = isCycleOpen(c.key, defaultOpenKey);
          const linked = c.key === linkedKey;
          // Only on the render the graph navigation requested (the same
          // one-shot flag the graph's own slide-in uses).
          const linkEntering = linked && state.cycleNavDirection;
          const shifts = c.records.length;
          const jobCount = cycleJobCount(c.records);
          const bodyId = `cycle-body-${i}`;
          return `
        <div class="cycle-group ${open ? 'is-open' : ''} ${linked ? 'is-linked' : ''} ${linkEntering ? 'is-link-entering' : ''}" data-cycle-group="${esc(c.key)}" ${linked ? 'aria-current="true"' : ''}>
          <div class="cycle-head">
            <button type="button" class="cycle-toggle" data-cycle-toggle="${esc(c.key)}" aria-expanded="${open}" aria-controls="${bodyId}"
              aria-label="Pay cycle ${esc(c.cycleLabel)}${linked ? ' (shown in the graph)' : ''}: ${esc(calc.formatDuration(c.totalMinutes))}, ${shifts} shift${shifts === 1 ? '' : 's'}, ${esc(jobCountLabel(jobCount))}, ${esc(money(c.totalPay))}">
              <span class="cycle-chevron" aria-hidden="true">${icon('arrowRight', 'icon-sm')}</span>
              <span class="cycle-title">
                <span class="cycle-eyebrow">Pay cycle${linked ? '<span class="cycle-linked-note"> · shown in graph</span>' : ''}</span>
                <span class="cycle-name">${esc(c.cycleLabel)}</span>
              </span>
              <span class="cycle-metrics">
                <span class="cycle-summary tnum"><span class="cycle-metric" data-metric="hours">${calc.formatDuration(c.totalMinutes)}</span> · <span class="cycle-metric" data-metric="shifts">${shifts} shift${shifts === 1 ? '' : 's'}</span> · <span class="cycle-metric" data-metric="jobs">${esc(jobCountLabel(jobCount))}</span></span>
                <span class="cycle-pay tnum" data-metric="pay">${money(c.totalPay)}</span>
              </span>
            </button>
            <div class="cycle-head-actions">
              <div class="cycle-export-actions" role="group" aria-label="Export all records in ${esc(c.cycleLabel)}">
                <button class="icon-btn small" data-cycle-export="pdf" data-cycle-key="${esc(c.key)}" title="Export all records in this cycle as PDF">PDF</button>
                <button class="icon-btn small" data-cycle-export="jpg" data-cycle-key="${esc(c.key)}" title="Export all records in this cycle as JPG">JPG</button>
                <button class="icon-btn small" data-cycle-export="xlsx" data-cycle-key="${esc(c.key)}" title="Export all records in this cycle as Excel">Excel</button>
              </div>
            </div>
          </div>
          <div class="cycle-body" id="${bodyId}" ${open ? '' : 'inert'}>
          <div class="cycle-body-inner" ${open ? '' : `data-lazy-cycle="${esc(c.key)}"`}>
${open ? renderCycleBodyContent(c) : ''}
          </div>
          </div>
        </div>`;
        })
        .join('')}
    </section>`;
}

/** A cycle's ledger (desktop table + mobile list). Only built for OPEN
 *  cycles: a collapsed cycle's body stays empty until it is first opened
 *  (see toggleCycleGroup), so long histories don't create thousands of
 *  hidden rows on every render. */
function renderCycleBodyContent(c) {
  return `
          <table class="ledger-table">
            <thead>
              <tr>
                <th>Date</th><th>Job</th><th>Active hour</th><th class="col-duration">Duration</th><th class="col-num">Rate</th><th class="col-num">Pay</th><th class="col-actions">Actions</th>
              </tr>
            </thead>
            ${groupRecordsByJob(c.records).map((group) => `
              <tbody class="ledger-job-group">
                <tr class="ledger-job-group-heading">
                  <th colspan="7">
                    <div class="ledger-job-group-head-row">
                      <span class="ledger-job-group-title">${icon('briefcase', 'icon-sm')}${esc(group.name)}</span>
                      <div class="ledger-job-group-head-end">
                      ${jobGroupStats(group)}
                      <div class="cycle-export-actions" role="group" aria-label="Export ${esc(group.name)}'s records in ${esc(c.cycleLabel)}">
                        <button class="icon-btn small" data-job-export="pdf" data-cycle-key="${esc(c.key)}" data-job-key="${esc(group.key)}" title="Export ${esc(group.name)}'s records in this cycle as PDF">PDF</button>
                        <button class="icon-btn small" data-job-export="jpg" data-cycle-key="${esc(c.key)}" data-job-key="${esc(group.key)}" title="Export ${esc(group.name)}'s records in this cycle as JPG">JPG</button>
                        <button class="icon-btn small" data-job-export="xlsx" data-cycle-key="${esc(c.key)}" data-job-key="${esc(group.key)}" title="Export ${esc(group.name)}'s records in this cycle as Excel">Excel</button>
                      </div>
                      </div>
                    </div>
                  </th>
                </tr>
                ${group.records.map(renderLedgerRow).join('')}
              </tbody>`).join('')}
          </table>
          ${groupRecordsByJob(c.records).map((group) => `
            <section class="ledger-mobile-job-group" aria-label="${esc(group.name)} records">
              <div class="ledger-mobile-job-heading">
                <span class="ledger-job-group-title">${icon('briefcase', 'icon-sm')}${esc(group.name)}</span>
                <div class="ledger-job-group-head-end">
                ${jobGroupStats(group)}
                <div class="cycle-export-actions" role="group" aria-label="Export ${esc(group.name)}'s records in ${esc(c.cycleLabel)}">
                  <button class="icon-btn small" data-job-export="pdf" data-cycle-key="${esc(c.key)}" data-job-key="${esc(group.key)}" title="Export ${esc(group.name)}'s records as PDF">PDF</button>
                  <button class="icon-btn small" data-job-export="jpg" data-cycle-key="${esc(c.key)}" data-job-key="${esc(group.key)}" title="Export ${esc(group.name)}'s records as JPG">JPG</button>
                  <button class="icon-btn small" data-job-export="xlsx" data-cycle-key="${esc(c.key)}" data-job-key="${esc(group.key)}" title="Export ${esc(group.name)}'s records as Excel">Excel</button>
                </div>
                </div>
              </div>
              <ul class="ledger-mobile-list">${group.records.map(renderLedgerMobileRow).join('')}</ul>
            </section>`).join('')}`;
}

/** A job sub-section's summary, in reading order: shifts, hours, amount. */
function jobGroupStats(group) {
  const n = group.records.length;
  return `<span class="ledger-job-group-stats tnum"><span data-metric="shifts">${n} shift${n === 1 ? '' : 's'}</span> · <span data-metric="hours">${calc.formatDuration(calc.totalMinutes(group.records))}</span> · <span data-metric="pay">${money(calc.totalPay(group.records))}</span></span>`;
}

/** Distinct jobs in a cycle, keyed by stable jobId (never display name,
 *  so two similarly-named jobs can't collide). Records saved without a
 *  job aren't a job, so they don't count toward this. */
function cycleJobCount(records) {
  const ids = new Set();
  for (const r of records) if (r.jobId) ids.add(r.jobId);
  return ids.size;
}

function jobCountLabel(n) {
  if (n === 0) return 'no job';
  return `${n} job${n === 1 ? '' : 's'}`;
}

function isCycleOpen(key, defaultOpenKey) {
  return cycleExpansion.has(key) ? cycleExpansion.get(key) : key === defaultOpenKey;
}

/** Flip one cycle group's open state with a scoped DOM patch — no
 *  render(), no regrouping, no recalculation. The open/close motion is
 *  pure CSS (see .cycle-body in styles.css), so rapid toggles simply
 *  reverse the running transition instead of queueing JS timers. */
function toggleCycleGroup(button) {
  const key = button.dataset.cycleToggle;
  const group = button.closest('.cycle-group');
  const body = group?.querySelector('.cycle-body');
  if (!group || !body) return;
  const open = !group.classList.contains('is-open');
  const inner = body.querySelector('[data-lazy-cycle]');
  if (open && inner) {
    const cycle = calc.groupByCycle(state.records, state.settings.payCycleLengthDays, state.settings.payCycleAnchor).find((c) => c.key === key);
    if (cycle) {
      inner.innerHTML = renderCycleBodyContent(cycle);
      inner.removeAttribute('data-lazy-cycle');
      wireRecordControls(inner);
    }
  }
  cycleExpansion.set(key, open);
  group.classList.toggle('is-open', open);
  button.setAttribute('aria-expanded', String(open));
  body.inert = !open;
}

function renderInsights() {
  const start = calc.averageStartTime(state.records);
  const overallRate = calc.weightedAverageRate(state.records);
  return `
    <section class="insights" aria-label="Insights">
      <div class="insight-card">
        <div class="insight-label">Usual starting time</div>
        <div class="insight-value">${start ? calc.formatTime12h(start) : '—'}</div>
        <p class="insight-note">Average clock-in time across every recorded shift.</p>
      </div>
      <div class="insight-card">
        <div class="insight-label">Average earning per hour</div>
        <div class="insight-value">${overallRate > 0 ? `${money(overallRate)}/hr` : '—'}</div>
        <p class="insight-note">Total earnings ÷ total working time — a weighted rate, not an average of daily rates.</p>
      </div>
    </section>`;
}

function renderOptionRow(field, option, usageCount) {
  const locked = usageCount > 0;
  return `
    <li class="option-row ${option.archived ? 'is-archived' : ''}" data-id="${option.id}">
      <div class="option-info">
        <span class="option-label" data-role="label">${esc(option.label)}</span>
        ${option.archived ? '<span class="tag muted-tag">Archived</span>' : ''}
        <span class="option-usage">${usageCount ? `used in ${usageCount} record${usageCount === 1 ? '' : 's'}` : 'not used yet'}</span>
      </div>
      <div class="option-actions">
        <button class="icon-btn small" data-opt-action="move-up" data-field="${field}" data-id="${option.id}" aria-label="Move ${esc(option.label)} up">${icon('arrowUp', 'icon-sm')}</button>
        <button class="icon-btn small" data-opt-action="move-down" data-field="${field}" data-id="${option.id}" aria-label="Move ${esc(option.label)} down">${icon('arrowDown', 'icon-sm')}</button>
        <button class="icon-btn small" data-opt-action="rename" data-field="${field}" data-id="${option.id}">Rename</button>
        ${
          option.archived
            ? `<button class="icon-btn small" data-opt-action="restore" data-field="${field}" data-id="${option.id}">Restore</button>`
            : `<button class="icon-btn small danger" data-opt-action="remove" data-field="${field}" data-id="${option.id}">${locked ? 'Archive' : 'Delete'}</button>`
        }
      </div>
    </li>`;
}

// -- Profiles -------------------------------------------------------------
// Separate workspaces on one device (see storage.js "Profiles"). Switching
// loads that profile's records, jobs and settings; nothing is shared but
// the theme.

const profileIndex = () => store.loadProfiles();
const activeProfile = () => profileIndex().profiles.find((p) => p.id === store.getActiveProfileId()) || profileIndex().profiles[0];
const hasProfiles = () => profileIndex().profiles.length > 1;

/** "Profile: [Main job ▾]" above the dashboard — only once there are two or more. */
function renderProfileBar() {
  if (!hasProfiles()) return '';
  const { profiles } = profileIndex();
  return `
    <div class="profile-bar" data-active-profile="${esc(store.getActiveProfileId())}">
      <label class="profile-bar-label" for="h-profile">${icon('briefcase', 'icon-sm')}Profile</label>
      <div class="profile-bar-select">${themedSelect('h-profile', profiles.map((p) => ({ value: p.id, label: p.name })), store.getActiveProfileId(), 'profile')}</div>
      <span class="profile-bar-count" aria-live="polite">${state.records.length} record${state.records.length === 1 ? '' : 's'} · ${store.pendingNoteCount(state.notes)} pending note${store.pendingNoteCount(state.notes) === 1 ? '' : 's'}</span>
    </div>`;
}

function switchProfile(id) {
  if (id === store.getActiveProfileId()) return;
  discardFormDraft();
  store.setActiveProfile(id);
  try { store.rememberActiveProfile(id); } catch { /* storage full — still switch for this visit */ }
  state.records = store.loadRecords();
  state.settings = store.loadSettings();
  state.notes = store.loadNotes();
  state.noteEditingId = null;
  state.editingId = null;
  state.focusedCycleKey = null;
  state.exportRequest = null;
  state.formError = '';
  parkedFormDraft = null;
  cycleExpansion.clear();
  calendarView = null;
  profileSwitchMotion = true;
  showToast(`Switched to ${activeProfile().name}.`);
}

function profilesTab() {
  const { profiles } = profileIndex();
  const activeId = store.getActiveProfileId();
  return `
    <p class="panel-hint">Profiles keep separate sets of records, jobs and settings on this device — for example your main job with a Monday–Sunday pay cycle and a side job paid Tuesday–Monday. Each has its own history, graph and backups. The theme is shared. A profile isn't a login: anyone using this browser can switch between them.</p>
    <ul class="option-list profile-list">
      ${profiles
        .map((p) => {
          const count = p.id === activeId ? state.records.length : store.loadRecordsFor(p.id).length;
          const active = p.id === activeId;
          return `
        <li class="option-row" data-profile-id="${esc(p.id)}">
          <div class="option-info">
            <span class="option-label">${esc(p.name)}</span>
            ${active ? '<span class="tag">Current</span>' : ''}
            <span class="option-usage">${count} record${count === 1 ? '' : 's'}</span>
          </div>
          <div class="option-actions">
            ${active ? '' : `<button class="icon-btn small" type="button" data-profile-action="switch" data-id="${esc(p.id)}" aria-label="Switch to ${esc(p.name)}">Switch</button>`}
            <button class="icon-btn small" type="button" data-profile-action="rename" data-id="${esc(p.id)}" aria-label="Rename ${esc(p.name)}">Rename</button>
            ${p.id === store.DEFAULT_PROFILE_ID ? '' : `<button class="icon-btn small danger" type="button" data-profile-action="delete" data-id="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">Delete</button>`}
          </div>
        </li>`;
        })
        .join('')}
    </ul>
    <form class="add-option-row" id="add-profile-form">
      <input id="new-profile-name" maxlength="40" placeholder="e.g. Side job" aria-label="New profile name" autocomplete="off">
      <button class="btn secondary" type="submit">Add profile</button>
    </form>
    <p class="field-help">The first profile holds the records that were already here and can be renamed but not deleted.</p>`;
}

function handleProfileAction(action, id) {
  const profile = profileIndex().profiles.find((p) => p.id === id);
  if (!profile) return;
  try {
    if (action === 'switch') {
      switchProfile(id);
      return;
    }
    if (action === 'rename') {
      const next = prompt('Rename profile to:', profile.name);
      if (next === null) return;
      if (!next.trim()) return showToast('A profile needs a name.', 'error');
      store.renameProfile(id, next);
      showToast(`Renamed to ${next.trim().slice(0, 40)}.`);
      return;
    }
    if (action === 'delete') {
      const count = id === store.getActiveProfileId() ? state.records.length : store.loadRecordsFor(id).length;
      if (!confirm(`Delete the profile “${profile.name}” and its ${count} record(s), jobs and notes from this device? This cannot be undone — download a backup of it first if unsure.`)) return;
      const wasActive = id === store.getActiveProfileId();
      store.deleteProfile(id);
      if (wasActive) {
        store.setActiveProfile(store.DEFAULT_PROFILE_ID);
        state.records = store.loadRecords();
        state.settings = store.loadSettings();
        state.notes = store.loadNotes();
        state.noteEditingId = null;
        state.editingId = null;
        state.focusedCycleKey = null;
        cycleExpansion.clear();
        calendarView = null;
      }
      showToast(`Deleted ${profile.name}.`);
    }
  } catch {
    showToast(PERSIST_FAILED_MESSAGE, 'error');
  }
}

function addProfile(name) {
  const clean = String(name || '').trim();
  if (!clean) return showToast('Type a name for the new profile.', 'error');
  if (profileIndex().profiles.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return showToast(`There is already a profile called ${clean}.`, 'error');
  try {
    // Make sure the current profile is saved under its own keys first.
    if (!persist()) return;
    if (!hasProfiles()) store.saveProfiles({ ...profileIndex(), ...store.appearanceOf(state.settings) });
    const profile = store.createProfile(clean, { ...store.appearanceOf(state.settings), currency: state.settings.currency });
    switchProfile(profile.id);
    showToast(`Added ${profile.name} and switched to it. Set up its jobs and pay cycle in Settings.`);
  } catch {
    showToast(PERSIST_FAILED_MESSAGE, 'error');
  }
}

const SETTINGS_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'options', label: 'Options' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'feedback', label: 'Feedback' },
];

// -- Feedback tab ---------------------------------------------------------
// Transient, session-only UI state (same pattern as formOverrideMode etc.
// above) — a feedback draft is never persisted to localStorage or sent
// anywhere until the user submits it. See feedback.js for why the actual
// "submit" always honestly reports that delivery isn't connected yet.
let feedbackDraft = '';
let feedbackSubmitting = false;
let feedbackStatus = null; // null | { ok: boolean, error?: string, notConnected?: boolean }

function feedbackTab() {
  return `
    <div class="field">
      <label for="feedback-message">Tell us what you think</label>
      <textarea id="feedback-message" rows="5" maxlength="4000" placeholder="What's working well? What would make WorkRoaster better for you?" ${feedbackSubmitting ? 'disabled' : ''}>${esc(feedbackDraft)}</textarea>
      <small class="field-help">Feedback stays on this device until you send it — nothing is saved or shared automatically.</small>
    </div>
    <div class="feedback-actions">
      <button class="btn primary" id="btn-feedback-submit" type="button" ${feedbackSubmitting ? 'disabled' : ''}>${feedbackSubmitting ? 'Sending…' : 'Send feedback'}</button>
      ${
        feedbackStatus && feedbackStatus.ok === false
          ? `<p class="feedback-status is-error" role="status">${icon('close', 'icon-sm')}${esc(feedbackStatus.error)}</p>`
          : ''
      }
      ${
        feedbackStatus && feedbackStatus.ok === true
          ? `<p class="feedback-status is-success" role="status">${icon('check', 'icon-sm')}Thanks — your feedback was sent.</p>`
          : ''
      }
    </div>`;
}

// -- Jobs settings tab ---------------------------------------------------

function ruleEditorRow(name, id, rule) {
  const r = calc.normalizeRule(rule);
  return `
    <div class="rule-editor-row">
      <span class="rule-editor-name">${esc(name)}</span>
      <div class="field">
        <label for="${id}-type">Type</label>
        <div class="select-control select-plain">
          <select id="${id}-type">
            <option value="none" ${r.type === 'none' ? 'selected' : ''}>No adjustment</option>
            <option value="percent" ${r.type === 'percent' ? 'selected' : ''}>Percentage (+%)</option>
            <option value="multiplier" ${r.type === 'multiplier' ? 'selected' : ''}>Multiplier (×)</option>
            <option value="custom" ${r.type === 'custom' ? 'selected' : ''}>Flat rate ($)</option>
          </select>
          <span class="select-chevron" aria-hidden="true"></span>
        </div>
      </div>
      <div class="field">
        <label for="${id}-value">Value</label>
        <input id="${id}-value" type="number" step="0.01" min="0" value="${r.type === 'none' ? '' : r.value}" ${r.type === 'none' ? 'disabled' : ''}>
      </div>
    </div>`;
}

/** Per-job pay calculation mode — same radio-card pattern (.mode-options)
 *  as the global setting in Settings > Workflow, not a new control. */
/** "How is this job paid?" — the job's own payment method (Phase 7's
 *  job.payCalculationMode), given its own section in Add Job and Edit
 *  Job together with the rate it uses. Same .mode-options radio cards as
 *  the global setting in Settings > Workflow. */
function jobPaymentMethodFieldset(name, mode, rateId, rateValue, ratePlaceholder, isEdit, fxPrefix, fixedPay) {
  const option = (value, title, desc) => `
      <label class="mode-option ${mode === value ? 'is-selected' : ''}">
        <input type="radio" name="${name}" value="${value}" data-job-mode ${mode === value ? 'checked' : ''}>
        <span class="mode-option-body">
          <span class="mode-option-title">${title}</span>
          <span class="mode-option-desc">${desc}</span>
        </span>
      </label>`;
  return `
      <fieldset class="field-group job-pay-method">
        <legend id="${name}-label">How is this job paid?</legend>
        <div class="mode-options" role="radiogroup" aria-labelledby="${name}-label">
          ${option('hourlyRate', 'Hourly rate', 'Paid for your working time — e.g. $30/hour. WorkRoaster calculates pay as hours × the applicable rate.')}
          ${option('payment', 'Actual payment', 'You enter what you actually received — e.g. $40 per delivery or task. WorkRoaster works out your effective hourly rate.')}
          ${option('monthlyFixed', 'Monthly fixed pay', 'A monthly salary — e.g. $4,840 a month — on a regular schedule. New records start with your standard hours.')}
          ${option('yearlyFixed', 'Yearly fixed pay', 'An annual salary — e.g. $62,400 a year — on a regular schedule. New records start with your standard hours.')}
        </div>
        <div class="job-mode-section" data-modes="hourlyRate payment">${jobRateField(rateId, rateValue, ratePlaceholder)}</div>
        <div class="job-mode-section job-fixed-fields" data-modes="monthlyFixed yearlyFixed">${jobFixedPayFields(fxPrefix, fixedPay)}</div>
        ${isEdit ? '<small class="field-help">Changing how this job is paid — or its salary or schedule — only affects records you add from now on. Saved records keep what they were entered with.</small>' : ''}
      </fieldset>`;
}

/** Salary + standard schedule for the fixed-pay methods. Working days are
 *  real checkboxes (keyboard + screen-reader friendly) styled as chips;
 *  unticked days are days off, so any pattern — weekends, rotating
 *  shifts — can be described, not just Monday–Friday. */
function jobFixedPayFields(prefix, fixedPay) {
  const fp = calc.normalizeFixedPay(fixedPay);
  const currencyPrefix = money(0).replace(/[0-9.,]/g, '').trim() || '$';
  return `
          <div class="field">
            <label for="${prefix}-amount"><span class="job-mode-copy" data-for-mode="monthlyFixed">Monthly pay</span><span class="job-mode-copy" data-for-mode="yearlyFixed">Yearly pay</span></label>
            <div class="prefix-input">
              <span class="prefix">${currencyPrefix}</span>
              <input id="${prefix}-amount" type="number" min="0" step="0.01" ${fp.amount ? `value="${fp.amount}"` : ''} placeholder="4840">
            </div>
          </div>
          <div class="field">
            <label id="${prefix}-days-label">Working days</label>
            <div class="weekday-chips" role="group" aria-labelledby="${prefix}-days-label">
              ${WEEKDAY_ORDER.map((d) => `
              <label class="weekday-chip"><input type="checkbox" value="${d}" data-workday ${fp.workingDays.includes(d) ? 'checked' : ''}><span>${esc(WEEKDAY_SHORT[d])}</span></label>`).join('')}
            </div>
            <small class="field-help">Tick the days you normally work — days left unticked are your days off (weekends included).</small>
          </div>
          <div class="grid grid-3 job-fixed-hours">
            <div class="field">
              <label for="${prefix}-start">Standard start</label>
              ${timeFieldMarkup(`${prefix}-start`, fp.start, 'Open time picker for standard start time')}
            </div>
            <div class="field">
              <label for="${prefix}-end">Standard end</label>
              ${timeFieldMarkup(`${prefix}-end`, fp.end, 'Open time picker for standard end time')}
            </div>
            <div class="field">
              <label for="${prefix}-break">Break</label>
              <div class="select-control select-plain">
                <select id="${prefix}-break">
                  ${calc.FIXED_PAY_BREAK_OPTIONS.map((m) => `<option value="${m}" ${fp.breakMinutes === m ? 'selected' : ''}>${m ? `${m} min` : 'No break'}</option>`).join('')}
                </select>
                <span class="select-chevron" aria-hidden="true"></span>
              </div>
            </div>
          </div>
          <small class="field-help">New records for this job start with these hours — you can still change any single record.</small>`;
}

function readFixedPayFromForm(form, prefix) {
  return calc.normalizeFixedPay({
    amount: Number(document.getElementById(`${prefix}-amount`)?.value) || 0,
    workingDays: [...(form?.querySelectorAll('[data-workday]:checked') || [])].map((el) => Number(el.value)),
    start: document.getElementById(`${prefix}-start`)?.value,
    end: document.getElementById(`${prefix}-end`)?.value,
    breakMinutes: Number(document.getElementById(`${prefix}-break`)?.value),
  });
}

/** Base-rate field whose label/help follow the form's mode (CSS keyed
 *  on the form's data-pay-mode — see .job-mode-copy in styles.css). */
function jobRateField(id, value, placeholder) {
  return `
          <div class="field">
            <label for="${id}"><span class="job-mode-copy" data-for-mode="hourlyRate">Standard / base hourly rate</span><span class="job-mode-copy" data-for-mode="payment">Expected hourly rate <span class="optional">optional</span></span></label>
            <div class="prefix-input">
              <span class="prefix">${money(0).replace(/[0-9.,]/g, '').trim() || '$'}</span>
              <input id="${id}" type="number" min="0" step="0.01" ${value !== null ? `value="${value}"` : ''} ${placeholder ? `placeholder="${placeholder}"` : ''}>
            </div>
            <small class="field-help job-mode-copy" data-for-mode="payment">Only used to compare what you were paid against what this rate would have paid.</small>
          </div>`;
}

const JOB_RATES_MODE_HINT = '<small class="field-help job-mode-copy" data-for-mode="payment">In actual-payment mode these rules only shape the expected pay you\'re compared against — they never change what you enter.</small>';

/** "Hourly · $32/hr" or "Actual payment" (plus its optional expected
 *  rate) — how this job is paid, readable at a glance on its card. */
function jobCardPaySummary(job) {
  const mode = jobPayMode(job);
  if (mode === 'hourlyRate') return `<span class="job-row-mode">Hourly</span> · ${money(job.baseRate)}/hr`;
  if (calc.isFixedPayMode(mode)) return `<span class="job-row-mode">${payModeLabel(mode)}</span> · ${fixedPayAmountLabel(mode, job.fixedPay)}`;
  return `<span class="job-row-mode">Actual payment</span>${job.baseRate > 0 ? ` · ${money(job.baseRate)}/hr expected` : ''}`;
}

function renderJobRow(job, records) {
  const usage = jobs.jobUsageCount(records, job.id);
  const editing = state.jobEditingId === job.id;
  return `
    <li class="job-row ${job.active ? '' : 'is-archived'}" data-id="${job.id}">
      <div class="job-row-top">
        <div class="job-row-info">
          <span class="job-row-name">${esc(job.name)}${job.employer ? ` <span class="muted">· ${esc(job.employer)}</span>` : ''}</span>
          <span class="job-row-sub">${usage ? `used in ${usage} record${usage === 1 ? '' : 's'}` : 'not used yet'}</span>
        </div>
        <span class="job-row-rate tnum">${jobCardPaySummary(job)}</span>
        <div class="job-row-actions">
          <button class="icon-btn small" data-job-action="edit" data-id="${job.id}">${editing ? 'Close' : 'Edit'}</button>
          ${
            job.active
              ? `<button class="icon-btn small danger" data-job-action="archive" data-id="${job.id}">Archive</button>`
              : `<button class="icon-btn small" data-job-action="restore" data-id="${job.id}">Restore</button>`
          }
          ${usage === 0 ? `<button class="icon-btn small danger" data-job-action="delete" data-id="${job.id}" aria-label="Delete ${esc(job.name)}" title="No records use this job, so it can be deleted">Delete</button>` : ''}
        </div>
      </div>
      <div class="job-row-badges">
        ${!job.active ? '<span class="tag muted-tag">Archived</span>' : ''}
        ${job.saturdayRule.type !== 'none' ? `<span class="tag">Sat ${esc(calc.formatRuleLabel(job.saturdayRule, state.settings.currency))}</span>` : ''}
        ${job.sundayRule.type !== 'none' ? `<span class="tag">Sun ${esc(calc.formatRuleLabel(job.sundayRule, state.settings.currency))}</span>` : ''}
        ${job.additionalRule.type !== 'none' ? `<span class="tag">+ ${esc(calc.formatRuleLabel(job.additionalRule, state.settings.currency))}</span>` : ''}
      </div>
      ${
        editing
          ? `
      <form class="job-editor" data-job-edit-form data-id="${job.id}" data-pay-mode="${jobPayMode(job)}">
        <fieldset class="field-group">
          <legend>Job details</legend>
          <div class="grid grid-2">
            <div class="field">
              <label for="je-name-${job.id}">Job name</label>
              <input id="je-name-${job.id}" required value="${esc(job.name)}">
            </div>
            <div class="field">
              <label for="je-employer-${job.id}">Employer <span class="optional">optional</span></label>
              <input id="je-employer-${job.id}" value="${esc(job.employer)}">
            </div>
          </div>
        </fieldset>
        ${jobPaymentMethodFieldset(`je-mode-${job.id}`, jobPayMode(job), `je-rate-${job.id}`, job.baseRate, '', true, `je-fx-${job.id}`, job.fixedPay)}
        <fieldset class="field-group job-mode-section" data-modes="hourlyRate payment">
          <legend>Weekend &amp; loading rules</legend>
          ${ruleEditorRow('Saturday', `je-sat-${job.id}`, job.saturdayRule)}
          ${ruleEditorRow('Sunday', `je-sun-${job.id}`, job.sundayRule)}
          ${ruleEditorRow('Additional loading', `je-add-${job.id}`, job.additionalRule)}
          <small class="field-help">Additional loading is also what's offered for overtime and public-holiday shifts when entering a record.</small>
          ${JOB_RATES_MODE_HINT}
        </fieldset>
        <fieldset class="field-group">
          <legend>Other</legend>
          <div class="field">
            <label for="je-notes-${job.id}">Notes <span class="optional">optional</span></label>
            <input id="je-notes-${job.id}" value="${esc(job.notes)}">
          </div>
        </fieldset>
        <div class="form-actions">
          <button class="btn primary" type="submit">${icon('check', 'icon-sm')}Save job</button>
          <button class="btn secondary" type="button" data-job-action="cancel-edit">Cancel</button>
        </div>
      </form>`
          : ''
      }
    </li>`;
}

function jobsTab() {
  const list = state.settings.jobs || [];
  return `
    <p class="panel-hint">Jobs are the base for automatic Saturday/Sunday penalty rates and additional loadings. Editing a job's rates only affects <strong>new</strong> records — every record already saved keeps the rate it was actually entered with.</p>
    <ul class="jobs-list">
      ${list.map((j) => renderJobRow(j, state.records)).join('') || '<li class="muted">No jobs added yet.</li>'}
    </ul>
    <form class="add-job-row" id="add-job-form" data-pay-mode="${globalPayMode()}">
      <h3>${icon('plus', 'icon-sm')}Add a job</h3>
      <fieldset class="field-group">
        <legend>Job details</legend>
        <div class="grid grid-2">
          <div class="field">
            <label for="new-job-name">Job name</label>
            <input id="new-job-name" placeholder="e.g. Café Barista" required>
          </div>
          <div class="field">
            <label for="new-job-employer">Employer <span class="optional">optional</span></label>
            <input id="new-job-employer" placeholder="e.g. Northside Café">
          </div>
        </div>
      </fieldset>
      ${jobPaymentMethodFieldset('new-job-mode', globalPayMode(), 'new-job-rate', null, '30.00', false, 'new-job-fx', null)}
      <fieldset class="field-group job-mode-section" data-modes="hourlyRate payment">
        <legend>Weekend &amp; loading rules</legend>
        ${ruleEditorRow('Saturday', 'new-job-sat', null)}
        ${ruleEditorRow('Sunday', 'new-job-sun', null)}
        ${ruleEditorRow('Additional loading', 'new-job-add', null)}
        <small class="field-help">Additional loading is also what's offered for overtime and public-holiday shifts when you enter a record — this job doesn't need a separate public-holiday rate.</small>
        ${JOB_RATES_MODE_HINT}
      </fieldset>
      <fieldset class="field-group">
        <legend>Other</legend>
        <div class="field">
          <label for="new-job-notes">Notes <span class="optional">optional</span></label>
          <input id="new-job-notes" placeholder="e.g. Casual, weekend shifts">
        </div>
      </fieldset>
      <div class="form-actions">
        <button class="btn primary" type="submit">${icon('check', 'icon-sm')}Save job</button>
        <button class="btn secondary" type="button" id="btn-cancel-add-job">Cancel</button>
      </div>
    </form>`;
}

/** Settings → General: which day the pay cycle starts. Weekly cycles pick
 *  a weekday; longer cycles pick the date the current cycle started on
 *  (a weekday alone can't say which week a fortnight starts in). Only
 *  regroups records — nothing stored on a record changes. */
function cycleStartField() {
  const len = state.settings.payCycleLengthDays;
  const anchor = state.settings.payCycleAnchor;
  const current = calc.getCycleForDate(calc.todayString(), len, anchor);
  const help = `<small class="field-help" id="s-cycle-start-help">Current pay cycle: ${esc(current.cycleLabel)}. Changing this regroups your history and graph; no record is changed.</small>`;
  if (len === 7) {
    return `
    <div class="field">
      <label for="s-cycle-start-day">Pay cycle starts on</label>
      ${themedSelect('s-cycle-start-day', CYCLE_START_DAY_CHOICES, calc.cycleStartWeekday(anchor), 'pay cycle start day')}
      ${help}
    </div>`;
  }
  return `
    <div class="field">
      <label for="s-cycle-start-date">Current pay cycle started on</label>
      <input id="s-cycle-start-date" type="date" required value="${current.cycleStart}" aria-describedby="s-cycle-start-help">
      ${help}
    </div>`;
}

/** One Settings category's content pane — used by the full modal render
 *  and by navigateSettingsTab()'s in-place pane swap. */
function settingsTabContent(tab) {
  const field = state.optionField;
  const list = state.settings[field] || [];
  const fieldLabel = field === 'dayTypes' ? 'Day types' : 'Payment types';

  const generalTab = `
    <div class="field">
      <label for="s-currency">Currency code</label>
      <input id="s-currency" list="currency-list" value="${esc(state.settings.currency)}" maxlength="3" style="text-transform:uppercase" aria-describedby="s-currency-help s-currency-error" autocomplete="off" spellcheck="false">
      <datalist id="currency-list">
        ${['USD', 'AUD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD', 'INR'].map((c) => `<option value="${c}">`).join('')}
      </datalist>
      <small class="field-help" id="s-currency-help">Any valid 3-letter ISO currency code, e.g. AUD, USD, GBP.</small>
      <small class="field-error" id="s-currency-error" role="alert">${isSupportedCurrency(state.settings.currency) ? '' : `Your saved code “${esc(state.settings.currency)}” isn’t a recognised currency. Amounts still show it until you choose a valid code.`}</small>
    </div>
    <div class="field">
      <label for="s-default-start">Default starting time for new records</label>
      ${timeFieldMarkup('s-default-start', state.settings.defaults.startTime, 'Open time picker for default starting time', false)}
    </div>
    <div class="field">
      <label for="s-cycle-length">Pay cycle length</label>
      ${themedSelect('s-cycle-length', CYCLE_LENGTH_CHOICES, state.settings.payCycleLengthDays, 'pay cycle length')}
      <small class="field-help">Every record is grouped from its date. 30- and 365-day cycles are rolling blocks of that many days — not calendar months or calendar years.</small>
    </div>
    ${cycleStartField()}
    <fieldset class="field-group export-visibility" aria-describedby="s-export-help">
      <legend>Export</legend>
      <p class="field-help" id="s-export-help">What PDF, JPG and Excel reports include. These are the starting choices — you can still change them for each export. JSON backups and CSV always include everything.</p>
      ${exportVisibilityFields('s-export', state.settings.exportVisibility)}
    </fieldset>`;

  const visualNow = state.settings.visualTheme || 'classic';
  const motionNow = store.MOTION_STYLES.includes(state.settings.motionStyle) ? state.settings.motionStyle : store.DEFAULT_MOTION_STYLE;
  const appearanceTab = `
    <fieldset class="field-group appearance-themes">
      <legend>Visual theme</legend>
      <p class="field-help" id="s-visual-help">Colours, surfaces and accents for the whole app. Every theme has a light and a dark version — choose which below. Shared by all profiles.</p>
      <div class="visual-theme-grid" role="radiogroup" aria-describedby="s-visual-help">
        ${VISUAL_THEME_CHOICES.map((t) => `
        <label class="visual-theme-card ${visualNow === t.id ? 'is-selected' : ''}" data-visual-preview="${t.id}">
          <input type="radio" name="s-visual-theme" value="${t.id}" ${visualNow === t.id ? 'checked' : ''}>
          <span class="visual-theme-swatch" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="visual-theme-name">${esc(t.name)}</span>
          <span class="visual-theme-blurb">${esc(t.blurb)}</span>
        </label>`).join('')}
      </div>
    </fieldset>
    <div class="field">
      <label for="s-header-glass">Top bar transparency</label>
      <div class="range-row">
        <span class="range-end" aria-hidden="true">Solid</span>
        <input type="range" id="s-header-glass" min="0" max="100" step="5" value="${store.normalizeHeaderTransparency(state.settings.headerTransparency)}" aria-describedby="s-header-glass-help" aria-valuetext="${esc(headerTransparencyLabel(state.settings.headerTransparency))}">
        <span class="range-end" aria-hidden="true">Clear</span>
      </div>
      <small class="field-help" id="s-header-glass-help"><output id="s-header-glass-value" for="s-header-glass">${esc(headerTransparencyLabel(state.settings.headerTransparency))}</output>. How much of the page shows through the top bar as you scroll. Text and buttons stay readable at every setting; browsers without blur keep a solid bar.</small>
    </div>
    <fieldset class="field-group appearance-motion">
      <legend>Motion &amp; bounce</legend>
      <p class="field-help" id="s-motion-help">How buttons, menus and dialogs move. If your device is set to reduce motion, WorkRoaster always stays still.</p>
      <div class="segmented" role="radiogroup" aria-describedby="s-motion-help">
        ${MOTION_STYLE_CHOICES.map((m) => `
        <label class="segmented-option ${motionNow === m.id ? 'is-selected' : ''}">
          <input type="radio" name="s-motion-style" value="${m.id}" ${motionNow === m.id ? 'checked' : ''} aria-describedby="s-motion-${m.id}-desc">
          <span class="segmented-name">${esc(m.name)}</span>
          <span class="segmented-desc" id="s-motion-${m.id}-desc">${esc(m.blurb)}</span>
        </label>`).join('')}
      </div>
    </fieldset>
    <div class="field">
      <label for="s-theme">Light or dark</label>
      <div class="select-control select-plain">
      <select id="s-theme">
        <option value="system" ${state.settings.theme === 'system' ? 'selected' : ''}>Match system</option>
        <option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Light</option>
        <option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
      </select>
      <span class="select-chevron" aria-hidden="true"></span>
      </div>
      <small class="field-help">"Match system" follows your device's light/dark setting automatically.</small>
    </div>`;

  const workflowTab = `
    <div class="field">
      <label id="pay-mode-label">Pay calculation for records without a job</label>
      <p class="field-help" style="margin:0 0 10px">Each job has its own calculation mode (Settings → Jobs). This one applies to records saved with <strong>no job</strong>, and is the starting choice for new jobs. It never recalculates a record you've already saved.</p>
      <div class="mode-options" role="radiogroup" aria-labelledby="pay-mode-label">
        <label class="mode-option ${state.settings.payCalculationMode === 'payment' ? 'is-selected' : ''}">
          <input type="radio" name="pay-calc-mode" value="payment" ${state.settings.payCalculationMode === 'payment' ? 'checked' : ''}>
          <span class="mode-option-body">
            <span class="mode-option-title">Payment amount</span>
            <span class="mode-option-desc">I enter the final amount I receive, and WorkRoaster calculates my hourly rate.</span>
          </span>
        </label>
        <label class="mode-option ${state.settings.payCalculationMode === 'hourlyRate' ? 'is-selected' : ''}">
          <input type="radio" name="pay-calc-mode" value="hourlyRate" ${state.settings.payCalculationMode === 'hourlyRate' ? 'checked' : ''}>
          <span class="mode-option-body">
            <span class="mode-option-title">Hourly rate</span>
            <span class="mode-option-desc">I enter my hourly rate, and WorkRoaster calculates the payment from my working time.</span>
          </span>
        </label>
      </div>
    </div>
    <div class="field">
      <label class="checkbox-field" for="s-end-time-mode">
        <input type="checkbox" id="s-end-time-mode" ${state.settings.calculateDurationFromEndTime ? 'checked' : ''}>
        <span>Calculate working time from ending time</span>
      </label>
      <p class="field-help" style="margin:6px 0 0">Working time is calculated automatically from the starting and ending times.</p>
      <p class="field-help" style="margin:2px 0 0">For example, ending time: 5:30 PM</p>
    </div>`;

  const optionsTab = `
    <div class="option-tabs" role="group" aria-label="Option list">
      <button class="chip-tab ${field === 'dayTypes' ? 'active' : ''}" data-option-field="dayTypes" type="button" aria-pressed="${field === 'dayTypes'}">Day types</button>
      <button class="chip-tab ${field === 'paymentTypes' ? 'active' : ''}" data-option-field="paymentTypes" type="button" aria-pressed="${field === 'paymentTypes'}">Payment types</button>
    </div>
    <p class="panel-hint">Deleting an option used by existing records archives it instead — those records keep showing their original value, and the option just won't appear in future dropdowns.</p>
    <ul class="option-list">
      ${list.map((o) => renderOptionRow(field, o, opts.optionUsageCount(state.records, field === 'dayTypes' ? 'dayType' : 'paymentType', o.label))).join('') || '<li class="muted">No options yet.</li>'}
    </ul>
    <form class="add-option-row" id="add-option-form">
      <input id="new-option-label" placeholder="Add a new ${fieldLabel.toLowerCase().replace(/s$/, '')}…" aria-label="New ${fieldLabel} name">
      <button class="btn secondary" type="submit">Add</button>
    </form>`;

  if (tab === 'jobs') return jobsTab();
  if (tab === 'profiles') return profilesTab();
  if (tab === 'feedback') return feedbackTab();
  return { general: generalTab, appearance: appearanceTab, workflow: workflowTab, options: optionsTab }[tab] || generalTab;
}

function renderSettingsModal() {
  if (state.modal !== 'settings') return '';
  const tab = SETTINGS_CATEGORIES.some((c) => c.id === state.settingsTab) ? state.settingsTab : 'general';
  return `
    <div class="modal-backdrop ${modalEnterClass()}" id="modal-backdrop">
      <div class="modal settings-modal ${modalEnterClass()}" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button class="icon-btn" id="btn-close-modal" aria-label="Close settings">${icon('close', 'icon-sm')}</button>
        </div>
        <div class="modal-body">
          <div class="settings-layout">
            <div class="settings-rail" id="settings-rail" role="tablist" aria-label="Settings categories">
              <div class="settings-rail-indicator" id="settings-rail-indicator" aria-hidden="true"></div>
              ${SETTINGS_CATEGORIES.map((c) => `<button class="rail-tab ${tab === c.id ? 'active' : ''}" data-tab="${c.id}" type="button" role="tab" aria-selected="${tab === c.id}">${esc(c.label)}</button>`).join('')}
            </div>
            <div class="settings-content" id="settings-content">
              ${settingsTabContent(tab)}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

// -- Guide ----------------------------------------------------------------
// Read-only help. Content lives in guide.js; this renders it inside the
// same modal + category rail + content animation as Settings (reusing its
// .settings-* classes and #settings-rail ids — only one modal is ever
// open). Section, search text and example inputs are transient UI state:
// nothing here reads or writes a record, a job or a setting.
let guideSection = GUIDE_SECTIONS[0].id;
let guideQuery = '';

const guidePlainText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const GUIDE_INDEX = GUIDE_SECTIONS.flatMap((section) =>
  section.topics.map((topic) => ({
    section,
    topic,
    text: `${topic.title} ${guidePlainText(topic.body)} ${topic.keywords || ''} ${section.label}`.toLowerCase(),
  }))
);

/** Interactive examples — labelled as examples, driven only by their own
 *  inputs, and calculated with the same calculations.js functions the
 *  app uses, so the Guide can't drift from real behaviour. */
function renderGuideExample(kind) {
  const num = (id, label, value, attrs = '') =>
    `<label class="guide-example-field"><span>${label}</span><input id="${id}" type="number" inputmode="decimal" value="${value}" ${attrs}></label>`;
  const time = (id, label, value) => `<label class="guide-example-field"><span>${label}</span><input id="${id}" type="time" value="${value}"></label>`;
  const inputs = {
    break: `${time('gx-break-start', 'Start', '09:00')}${time('gx-break-end', 'End', '17:00')}
      <label class="guide-example-field"><span>Break</span><select id="gx-break-mins"><option value="0">None</option><option value="15">15 min</option><option value="30" selected>30 min</option><option value="60">60 min</option></select></label>`,
    hourly: `${num('gx-h-rate', 'Base rate ($/hr)', 30, 'min="0" step="0.01"')}${num('gx-h-weekend', 'Weekend rule (+%)', 0, 'min="0" step="1"')}${num('gx-h-add', 'Additional (+%)', 0, 'min="0" step="1"')}${num('gx-h-hours', 'Working hours', 5, 'min="0" step="0.25"')}`,
    actual: `${num('gx-a-pay', 'Actual payment ($)', 40, 'min="0" step="0.01"')}${num('gx-a-hours', 'Working hours', 3, 'min="0" step="0.25"')}`,
  }[kind];
  if (!inputs) return '';
  return `
    <div class="guide-example" data-guide-example="${kind}">
      <span class="guide-example-label">Try it — example only, nothing is saved</span>
      <div class="guide-example-inputs">${inputs}</div>
      <output class="guide-example-result" id="gx-${kind}-out" aria-live="polite"></output>
    </div>`;
}

function updateGuideExamples() {
  const val = (id) => Number(document.getElementById(id)?.value) || 0;
  const breakOut = document.getElementById('gx-break-out');
  if (breakOut) {
    const gross = calc.minutesFromTimes(document.getElementById('gx-break-start')?.value, document.getElementById('gx-break-end')?.value);
    const brk = val('gx-break-mins');
    breakOut.innerHTML =
      gross === null
        ? 'Enter a start and end time.'
        : gross === 0 || brk >= gross
          ? `A ${calc.formatDuration(brk)} break leaves no working time in a ${calc.formatDuration(gross)} shift — WorkRoaster wouldn't save this.`
          : `Gross <b>${calc.formatDuration(gross)}</b> − break <b>${calc.formatDuration(brk)}</b> = working time <b>${calc.formatDuration(gross - brk)}</b>`;
  }
  const hourlyOut = document.getElementById('gx-hourly-out');
  if (hourlyOut) {
    const { effective } = calc.calculateEffectiveRate({
      baseRate: val('gx-h-rate'),
      weekendRule: { type: 'percent', value: val('gx-h-weekend') },
      additionalRule: { type: 'percent', value: val('gx-h-add') },
    });
    const mins = Math.round(val('gx-h-hours') * 60);
    hourlyOut.innerHTML = `Effective rate <b>${money(effective)}/hr</b> × <b>${calc.formatDuration(mins)}</b> = pay <b>${money(calc.paymentFromHourlyRate(effective, mins))}</b>`;
  }
  const actualOut = document.getElementById('gx-actual-out');
  if (actualOut) {
    const mins = Math.round(val('gx-a-hours') * 60);
    const r = calc.hourlyRate(val('gx-a-pay'), mins);
    actualOut.innerHTML = `<b>${money(val('gx-a-pay'))}</b> ÷ <b>${calc.formatDuration(mins)}</b> = effective rate <b>${r > 0 ? `${money(r)}/hr` : '—'}</b>`;
  }
}

function guideTopicMarkup(topic, headingLevel = 3) {
  return `
    <article class="guide-topic">
      <h${headingLevel} class="guide-topic-title">${esc(topic.title)}</h${headingLevel}>
      <div class="guide-topic-body">${topic.body}</div>
      ${topic.example ? renderGuideExample(topic.example) : ''}
    </article>`;
}

function renderGuideContent() {
  const query = guideQuery.trim().toLowerCase();
  if (query) {
    const words = query.split(/\s+/);
    const hits = GUIDE_INDEX.filter((entry) => words.every((w) => entry.text.includes(w)));
    if (!hits.length) {
      return `<p class="guide-empty">No guide topics match “${esc(guideQuery.trim())}”. Try a simpler word, like <em>break</em>, <em>export</em> or <em>rate</em>.</p>`;
    }
    return `
      <p class="guide-results-count" role="status">${hits.length} topic${hits.length === 1 ? '' : 's'} for “${esc(guideQuery.trim())}”</p>
      ${hits
        .map((hit) => `<p class="guide-result-section">${esc(hit.section.label)}</p>${guideTopicMarkup(hit.topic, 3)}`)
        .join('')}`;
  }
  const section = GUIDE_SECTIONS.find((s) => s.id === guideSection) || GUIDE_SECTIONS[0];
  return `
    <h3 class="guide-section-title" id="guide-section-title">${esc(section.label)}</h3>
    <p class="guide-section-summary">${esc(section.summary)}</p>
    ${section.id === GUIDE_SECTIONS[0].id ? `<p class="guide-intro">${esc(GUIDE_INTRO)}</p>` : ''}
    ${section.topics.map((t) => guideTopicMarkup(t, 4)).join('')}`;
}

function renderGuideModal() {
  if (state.modal !== 'guide') return '';
  const searching = !!guideQuery.trim();
  return `
    <div class="modal-backdrop ${modalEnterClass()}" id="modal-backdrop">
      <div class="modal settings-modal guide-modal ${modalEnterClass()}" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div class="modal-head">
          <h2 id="guide-title">Guide</h2>
          <button class="icon-btn" id="btn-close-modal" aria-label="Close guide">${icon('close', 'icon-sm')}</button>
        </div>
        <div class="modal-body">
          <div class="guide-search">
            <span class="guide-search-icon" aria-hidden="true">${icon('search', 'icon-sm')}</span>
            <input id="guide-search" type="search" placeholder="Search the guide — e.g. break, export, rate" aria-label="Search the guide" value="${esc(guideQuery)}" autocomplete="off">
          </div>
          <div class="settings-layout">
            <div class="settings-rail ${searching ? 'is-searching' : ''}" id="settings-rail" role="tablist" aria-label="Guide sections" aria-orientation="vertical">
              <div class="settings-rail-indicator" id="settings-rail-indicator" aria-hidden="true"></div>
              ${GUIDE_SECTIONS.map((s) => {
                const active = !searching && s.id === guideSection;
                return `<button class="rail-tab ${active ? 'active' : ''}" data-guide-section="${s.id}" id="guide-tab-${s.id}" type="button" role="tab" aria-selected="${active}" aria-controls="guide-content" tabindex="${s.id === guideSection ? '0' : '-1'}">${esc(s.label)}</button>`;
              }).join('')}
            </div>
            <div class="settings-content guide-content" id="guide-content" role="tabpanel" aria-labelledby="guide-tab-${guideSection}" tabindex="0">
              ${renderGuideContent()}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/** Swap just the content pane (never render()) so the search box keeps
 *  focus and nothing else on the page is rebuilt. `animate` replays the
 *  same content-enter animation Settings uses for a category change. */
function refreshGuideContent({ direction = 0 } = {}) {
  const content = document.getElementById('guide-content');
  if (!content) return;
  const searching = !!guideQuery.trim();
  content.innerHTML = renderGuideContent();
  content.setAttribute('aria-labelledby', `guide-tab-${guideSection}`);
  document.getElementById('settings-rail')?.classList.toggle('is-searching', searching);
  document.querySelectorAll('[data-guide-section]').forEach((tab) => {
    const active = !searching && tab.dataset.guideSection === guideSection;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = tab.dataset.guideSection === guideSection ? 0 : -1;
  });
  positionRailIndicator();
  wireGuideContentEvents();
  if (direction) {
    content.scrollTop = 0;
    document.querySelector('.guide-modal')?.scrollTo?.({ top: 0 });
    playSettingsContentEnter(content, direction);
  }
}

function navigateGuideSection(id, { focusTab = false } = {}) {
  const order = GUIDE_SECTIONS.map((s) => s.id);
  const wasSearching = !!guideQuery.trim();
  const direction = Math.sign(order.indexOf(id) - order.indexOf(guideSection)) || 1;
  if (id === guideSection && !wasSearching) return;
  guideSection = id;
  if (wasSearching) {
    guideQuery = '';
    const search = document.getElementById('guide-search');
    if (search) search.value = '';
  }
  refreshGuideContent({ direction });
  if (focusTab) document.getElementById(`guide-tab-${id}`)?.focus();
}

function wireGuideContentEvents() {
  document.querySelectorAll('.guide-example input, .guide-example select').forEach((el) => el.addEventListener('input', updateGuideExamples));
  updateGuideExamples();
}

function wireGuideEvents() {
  if (state.modal !== 'guide') return;
  document.querySelectorAll('[data-guide-section]').forEach((tab) => {
    tab.addEventListener('click', () => navigateGuideSection(tab.dataset.guideSection));
    // Roving tabindex, arrow keys move between sections (tablist pattern).
    tab.addEventListener('keydown', (e) => {
      const order = GUIDE_SECTIONS.map((s) => s.id);
      const i = order.indexOf(tab.dataset.guideSection);
      const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: order.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      navigateGuideSection(order[(next + order.length) % order.length], { focusTab: true });
    });
  });
  document.getElementById('guide-search')?.addEventListener('input', (e) => {
    guideQuery = e.target.value;
    refreshGuideContent();
  });
  wireGuideContentEvents();
}

function renderDataModal() {
  if (state.modal !== 'data') return '';
  return `
    <div class="modal-backdrop ${modalEnterClass()}" id="modal-backdrop">
      <div class="modal ${modalEnterClass()}" role="dialog" aria-modal="true" aria-labelledby="data-title">
        <div class="modal-head">
          <h2 id="data-title">Backup &amp; export</h2>
          <button class="icon-btn" id="btn-close-modal" aria-label="Close">${icon('close', 'icon-sm')}</button>
        </div>
        <div class="modal-body">
          <div class="data-section">
            <h3>${icon('download', 'icon-sm')}Export</h3>
            <p class="panel-hint">${hasProfiles() ? `Save a backup of this profile (${esc(activeProfile().name)}: records, jobs and settings) or of every profile, or a spreadsheet-friendly CSV of this profile's records.` : 'Save a full backup (records + settings), or a spreadsheet-friendly CSV of your records.'}</p>
            <div class="form-actions">
              <button class="btn secondary" id="btn-export-json" type="button">${hasProfiles() ? `Download backup of ${esc(activeProfile().name)}` : 'Download JSON backup'}</button>
              ${hasProfiles() ? '<button class="btn secondary" id="btn-export-all-profiles" type="button">Download all profiles</button>' : ''}
              <button class="btn secondary" id="btn-export-csv" type="button" ${state.records.length ? '' : 'disabled'}>Download CSV</button>
            </div>
          </div>
          <div class="data-section">
            <h3>${icon('restore', 'icon-sm')}Restore</h3>
            <p class="panel-hint">Import a JSON backup. Choose whether to merge it with your current records or replace them entirely.</p>
            <input type="file" id="import-file" accept="application/json" class="visually-hidden" tabindex="-1" aria-hidden="true" aria-label="Backup file to import">
            <div class="form-actions">
              <button class="btn secondary" id="btn-import-merge" type="button">Import &amp; merge</button>
              <button class="btn secondary" id="btn-import-replace" type="button">Import &amp; replace all</button>
            </div>
          </div>
          <div class="data-section danger-zone">
            <h3>${icon('trash', 'icon-sm')}Reset</h3>
            <p class="panel-hint">Permanently erase every record on this device. This cannot be undone — export a backup first.</p>
            <button class="btn danger-outline" id="btn-clear-all" type="button">Clear all records</button>
          </div>
        </div>
      </div>
    </div>`;
}

// -- Export visibility (report exports only) ---------------------------

const EXPORT_VISIBILITY_FIELDS = [
  { key: 'baseSalary', label: 'Base salary', help: 'Monthly or yearly salary amounts of salaried jobs (needs Total amount on too).' },
  { key: 'time', label: 'Time', help: 'Shift start and end times.' },
  { key: 'hours', label: 'Total hours worked', help: 'Each shift’s duration and break, and the hours-worked totals.' },
  { key: 'amount', label: 'Total amount', help: 'Every money figure: pay, hourly rates, subtotals and totals.' },
];

/** The four labelled checkboxes, shared by Settings and the export dialog. */
function exportVisibilityFields(prefix, values) {
  const v = store.normalizeExportVisibility(values);
  return `<div class="export-visibility-list">${EXPORT_VISIBILITY_FIELDS.map(
    (f) => `
        <div class="export-visibility-item">
          <label class="checkbox-field" for="${prefix}-${f.key}">
            <input type="checkbox" id="${prefix}-${f.key}" data-export-visibility="${f.key}" ${v[f.key] ? 'checked' : ''} aria-describedby="${prefix}-${f.key}-help">
            <span>${esc(f.label)}</span>
          </label>
          <small class="field-help" id="${prefix}-${f.key}-help">${esc(f.help)}</small>
        </div>`
  ).join('')}</div>`;
}

const EXPORT_FORMAT_LABEL = { pdf: 'PDF', jpg: 'JPG', xlsx: 'Excel' };

/** Shown before every PDF / JPG / Excel export, so the person can review
 *  (or change, for this file only) what the report will contain. */
function renderExportModal() {
  if (state.modal !== 'export' || !state.exportRequest) return '';
  const req = state.exportRequest;
  const fmt = EXPORT_FORMAT_LABEL[req.format] || req.format.toUpperCase();
  const choices = store.normalizeExportVisibility(req.choices);
  const nothingLeft = !choices.time && !choices.hours && !choices.amount;
  return `
    <div class="modal-backdrop ${modalEnterClass()}" id="modal-backdrop">
      <div class="modal export-modal ${modalEnterClass()}" role="dialog" aria-modal="true" aria-labelledby="export-title" aria-describedby="export-scope">
        <div class="modal-head">
          <h2 id="export-title">Export ${esc(fmt)}</h2>
          <button class="icon-btn" id="btn-close-modal" aria-label="Close">${icon('close', 'icon-sm')}</button>
        </div>
        <div class="modal-body">
          <p class="export-scope" id="export-scope">${esc(req.scopeLabel)}</p>
          <fieldset class="field-group">
            <legend>Include in this file</legend>
            ${exportVisibilityFields('x-export', choices)}
          </fieldset>
          <p class="field-help export-defaults-note">Starts from your defaults in Settings → General → Export. Changes here apply to this ${esc(fmt)} only.</p>
          ${nothingLeft ? '<p class="field-help export-minimal-note" role="status">Only dates, jobs and record details will be included.</p>' : ''}
          <div class="form-actions export-actions">
            <button class="btn primary" id="btn-export-confirm" type="button">${icon('download', 'icon-sm')}Export ${esc(fmt)}</button>
            <button class="btn secondary" id="btn-export-cancel" type="button">Cancel</button>
          </div>
        </div>
      </div>
    </div>`;
}

function openExportOptions(request) {
  state.exportRequest = { ...request, choices: store.normalizeExportVisibility(state.settings.exportVisibility) };
  state.modal = 'export';
  render();
}

async function confirmExport() {
  const req = state.exportRequest;
  if (!req) return;
  const visibility = store.normalizeExportVisibility(req.choices);
  state.modal = null;
  state.exportRequest = null;
  render();
  if (req.kind === 'job') await handleJobExport(req.format, req.cycleKey, req.jobKey, visibility);
  else await handleCycleExport(req.format, req.cycleKey, visibility);
}

function renderToast() {
  if (!state.toast) return '';
  const toastIcon = state.toast.tone === 'error' ? 'close' : 'check';
  return `<div class="toast toast-${state.toast.tone}" role="status">${icon(toastIcon, 'icon-sm')}${esc(state.toast.message)}</div>`;
}

let initialRender = true;
let themeChangeTimer = null;
// Page / profile transitions (presentation only — data is already updated
// before the render that plays them).
let lastRenderedView = null;
let profileSwitchMotion = false;
let parkedFormDraft = null;

function initCanvasMotion() {
  if (window.__workRoasterCanvasMotion) return;
  window.__workRoasterCanvasMotion = true;
  let ticking = false;
  let scrolled = false;
  const update = () => {
    const y = Math.round(window.scrollY * -0.11);
    const x = Math.round(Math.sin(window.scrollY * 0.0018) * 7);
    document.documentElement.style.setProperty('--canvas-shift-y', y + 'px');
    document.documentElement.style.setProperty('--canvas-shift-x', x + 'px');
    // The top bar reacts to scrolling (tint/shadow only — never its height,
    // so nothing below it jumps). Hysteresis stops flicker at the edge.
    const next = scrolled ? window.scrollY > 4 : window.scrollY > 16;
    if (next !== scrolled) {
      scrolled = next;
      document.documentElement.toggleAttribute('data-scrolled', scrolled);
    }
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}

function render() {
  // A full render rebuilds the record form, so no option popover survives it.
  optionPickerOpenId = null;
  // An open time picker is reopened after an unrelated render (a toast
  // expiring) — but only on the same profile and screen, and only if its
  // field is still there; never carried into a switched profile.
  const reopenTimePicker = timePickerOpen && timePickerTargetId
    ? { target: timePickerTargetId, profile: store.getActiveProfileId(), view: state.view, modal: state.modal }
    : null;
  // …nor a time picker: its popover comes back closed and empty, so the
  // open state must not outlive it (otherwise the next click on the clock
  // "closes" an already-closed picker, and a later action targets a field
  // from before the render — e.g. after switching or adding a profile).
  timePickerOpen = false;
  timePickerTargetId = null;
  // …and it shows the latest data, including any change from another tab.
  // The record form only exists on the home page: an unsaved draft is parked
  // while Notes is open and put back on return.
  const formDraft = captureFormDraft() || (state.view === 'home' ? parkedFormDraft : null);
  if (state.view !== 'home' && formDraft) parkedFormDraft = formDraft;
  if (state.view === 'home') parkedFormDraft = null;
  // Text being typed on the Notes page survives renders (a toast expiring).
  const notesDraft = captureNotesDraft();
  const viewChanged = lastRenderedView !== null && lastRenderedView !== state.view;
  const mainMotion = viewChanged ? 'is-view-entering' : profileSwitchMotion ? 'is-profile-entering' : '';
  lastRenderedView = state.view;
  profileSwitchMotion = false;
  formDirty = false;
  externalChangePending = false;
  // The Settings/Guide pane is the modal's scroll container; a full
  // render (saving a job, a toast expiring) rebuilds it, so carry its
  // scroll position over while the same modal stays open.
  const paneScroll = state.modal && state.modal === lastRenderedModal ? document.querySelector('.modal .settings-content')?.scrollTop || 0 : 0;
  modalEntering = !!state.modal && state.modal !== lastRenderedModal;
  const previousModal = lastRenderedModal;
  const focusedId = focusKeyOf(document.activeElement);
  if (state.modal && !previousModal) modalOpenerId = focusedId;
  lastRenderedModal = state.modal;
  applyTheme();
  initCanvasMotion();
  // Computed once and handed to both the graph and the pay-cycle history,
  // so they are guaranteed to see the same cycles and the same keys.
  const cycles = calc.groupByCycle(state.records, state.settings.payCycleLengthDays, state.settings.payCycleAnchor);
  // The calendar follows the record form's date unless the person has
  // navigated it. The template is built while the previous form is still
  // in the DOM, so a following calendar re-reads the date once the new
  // form exists (below).
  const calendarFollowsForm = calendarView === null;
  // A focused cycle whose last record was deleted no longer exists —
  // fall back to following the newest cycle rather than a stale key.
  if (state.focusedCycleKey && !cycles.some((c) => c.key === state.focusedCycleKey)) state.focusedCycleKey = null;
  root.innerHTML = `
    <div class="app-shell ${initialRender ? 'is-entering' : ''}">
      ${renderHeader()}
      <main class="app-main ${mainMotion}" id="main-content">
        ${renderProfileBar()}
        ${state.view === 'notes' ? renderNotesPage() : `
        ${renderStats(cycles)}
        <div class="workspace-grid">
          ${renderForm()}
          <div class="workspace-side">
            ${renderCalendar()}
            ${renderCalculator()}
          </div>
        </div>
        ${renderRecords(cycles)}
        ${renderInsights()}`}
      </main>
    </div>
    ${renderSettingsModal()}
    ${renderDataModal()}
    ${renderExportModal()}
    ${renderGuideModal()}
    ${renderToast()}
  `;
  // The directional nav animation is meant to play exactly once, for the
  // render it was requested for — clearing it here (after the template
  // above already consumed it) means a later, unrelated render (adding a
  // record, say) won't unexpectedly replay the slide-in.
  state.cycleNavDirection = null;
  modalEntering = false;
  if (paneScroll) {
    const pane = document.querySelector('.modal .settings-content');
    if (pane) pane.scrollTop = paneScroll;
  }
  wireEvents();
  if (calendarFollowsForm) calendarView = null;
  refreshCalendar();
  positionRailIndicator(true);
  initialRender = false;
  restoreFormDraft(formDraft);
  restoreNotesDraft(notesDraft);
  restoreFocusAfterRender(previousModal, focusedId);
  if (
    reopenTimePicker &&
    reopenTimePicker.profile === store.getActiveProfileId() &&
    reopenTimePicker.view === state.view &&
    reopenTimePicker.modal === state.modal &&
    document.getElementById(reopenTimePicker.target)
  ) openTimePicker(reopenTimePicker.target);
}

/** Unsaved text in the Notes capture box / the note being edited, with the
 *  caret position, so a render never throws away what's being typed. */
function captureNotesDraft() {
  if (state.view !== 'notes') return null;
  const grab = (el) => (el ? { id: el.id, value: el.value, start: el.selectionStart, end: el.selectionEnd } : null);
  const fields = [grab(document.getElementById('note-new')), grab(document.querySelector('[data-note-edit-form] textarea'))].filter(Boolean);
  return fields.length ? fields : null;
}
function restoreNotesDraft(draft) {
  if (!draft) return;
  for (const f of draft) {
    const el = document.getElementById(f.id);
    // A just-added note clears the capture box on purpose (see addNote).
    if (!el || (f.id === 'note-new' && notesCaptureCleared)) continue;
    el.value = f.value;
    if (f.start !== null) el.setSelectionRange(f.start, f.end);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  notesCaptureCleared = false;
}
let notesCaptureCleared = false;

/** What the person has typed into the record form but not saved yet. */
function captureFormDraft() {
  if (!dirtyFieldIds.size || !document.getElementById('record-form')) return null;
  const values = [];
  for (const id of dirtyFieldIds) {
    const el = document.getElementById(id);
    if (el && el.closest('#record-form')) values.push([id, el.type === 'checkbox' ? el.checked : el.value]);
  }
  return values.length ? { editingId: state.editingId, values } : null;
}

/** Put an unsaved draft back into the freshly rendered form — the job
 *  first (it decides which fields the form shows), then everything else,
 *  firing the usual events so live totals and picker labels follow. */
function restoreFormDraft(draft) {
  if (!draft || draft.editingId !== state.editingId) {
    dirtyFieldIds.clear();
    return;
  }
  const apply = ([id, value]) => {
    const el = document.getElementById(id);
    if (!el || !el.closest('#record-form')) return;
    if (el.type === 'checkbox') el.checked = value;
    else if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === value)) return;
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (el.tagName === 'SELECT' && document.getElementById(`btn-${id}-picker`)) syncOptionPickerLabel(id);
  };
  const job = draft.values.find(([id]) => id === 'f-job');
  if (job) apply(job);
  draft.values.filter(([id]) => id !== 'f-job').forEach(apply);
}

/** The form is being reset on purpose (saved, cancelled, opened for editing). */
function discardFormDraft() {
  dirtyFieldIds.clear();
  formDirty = false;
  parkedFormDraft = null;
}

/** A full render replaces the page's DOM, which would otherwise drop
 *  keyboard focus onto <body>. Put it somewhere sensible instead: into a
 *  dialog that just opened, back onto the button that opened a dialog that
 *  just closed, onto a target an action asked for, or back onto the same
 *  control it was on. */
/** A selector that finds "the same control" again after a full render. */
function focusKeyOf(el) {
  if (!el || el === document.body || !(el instanceof Element)) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.dataset.action && el.dataset.id) return `[data-action="${CSS.escape(el.dataset.action)}"][data-id="${CSS.escape(el.dataset.id)}"]`;
  // e.g. a PDF / JPG / Excel button: identified by its data-* attributes.
  const attrs = [...el.attributes].filter((a) => a.name.startsWith('data-'));
  if (attrs.length) return attrs.map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  return null;
}
const findFocusKey = (key) => (key ? [...document.querySelectorAll(key)].find(isVisible) || null : null);

function restoreFocusAfterRender(previousModal, focusedId) {
  const focus = (el) => { if (el) el.focus({ preventScroll: true }); return !!el && document.activeElement === el; };
  const dialog = document.querySelector('.modal[aria-modal="true"]');
  if (dialog && !previousModal) {
    const target = dialog.querySelector('[role="tab"][aria-selected="true"]') || [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].find(isVisible);
    focus(target);
    return;
  }
  if (!state.modal && previousModal) {
    const opener = findFocusKey(modalOpenerId);
    modalOpenerId = null;
    if (focus(opener)) return;
  }
  if (focusAfterRender) {
    const target = typeof focusAfterRender === 'function' ? focusAfterRender() : focusAfterRender;
    focusAfterRender = null;
    if (focus(target)) return;
  }
  if (focusedId && (document.activeElement === document.body || !document.activeElement)) focus(findFocusKey(focusedId));
}

/** Keep Tab / Shift+Tab inside an open dialog (WCAG 2.4.3 focus order). */
function trapFocusInDialog(e) {
  if (e.key !== 'Tab') return;
  const dialog = document.querySelector('.modal[aria-modal="true"]');
  if (!dialog) return;
  const items = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isVisible);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (!dialog.contains(document.activeElement)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
document.addEventListener('keydown', trapFocusInDialog);

// ---------------------------------------------------------------------
// Live pay calculation (patches one field, no full re-render)
// -----------------------------------------------------------------------
// Bidirectional: which direction runs depends on which input the form is
// currently showing (see payModeForForm/renderForm) — #f-pay editable +
// #f-rate showing the computed hourly rate, or #f-hourly-rate editable +
// #f-rate showing the computed payment. Either way this only updates the
// live preview; nothing is written to the record until submit.
// ---------------------------------------------------------------------

/**
 * The form's current working-minutes value, read straight from whichever
 * Duration inputs are actually rendered — never from state, so this stays
 * correct while the user is still typing. Returns null when there isn't
 * enough information yet to calculate a real duration (Ending-time mode
 * with a missing Starting or Ending time), so callers can show "—"
 * instead of a misleading number.
 */
function currentFormMinutes() {
  const endInput = document.getElementById('f-end');
  if (endInput) {
    const start = document.getElementById('f-start')?.value || '';
    return calc.minutesFromTimes(start, endInput.value);
  }
  const h = document.getElementById('f-hours')?.value || 0;
  const m = document.getElementById('f-minutes')?.value || 0;
  // Out-of-range parts show "—" in the live outputs rather than a
  // silently clamped figure (submit explains what's wrong).
  const mNum = Number(m);
  const hNum = Number(h);
  if (!Number.isInteger(mNum) || mNum < 0 || mNum > 59 || !Number.isFinite(hNum) || hNum < 0) return null;
  return calc.durationMinutes(h, m);
}

/** The Break selector's current value (0/15/30/60), or 0 if the field
 *  isn't on the page for some reason. See docs/data-model.md "Break time". */
function currentFormBreakMinutes() {
  const el = document.getElementById('f-break');
  return el ? Number(el.value) || 0 : 0;
}

/** currentFormMinutes() (the gross span) minus the selected break,
 *  clamped to zero for live-preview purposes only — submitForm() applies
 *  the real validation (break cannot exceed the gross duration) and
 *  blocks saving rather than silently clamping. Returns null exactly
 *  when currentFormMinutes() does (not enough information yet). */
function currentFormNetMinutes() {
  const gross = currentFormMinutes();
  if (gross === null) return null;
  return Math.max(0, gross - currentFormBreakMinutes());
}

/** Live-updates the read-only "Working time" output in Ending-time mode
 *  as Starting/Ending time change. No-op in manual mode, where the
 *  hours/minutes inputs are themselves the value — there's nothing to
 *  compute or patch. This stays the GROSS start→end span (what it's
 *  always shown); the separate "Net paid time" output below shows what's
 *  left after the break. */
function updateDurationOutput() {
  const out = document.getElementById('f-duration-output');
  if (!out) return;
  const mins = currentFormMinutes();
  out.textContent = mins === null ? '—' : calc.formatDuration(mins);
}

/** Live-updates the "Net paid time" output next to the Break selector —
 *  present in both the Ending-time and manual-duration workflows. */
function updateBreakNetOutput() {
  const out = document.getElementById('f-break-net');
  if (!out) return;
  const mins = currentFormNetMinutes();
  out.textContent = mins === null ? '—' : calc.formatDuration(mins);
}

/** Is the record form currently showing the fixed-pay UI? */
function isFixedPayForm() {
  return calc.isFixedPayMode(currentFormPayMode());
}

/**
 * The fixed-pay configuration this form would save with, or null when the
 * form isn't in fixed-pay mode (or no job is selected). A NEW record uses
 * the selected job's current salary + schedule. An EDITED record keeps the
 * snapshot it was saved with (history never changes) — unless it's being
 * moved to a different fixed-pay job, which then brings its own.
 */
function formFixedPayContext() {
  if (!isFixedPayForm()) return null;
  const job = selectedFormJob();
  if (!job) return null;
  const editing = state.editingId ? state.records.find((r) => r.id === state.editingId) : null;
  if (editing && editing.fixedPayAtEntry && editing.jobId === job.id) {
    return { jobId: job.id, mode: editing.fixedPayAtEntry.mode, config: calc.normalizeFixedPay(editing.fixedPayAtEntry) };
  }
  const mode = jobPayMode(job);
  if (!calc.isFixedPayMode(mode)) {
    return editing && editing.fixedPayAtEntry ? { jobId: job.id, mode: editing.fixedPayAtEntry.mode, config: calc.normalizeFixedPay(editing.fixedPayAtEntry) } : null;
  }
  return { jobId: job.id, mode, config: calc.normalizeFixedPay(job.fixedPay) };
}

/** The day's salary share for `dateVal`, and whether THIS record carries
 *  it: not on an unscheduled day, and not when another record for the same
 *  job and date already carries it (split shifts share one day's salary). */
function fixedShareForForm(ctx, dateVal) {
  const day = calc.fixedPayDayShare(ctx.mode, ctx.config, dateVal);
  const alreadyCounted = state.records.some((r) => r.id !== state.editingId && r.jobId === ctx.jobId && r.date === dateVal && r.fixedPayAtEntry && r.fixedPayAtEntry.counted);
  const reason = !day.scheduledDay ? 'unscheduled' : alreadyCounted ? 'already-counted' : 'scheduled';
  return { ...day, counted: reason === 'scheduled', reason };
}

/** Refresh the fixed-pay outputs + explanation panel (scoped DOM patch). */
function updateFixedPayPanel() {
  const shareOut = document.getElementById('f-fixed-share');
  const panel = document.getElementById('fixed-pay-panel');
  if (!shareOut && !panel) return;
  const ctx = formFixedPayContext();
  const dateVal = document.getElementById('f-date')?.value;
  const rateOut = document.getElementById('f-rate');
  if (!ctx || !dateVal) {
    if (shareOut) shareOut.textContent = '—';
    if (rateOut) rateOut.textContent = '—';
    if (panel) panel.innerHTML = ctx ? '' : '<p class="fixed-pay-note">Choose the salaried job this record belongs to.</p>';
    return;
  }
  const fx = fixedShareForForm(ctx, dateVal);
  const carried = fx.counted ? fx.share : 0;
  const minsRaw = currentFormNetMinutes();
  const mins = minsRaw === null ? 0 : minsRaw;
  const dayRate = calc.hourlyRate(carried, mins);
  if (shareOut) shareOut.textContent = money(carried);
  if (rateOut) rateOut.textContent = dayRate > 0 ? `${money(dayRate)}/hr` : '—';
  if (!panel) return;
  const weekday = new Date(`${dateVal}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
  const status = {
    scheduled: `${weekday} is one of this job's working days — this record carries ${money(fx.share)}.`,
    unscheduled: `${weekday} isn't one of this job's working days — your salary doesn't change, so this record carries ${money(0)}. Its hours are still tracked.`,
    'already-counted': `This day's share is already on another record for this job — this one carries ${money(0)}, and its hours still count.`,
  }[fx.reason];
  // Month-to-date for this job (other saved records + this form), purely
  // analytical: salary shares ÷ tracked hours.
  const monthKey = dateVal.slice(0, 7);
  const others = state.records.filter((r) => r.id !== state.editingId && r.jobId === ctx.jobId && (r.date || '').slice(0, 7) === monthKey);
  const monthMins = calc.totalMinutes(others) + mins;
  const monthPay = calc.totalPay(others) + carried;
  const monthRate = calc.hourlyRate(monthPay, monthMins);
  const monthName = new Date(`${monthKey}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long' });
  panel.innerHTML = `
    <p class="fixed-pay-formula">${esc(fixedPayAmountLabel(ctx.mode, ctx.config))} ÷ ${fx.scheduledDays} scheduled working day${fx.scheduledDays === 1 ? '' : 's'} in ${esc(fx.periodLabel)} = <b>${money(fx.share)}</b> ${fx.scheduledDay ? 'for this date' : 'a day'}${fx.scheduledDay && fx.share !== fx.averageShare ? ` <span class="fixed-pay-note">(leftover cents are spread across the first days so ${esc(fx.periodLabel)} adds up to exactly ${money(ctx.config.amount)})</span>` : ''}</p>
    <p class="fixed-pay-status is-${fx.reason}">${esc(status)}</p>
    <p class="fixed-pay-month">${esc(monthName)} so far for this job: <b>${esc(calc.formatDuration(monthMins))}</b> tracked · <b>${money(monthPay)}</b> in salary shares${monthRate > 0 ? ` → <b>${money(monthRate)}/hr</b> effective (analytical)` : ''}.</p>`;
}

/** New record + fixed-pay job selected: start from the job's standard
 *  schedule so the user doesn't retype it. Every field stays editable —
 *  a longer or shorter day is simply changed on this record. Editing an
 *  existing record never overwrites what it already has. */
function applyFixedScheduleToForm(job) {
  if (state.editingId || !job || !calc.isFixedPayMode(jobPayMode(job))) return;
  const fp = calc.normalizeFixedPay(job.fixedPay);
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  setValue('f-start', fp.start);
  if (document.getElementById('f-end')) {
    setValue('f-end', fp.end);
  } else {
    // Manual mode takes the GROSS span (break is subtracted on save).
    const gross = calc.minutesFromTimes(fp.start, fp.end) || 0;
    setValue('f-hours', String(Math.floor(gross / 60)));
    setValue('f-minutes', String(gross % 60));
  }
  const breakSelect = document.getElementById('f-break');
  if (breakSelect && [...breakSelect.options].some((o) => Number(o.value) === fp.breakMinutes)) setValue('f-break', String(fp.breakMinutes));
}

function updateLiveRate() {
  updateDurationOutput();
  updateBreakNetOutput();
  const minsRaw = currentFormNetMinutes();
  const mins = minsRaw === null ? 0 : minsRaw;
  const out = document.getElementById('f-rate');
  if (!out) return;

  if (isFixedPayForm()) {
    updateFixedPayPanel();
    return;
  }

  const hourlyInput = document.getElementById('f-hourly-rate');
  if (hourlyInput) {
    // Hourly-rate mode: rate is the input, payment is computed — from the
    // NET (post-break) minutes, same as every other payment calculation.
    const hourlyRateValue = Number(hourlyInput.value || 0);
    out.textContent = mins > 0 ? money(calc.paymentFromHourlyRate(hourlyRateValue, mins)) : money(0);
    return;
  }

  // Payment mode (default/original behaviour): payment is the input,
  // hourly rate is computed from the NET (post-break) minutes.
  const pay = Number(document.getElementById('f-pay')?.value || 0);
  out.textContent = pay > 0 && mins > 0 ? rate(pay, mins) : '—';
}

/** Live-updates the read-only "Pay cycle" preview in the form as the
 *  date field changes, using the same pure calculation the rest of the
 *  app uses — nothing is written to the record until it's submitted. */
function updateCyclePreview() {
  const dateVal = document.getElementById('f-date')?.value;
  const out = document.getElementById('f-cycle-preview');
  if (!out) return;
  const cyc = dateVal ? calc.getCycleForDate(dateVal, state.settings.payCycleLengthDays, state.settings.payCycleAnchor) : null;
  out.textContent = cyc ? cyc.cycleLabel : '—';
}

// ---------------------------------------------------------------------
// Job-aware live calculation — Rate panel, expected-vs-actual comparison,
// and the Pay fieldset's job-driven output. Every update here is a
// scoped DOM patch, exactly like updateLiveRate() above: selecting a job,
// changing the date, or picking a weekend override must NEVER call the
// full render(), or every other field the user is mid-typing (notes,
// map number, manual duration…) would be reset to its last-saved value.
// ---------------------------------------------------------------------

// Keeps the themed job-picker trigger button's visible label in sync
// with the real (now hidden) #f-job select — called whenever that
// select's value changes, whether via selectJobOption() below or (in
// principle) any other future path that dispatches a real change event.
function syncJobSelectTriggerLabel() {
  const select = document.getElementById('f-job');
  const trigger = document.getElementById('btn-job-picker');
  if (!select || !trigger) return;
  const opt = select.options[select.selectedIndex];
  trigger.textContent = opt ? opt.textContent : 'No job (manual entry)';
}

function updateJobAwareCalc() {
  const job = selectedFormJob();
  const breakdown = currentFormBreakdown(job);

  const rateFieldset = document.getElementById('rate-fieldset');
  if (rateFieldset) rateFieldset.classList.toggle('is-hidden', !job || isFixedPayForm());

  const subtitle = document.getElementById('f-job-subtitle');
  if (subtitle) subtitle.textContent = jobSubtitle(job);

  const panelRoot = document.getElementById('rate-panel-root');
  if (panelRoot) panelRoot.innerHTML = renderRatePanelBody(job, breakdown, currentFormPayMode());

  document.querySelectorAll('.job-pay-manual-field').forEach((el) => el.classList.toggle('is-hidden', !!job));
  const fromJob = document.getElementById('job-pay-fromjob');
  if (fromJob) {
    fromJob.classList.toggle('is-hidden', !job);
    const out = document.getElementById('f-job-calculated-pay');
    if (out) out.textContent = breakdown ? money(breakdown.payment) : '—';
  }

  const comparisonRoot = document.getElementById('pay-panel-root');
  if (comparisonRoot) comparisonRoot.innerHTML = job ? renderPayComparison(breakdown) : '';
}

function wireOverrideControls() {
  document.querySelectorAll('.override-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      formOverrideMode = chip.dataset.overrideMode;
      document.querySelectorAll('.override-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
      const customFields = document.getElementById('override-custom-fields');
      if (customFields) customFields.style.display = formOverrideMode === 'custom' ? '' : 'none';
      updateJobAwareCalc();
    });
  });
  document.getElementById('f-override-type')?.addEventListener('change', (e) => {
    formOverrideRule = calc.normalizeRule({ type: e.target.value, value: formOverrideRule.value });
    updateJobAwareCalc();
  });
  document.getElementById('f-override-value')?.addEventListener('input', (e) => {
    formOverrideRule = calc.normalizeRule({ type: formOverrideRule.type, value: Number(e.target.value) || 0 });
    updateJobAwareCalc();
  });
}

// ---------------------------------------------------------------------
// Calendar date-picker popover — a self-contained component that patches
// its own placeholder div (#date-picker-root's content lives inline in
// the form, see renderForm's #date-picker-body) and is opened/closed
// purely via classList, never via render(). See the module-level
// datePickerOpen/datePickerNavYear/datePickerNavMonth declaration.
// ---------------------------------------------------------------------

function renderDatePickerBody() {
  const selected = document.getElementById('f-date')?.value || '';
  const base = selected || calc.todayString();
  if (datePickerNavYear === null || datePickerNavMonth === null) {
    const [y, m] = base.split('-').map(Number);
    datePickerNavYear = y;
    datePickerNavMonth = m - 1;
  }
  const year = datePickerNavYear;
  const month = datePickerNavMonth;
  const workDays = new Set(state.records.filter((r) => r.date).map((r) => r.date));
  const workDayStats = new Map([...workDays].map((d) => [d, { count: 1, minutes: 1 }]));
  const cells = buildMonthGrid(year, month, workDayStats);
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return `
    <div class="date-picker-head">
      <span class="date-picker-month">${esc(monthLabel)}</span>
      <div class="date-picker-nav">
        <button type="button" class="date-picker-nav-btn" data-dp-nav="prev" aria-label="Previous month">${icon('arrowLeft', 'icon-sm')}</button>
        <button type="button" class="date-picker-nav-btn" data-dp-nav="next" aria-label="Next month">${icon('arrowRight', 'icon-sm')}</button>
      </div>
    </div>
    <div class="date-picker-weekdays">${CALENDAR_WEEKDAY_LABELS.map((d) => `<span>${esc(d[0])}</span>`).join('')}</div>
    <div class="date-picker-grid">
      ${cells
        .map((c) => {
          const dow = new Date(c.dateStr + 'T00:00:00').getDay();
          const isWeekend = dow === 0 || dow === 6;
          const cls = [
            'date-picker-day',
            c.inMonth ? '' : 'is-outside',
            c.isToday ? 'is-today' : '',
            c.count > 0 ? 'has-work' : '',
            isWeekend ? 'is-weekend' : '',
            c.dateStr === selected ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<button type="button" class="${cls}" data-dp-date="${c.dateStr}" aria-label="${esc(calc.shortDateLabel(c.dateStr))}${c.count > 0 ? ', has a work record' : ''}">${c.dayNum}</button>`;
        })
        .join('')}
    </div>
    <div class="date-picker-foot">
      <button type="button" data-dp-action="today">Today</button>
      <button type="button" class="date-picker-clear" data-dp-action="clear">Clear</button>
    </div>`;
}

function wireDatePickerBodyEvents() {
  document.querySelectorAll('[data-dp-date]').forEach((btn) => btn.addEventListener('click', () => selectDatePickerDate(btn.dataset.dpDate)));
  document.querySelector('[data-dp-nav="prev"]')?.addEventListener('click', () => navDatePicker(-1));
  document.querySelector('[data-dp-nav="next"]')?.addEventListener('click', () => navDatePicker(1));
  document.querySelector('[data-dp-action="today"]')?.addEventListener('click', () => selectDatePickerDate(calc.todayString()));
  document.querySelector('[data-dp-action="clear"]')?.addEventListener('click', () => {
    const input = document.getElementById('f-date');
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closeDatePicker();
  });
}

function refreshDatePickerBody() {
  const body = document.getElementById('date-picker-body');
  if (!body) return;
  body.innerHTML = renderDatePickerBody();
  wireDatePickerBodyEvents();
}

function navDatePicker(delta) {
  let m = (datePickerNavMonth ?? 0) + delta;
  let y = datePickerNavYear ?? new Date().getFullYear();
  if (m < 0) {
    m = 11;
    y -= 1;
  } else if (m > 11) {
    m = 0;
    y += 1;
  }
  datePickerNavMonth = m;
  datePickerNavYear = y;
  refreshDatePickerBody();
}

function selectDatePickerDate(dateStr) {
  const input = document.getElementById('f-date');
  if (input) {
    input.value = dateStr;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeDatePicker();
}

function openDatePicker() {
  datePickerNavYear = null;
  datePickerNavMonth = null;
  refreshDatePickerBody();
  document.getElementById('date-picker-popover')?.classList.add('is-open');
  document.getElementById('btn-date-picker')?.setAttribute('aria-expanded', 'true');
  datePickerOpen = true;
}

function closeDatePicker() {
  document.getElementById('date-picker-popover')?.classList.remove('is-open');
  document.getElementById('btn-date-picker')?.setAttribute('aria-expanded', 'false');
  datePickerOpen = false;
}

function toggleDatePicker() {
  if (datePickerOpen) closeDatePicker();
  else openDatePicker();
}

// ---------------------------------------------------------------------
// Job listbox popover — same approach as the calendar above: the real
// <select id="f-job"> (now visually hidden, see renderForm) stays the
// authoritative value/event source. This reads its <option>s directly
// off the DOM rather than re-deriving the job list from `state`, so it
// can never drift out of sync with what renderForm() actually put in
// the select.
// ---------------------------------------------------------------------

function renderJobPickerBody() {
  const select = document.getElementById('f-job');
  if (!select) return '';
  const options = [...select.options];
  if (jobPickerActiveIndex < 0 || jobPickerActiveIndex >= options.length) {
    jobPickerActiveIndex = select.selectedIndex >= 0 ? select.selectedIndex : 0;
  }
  return options
    .map((opt, i) => {
      const cls = [
        'job-picker-option',
        opt.selected ? 'is-selected' : '',
        opt.dataset.archived ? 'is-archived' : '',
        i === jobPickerActiveIndex ? 'is-active' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<button type="button" class="${cls}" role="option" aria-selected="${opt.selected}" data-jp-index="${i}" data-jp-value="${esc(opt.value)}">${esc(opt.textContent)}</button>`;
    })
    .join('');
}

function wireJobPickerBodyEvents() {
  document.querySelectorAll('[data-jp-value]').forEach((btn) => {
    btn.addEventListener('click', () => selectJobOption(btn.dataset.jpValue));
    btn.addEventListener('mouseenter', () => {
      jobPickerActiveIndex = Number(btn.dataset.jpIndex);
      document.querySelectorAll('.job-picker-option').forEach((el) => el.classList.toggle('is-active', el === btn));
    });
  });
}

function refreshJobPickerBody() {
  const body = document.getElementById('job-picker-body');
  if (!body) return;
  body.innerHTML = renderJobPickerBody();
  wireJobPickerBodyEvents();
  body.querySelector('.job-picker-option.is-active')?.scrollIntoView({ block: 'nearest' });
}

function selectJobOption(value) {
  const select = document.getElementById('f-job');
  if (select) {
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeJobPicker();
  document.getElementById('btn-job-picker')?.focus();
}

function openJobPicker() {
  const select = document.getElementById('f-job');
  jobPickerActiveIndex = select ? select.selectedIndex : -1;
  refreshJobPickerBody();
  document.getElementById('job-picker-popover')?.classList.add('is-open');
  document.getElementById('btn-job-picker')?.setAttribute('aria-expanded', 'true');
  jobPickerOpen = true;
}

function closeJobPicker() {
  document.getElementById('job-picker-popover')?.classList.remove('is-open');
  document.getElementById('btn-job-picker')?.setAttribute('aria-expanded', 'false');
  jobPickerOpen = false;
}

function toggleJobPicker() {
  if (jobPickerOpen) closeJobPicker();
  else openJobPicker();
}

function moveJobPickerActive(delta) {
  const select = document.getElementById('f-job');
  if (!select) return;
  const max = select.options.length - 1;
  const base = jobPickerActiveIndex < 0 ? select.selectedIndex : jobPickerActiveIndex;
  jobPickerActiveIndex = Math.min(max, Math.max(0, base + delta));
  refreshJobPickerBody();
}

function commitJobPickerActive() {
  const select = document.getElementById('f-job');
  if (!select || jobPickerActiveIndex < 0) return;
  const opt = select.options[jobPickerActiveIndex];
  if (opt) selectJobOption(opt.value);
}

// ---------------------------------------------------------------------
// Time picker popover — one implementation shared by every time input
// (#f-start, #f-end, #s-default-start). The input itself stays real and
// directly typable (its native picker icon is hidden purely via CSS,
// see input[type="time"]::-webkit-calendar-picker-indicator in
// styles.css); this popover is just an alternative themed way to set
// the same value, and every selection is committed immediately (no
// separate "apply" step) by writing to the input and dispatching real
// input/change events, exactly like the date and job pickers above.
// ---------------------------------------------------------------------

function hhmmTo12h(hhmm) {
  // A blank #f-end (the common case for a brand-new record before the
  // user has set an end time) splits to ['' ] → m is `undefined`, and
  // Number.isNaN(undefined) is false (undefined isn't the NaN value) —
  // so a naive NaN check here doesn't actually catch it. Match the exact
  // HH:mm shape instead so anything else (blank, partial, malformed)
  // reliably falls through to the picker's own {12, 0, AM} default
  // rather than silently committing an "HH:undefined" value that the
  // browser then rejects.
  const match = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: m, period };
}

function to24hHHMM(hour12, minute, period) {
  let h = hour12 % 12;
  if (period === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timePickerPopoverId() {
  return `${timePickerTargetId}-time-popover`;
}
function timePickerBodyId() {
  return `${timePickerTargetId}-time-body`;
}
function timePickerTriggerId() {
  return `btn-${timePickerTargetId}-time`;
}

function renderTimePickerBody() {
  const input = document.getElementById(timePickerTargetId);
  const current = hhmmTo12h(input?.value) || { hour12: 12, minute: 0, period: 'AM' };
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  // Always include the exact current minute even if it isn't on a 5-minute
  // mark, so a value typed directly into the input (or loaded from a
  // saved record) is still visible and correctly highlighted here.
  const minutes = [...new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, current.minute])].sort((a, b) => a - b);
  const periods = ['AM', 'PM'];

  const buildCol = (part, items, format, selectedValue) =>
    `<div class="time-picker-col" data-tp-col="${part}">${items
      .map(
        (v) =>
          `<button type="button" class="time-picker-option${v === selectedValue ? ' is-selected' : ''}" data-tp-part="${part}" data-tp-value="${v}">${format(v)}</button>`
      )
      .join('')}</div>`;

  return `
    <div class="time-picker-columns">
      ${buildCol('hour', hours, (v) => String(v), current.hour12)}
      ${buildCol('minute', minutes, (v) => String(v).padStart(2, '0'), current.minute)}
      ${buildCol('period', periods, (v) => v, current.period)}
    </div>
    <div class="time-picker-foot">
      <button type="button" data-tp-action="now">Now</button>
      <button type="button" data-tp-action="done">Done</button>
    </div>`;
}

function setTimePickerValue(hhmm) {
  const input = document.getElementById(timePickerTargetId);
  if (!input) return;
  input.value = hhmm;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function commitTimePickerPart(part, value) {
  const input = document.getElementById(timePickerTargetId);
  const current = hhmmTo12h(input?.value) || { hour12: 12, minute: 0, period: 'AM' };
  const next = { ...current, [part === 'hour' ? 'hour12' : part]: value };
  setTimePickerValue(to24hHHMM(next.hour12, next.minute, next.period));
  refreshTimePickerBody();
}

// Wire only the OPEN picker's own buttons. A page-wide querySelector here
// used to find the first "Done" in the document — the Start picker's, once
// it had been used — so the End picker's Done did nothing and its popover
// stayed open (seen after adding a profile and switching to end times).
function wireTimePickerBodyEvents(body) {
  if (!body) return;
  body.querySelectorAll('[data-tp-part]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const part = btn.dataset.tpPart;
      const value = part === 'period' ? btn.dataset.tpValue : Number(btn.dataset.tpValue);
      commitTimePickerPart(part, value);
    });
  });
  body.querySelector('[data-tp-action="now"]')?.addEventListener('click', () => {
    const now = new Date();
    setTimePickerValue(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    refreshTimePickerBody();
  });
  body.querySelector('[data-tp-action="done"]')?.addEventListener('click', () => closeTimePicker({ returnFocus: true }));
}

function refreshTimePickerBody() {
  const body = document.getElementById(timePickerBodyId());
  if (!body) return;
  body.innerHTML = renderTimePickerBody();
  wireTimePickerBodyEvents(body);
  body.querySelectorAll('.time-picker-option.is-selected').forEach((el) => el.scrollIntoView({ block: 'nearest' }));
}

function openTimePicker(targetId) {
  if (timePickerOpen && timePickerTargetId !== targetId) closeTimePicker();
  timePickerTargetId = targetId;
  refreshTimePickerBody();
  document.getElementById(timePickerPopoverId())?.classList.add('is-open');
  document.getElementById(timePickerTriggerId())?.setAttribute('aria-expanded', 'true');
  timePickerOpen = true;
}

function closeTimePicker({ returnFocus = false } = {}) {
  if (!timePickerOpen || !timePickerTargetId) {
    timePickerOpen = false;
    timePickerTargetId = null;
    return;
  }
  const trigger = document.getElementById(timePickerTriggerId());
  document.getElementById(timePickerPopoverId())?.classList.remove('is-open');
  trigger?.setAttribute('aria-expanded', 'false');
  // Empty the closed picker so no stale buttons are left in the page.
  const body = document.getElementById(timePickerBodyId());
  if (body) body.innerHTML = '';
  timePickerOpen = false;
  timePickerTargetId = null;
  if (returnFocus) trigger?.focus();
}

function toggleTimePicker(targetId) {
  if (timePickerOpen && timePickerTargetId === targetId) closeTimePicker();
  else openTimePicker(targetId);
}

// Registered once at module init (see the bottom of this file), never
// inside render()/wireEvents() — a document-level listener re-added on
// every render would pile up duplicates, since nothing ever removes the
// previous one. Reading elements by id at event time means these keep
// working correctly across every render/patch without needing to be
// re-wired themselves. Covers all three custom popovers (date, job,
// time) so there is exactly one click-outside and one Escape listener
// for the whole app, never one per popover instance.
function initPickerGlobalListeners() {
  document.addEventListener('click', (e) => {
    if (!datePickerOpen && !jobPickerOpen && !timePickerOpen && !optionPickerOpenId) return;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];

    if (datePickerOpen) {
      const popover = document.getElementById('date-picker-popover');
      const trigger = document.getElementById('btn-date-picker');
      // Use composedPath() rather than e.target/.contains(): a click on a
      // month-nav button replaces #date-picker-body's innerHTML
      // synchronously (see navDatePicker), which detaches the clicked
      // button from the document before this bubbled listener runs. At
      // that point popover.contains(e.target) would wrongly return false
      // (the target no longer has ANY parent) and close the popover right
      // after navigating. composedPath() is captured at dispatch time and
      // stays correct regardless of DOM mutation that happens in between.
      if (popover && !path.includes(popover) && !(trigger && path.includes(trigger))) closeDatePicker();
    }
    if (jobPickerOpen) {
      const popover = document.getElementById('job-picker-popover');
      const trigger = document.getElementById('btn-job-picker');
      if (popover && !path.includes(popover) && !(trigger && path.includes(trigger))) closeJobPicker();
    }
    if (timePickerOpen) {
      const popover = document.getElementById(timePickerPopoverId());
      const trigger = document.getElementById(timePickerTriggerId());
      if (popover && !path.includes(popover) && !(trigger && path.includes(trigger))) closeTimePicker();
    }
    if (optionPickerOpenId) {
      const popover = document.getElementById(`${optionPickerOpenId}-picker-popover`);
      const trigger = document.getElementById(`btn-${optionPickerOpenId}-picker`);
      if (popover && !path.includes(popover) && !(trigger && path.includes(trigger))) closeOptionPicker();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (datePickerOpen) closeDatePicker();
    if (jobPickerOpen) closeJobPicker();
    if (timePickerOpen) closeTimePicker();
    if (optionPickerOpenId) closeOptionPicker();
  });
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

/** Show a validation message in place (no render()), so everything the
 *  user typed stays exactly as they entered it. */
function showFormFieldError(message, focusId) {
  state.formError = message;
  const errorEl = document.getElementById('form-error');
  if (errorEl) errorEl.textContent = message;
  if (focusId) (document.getElementById(`btn-${focusId}-picker`) || document.getElementById(focusId))?.focus();
}

function rateConfirmationQuestions(job, dateVal, dayType, paymentType) {
  if (!job) return [];
  const existing = state.editingId ? state.records.find((record) => record.id === state.editingId) : null;
  const contextChanged =
    !existing ||
    existing.date !== dateVal ||
    (existing.jobId || '') !== job.id ||
    (existing.dayType || '') !== dayType ||
    (existing.paymentType || '') !== paymentType;
  if (!contextChanged) return [];

  const questions = [];
  const weekend = calc.dateRuleKind(dateVal);
  const weekendRule = weekend === 'weekday' ? null : calc.normalizeRule(job[`${weekend}Rule`]);
  if (weekendRule && weekendRule.type !== 'none' && formOverrideMode === 'default') {
    const dayLabel = weekend === 'saturday' ? 'Saturday' : 'Sunday';
    questions.push({
      kind: 'weekend',
      title: `${dayLabel} rate`,
      icon: 'sun',
      description: `Apply this job’s configured ${dayLabel.toLowerCase()} rate to the shift?`,
      rateLabel: calc.formatRuleLabel(weekendRule, state.settings.currency),
      applyLabel: `Apply ${calc.formatRuleLabel(weekendRule, state.settings.currency)}`,
      skipLabel: 'Use base rate',
    });
  }

  const overtime = /overtime/i.test(paymentType);
  const publicHoliday = /public\s*holiday/i.test(dayType) || /public\s*holiday/i.test(paymentType);
  const additionalRule = calc.normalizeRule(job.additionalRule);
  if ((overtime || publicHoliday) && additionalRule.type !== 'none' && formAdditionalOverrideMode === 'default') {
    const triggerLabel = overtime && publicHoliday ? 'Overtime and public holiday' : overtime ? 'Overtime' : 'Public holiday';
    questions.push({
      kind: 'additional',
      title: `${triggerLabel} loading`,
      icon: 'clock',
      description: `Apply this job’s additional loading to this ${triggerLabel.toLowerCase()} shift?`,
      rateLabel: calc.formatRuleLabel(additionalRule, state.settings.currency),
      applyLabel: `Apply ${calc.formatRuleLabel(additionalRule, state.settings.currency)}`,
      skipLabel: 'No extra loading',
    });
  }
  return questions;
}

function showRateConfirmation(job, questions) {
  if (rateConfirmationDialog || !questions.length) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'rate-confirmation-dialog';
  dialog.setAttribute('aria-labelledby', 'rate-confirmation-title');
  dialog.innerHTML = `
    <div class="rate-confirmation-head">
      <span class="rate-confirmation-mark" aria-hidden="true">${icon('clock')}</span>
      <div>
        <p class="rate-confirmation-eyebrow">Rate check</p>
        <h2 id="rate-confirmation-title">Confirm shift rates</h2>
        <p class="rate-confirmation-job">${esc(job.name)} · ${esc(calc.shortDateLabel(document.getElementById('f-date')?.value))}</p>
      </div>
    </div>
    <div class="rate-confirmation-questions">
      ${questions.map((question) => `
        <section class="rate-confirmation-question" data-rate-question="${question.kind}">
          <h3>${icon(question.icon, 'icon-sm')}${esc(question.title)}</h3>
          <p>${esc(question.description)} <span class="rate-confirmation-rule">${esc(question.rateLabel)}</span></p>
          <div class="rate-confirmation-options" role="group" aria-label="${esc(question.title)}">
            <button type="button" class="rate-choice" data-rate-answer="apply" aria-pressed="false">${esc(question.applyLabel)}</button>
            <button type="button" class="rate-choice" data-rate-answer="skip" aria-pressed="false">${esc(question.skipLabel)}</button>
          </div>
        </section>`).join('')}
    </div>
    <div class="rate-confirmation-actions">
      <button type="button" class="btn secondary" data-rate-action="cancel">Keep editing</button>
      <button type="button" class="btn primary" data-rate-action="continue" disabled>Save record</button>
    </div>`;
  document.body.append(dialog);
  rateConfirmationDialog = dialog;

  const continueButton = dialog.querySelector('[data-rate-action="continue"]');
  dialog.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-rate-answer]');
    if (choice) {
      const group = choice.closest('[data-rate-question]');
      group.querySelectorAll('[data-rate-answer]').forEach((button) => {
        const selected = button === choice;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('is-selected', selected);
      });
      continueButton.disabled = [...dialog.querySelectorAll('[data-rate-question]')].some(
        (question) => !question.querySelector('[data-rate-answer][aria-pressed="true"]')
      );
      return;
    }

    const action = event.target.closest('[data-rate-action]')?.dataset.rateAction;
    if (action === 'cancel') dialog.close();
    if (action === 'continue' && !continueButton.disabled) {
      dialog.querySelectorAll('[data-rate-question]').forEach((question) => {
        const answer = question.querySelector('[data-rate-answer][aria-pressed="true"]')?.dataset.rateAnswer;
        if (question.dataset.rateQuestion === 'weekend') formOverrideMode = answer === 'skip' ? 'none' : 'default';
        if (question.dataset.rateQuestion === 'additional') formAdditionalOverrideMode = answer === 'skip' ? 'none' : 'default';
      });
      dialog.close();
      document.querySelectorAll('.override-chip').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.overrideMode === formOverrideMode);
      });
      updateJobAwareCalc();
      submitForm(new Event('submit'), true);
    }
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (rateConfirmationDialog === dialog) rateConfirmationDialog = null;
  });
  dialog.addEventListener('cancel', () => {
    dialog.remove();
    if (rateConfirmationDialog === dialog) rateConfirmationDialog = null;
  });
  dialog.showModal();
  dialog.querySelector('[data-rate-answer]')?.focus();
}

function submitForm(event, ratesConfirmed = false) {
  event.preventDefault();
  const dateVal = document.getElementById('f-date').value;
  const startVal = document.getElementById('f-start').value;

  // Which Duration inputs the form actually rendered decides how
  // `workingMinutes` (and the optional `end`) are derived — see
  // durationModeForForm(). Reading the DOM here (rather than re-checking
  // settings.calculateDurationFromEndTime) keeps this correct even when
  // editing a record whose own mode differs from the current global
  // setting: whichever fields were actually shown are authoritative.
  const endInput = document.getElementById('f-end');
  const usingEndTime = !!endInput;

  let workingMinutes;
  let hoursInput = '';
  let minutesInput = '';
  if (usingEndTime) {
    workingMinutes = calc.minutesFromTimes(startVal, endInput.value);
  } else {
    hoursInput = document.getElementById('f-hours').value;
    minutesInput = document.getElementById('f-minutes').value;
    // Validate the typed parts before combining them: calc.durationMinutes
    // clamps minutes to 0–59, so 1h 75m would otherwise silently save as
    // 1h 59m. The user is told instead — their input is never altered.
    const minutesNum = Number(minutesInput);
    const hoursNum = Number(hoursInput);
    if (minutesInput !== '' && (!Number.isInteger(minutesNum) || minutesNum < 0 || minutesNum > 59)) {
      showFormFieldError('Minutes must be a whole number between 0 and 59.', 'f-minutes');
      return;
    }
    if (hoursInput !== '' && (!Number.isFinite(hoursNum) || hoursNum < 0)) {
      showFormFieldError('Hours can’t be negative.', 'f-hours');
      return;
    }
    workingMinutes = hoursInput === '' || minutesInput === '' ? null : calc.durationMinutes(hoursInput, minutesInput);
  }
  // `workingMinutes` above is still the GROSS span at this point — the
  // Break selector is deducted from it further down, once it's confirmed
  // to be a valid, non-negative gross duration. See docs/data-model.md
  // "Break time". Reading it fresh from the DOM (like every other field
  // here) rather than from state keeps this correct while the user is
  // still interacting with the form.
  const breakMinutes = currentFormBreakMinutes();

  if (!dateVal || !startVal) {
    state.formError = 'Date and starting time are required.';
    render();
    return;
  }
  if (usingEndTime && workingMinutes === null) {
    state.formError = 'Starting time and ending time are both required to calculate working time.';
    render();
    return;
  }
  if (!usingEndTime && (workingMinutes === null || workingMinutes < 0)) {
    state.formError = 'Date, starting time, hours and minutes are required.';
    render();
    return;
  }
  // A record must describe real work: no zero-length shifts. In end-time
  // mode an end EARLIER than the start is a valid overnight shift
  // (minutesFromTimes adds a day), so only an identical start and end
  // reaches 0 here.
  if (workingMinutes === 0) {
    showFormFieldError(
      usingEndTime ? 'Start and end times are the same — enter when the shift actually ended.' : 'Working time must be more than 0 minutes.',
      usingEndTime ? 'f-end' : 'f-hours'
    );
    return;
  }
  // The break must leave some paid time: equal to the shift is rejected too.
  if (breakMinutes >= workingMinutes) {
    showFormFieldError('The break must be shorter than the shift — there would be no working time left.', 'f-break');
    return;
  }
  // Actual-payment mode: the typed amount IS the record's pay, so it must
  // be a real, non-negative number — never silently saved as $0 from a
  // blank or invalid entry. Shown in place (no render()) so everything
  // else the user typed stays put.
  const payInput = document.getElementById('f-pay');
  if (payInput) {
    const raw = payInput.value.trim();
    const amount = Number(raw);
    if (raw === '' || !Number.isFinite(amount) || amount < 0) {
      state.formError = 'Enter the actual payment you received (0 or more).';
      const errorEl = document.getElementById('form-error');
      if (errorEl) errorEl.textContent = state.formError;
      payInput.focus();
      return;
    }
  }
  // Fixed pay is a job's salary — it can't be saved without that job.
  const fixedCtx = formFixedPayContext();
  if (isFixedPayForm() && !fixedCtx) {
    state.formError = 'Choose the salaried job this record belongs to.';
    const errorEl = document.getElementById('form-error');
    if (errorEl) errorEl.textContent = state.formError;
    document.getElementById('btn-job-picker')?.focus();
    return;
  }
  state.formError = '';

  // The ONLY place break time is applied: from here on, `workingMinutes`
  // is the NET figure every downstream calculation (and every other part
  // of the app) reads — see calculations.js#recordMinutes and
  // docs/data-model.md "Break time".
  workingMinutes -= breakMinutes;

  const jobForConfirmation = selectedFormJob();
  const dayTypeForConfirmation = document.getElementById('f-daytype').value;
  const paymentTypeForConfirmation = document.getElementById('f-paytype').value;
  // Weekend/loading questions are about hourly rate rules — a salaried
  // day has none, so fixed-pay records never ask them.
  const confirmationQuestions = fixedCtx ? [] : rateConfirmationQuestions(jobForConfirmation, dateVal, dayTypeForConfirmation, paymentTypeForConfirmation);
  if (!ratesConfirmed && confirmationQuestions.length) {
    showRateConfirmation(jobForConfirmation, confirmationQuestions);
    return;
  }

  const data = {
    date: dateVal,
    start: startVal,
    // No manual cycle field: the pay cycle is derived automatically from
    // `date` + settings.payCycleLengthDays (see calculations.js#getCycleForDate)
    // every time it's displayed, rather than stored per record.
    workingMinutes,
    breakMinutes,
    mapNumber: document.getElementById('f-map').value.trim(),
    dayType: document.getElementById('f-daytype').value,
    paymentType: document.getElementById('f-paytype').value,
    notes: document.getElementById('f-notes').value.trim(),
  };
  // Optional context field: only set when this form was actually showing
  // the Ending-time workflow — see storage.js#migrateRecord and
  // docs/data-model.md "Ending time". A record built in manual mode never
  // gets this key.
  if (usingEndTime) {
    data.end = endInput.value;
  }

  // Jobs integration — entirely additive. When "No job (manual entry)" is
  // selected, none of this branch runs and the record is saved exactly
  // as it always has been: no jobId, no snapshot fields. See
  // docs/data-model.md "Jobs".
  const job = selectedFormJob();
  if (fixedCtx) {
    // Fixed pay: the salary is the pay. This record stores the salary
    // configuration in force right now (its historical snapshot — a later
    // salary/schedule change never reprices it) and carries that day's
    // share of the salary period, or $0 on a day outside the schedule or
    // a day whose share is already on another record for this job.
    const fx = fixedShareForForm(fixedCtx, dateVal);
    data.jobId = fixedCtx.jobId;
    data.fixedPayAtEntry = { mode: fixedCtx.mode, ...fixedCtx.config, scheduledDays: fx.scheduledDays, dayShare: fx.share, counted: fx.counted, reason: fx.reason };
    data.paymentAmount = fx.counted ? fx.share : 0;
    data.hourlyRate = undefined;
    data.baseRateAtEntry = undefined;
    data.weekendRuleAtEntry = undefined;
    data.additionalRuleAtEntry = undefined;
    data.effectiveRateAtEntry = undefined;
    data.weekendOverride = undefined;
    data.expectedRateAtEntry = undefined;
    data.expectedPaymentAtEntry = undefined;
  } else if (job) {
    const breakdown = calc.getRateBreakdown(jobWithFormAdditionalOverride(job), dateVal, currentFormOverride(), workingMinutes);
    data.fixedPayAtEntry = undefined;
    data.jobId = job.id;
    data.baseRateAtEntry = job.baseRate;
    data.weekendRuleAtEntry = breakdown.weekendRule;
    data.additionalRuleAtEntry = breakdown.additionalRule;
    data.effectiveRateAtEntry = breakdown.effectiveRate;
    data.weekendOverride = currentFormOverride().mode === 'custom' ? { mode: 'custom', rule: formOverrideRule } : { mode: currentFormOverride().mode };

    const hourlyInput = document.getElementById('f-hourly-rate');
    if (hourlyInput) {
      // Hourly-rate mode + a job selected: the job's own effective rate
      // drives the payment, not a manually typed rate. `hourlyRate` is
      // still set (to the effective rate actually used) purely so
      // payModeForForm() keeps recognising this as an hourly-rate-mode
      // record when it's reopened for editing — no new discriminator
      // needed, the existing one already does the right thing.
      data.hourlyRate = breakdown.effectiveRate;
      data.paymentAmount = breakdown.payment;
    } else {
      // Direct-payment mode + a job selected: the typed payment amount
      // remains the source of truth. The job only ever annotates it with
      // what was expected, for later comparison — never replaces it.
      data.paymentAmount = Number(document.getElementById('f-pay').value) || 0;
      data.expectedRateAtEntry = breakdown.effectiveRate;
      data.expectedPaymentAtEntry = breakdown.payment;
    }
  } else {
    const hourlyInput = document.getElementById('f-hourly-rate');
    if (hourlyInput) {
      const hourlyRateValue = Math.max(0, Number(hourlyInput.value) || 0);
      data.hourlyRate = hourlyRateValue;
      data.paymentAmount = calc.paymentFromHourlyRate(hourlyRateValue, workingMinutes);
    } else {
      data.paymentAmount = Number(document.getElementById('f-pay').value) || 0;
    }
    // Explicitly clear any Jobs fields a previous save of THIS record
    // may have set, in case the user is editing an existing job-linked
    // record and switches it back to "No job". Object.assign only
    // overwrites keys present here, so without this an old jobId would
    // otherwise survive untouched. `undefined` values are dropped on
    // save (JSON.stringify) exactly like a key that was never set.
    data.jobId = undefined;
    data.baseRateAtEntry = undefined;
    data.weekendRuleAtEntry = undefined;
    data.additionalRuleAtEntry = undefined;
    data.effectiveRateAtEntry = undefined;
    data.weekendOverride = undefined;
    data.expectedRateAtEntry = undefined;
    data.expectedPaymentAtEntry = undefined;
    data.fixedPayAtEntry = undefined;
  }

  if (state.editingId) {
    const r = state.records.find((x) => x.id === state.editingId);
    const before = { jobId: r.jobId, date: r.date, carried: !!r.fixedPayAtEntry?.counted };
    Object.assign(r, data);
    // If this record carried its salaried day and has now moved off it (new
    // date or job), hand that day's share to the record left behind.
    if (before.carried && (r.jobId !== before.jobId || r.date !== before.date || !r.fixedPayAtEntry?.counted)) {
      reassignFixedPayDay(before.jobId, before.date);
    }
    state.editingId = null;
    calendarView = null;
    discardFormDraft();
    showToast('Record updated.');
  } else {
    state.records.push({ id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36), ...data });
    discardFormDraft();
    showToast('Record added.');
    calendarView = null;
  }
  // Open the cycle the saved record now belongs to, so an added record —
  // or one whose date change moved it into another cycle — is visible
  // where it landed rather than hidden inside a collapsed group.
  const savedCycle = calc.getCycleForDate(data.date, state.settings.payCycleLengthDays, state.settings.payCycleAnchor);
  if (savedCycle) cycleExpansion.set(savedCycle.key, true);
  persist();
  render();
}

/**
 * A salaried day is paid once: the first record for a job + date carries
 * the day's share and any others that day are saved at $0 with
 * reason "already-counted" (see fixedShareForForm). That $0 is only true
 * while the carrying record exists — so when the carrier is deleted or
 * moved off the day, the next record for that day takes the share over,
 * using its OWN snapshot's dayShare (its salary at entry; never the job's
 * current salary). Unscheduled-day records are left alone.
 */
function reassignFixedPayDay(jobId, date) {
  if (!jobId || !date) return null;
  const sameDay = state.records.filter((r) => r.jobId === jobId && r.date === date && r.fixedPayAtEntry);
  if (sameDay.some((r) => r.fixedPayAtEntry.counted)) return null;
  const heir = sameDay.find((r) => r.fixedPayAtEntry.reason === 'already-counted');
  if (!heir) return null;
  heir.fixedPayAtEntry = { ...heir.fixedPayAtEntry, counted: true, reason: 'scheduled' };
  heir.paymentAmount = heir.fixedPayAtEntry.dayShare;
  return heir;
}

function startEdit(id) {
  discardFormDraft();
  state.editingId = id;
  calendarView = null;
  state.formError = '';
  // Keyboard users land in the form they are about to edit.
  focusAfterRender = () => [...(document.getElementById('record-form')?.querySelectorAll(FOCUSABLE_SELECTOR) || [])].find(isVisible);
  render();
  document.getElementById('form-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteRecord(id) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;
  const label = `${calc.shortDateLabel(record.date)} (${calc.formatDuration(calc.recordMinutes(record))})`;
  if (!confirm(`Delete the record for ${label}? This cannot be undone.`)) return;
  // Keep keyboard focus in the list: move it to the neighbouring record's
  // delete button (or the list heading when it was the last one).
  const shownIds = [...document.querySelectorAll('[data-action="delete"]')].filter(isVisible).map((b) => b.dataset.id);
  const at = shownIds.indexOf(id);
  const neighbourId = at === -1 ? null : shownIds[at + 1] || shownIds[at - 1] || null;
  focusAfterRender = () =>
    (neighbourId && [...document.querySelectorAll(`[data-action="delete"][data-id="${CSS.escape(neighbourId)}"]`)].find(isVisible)) ||
    document.querySelector('.records-heading h2');
  state.records = state.records.filter((r) => r.id !== id);
  if (state.editingId === id) state.editingId = null;
  const heir = record.fixedPayAtEntry?.counted ? reassignFixedPayDay(record.jobId, record.date) : null;
  persist();
  showToast(heir ? `Record deleted. The day’s salary share (${money(heir.paymentAmount)}) now sits on the other record for that day.` : 'Record deleted.');
  render();
}

function loadSampleData() {
  const samples = [
    { date: '2026-08-25', start: '16:00', cycle: '24 Aug – 6 Sep', workingMinutes: 150, mapNumber: 'Week 2', dayType: 'Afternoon', paymentType: 'Normal', paymentAmount: 75, notes: 'Sample record' },
    { date: '2026-08-27', start: '17:00', cycle: '24 Aug – 6 Sep', workingMinutes: 240, mapNumber: 'Week 2', dayType: 'Night', paymentType: 'Overtime', paymentAmount: 135, notes: 'Sample record' },
    { date: '2026-08-15', start: '09:00', cycle: '10 Aug – 23 Aug', workingMinutes: 300, mapNumber: 'Week 1', dayType: 'Day', paymentType: 'Normal', paymentAmount: 150, notes: 'Sample record' },
    { date: '2026-08-11', start: '10:00', cycle: '10 Aug – 23 Aug', workingMinutes: 180, mapNumber: 'Week 1', dayType: 'Day', paymentType: 'Weekend', paymentAmount: 112.5, notes: 'Sample record' },
  ];
  state.records = [...state.records, ...samples.map((s) => ({ id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random(), ...s }))];
  persist();
  showToast('Sample data loaded — delete any record to remove it.');
  render();
}

// -- Settings options ---------------------------------------------------

function updateOptionField(field, list) {
  state.settings = { ...state.settings, [field]: list };
  persist();
  render();
}

function handleOptionAction(action, field, id) {
  const list = state.settings[field];
  const recordField = field === 'dayTypes' ? 'dayType' : 'paymentType';
  const option = list.find((o) => o.id === id);
  if (!option) return;

  if (action === 'move-up') return updateOptionField(field, opts.reorderOption(list, id, 'up'));
  if (action === 'move-down') return updateOptionField(field, opts.reorderOption(list, id, 'down'));
  if (action === 'restore') return updateOptionField(field, opts.restoreOption(list, id));

  if (action === 'rename') {
    const next = prompt('Rename option to:', option.label);
    if (next === null) return;
    const result = opts.renameOption(list, id, next);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    const usage = opts.optionUsageCount(state.records, recordField, option.label);
    let records = state.records;
    if (usage > 0 && confirm(`${usage} existing record${usage === 1 ? '' : 's'} currently show "${option.label}". Update ${usage === 1 ? 'it' : 'them'} to "${next.trim()}" as well?\n\nChoose Cancel to keep those records showing "${option.label}".`)) {
      const bulk = opts.bulkRenameRecords(records, recordField, option.label, next.trim());
      records = bulk.records;
    }
    state.records = records;
    state.settings = { ...state.settings, [field]: result.list };
    persist();
    render();
    return;
  }

  if (action === 'remove') {
    const usage = opts.optionUsageCount(state.records, recordField, option.label);
    if (usage > 0) {
      if (confirm(`"${option.label}" is used by ${usage} record${usage === 1 ? '' : 's'}. It can't be deleted without losing that history, so it will be archived instead: it stays visible on existing records but won't be offered for new ones. Continue?`)) {
        updateOptionField(field, opts.archiveOption(list, id));
      }
      return;
    }
    if (confirm(`Delete "${option.label}"? It isn't used by any records.`)) {
      updateOptionField(field, opts.removeOption(list, id));
    }
  }
}

// -- Settings: jobs -------------------------------------------------------

function updateJobsList(list, message) {
  state.settings = { ...state.settings, jobs: list };
  persist();
  if (message) showToast(message);
  render();
}

function handleJobAction(action, id) {
  const list = state.settings.jobs || [];
  if (action === 'edit') {
    state.jobEditingId = state.jobEditingId === id ? null : id;
    render();
    return;
  }
  if (action === 'cancel-edit') {
    state.jobEditingId = null;
    render();
    return;
  }
  if (action === 'archive') {
    updateJobsList(jobs.archiveJob(list, id), 'Job archived — it stays on past records but won’t be offered for new ones.');
    return;
  }
  if (action === 'restore') {
    updateJobsList(jobs.restoreJob(list, id), 'Job restored.');
    return;
  }
  if (action === 'delete') {
    const job = list.find((j) => j.id === id);
    if (!job) return;
    const next = jobs.deleteUnusedJob(list, state.records, id);
    if (next === list) {
      // A record was added (maybe in another tab) since the button appeared.
      showToast(`“${job.name}” is used by a record now, so it can’t be deleted — archive it instead.`);
      return;
    }
    if (!confirm(`Delete the job “${job.name}”? No records use it. Its pay settings are removed from this device and this cannot be undone.`)) return;
    if (state.jobEditingId === id) state.jobEditingId = null;
    updateJobsList(next, `Job “${job.name}” deleted.`);
  }
}

function readRuleFromForm(prefix) {
  const type = document.getElementById(`${prefix}-type`)?.value || 'none';
  const value = Number(document.getElementById(`${prefix}-value`)?.value) || 0;
  return calc.normalizeRule({ type, value });
}

// Snapshot every raw field value for a job form (Add or Edit) keyed by
// element id, so a rejected submit can restore exactly what the user typed
// after showToast()'s render() rebuilds the form from scratch. Rule-editor
// value inputs also need their disabled state re-synced, since that's
// normally driven by a change event that never fires on a restore.
function snapshotJobFormFields(ids) {
  const values = {};
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) values[id] = el.value;
  });
  return values;
}

/** Reflect a job form's chosen mode: radio + card highlight + the
 *  form's data-pay-mode (which swaps the mode-specific labels/help). */
function setJobFormMode(form, mode) {
  if (!form) return;
  form.dataset.payMode = mode;
  form.querySelectorAll('[data-job-mode]').forEach((input) => {
    input.checked = input.value === mode;
    input.closest('.mode-option')?.classList.toggle('is-selected', input.checked);
  });
}

function restoreWorkdays(form, days) {
  form?.querySelectorAll('[data-workday]').forEach((box) => { box.checked = days.includes(Number(box.value)); });
}

function readJobFormMode(form) {
  return calc.normalizePayMode(form?.querySelector('[data-job-mode]:checked')?.value, globalPayMode());
}

function restoreJobFormFields(values, ruleGroupPrefixes) {
  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
  ruleGroupPrefixes.forEach((prefix) => {
    const typeEl = document.getElementById(`${prefix}-type`);
    const valueEl = document.getElementById(`${prefix}-value`);
    if (typeEl && valueEl) valueEl.disabled = typeEl.value === 'none';
  });
}

function handleJobEditSubmit(id, event) {
  event.preventDefault();
  const fieldIds = [
    `je-name-${id}`, `je-employer-${id}`, `je-rate-${id}`,
    `je-sat-${id}-type`, `je-sat-${id}-value`,
    `je-sun-${id}-type`, `je-sun-${id}-value`,
    `je-add-${id}-type`, `je-add-${id}-value`,
    `je-notes-${id}`,
    `je-fx-${id}-amount`, `je-fx-${id}-start`, `je-fx-${id}-end`, `je-fx-${id}-break`,
  ];
  const snapshot = snapshotJobFormFields(fieldIds);
  const editForm = document.querySelector(`form[data-job-edit-form][data-id="${id}"]`);
  const payCalculationMode = readJobFormMode(editForm);
  const fixedPay = readFixedPayFromForm(editForm, `je-fx-${id}`);
  const patch = {
    payCalculationMode,
    fixedPay,
    name: document.getElementById(`je-name-${id}`).value.trim(),
    employer: document.getElementById(`je-employer-${id}`).value.trim(),
    baseRate: Number(document.getElementById(`je-rate-${id}`).value) || 0,
    saturdayRule: readRuleFromForm(`je-sat-${id}`),
    sundayRule: readRuleFromForm(`je-sun-${id}`),
    additionalRule: readRuleFromForm(`je-add-${id}`),
    notes: document.getElementById(`je-notes-${id}`).value.trim(),
  };
  const result = jobs.updateJob(state.settings.jobs, id, patch);
  if (result.error) {
    showToast(result.error, 'error');
    // Job Setup validation must preserve entered values, not just report
    // the problem — the toast above already rebuilt the editor via
    // render(), reset to the job's stored values, so restore the attempt.
    restoreJobFormFields(snapshot, [`je-sat-${id}`, `je-sun-${id}`, `je-add-${id}`]);
    const restoredForm = document.querySelector(`form[data-job-edit-form][data-id="${id}"]`);
    setJobFormMode(restoredForm, payCalculationMode);
    restoreWorkdays(restoredForm, fixedPay.workingDays);
    document.getElementById(`je-name-${id}`)?.focus();
    return;
  }
  // A job that already has records and whose pay settings changed: ask
  // what should happen to those records before anything is saved.
  const before = jobs.findJob(state.settings.jobs, id);
  const after = jobs.findJob(result.jobs, id);
  const counts = jobs.jobRecordCounts(state.records, id);
  if (before && after && counts.total > 0 && jobs.payRulesChanged(before, after)) {
    showJobPayChangeDialog(before, after, patch, counts);
    return;
  }
  state.jobEditingId = null;
  updateJobsList(result.jobs, 'Job updated.');
}

/** Human-readable before → after lines for the pay settings that changed. */
function jobPayChangeLines(before, after) {
  const rule = (r) => (calc.normalizeRule(r).type === 'none' ? 'none' : calc.formatRuleLabel(r, state.settings.currency));
  const lines = [];
  const payBefore = jobCardPaySummary(before);
  const payAfter = jobCardPaySummary(after);
  if (payBefore !== payAfter) lines.push(`<li><span>Pay</span><span>${payBefore} → ${payAfter}</span></li>`);
  [['Saturday', 'saturdayRule'], ['Sunday', 'sundayRule'], ['Additional', 'additionalRule']].forEach(([label, key]) => {
    const a = rule(before[key]);
    const b = rule(after[key]);
    if (a !== b) lines.push(`<li><span>${label}</span><span>${esc(a)} → ${esc(b)}</span></li>`);
  });
  if (!lines.length) lines.push('<li><span>Salary</span><span>schedule or break changed</span></li>');
  return lines.join('');
}

/**
 * Pay settings changed on a job that has records: the person chooses to
 * re-rate those records with the new settings, or to keep them as they are
 * and continue with a new version of the job. Cancel (button, Escape or
 * closing the dialog) saves nothing — the editor stays open as typed.
 */
function showJobPayChangeDialog(before, after, patch, counts) {
  if (rateConfirmationDialog) return;
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const repriceable = counts.hourly + counts.payment;
  const applyParts = [];
  if (counts.hourly) applyParts.push(`${n(counts.hourly, 'hourly record gets', 'hourly records get')} the new rate and a recalculated amount`);
  if (counts.payment) applyParts.push(`${n(counts.payment, 'actual-payment record keeps its', 'actual-payment records keep their')} entered payment; only the expected rate it’s compared with changes`);
  const fixedNote = counts.fixed
    ? ` ${n(counts.fixed, 'salaried record keeps its', 'salaried records keep their')} saved salary share either way.`
    : '';
  const dialog = document.createElement('dialog');
  dialog.className = 'rate-confirmation-dialog job-pay-change-dialog';
  dialog.setAttribute('aria-labelledby', 'job-pay-change-title');
  dialog.setAttribute('aria-describedby', 'job-pay-change-summary');
  dialog.innerHTML = `
    <div class="rate-confirmation-head">
      <span class="rate-confirmation-mark" aria-hidden="true">${icon('payment')}</span>
      <div>
        <p class="rate-confirmation-eyebrow">Pay settings changed</p>
        <h2 id="job-pay-change-title">What about existing records?</h2>
        <p class="rate-confirmation-job">${esc(before.name)} · ${n(counts.total, 'record uses', 'records use')} this job</p>
      </div>
    </div>
    <div class="rate-confirmation-questions">
      <ul class="job-pay-change-list" id="job-pay-change-summary">${jobPayChangeLines(before, after)}</ul>
      <div class="rate-confirmation-options job-pay-change-options" role="group" aria-label="How to apply the new pay settings">
        <button type="button" class="rate-choice" aria-pressed="false" data-pay-change="apply" ${repriceable ? '' : 'disabled'}>
          <strong>Update existing records</strong>
          <span>${repriceable ? `${esc(applyParts.join('; '))}.${esc(fixedNote)}` : 'Not available: salaried records always keep their saved salary share.'}</span>
        </button>
        <button type="button" class="rate-choice" aria-pressed="false" data-pay-change="version">
          <strong>Keep old records, start a new version</strong>
          <span>The current job keeps its settings and its ${n(counts.total, 'record', 'records')}, and is archived. A new job, “${esc(jobs.jobVersionName(state.settings.jobs, after.name))}”, with these settings is used for new records.</span>
        </button>
      </div>
    </div>
    <div class="rate-confirmation-actions">
      <button type="button" class="btn secondary" data-pay-change-action="cancel">Cancel</button>
      <button type="button" class="btn primary" data-pay-change-action="save" disabled>Save changes</button>
    </div>`;
  document.body.append(dialog);
  rateConfirmationDialog = dialog;
  const saveButton = dialog.querySelector('[data-pay-change-action="save"]');
  let choice = null;
  const finish = () => {
    dialog.remove();
    if (rateConfirmationDialog === dialog) rateConfirmationDialog = null;
  };
  dialog.addEventListener('click', (event) => {
    const option = event.target.closest('[data-pay-change]');
    if (option && !option.disabled) {
      choice = option.dataset.payChange;
      dialog.querySelectorAll('[data-pay-change]').forEach((b) => {
        const on = b === option;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('is-selected', on);
      });
      saveButton.disabled = false;
      return;
    }
    const action = event.target.closest('[data-pay-change-action]')?.dataset.payChangeAction;
    if (action === 'cancel') {
      dialog.close();
      document.getElementById(`je-name-${before.id}`)?.focus();
    }
    if (action === 'save' && choice) {
      dialog.close();
      applyJobPayChange(before, patch, choice);
    }
  });
  dialog.addEventListener('close', finish);
  dialog.addEventListener('cancel', finish);
  dialog.showModal();
  dialog.querySelector('[data-pay-change]:not([disabled])')?.focus();
}

/** Commit the chosen pay change. Records and settings are saved together;
 *  if the browser refuses either write, both are put back as they were. */
function applyJobPayChange(before, patch, choice) {
  const prevRecords = state.records;
  const prevSettings = state.settings;
  let message;
  if (choice === 'apply') {
    const result = jobs.updateJob(prevSettings.jobs, before.id, patch);
    if (result.error) return showToast(result.error, 'error');
    const updated = jobs.findJob(result.jobs, before.id);
    const repriced = jobs.repriceJobRecords(prevRecords, updated);
    state.records = repriced.records;
    state.settings = { ...prevSettings, jobs: result.jobs };
    message = `Job updated — ${repriced.changed} existing record${repriced.changed === 1 ? '' : 's'} recalculated.`;
  } else {
    const result = jobs.createJobVersion(prevSettings.jobs, before.id, patch);
    if (result.error) return showToast(result.error, 'error');
    state.settings = { ...prevSettings, jobs: result.jobs };
    message = `New version “${result.job.name}” saved for new records. “${before.name}” keeps its records and is archived.`;
  }
  if (!persist()) {
    // persist() reloads from storage, which may already hold the new
    // records if only the settings write failed — put both back.
    try {
      store.saveRecords(prevRecords);
      store.saveSettings(prevSettings);
    } catch { /* storage unavailable: the in-memory state below is still the old one */ }
    state.records = prevRecords;
    state.settings = prevSettings;
    render();
    return;
  }
  state.jobEditingId = null;
  showToast(message);
}

function handleAddJobSubmit(event) {
  event.preventDefault();
  const fieldIds = [
    'new-job-name', 'new-job-employer', 'new-job-rate',
    'new-job-sat-type', 'new-job-sat-value',
    'new-job-sun-type', 'new-job-sun-value',
    'new-job-add-type', 'new-job-add-value',
    'new-job-notes',
    'new-job-fx-amount', 'new-job-fx-start', 'new-job-fx-end', 'new-job-fx-break',
  ];
  // (Add Job's rule-editor `id` args to ruleEditorRow already are
  // 'new-job-sat'/'new-job-sun'/'new-job-add' themselves, so the resulting
  // element ids are 'new-job-sat-type'/'new-job-sat-value' etc. — unlike
  // Edit Job's per-job `je-sat-${id}` prefix, no extra id segment here.)
  const snapshot = snapshotJobFormFields(fieldIds);
  const payCalculationMode = readJobFormMode(document.getElementById('add-job-form'));
  const fixedPay = readFixedPayFromForm(document.getElementById('add-job-form'), 'new-job-fx');
  const name = document.getElementById('new-job-name').value;
  const employer = document.getElementById('new-job-employer').value;
  const baseRate = Number(document.getElementById('new-job-rate').value) || 0;
  // Same complete field set Edit Job already collects (see
  // handleJobEditSubmit/readRuleFromForm) — Phase 5 closes the gap that
  // used to force Add Job -> Edit Job just to finish configuring a job.
  const saturdayRule = readRuleFromForm('new-job-sat');
  const sundayRule = readRuleFromForm('new-job-sun');
  const additionalRule = readRuleFromForm('new-job-add');
  const notes = document.getElementById('new-job-notes').value.trim();
  const result = jobs.addJob(state.settings.jobs, { name, employer, baseRate, payCalculationMode, fixedPay, saturdayRule, sundayRule, additionalRule, notes });
  if (result.error) {
    showToast(result.error, 'error');
    // Job Setup validation must preserve entered values, not just report
    // the problem — the toast above already rebuilt the (blank) form via
    // render(), so restore exactly what the user had typed.
    restoreJobFormFields(snapshot, ['new-job-sat', 'new-job-sun', 'new-job-add']);
    setJobFormMode(document.getElementById('add-job-form'), payCalculationMode);
    restoreWorkdays(document.getElementById('add-job-form'), fixedPay.workingDays);
    document.getElementById('new-job-name')?.focus();
    return;
  }
  updateJobsList(result.jobs, `${result.job.name} added and ready to use.`);
}

// -- Data: export / import / reset --------------------------------------

/** "-side-job" in file names once there are several profiles, so backups
 *  from different profiles can't be mixed up. */
function profileFileTag() {
  return hasProfiles() ? `-${(activeProfile().name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'profile').slice(0, 24)}` : '';
}

function exportJSON() {
  const backup = store.buildBackup(state.records, state.settings, hasProfiles() ? activeProfile().name : null, state.notes);
  store.downloadFile(`workroaster-backup${profileFileTag()}-${calc.todayString()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  showToast(hasProfiles() ? `Backup of ${activeProfile().name} downloaded.` : 'Backup downloaded.');
}

function exportAllProfilesJSON() {
  persist();
  const backup = store.buildAllProfilesBackup();
  store.downloadFile(`workroaster-backup-all-profiles-${calc.todayString()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  showToast(`Backup of all ${backup.profiles.length} profiles downloaded.`);
}

function exportCSV() {
  const csv = store.recordsToCSV(state.records, state.settings.payCycleLengthDays, state.settings.jobs, state.settings.payCycleAnchor);
  store.downloadFile(`workroaster-records${profileFileTag()}-${calc.todayString()}.csv`, csv, 'text/csv');
  showToast('CSV downloaded.');
}

// -- Per-cycle export (PDF / JPG / Excel) --------------------------------

async function handleCycleExport(format, cycleKey, visibility = state.settings.exportVisibility) {
  const cycles = calc.groupByCycle(state.records, state.settings.payCycleLengthDays, state.settings.payCycleAnchor);
  const cycle = cycles.find((c) => c.key === cycleKey);
  if (!cycle) return;
  try {
    const options = { currency: state.settings.currency, visibility: store.normalizeExportVisibility(visibility), jobs: state.settings.jobs };
    const exportModule = await import('./export.js');
    if (format === 'pdf') exportModule.exportCyclePDF(cycle, options);
    else if (format === 'jpg') exportModule.exportCycleJPG(cycle, options);
    else if (format === 'xlsx') await exportModule.exportCycleExcel(cycle, options);
    showToast(`${format.toUpperCase()} downloaded — all records in ${cycle.cycleLabel}.`);
  } catch (err) {
    showToast(err.message || 'Export failed.', 'error');
  }
}

/** Submits the Feedback tab's textarea via feedback.js#submitFeedback().
 *  Guards against duplicate submission (ignored while already sending),
 *  and never claims success feedback.js didn't actually report — see
 *  that module's comment for why it currently always resolves ok:false. */
async function handleFeedbackSubmit() {
  if (feedbackSubmitting) return;
  feedbackSubmitting = true;
  feedbackStatus = null;
  render();

  const result = await submitFeedback(feedbackDraft);

  feedbackSubmitting = false;
  feedbackStatus = result;
  if (result.ok) {
    feedbackDraft = '';
    showToast('Feedback sent — thank you.');
  } else {
    showToast(result.notConnected ? 'Feedback isn’t wired up to a backend yet.' : result.error, 'error');
  }
  render();
}

function requestCycleExport(format, cycleKey) {
  const cycle = calc.groupByCycle(state.records, state.settings.payCycleLengthDays, state.settings.payCycleAnchor).find((c) => c.key === cycleKey);
  if (!cycle) return;
  openExportOptions({ kind: 'cycle', format, cycleKey, scopeLabel: `All records · ${cycle.cycleLabel}` });
}

function requestJobExport(format, cycleKey, jobKey) {
  const cycle = calc.groupByCycle(state.records, state.settings.payCycleLengthDays, state.settings.payCycleAnchor).find((c) => c.key === cycleKey);
  const group = cycle && groupRecordsByJob(cycle.records).find((g) => g.key === jobKey);
  if (!group) return;
  openExportOptions({ kind: 'job', format, cycleKey, jobKey, scopeLabel: `${group.name} · ${cycle.cycleLabel}` });
}

/** Same export functions as handleCycleExport() above, just handed a
 *  group narrowed to one job's records via export.js#jobScopedGroup —
 *  no second export engine, see docs/data-model.md "Jobs" and
 *  export.js's own module comment. */
async function handleJobExport(format, cycleKey, jobKey, visibility = state.settings.exportVisibility) {
  const cycles = calc.groupByCycle(state.records, state.settings.payCycleLengthDays, state.settings.payCycleAnchor);
  const cycle = cycles.find((c) => c.key === cycleKey);
  if (!cycle) return;
  const jobGroup = groupRecordsByJob(cycle.records).find((g) => g.key === jobKey);
  if (!jobGroup) return;
  try {
    const options = { currency: state.settings.currency, visibility: store.normalizeExportVisibility(visibility), jobs: state.settings.jobs };
    const exportModule = await import('./export.js');
    const scoped = exportModule.jobScopedGroup(cycle, jobKey, jobGroup.name);
    if (format === 'pdf') exportModule.exportCyclePDF(scoped, options);
    else if (format === 'jpg') exportModule.exportCycleJPG(scoped, options);
    else if (format === 'xlsx') await exportModule.exportCycleExcel(scoped, options);
    showToast(`${format.toUpperCase()} downloaded — ${jobGroup.name} in ${cycle.cycleLabel}.`);
  } catch (err) {
    showToast(err.message || 'Export failed.', 'error');
  }
}

/** An "All profiles" backup: each profile in the file goes into the profile
 *  with the same name on this device (created if it doesn't exist), using
 *  the same job-aware import as a single backup. Profiles that aren't in
 *  the file are left alone. */
function importAllProfiles(fileProfiles, mode) {
  const names = fileProfiles.map((p) => p.name).join(', ');
  if (mode === 'replace' && !confirm(`Replace the records and settings of ${fileProfiles.length} profile(s) (${names}) with this file? Profiles with these names are overwritten and missing ones are created; other profiles are left alone. This cannot be undone — export a backup first if unsure.`)) return;
  if (!persist()) return;
  const lines = [];
  let created = 0;
  for (const fp of fileProfiles) {
    let target = profileIndex().profiles.find((p) => p.name.toLowerCase() === fp.name.toLowerCase());
    let isNew = false;
    if (!target) {
      if (!hasProfiles()) store.saveProfiles({ ...profileIndex(), ...store.appearanceOf(state.settings) });
      target = store.createProfile(fp.name, store.appearanceOf(state.settings));
      created += 1;
      isNew = true;
    }
    const current = { records: store.loadRecordsFor(target.id), settings: store.loadSettingsFor(target.id), notes: store.loadNotesFor(target.id) };
    // A profile created from the file takes all its settings (pay cycle, currency…), not the blank defaults.
    const result = store.importBackup(current, fp.parsed, isNew ? 'replace' : mode);
    store.saveRecordsFor(target.id, result.records);
    store.saveSettingsFor(target.id, result.settings);
    // Only this profile's notes change, and only if the file has notes for it.
    store.saveNotesFor(target.id, result.notes);
    lines.push(`${target.name}: ${result.summary.added} record(s)${result.summary.duplicates ? `, ${result.summary.duplicates} duplicate(s) skipped` : ''}${result.summary.notesAdded ? `, ${result.summary.notesAdded} note(s)` : ''}`);
  }
  state.records = store.loadRecords();
  state.settings = store.loadSettings();
  state.notes = store.loadNotes();
  state.modal = null;
  showToast(`Imported ${fileProfiles.length} profile(s)${created ? ` (${created} new)` : ''} — ${lines.join('; ')}.`);
}

/** "Imported 6 new record(s); 5 duplicate(s) skipped. Added job: Westfield." */
function importSummaryMessage(mode, sum) {
  const parts = [mode === 'replace' ? `Replaced with ${sum.added} imported record(s).` : `Imported ${sum.added} new record(s); ${sum.duplicates} duplicate(s) skipped.`];
  if (sum.jobsAdded.length) parts.push(`Added job${sum.jobsAdded.length === 1 ? '' : 's'}: ${sum.jobsAdded.join(', ')}.`);
  if (sum.jobsMatched.length) parts.push(`Matched by name: ${sum.jobsMatched.join(', ')}.`);
  if (sum.optionsAdded.length) parts.push(`Added option${sum.optionsAdded.length === 1 ? '' : 's'}: ${sum.optionsAdded.join(', ')}.`);
  if (sum.notesAdded) parts.push(`${mode === 'replace' ? 'Restored' : 'Added'} ${sum.notesAdded} note${sum.notesAdded === 1 ? '' : 's'}.`);
  return parts.join(' ');
}

function handleImport(mode) {
  const input = document.getElementById('import-file');
  input.value = '';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Import is all-or-nothing: if anything below fails, put the records
      // and settings back exactly as they were.
      const previousRecords = state.records;
      const previousSettings = state.settings;
      const previousNotes = state.notes;
      try {
        const file = store.parseBackupFile(String(reader.result));
        if (file.kind === 'all') {
          importAllProfiles(file.profiles, mode);
          return;
        }
        const parsed = file.parsed;
        const into = hasProfiles() ? ` in ${activeProfile().name}` : '';
        if (mode === 'replace' && !confirm(`Replace all ${state.records.length} current record(s)${into} with the ${parsed.records.length} record(s) in this file? This cannot be undone — export a backup first if unsure.`)) return;
        // Jobs in the file are created (or matched by name) automatically,
        // and imported settings are validated like stored ones — see
        // storage.js#importBackup.
        const result = store.importBackup({ records: state.records, settings: state.settings, notes: state.notes }, parsed, mode);
        state.records = result.records;
        state.settings = result.settings;
        state.notes = result.notes;
        showToast(importSummaryMessage(mode, result.summary));
        if (persist()) store.saveNotes(state.notes);
        state.modal = null;
        render();
      } catch (err) {
        if (state.records !== previousRecords || state.settings !== previousSettings || state.notes !== previousNotes) {
          state.records = previousRecords;
          state.settings = previousSettings;
          state.notes = previousNotes;
          try { store.saveNotes(previousNotes); } catch { /* storage already reported */ }
          try { persist(); } catch { /* storage already reported */ }
          state.modal = null;
          render();
        }
        showToast(err.message || 'Could not import that file.', 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function clearAllRecords() {
  if (!state.records.length) {
    showToast('There are no records to clear.');
    return;
  }
  if (!confirm(`Delete all ${state.records.length} record(s) from this device? Export a backup first if you might want them later. This cannot be undone.`)) return;
  state.records = [];
  persist();
  state.modal = null;
  showToast('All records cleared.');
  render();
}

// ---------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------

function closeModal() {
  state.modal = null;
  state.exportRequest = null;
  if (timePickerOpen) closeTimePicker();
  render();
}

/**
 * Switch Settings category: ONE click -> one state change -> one DOM
 * update -> one transition. Only the content pane and the rail's active
 * state change; the modal, backdrop and rail indicator stay the same
 * elements, so nothing replays its entry animation and the indicator
 * slides from where it actually is.
 *
 * (Previously the whole #modal-backdrop was swapped via outerHTML: that
 * replayed backdrop-in on every switch, and the timer that later removed
 * .is-tab-transitioning — the class suppressing modal-in — restarted
 * modal-in ~240ms after the click, which read as a second refresh.)
 */
function navigateSettingsTab(nextTab) {
  if (nextTab === state.settingsTab) return;
  // The General tab's default-start-time popover lives in the pane
  // being replaced — close it rather than leave a dangling open state.
  if (timePickerOpen) closeTimePicker();
  const content = document.getElementById('settings-content');
  if (!content) {
    state.settingsTab = nextTab;
    render();
    return;
  }
  const tabOrder = SETTINGS_CATEGORIES.map((category) => category.id);
  const direction = Math.sign(tabOrder.indexOf(nextTab) - tabOrder.indexOf(state.settingsTab)) || 1;
  state.settingsTab = nextTab;

  // Rail first: positionRailIndicator() only measures the rail's own tabs,
  // and the modal's geometry is fixed (see .settings-modal in styles.css),
  // so the indicator's target never depends on the new pane's height.
  document.querySelectorAll('#settings-rail [data-tab]').forEach((tab) => {
    const active = tab.dataset.tab === nextTab;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  positionRailIndicator();
  content.innerHTML = settingsTabContent(nextTab);
  content.scrollTop = 0;
  wireSettingsContentEvents();
  playSettingsContentEnter(content, direction);
}

/** The single content-enter animation shared by Settings and the Guide.
 *  Restarting it on a rapid second click simply begins again from the
 *  new content — there is one timer, cleared each time, so no class can
 *  be left behind. Reduced motion skips it entirely. */
function playSettingsContentEnter(content, direction) {
  clearTimeout(settingsMotionFallbackTimer);
  content.classList.remove('is-motion-fallback');
  if (motionReduced()) {
    document.documentElement.style.removeProperty('--settings-motion-direction');
    return;
  }
  document.documentElement.style.setProperty('--settings-motion-direction', String(direction));
  void content.offsetWidth; // restart the animation for this update
  content.classList.add('is-motion-fallback');
  settingsMotionFallbackTimer = setTimeout(() => {
    content.classList.remove('is-motion-fallback');
    document.documentElement.style.removeProperty('--settings-motion-direction');
  }, SETTINGS_MOTION_MS);
}

/** Every listener that lives inside the settings modal's own DOM subtree
 *  (including its close button and backdrop-click-to-close, which are
 *  part of the same `#modal-backdrop` element renderSettingsModal()
 *  returns) — extracted out of wireEvents() so it can be called on its
 *  own after navigateSettingsTab()'s scoped re-render replaces just this
 *  subtree, without re-wiring (and double-binding listeners on) the rest
 *  of the page. wireEvents() also calls this, for the normal full-render
 *  case (opening the modal, or the data modal reusing the same
 *  #modal-backdrop/#btn-close-modal ids) — this is the one place these
 *  listeners are defined, not a copy. */
function wireSettingsModalEvents() {
  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => navigateSettingsTab(b.dataset.tab))
  );
  wireSettingsContentEvents();
}

/** Listeners inside the Settings content pane only — re-run after
 *  navigateSettingsTab() swaps that pane, never binding the modal's
 *  close/backdrop/rail listeners a second time. */
function wireSettingsContentEvents() {
  document.querySelectorAll('[data-profile-action]').forEach((b) =>
    b.addEventListener('click', () => handleProfileAction(b.dataset.profileAction, b.dataset.id))
  );
  document.getElementById('add-profile-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addProfile(document.getElementById('new-profile-name')?.value);
  });
  document.getElementById('s-cycle-start-day')?.addEventListener('change', (e) => {
    state.settings = { ...state.settings, payCycleAnchor: calc.cycleAnchorForWeekday(Number(e.target.value)) };
    state.focusedCycleKey = null;
    persist();
    render();
  });
  document.getElementById('s-cycle-start-date')?.addEventListener('change', (e) => {
    const value = e.target.value;
    // Ignore half-typed or cleared dates; only a real date moves the cycles.
    if (calc.normalizeCycleAnchor(value) !== value) return;
    state.settings = { ...state.settings, payCycleAnchor: value };
    state.focusedCycleKey = null;
    persist();
    render();
  });
  wireOptionPickers();
  // Settings → General → Export: the saved starting choices for reports.
  document.querySelectorAll('.export-visibility [data-export-visibility]').forEach((box) =>
    box.addEventListener('change', () => {
      const key = box.dataset.exportVisibility;
      state.settings = { ...state.settings, exportVisibility: { ...store.normalizeExportVisibility(state.settings.exportVisibility), [key]: box.checked } };
      persist();
    })
  );
  document.querySelectorAll('[data-option-field]').forEach((b) =>
    b.addEventListener('click', () => {
      state.optionField = b.dataset.optionField;
      render();
    })
  );
  document.querySelectorAll('[data-opt-action]').forEach((b) =>
    b.addEventListener('click', () => handleOptionAction(b.dataset.optAction, b.dataset.field, b.dataset.id))
  );
  document.getElementById('feedback-message')?.addEventListener('input', (e) => {
    feedbackDraft = e.target.value;
    // Clear a previous result once the user edits their message again —
    // an old error/success line should not linger next to new text.
    if (feedbackStatus) {
      feedbackStatus = null;
      document.querySelector('.feedback-status')?.remove();
    }
  });
  document.getElementById('btn-feedback-submit')?.addEventListener('click', () => handleFeedbackSubmit());
  document.getElementById('add-option-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('new-option-label');
    const result = opts.addOption(state.settings[state.optionField], input.value);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    updateOptionField(state.optionField, result.list);
  });
  document.querySelectorAll('[data-job-action]').forEach((b) =>
    b.addEventListener('click', () => handleJobAction(b.dataset.jobAction, b.dataset.id))
  );
  document.querySelectorAll('[data-job-edit-form]').forEach((f) =>
    f.addEventListener('submit', (e) => handleJobEditSubmit(f.dataset.id, e))
  );
  document.getElementById('add-job-form')?.addEventListener('submit', handleAddJobSubmit);
  // A full re-render (rather than a native form reset) so the rule-editor
  // rows' select-driven disabled state comes back in sync too, not just
  // their values — see ruleEditorRow/readRuleFromForm above.
  document.getElementById('btn-cancel-add-job')?.addEventListener('click', () => render());
  document.querySelectorAll('[data-job-mode]').forEach((input) =>
    input.addEventListener('change', () => {
      const form = input.closest('form');
      setJobFormMode(form, input.value);
      // Soft fade for the newly shown fields — only on a real mode switch,
      // never when the tab/pane itself appears (one click, one animation).
      if (form && !motionReduced()) {
        form.classList.remove('is-mode-switching');
        void form.offsetWidth;
        form.classList.add('is-mode-switching');
        setTimeout(() => form.classList.remove('is-mode-switching'), 400);
      }
    })
  );
  document.querySelectorAll('.job-fixed-fields input[type="time"]').forEach((input) =>
    document.getElementById(`btn-${input.id}-time`)?.addEventListener('click', () => toggleTimePicker(input.id))
  );
  document.querySelectorAll('.rule-editor-row select[id$="-type"]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const valueInput = document.getElementById(sel.id.replace('-type', '-value'));
      if (valueInput) valueInput.disabled = sel.value === 'none';
    });
  });

  document.getElementById('s-currency')?.addEventListener('change', (e) => {
    const code = normalizeCurrencyInput(e.target.value);
    const errorEl = document.getElementById('s-currency-error');
    // Only a real ISO 4217 code is saved; anything else is explained in
    // place and nothing changes (the saved currency keeps labelling amounts).
    if (!isSupportedCurrency(code)) {
      if (errorEl) errorEl.textContent = code ? `“${code}” isn’t a recognised currency code. Try one like AUD, USD, GBP or EUR — your currency is still ${state.settings.currency}.` : `Enter a currency code — your currency is still ${state.settings.currency}.`;
      e.target.setAttribute('aria-invalid', 'true');
      return;
    }
    e.target.removeAttribute('aria-invalid');
    if (errorEl) errorEl.textContent = '';
    if (code === state.settings.currency) return;
    state.settings = { ...state.settings, currency: code };
    persist();
    render();
  });
  document.getElementById('s-theme')?.addEventListener('change', (e) => {
    state.settings = { ...state.settings, theme: e.target.value };
    persist();
    render();
  });
  document.querySelectorAll('input[name="s-visual-theme"]').forEach((radio) =>
    radio.addEventListener('change', () => {
      if (!radio.checked || radio.value === state.settings.visualTheme) return;
      state.settings = { ...state.settings, visualTheme: radio.value };
      persist();
      // Cross-fade the colour change instead of snapping (skipped for reduced motion).
      document.documentElement.classList.add('is-theme-changing');
      clearTimeout(themeChangeTimer);
      themeChangeTimer = setTimeout(() => document.documentElement.classList.remove('is-theme-changing'), 420);
      const value = radio.value;
      focusAfterRender = () => justSelected(document.querySelector(`input[name="s-visual-theme"][value="${value}"]`));
      render();
    })
  );
  document.querySelectorAll('input[name="s-motion-style"]').forEach((radio) =>
    radio.addEventListener('change', () => {
      if (!radio.checked || radio.value === state.settings.motionStyle) return;
      state.settings = { ...state.settings, motionStyle: radio.value };
      persist();
      const value = radio.value;
      focusAfterRender = () => justSelected(document.querySelector(`input[name="s-motion-style"][value="${value}"]`));
      render();
    })
  );
  const glass = document.getElementById('s-header-glass');
  if (glass) {
    // Live preview while dragging; saved (once) when the slider is released.
    glass.addEventListener('input', () => {
      setHeaderTransparencyVar(glass.value);
      const label = headerTransparencyLabel(glass.value);
      glass.setAttribute('aria-valuetext', label);
      const out = document.getElementById('s-header-glass-value');
      if (out) out.textContent = label;
    });
    glass.addEventListener('change', () => {
      state.settings = { ...state.settings, headerTransparency: store.normalizeHeaderTransparency(glass.value) };
      persist();
    });
  }
  document.getElementById('s-default-start')?.addEventListener('change', (e) => {
    state.settings = { ...state.settings, defaults: { ...state.settings.defaults, startTime: e.target.value } };
    persist();
  });
  document.getElementById('btn-s-default-start-time')?.addEventListener('click', () => toggleTimePicker('s-default-start'));
  document.getElementById('s-cycle-length')?.addEventListener('change', (e) => {
    const days = [7, 14, 30, 365].includes(Number(e.target.value)) ? Number(e.target.value) : 14;
    state.settings = { ...state.settings, payCycleLengthDays: days };
    persist();
    render();
  });
  document.querySelectorAll('input[name="pay-calc-mode"]').forEach((input) =>
    input.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      const mode = e.target.value === 'hourlyRate' ? 'hourlyRate' : 'payment';
      // Changing this setting only affects how the NEXT record is
      // entered/saved (see payModeForForm) — it deliberately does not
      // touch state.records, so no existing paymentAmount is recalculated.
      state.settings = { ...state.settings, payCalculationMode: mode };
      persist();
      render();
    })
  );
  document.getElementById('s-end-time-mode')?.addEventListener('change', (e) => {
    // Independent of payCalculationMode — see durationModeForForm(): a
    // change here only affects how the NEXT new record's form defaults,
    // and never touches state.records, so no existing record's stored
    // workingMinutes/end is recalculated or invented.
    state.settings = { ...state.settings, calculateDurationFromEndTime: e.target.checked };
    persist();
    render();
  });
}

/** Graph navigation: step to the older (+1) or newer (-1) cycle relative
 *  to the active one, and make that cycle's KEY the active one. Moving
 *  the graph also opens that cycle's records, which renderRecords() lists
 *  first by the same key. */
function focusCycleStep(step, direction) {
  const cycles = calc.groupByCycle(state.records, state.settings.payCycleLengthDays, state.settings.payCycleAnchor);
  const current = focusedCycle(cycles);
  const target = current ? cycles[cycles.indexOf(current) + step] : null;
  if (!target) return;
  state.focusedCycleKey = target.key;
  state.cycleNavDirection = direction;
  cycleExpansion.set(target.key, true);
  render();
}

/** Per-record controls inside a cycle body (edit, delete, rate breakdown,
 *  per-job exports). Called for the whole page on render, and for a single
 *  cycle body when it is first opened and filled in lazily. */
function wireRecordControls(scope) {
  scope.querySelectorAll('[data-action="edit"]').forEach((b) => b.addEventListener('click', () => startEdit(b.dataset.id)));
  scope.querySelectorAll('[data-action="delete"]').forEach((b) => b.addEventListener('click', () => deleteRecord(b.dataset.id)));
  scope.querySelectorAll('[data-rb-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const wrap = b.closest('.rate-breakdown');
      const detail = wrap?.querySelector('.rate-breakdown-detail');
      if (!wrap || !detail) return;
      const opening = detail.classList.toggle('is-hidden') === false;
      wrap.classList.toggle('is-open', opening);
    })
  );
  scope.querySelectorAll('[data-job-export]').forEach((b) =>
    b.addEventListener('click', () => requestJobExport(b.dataset.jobExport, b.dataset.cycleKey, b.dataset.jobKey))
  );
}

function wireEvents() {
  wireNotesEvents();
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    const current = state.settings.theme === 'dark' ? 'light' : 'dark';
    state.settings = { ...state.settings, theme: current };
    persist();
    render();
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    state.modal = 'settings';
    render();
  });
  document.getElementById('btn-data')?.addEventListener('click', () => {
    state.modal = 'data';
    render();
  });
  document.getElementById('btn-guide')?.addEventListener('click', () => {
    guideQuery = '';
    state.modal = 'guide';
    render();
    document.getElementById('guide-search')?.focus({ preventScroll: true });
  });
  wireGuideEvents();
  wireSettingsModalEvents();

  // Dashboard "Add work" shortcut — purely a convenience scroll/focus
  // into the existing form below; it creates no new state and submits
  // through the same #record-form as always.
  document.getElementById('btn-quick-add')?.addEventListener('click', () => {
    document.getElementById('form-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('f-date')?.focus({ preventScroll: true });
  });

  // Pay-cycle navigator — pure UI paging through calc.groupByCycle()'s
  // already-computed list; never touches state.records or state.settings.
  document.getElementById('btn-cycle-prev')?.addEventListener('click', () => focusCycleStep(1, 'left'));
  document.getElementById('btn-cycle-next')?.addEventListener('click', () => focusCycleStep(-1, 'right'));

  document.getElementById('record-form')?.addEventListener('submit', submitForm);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
    discardFormDraft();
    state.editingId = null;
    calendarView = null;
    state.formError = '';
    render();
  });
  wirePayInputs();
  ['f-hours', 'f-minutes', 'f-start', 'f-end'].forEach((id) =>
    document.getElementById(id)?.addEventListener('input', () => {
      updateLiveRate();
      updateJobAwareCalc();
    })
  );
  document.getElementById('f-date')?.addEventListener('input', () => {
    updateCyclePreview();
    updateJobAwareCalc();
    if (isFixedPayForm()) updateFixedPayPanel();
    syncCalendarToFormDate();
  });
  document.getElementById('f-job')?.addEventListener('change', () => {
    formAdditionalOverrideMode = 'default';
    syncFormPayModeToJob();
    applyFixedScheduleToForm(selectedFormJob());
    updateLiveRate();
    updateJobAwareCalc();
    syncJobSelectTriggerLabel();
  });
  document.getElementById('f-break')?.addEventListener('change', () => {
    updateLiveRate();
    updateJobAwareCalc();
  });
  ['f-daytype', 'f-paytype'].forEach((id) =>
    document.getElementById(id)?.addEventListener('change', () => {
      formAdditionalOverrideMode = 'default';
      updateJobAwareCalc();
    })
  );
  document.getElementById('btn-date-picker')?.addEventListener('click', toggleDatePicker);
  document.getElementById('btn-job-picker')?.addEventListener('click', toggleJobPicker);
  wireOptionPickers();
  document.getElementById('btn-job-picker')?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!jobPickerOpen) openJobPicker();
      else moveJobPickerActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!jobPickerOpen) openJobPicker();
      else moveJobPickerActive(-1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!jobPickerOpen) openJobPicker();
      else commitJobPickerActive();
    } else if (e.key === 'Escape' && jobPickerOpen) {
      closeJobPicker();
    } else if (e.key === 'Home' && jobPickerOpen) {
      e.preventDefault();
      jobPickerActiveIndex = 0;
      refreshJobPickerBody();
    } else if (e.key === 'End' && jobPickerOpen) {
      e.preventDefault();
      const select = document.getElementById('f-job');
      if (select) {
        jobPickerActiveIndex = select.options.length - 1;
        refreshJobPickerBody();
      }
    }
  });
  ['f-start', 'f-end'].forEach((id) => {
    document.getElementById(`btn-${id}-time`)?.addEventListener('click', () => toggleTimePicker(id));
  });
  wireOverrideControls();
  updateLiveRate();
  updateCyclePreview();
  updateJobAwareCalc();
  wireCalendarEvents();
  wireCalculator(document.getElementById('calculator'));

  wireRecordControls(root);
  root.querySelectorAll('[data-cycle-toggle]').forEach((b) => b.addEventListener('click', () => toggleCycleGroup(b)));
  document.getElementById('h-profile')?.addEventListener('change', (e) => switchProfile(e.target.value));
  root.querySelectorAll('[data-cycle-export]').forEach((b) =>
    b.addEventListener('click', () => requestCycleExport(b.dataset.cycleExport, b.dataset.cycleKey))
  );

  // Export-options dialog
  document.getElementById('btn-export-confirm')?.addEventListener('click', confirmExport);
  document.getElementById('btn-export-cancel')?.addEventListener('click', closeModal);
  document.querySelectorAll('.export-modal [data-export-visibility]').forEach((box) =>
    box.addEventListener('change', () => {
      if (!state.exportRequest) return;
      // This export only — the saved defaults are left alone.
      const key = box.dataset.exportVisibility;
      state.exportRequest = { ...state.exportRequest, choices: { ...state.exportRequest.choices, [key]: box.checked } };
      const c = state.exportRequest.choices;
      const minimal = !c.time && !c.hours && !c.amount;
      if (minimal !== !!document.querySelector('.export-minimal-note')) render();
    })
  );

  document.getElementById('btn-sample-data')?.addEventListener('click', loadSampleData);

  // Data modal
  document.getElementById('btn-export-json')?.addEventListener('click', exportJSON);
  document.getElementById('btn-export-all-profiles')?.addEventListener('click', exportAllProfilesJSON);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
  document.getElementById('btn-import-merge')?.addEventListener('click', () => handleImport('merge'));
  document.getElementById('btn-import-replace')?.addEventListener('click', () => handleImport('replace'));
  document.getElementById('btn-clear-all')?.addEventListener('click', clearAllRecords);

  // One persistent listener (it used to be re-added with { once: true } on
  // every render, so the first key typed inside a dialog used it up and
  // Escape then stopped closing the Guide/Settings).
  if (!escListenerInstalled) {
    document.addEventListener('keydown', escToClose, true);
    escListenerInstalled = true;
  }
}

let escListenerInstalled = false;

/** Escape closes the open dialog — unless a picker inside it is open, in
 *  which case that Escape belongs to the picker (its own handler closes it).
 *  Capture phase, so the picker state is read before that handler runs. */
function escToClose(e) {
  if (e.key !== 'Escape' || !state.modal) return;
  if (datePickerOpen || jobPickerOpen || timePickerOpen || optionPickerOpenId) return;
  // A confirmation dialog on top (e.g. the job pay-change choice) closes
  // itself; the Settings window behind it — and what was typed there — stays.
  if (rateConfirmationDialog) return;
  closeModal();
}

/** Measures the active settings-category tab and moves the sliding rail
 *  indicator onto it. Since the whole modal is rebuilt from a template
 *  string on every render, this has to re-run after every render while
 *  the settings modal is open — it reads real layout (offsetTop/Left/
 *  Height/Width), so it's a JS measurement, not a CSS-only trick, and it
 *  changes nothing about state or persisted data. */
/** Move the rail indicator to the active tab. Only a real category
 *  change should glide it; after a full render() the indicator is a NEW
 *  element starting at 0, so `instant` places it without a transition —
 *  otherwise every save/toast/open inside the modal replayed a slide
 *  down from the top of the rail. */
function positionRailIndicator(instant = false) {
  const rail = document.getElementById('settings-rail');
  const indicator = document.getElementById('settings-rail-indicator');
  if (!rail || !indicator) return;
  const active = rail.querySelector('.rail-tab.active');
  if (!active) return;
  if (instant) indicator.style.transition = 'none';
  indicator.style.setProperty('--rail-top', `${active.offsetTop}px`);
  indicator.style.setProperty('--rail-height', `${active.offsetHeight}px`);
  indicator.style.setProperty('--rail-left', `${active.offsetLeft}px`);
  indicator.style.setProperty('--rail-width', `${active.offsetWidth}px`);
  if (instant) {
    void indicator.offsetWidth; // commit the placed position before re-enabling transitions
    indicator.style.transition = '';
  }
}

/**
 * Keep several open tabs in step. Each tab holds its own in-memory copy of
 * the data and every save writes the WHOLE list, so a tab that missed a
 * change made in another tab would silently wipe it on its next save. The
 * browser fires `storage` in every OTHER tab when localStorage changes:
 * reload the data then. The page is redrawn straight away unless the user is
 * in the middle of typing in the record form or has a dialog open — then
 * the (already up-to-date) data is drawn on their next action instead, so
 * nothing they are typing is thrown away.
 */
['input', 'change'].forEach((type) =>
  document.addEventListener(type, (e) => {
    if (e.target instanceof Element && e.target.closest('#record-form')) {
      formDirty = true;
      if (e.target.id) dirtyFieldIds.add(e.target.id);
    }
  }, true)
);
/** Unsaved input in the form, or a picker open: not a safe moment to rebuild the page. */
function formBusy() {
  return formDirty || datePickerOpen || jobPickerOpen || timePickerOpen || optionPickerOpenId !== null;
}

function syncFromOtherTab(e) {
  if (e.storageArea !== localStorage) return;
  const id = store.getActiveProfileId();
  if (e.key !== null && e.key !== store.recordsKeyFor(id) && e.key !== store.settingsKeyFor(id) && e.key !== store.notesKeyFor(id) && e.key !== store.PROFILES_KEY) return;
  // This profile was deleted in another tab: fall back to the first one.
  if (!store.loadProfiles().profiles.some((p) => p.id === id)) store.setActiveProfile(store.DEFAULT_PROFILE_ID);
  state.records = store.loadRecords();
  state.settings = store.loadSettings();
  state.notes = store.loadNotes();
  if (state.noteEditingId && !state.notes.some((n) => n.id === state.noteEditingId)) state.noteEditingId = null;
  if (state.editingId && !state.records.some((r) => r.id === state.editingId)) state.editingId = null;
  // Never rebuild the page under someone who is filling in the form or has a
  // dialog open: the other tab's change is shown at the next render (saving
  // the record, closing the dialog, or leaving an untouched form).
  if (state.modal || formBusy() || state.noteEditingId) {
    externalChangePending = true;
    return;
  }
  externalChangePending = false;
  render();
}
window.addEventListener('storage', syncFromOtherTab);
document.addEventListener('focusout', () => {
  if (!externalChangePending || state.modal) return;
  setTimeout(() => {
    if (externalChangePending && !state.modal && !formBusy()) {
      externalChangePending = false;
      render();
    }
  }, 0);
});

initPickerGlobalListeners();
window.addEventListener('hashchange', onHashChange);
render();
