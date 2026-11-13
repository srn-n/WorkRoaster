/*
 * press.js — touch press and "just switched" feedback.
 *
 * A mouse gets the springy press from CSS :active alone. A finger often
 * doesn't: Android's WebView (and Chrome on phones) holds back :active until
 * it knows the touch isn't a scroll, so a quick tap shows little or no
 * squeeze and the spring never plays. Here a touch adds .is-pressed straight
 * away, keeps it for a moment however quick the tap, and lets go so the
 * spring in styles.css bounces back. A drag (scroll) lets go at once.
 *
 * Switching an option (a radio card, a weekday chip, a tick box) gets the
 * one-shot "pop" the theme cards already had, even when the change redraws
 * the screen.
 *
 * Presentation only: nothing here reads or changes data.
 */

/** Everything that already springs on :active in styles.css. */
export const PRESSABLE = [
  '.btn', '.icon-btn', '.chip-tab', '.override-chip', '.rate-choice', '.weekday-chip',
  '.visual-theme-card', '.segmented-option', '.mode-option', '.date-picker-day',
  '.job-picker-option', '.rail-tab', '.text-link-btn', '.calc-key',
].join(', ');

/** Controls whose activation counts as a "tap" for vibration. */
export const TAPPABLE = `${PRESSABLE}, .checkbox-field, .note-check, .cycle-toggle, .option-trigger, .job-select-trigger, .time-picker-trigger, .time-picker-option, .date-picker-nav-btn, .cycle-nav-btn, button, [role="button"], [role="tab"], [role="option"], input[type="checkbox"], input[type="radio"]`;

export const MIN_PRESS_MS = 110; // long enough to see the squeeze on a quick tap
export const SCROLL_SLOP_PX = 8; // a finger that moves further is scrolling

/** How much longer the pressed look should stay once the finger lifts. */
export function pressHoldRemaining(downAt, now, min = MIN_PRESS_MS) {
  return Math.max(0, min - Math.max(0, now - downAt));
}

function isDisabled(el) {
  return !!(el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('fieldset:disabled'));
}

/** What should pop when this input changes (looked up again after a redraw). */
function popTargetFor(input) {
  const card = input.closest('.segmented-option, .mode-option, .visual-theme-card');
  if (card) return card;
  const chip = input.closest('.weekday-chip');
  if (chip) return chip.querySelector('span');
  if (input.type === 'checkbox') return input;
  return null;
}

function findAgain(doc, { id, name, value }) {
  if (id) return doc.getElementById(id);
  if (!name) return null;
  return [...doc.querySelectorAll('input')].find((i) => i.name === name && i.value === value) || null;
}

/**
 * @param {Document} doc
 * @param {{ reduced: () => boolean, onTap?: (el: Element) => void }} options
 *   reduced: true when movement should be skipped (device setting or "Minimal").
 *   onTap: called once per activated control (vibration hooks in here).
 */
export function installPressFeedback(doc, { reduced, onTap } = {}) {
  const win = doc.defaultView;
  let pressed = null; // { el, downAt, x, y, pointerId }
  const timers = new WeakMap();

  const release = (immediate) => {
    if (!pressed) return;
    const { el, downAt } = pressed;
    pressed = null;
    const wait = immediate ? 0 : pressHoldRemaining(downAt, win.performance.now());
    clearTimeout(timers.get(el));
    if (!wait) el.classList.remove('is-pressed');
    else timers.set(el, setTimeout(() => el.classList.remove('is-pressed'), wait));
  };

  doc.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    release(true);
    const el = e.target instanceof win.Element ? e.target.closest(PRESSABLE) : null;
    if (!el || isDisabled(el) || reduced?.()) return;
    clearTimeout(timers.get(el));
    el.classList.add('is-pressed');
    pressed = { el, downAt: win.performance.now(), x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  }, { passive: true });

  doc.addEventListener('pointermove', (e) => {
    if (!pressed || e.pointerId !== pressed.pointerId) return;
    if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > SCROLL_SLOP_PX) release(true);
  }, { passive: true });
  doc.addEventListener('pointerup', () => release(false), { passive: true });
  doc.addEventListener('pointercancel', () => release(true), { passive: true }); // the WebView took over to scroll

  // One tap = one callback, even though tapping a <label> also clicks its input.
  let lastTapAt = 0;
  doc.addEventListener('click', (e) => {
    if (!onTap) return;
    const el = e.target instanceof win.Element ? e.target.closest(TAPPABLE) : null;
    if (!el || isDisabled(el)) return;
    const now = win.performance.now();
    if (now - lastTapAt < 80) return;
    lastTapAt = now;
    onTap(el);
  }, true);

  doc.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof win.HTMLInputElement) || (input.type !== 'radio' && input.type !== 'checkbox')) return;
    if (reduced?.() || !popTargetFor(input)) return;
    const key = { id: input.id, name: input.name, value: input.value };
    // After the app's own handler (which may redraw the screen).
    setTimeout(() => {
      const now = input.isConnected ? input : findAgain(doc, key);
      const target = now && popTargetFor(now);
      if (!target) return;
      target.classList.remove('is-switched');
      void target.offsetWidth; // restart the animation on a quick re-tap
      target.classList.add('is-switched');
      target.addEventListener('animationend', () => target.classList.remove('is-switched'), { once: true });
    }, 0);
  });
}
