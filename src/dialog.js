/*
 * dialog.js — themed replacements for confirm() and prompt().
 *
 * The browser's own dialogs ignore WorkRoaster's theme (grey system boxes
 * on the website). These look like the rest of the app in every theme,
 * light or dark, on the website and in the Android app alike.
 *
 *   await askConfirm('Delete this note?', { confirmLabel: 'Delete', danger: true })  → true / false
 *   await askText('Rename profile to:', 'Work')                                      → string / null
 *
 * Text is set with textContent (never HTML), Escape / the backdrop / the
 * Android back button cancel, Enter confirms, and focus is kept inside the
 * dialog and returned to where it was afterwards.
 */

let current = null; // { close(result) } while a dialog is open

/** Close the open dialog as if Cancel was chosen. Returns true if one was open. */
export function cancelOpenDialog() {
  if (!current) return false;
  current.close(null);
  return true;
}

export function isDialogOpen() {
  return current !== null;
}

function build({ message, title, confirmLabel, cancelLabel, danger, input }) {
  const doc = document;
  const backdrop = doc.createElement('div');
  backdrop.className = 'wr-dialog-backdrop';
  const box = doc.createElement('div');
  box.className = 'wr-dialog';
  box.setAttribute('role', input ? 'dialog' : 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  const id = `wr-dialog-${Date.now().toString(36)}`;

  if (title) {
    const h = doc.createElement('h2');
    h.className = 'wr-dialog-title';
    h.id = `${id}-title`;
    h.textContent = title;
    box.append(h);
    box.setAttribute('aria-labelledby', h.id);
  }
  const body = doc.createElement('p');
  body.className = 'wr-dialog-message';
  body.id = `${id}-message`;
  body.textContent = message;
  box.append(body);
  box.setAttribute(title ? 'aria-describedby' : 'aria-labelledby', body.id);

  let field = null;
  if (input) {
    field = doc.createElement('input');
    field.type = 'text';
    field.className = 'wr-dialog-input';
    field.value = input.value ?? '';
    field.maxLength = input.maxLength ?? 80;
    field.setAttribute('aria-labelledby', body.id);
    field.autocomplete = 'off';
    box.append(field);
  }

  const actions = doc.createElement('div');
  actions.className = 'wr-dialog-actions';
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn secondary';
  cancel.textContent = cancelLabel;
  const ok = doc.createElement('button');
  ok.type = 'button';
  ok.className = `btn ${danger ? 'danger' : 'primary'}`;
  ok.textContent = confirmLabel;
  actions.append(cancel, ok);
  box.append(actions);
  backdrop.append(box);
  return { backdrop, box, field, ok, cancel };
}

function open(options) {
  if (current) current.close(null); // never stack two
  const prevFocus = document.activeElement;
  const ui = build(options);
  document.body.append(ui.backdrop);
  document.documentElement.classList.add('has-wr-dialog');
  requestAnimationFrame(() => ui.backdrop.classList.add('is-open'));

  return new Promise((resolve) => {
    const focusables = () => [ui.field, ui.cancel, ui.ok].filter(Boolean);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      } else if (e.key === 'Enter' && (e.target === ui.field || e.target === ui.ok)) {
        e.preventDefault();
        finish(options.input ? ui.field.value : true);
      } else if (e.key === 'Tab') {
        const list = focusables();
        const i = list.indexOf(document.activeElement);
        e.preventDefault();
        list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].focus();
      }
    };
    const finish = (result) => {
      if (!current) return;
      current = null;
      document.removeEventListener('keydown', onKey, true);
      ui.backdrop.remove();
      document.documentElement.classList.remove('has-wr-dialog');
      if (prevFocus && typeof prevFocus.focus === 'function' && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
      resolve(options.input ? (result === null ? null : String(result)) : result === true);
    };
    current = { close: finish };
    document.addEventListener('keydown', onKey, true);
    ui.ok.addEventListener('click', () => finish(options.input ? ui.field.value : true));
    ui.cancel.addEventListener('click', () => finish(null));
    ui.backdrop.addEventListener('mousedown', (e) => {
      if (e.target === ui.backdrop) finish(null);
    });
    (ui.field || (options.danger ? ui.cancel : ui.ok)).focus({ preventScroll: true });
    if (ui.field) ui.field.select();
  });
}

/** Themed confirm(): resolves true when confirmed, false otherwise. */
export function askConfirm(message, { title = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false } = {}) {
  return open({ message, title, confirmLabel, cancelLabel, danger, input: null });
}

/** Themed prompt(): resolves the typed text, or null when cancelled. */
export function askText(message, value = '', { title = '', confirmLabel = 'Save', cancelLabel = 'Cancel', maxLength = 80 } = {}) {
  return open({ message, title, confirmLabel, cancelLabel, danger: false, input: { value, maxLength } });
}
