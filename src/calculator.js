// A small standalone calculator shown under the work calendar.
//
// It is deliberately isolated from the rest of the app: it never reads or
// writes records, jobs, settings or LocalStorage, and its state lives only
// in this module (lost on reload by design). The arithmetic is a pure
// reducer — `calculatorReduce(state, action)` — so it can be reasoned
// about (and tested) without the DOM.

export const CALC_ERROR_DIVIDE = 'Cannot divide by 0';
const MAX_DIGITS = 15;

export function initialCalculatorState() {
  return {
    display: '0', // the number being entered or the last result (plain string, '.' decimal)
    raw: null, // full-precision value behind `display` when it is a computed result (null while typing)
    acc: null, // left operand while an operator is pending
    op: null, // pending operator: '+', '-', '*', '/'
    waiting: false, // true right after an operator: the next digit starts a new number
    justEvaluated: false, // true right after '=' / '%': the next digit starts over
    lastOp: null, // for repeated '=': the operator…
    lastOperand: null, // …and right operand of the last evaluation
    expression: '', // the small line above the display, e.g. "32 × 7.5 ="
    error: null, // error message while in an error state
  };
}

export const OP_SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

/** Round away binary floating-point noise (0.1 + 0.2 → 0.3). */
export function cleanNumber(n) {
  if (!Number.isFinite(n)) return n;
  const cleaned = parseFloat(n.toPrecision(12));
  return Object.is(cleaned, -0) ? 0 : cleaned;
}

function toDisplay(n) {
  const v = cleanNumber(n);
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return v.toExponential(8).replace(/\.?0+e/, 'e');
  return String(v);
}

function apply(a, op, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : a / b;
    default: return b;
  }
}

/** The value to calculate with: the full-precision result when the display
 *  shows one (so 1 ÷ 3 × 3 is 1, not 0.999999999999 from a rounded 1/3),
 *  otherwise exactly what was typed. */
function currentValue(s) {
  return s.raw !== null && s.raw !== undefined ? s.raw : Number(s.display);
}

/** Human-readable number for the expression line / display (1234.5 → "1,234.5"). */
export function formatCalcNumber(str) {
  if (typeof str !== 'string' || /e/i.test(str) || !/^-?\d*\.?\d*$/.test(str)) return str;
  const negative = str.startsWith('-');
  const [intPart, decPart] = (negative ? str.slice(1) : str).split('.');
  const grouped = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${decPart !== undefined ? `.${decPart}` : ''}`;
}

const fmt = (n) => formatCalcNumber(toDisplay(n));

function errorState(expression) {
  return { ...initialCalculatorState(), display: '0', expression, error: CALC_ERROR_DIVIDE };
}

/**
 * Pure calculator reducer. Actions:
 *   { type: 'digit', value: '0'–'9' } · { type: 'decimal' }
 *   { type: 'operator', value: '+'|'-'|'*'|'/' } · { type: 'equals' }
 *   { type: 'percent' } · { type: 'backspace' } · { type: 'clear' }
 */
export function calculatorReduce(state, action) {
  const s = state || initialCalculatorState();
  if (action.type === 'clear') return initialCalculatorState();
  // Any new entry after an error starts fresh; other keys are ignored.
  if (s.error) {
    if (action.type === 'digit' || action.type === 'decimal') return calculatorReduce(initialCalculatorState(), action);
    if (action.type === 'backspace') return initialCalculatorState();
    return s;
  }

  switch (action.type) {
    case 'digit': {
      if (s.waiting || s.justEvaluated) {
        return { ...s, display: action.value, raw: null, waiting: false, justEvaluated: false, ...(s.justEvaluated ? { expression: '', lastOp: null, lastOperand: null } : {}) };
      }
      const digits = s.display.replace(/[-.]/g, '').length;
      if (digits >= MAX_DIGITS) return s;
      const display = s.display === '0' ? action.value : s.display === '-0' ? `-${action.value}` : s.display + action.value;
      return { ...s, display, raw: null };
    }
    case 'decimal': {
      if (s.waiting || s.justEvaluated) {
        return { ...s, display: '0.', raw: null, waiting: false, justEvaluated: false, ...(s.justEvaluated ? { expression: '', lastOp: null, lastOperand: null } : {}) };
      }
      if (s.display.includes('.')) return s;
      return { ...s, display: `${s.display}.`, raw: null };
    }
    case 'operator': {
      const current = currentValue(s);
      // Changing your mind: "5 + ×" just swaps the operator.
      if (s.op && s.waiting) {
        return { ...s, op: action.value, expression: `${fmt(s.acc)} ${OP_SYMBOLS[action.value]}` };
      }
      let acc = current;
      if (s.op) {
        // Chained: "2 + 3 ×" evaluates 2 + 3 first (left to right, like a basic calculator).
        const result = apply(s.acc, s.op, current);
        if (result === null) return errorState(`${fmt(s.acc)} ${OP_SYMBOLS[s.op]} ${fmt(current)}`);
        acc = result; // keep full precision; only the display is tidied
      }
      return { ...s, acc, raw: acc, op: action.value, waiting: true, justEvaluated: false, display: toDisplay(acc), expression: `${fmt(acc)} ${OP_SYMBOLS[action.value]}`, lastOp: null, lastOperand: null };
    }
    case 'equals': {
      if (s.op) {
        const operand = currentValue(s);
        const result = apply(s.acc, s.op, operand);
        const expression = `${fmt(s.acc)} ${OP_SYMBOLS[s.op]} ${fmt(operand)} =`;
        if (result === null) return errorState(expression);
        return { ...s, display: toDisplay(result), raw: result, acc: null, op: null, waiting: false, justEvaluated: true, lastOp: s.op, lastOperand: operand, expression };
      }
      // Repeated equals: "5 + 3 = = =" keeps adding 3.
      if (s.lastOp !== null) {
        const left = currentValue(s);
        const result = apply(left, s.lastOp, s.lastOperand);
        const expression = `${fmt(left)} ${OP_SYMBOLS[s.lastOp]} ${fmt(s.lastOperand)} =`;
        if (result === null) return errorState(expression);
        return { ...s, display: toDisplay(result), raw: result, justEvaluated: true, expression };
      }
      return { ...s, justEvaluated: true };
    }
    case 'percent': {
      const current = currentValue(s);
      // "200 + 15 %" → 15 % of 200 (= 30), like a basic calculator;
      // otherwise (alone, or after × ÷) it simply divides by 100.
      const value = s.op && (s.op === '+' || s.op === '-') && !s.waiting ? (s.acc * current) / 100 : current / 100;
      return { ...s, display: toDisplay(value), raw: value, waiting: false, justEvaluated: !s.op, expression: s.op ? s.expression : `${fmt(current)}% =` };
    }
    case 'backspace': {
      if (s.waiting || s.justEvaluated) return s; // results aren't edited digit by digit
      const next = s.display.slice(0, -1);
      return { ...s, display: next === '' || next === '-' ? '0' : next, raw: null };
    }
    default:
      return s;
  }
}

// ---------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------

let calcState = initialCalculatorState();

const KEYS = [
  { label: 'C', action: { type: 'clear' }, cls: 'calc-key-fn', aria: 'Clear' },
  { label: '⌫', action: { type: 'backspace' }, cls: 'calc-key-fn', aria: 'Backspace' },
  { label: '%', action: { type: 'percent' }, cls: 'calc-key-fn', aria: 'Percent' },
  { label: '÷', action: { type: 'operator', value: '/' }, cls: 'calc-key-op', aria: 'Divide' },
  { label: '7', action: { type: 'digit', value: '7' } },
  { label: '8', action: { type: 'digit', value: '8' } },
  { label: '9', action: { type: 'digit', value: '9' } },
  { label: '×', action: { type: 'operator', value: '*' }, cls: 'calc-key-op', aria: 'Multiply' },
  { label: '4', action: { type: 'digit', value: '4' } },
  { label: '5', action: { type: 'digit', value: '5' } },
  { label: '6', action: { type: 'digit', value: '6' } },
  { label: '−', action: { type: 'operator', value: '-' }, cls: 'calc-key-op', aria: 'Subtract' },
  { label: '1', action: { type: 'digit', value: '1' } },
  { label: '2', action: { type: 'digit', value: '2' } },
  { label: '3', action: { type: 'digit', value: '3' } },
  { label: '+', action: { type: 'operator', value: '+' }, cls: 'calc-key-op', aria: 'Add' },
  { label: '0', action: { type: 'digit', value: '0' }, cls: 'calc-key-wide' },
  { label: '.', action: { type: 'decimal' }, aria: 'Decimal point' },
  { label: '=', action: { type: 'equals' }, cls: 'calc-key-equals', aria: 'Equals' },
];

const esc = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function displayText(s) {
  return s.error || formatCalcNumber(s.display);
}

export function renderCalculator() {
  const s = calcState;
  return `
    <section class="panel calculator-panel" aria-labelledby="calculator-heading">
      <div class="panel-head">
        <div>
          <h2 id="calculator-heading">Calculator</h2>
          <p class="panel-hint">For quick sums. It never changes your records.</p>
        </div>
      </div>
      <div class="calculator" id="calculator">
        <div class="calc-screen" id="calc-screen" tabindex="0" role="group" aria-label="Calculator display. With focus here or on a key, you can type numbers and + − * / % Enter Backspace Escape.">
          <div class="calc-expression" id="calc-expression" aria-hidden="true">${esc(s.expression) || '&nbsp;'}</div>
          <output class="calc-display ${s.error ? 'is-error' : ''}" id="calc-display" aria-live="polite" aria-atomic="true">${esc(displayText(s))}</output>
        </div>
        <div class="calc-keys">
          ${KEYS.map((k, i) => `<button type="button" class="calc-key ${k.cls || ''}" data-calc-key="${i}"${k.aria ? ` aria-label="${esc(k.aria)}"` : ''}>${esc(k.label)}</button>`).join('')}
        </div>
      </div>
    </section>`;
}

function reducedMotion() {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function paint(root, prev) {
  const display = root.querySelector('#calc-display');
  const expression = root.querySelector('#calc-expression');
  if (expression) expression.innerHTML = esc(calcState.expression) || '&nbsp;';
  if (!display) return;
  display.textContent = displayText(calcState);
  display.classList.toggle('is-error', !!calcState.error);
  // A result (=, %, chained operator, error) gets a soft fade-in; typing does not.
  const isResult = calcState.error || (calcState.justEvaluated && !prev.justEvaluated) || (calcState.waiting && !prev.waiting) || (calcState.justEvaluated && calcState.expression !== prev.expression);
  if (isResult && !reducedMotion()) {
    display.classList.remove('is-result');
    void display.offsetWidth;
    display.classList.add('is-result');
  }
}

function dispatch(root, action) {
  const prev = calcState;
  calcState = calculatorReduce(calcState, action);
  paint(root, prev);
}

function pressFeedback(root, index) {
  const key = root.querySelector(`[data-calc-key="${index}"]`);
  if (!key || reducedMotion()) return;
  key.classList.remove('is-pressed');
  void key.offsetWidth;
  key.classList.add('is-pressed');
}

function keyToAction(e) {
  const k = e.key;
  if (/^[0-9]$/.test(k)) return { type: 'digit', value: k };
  if (k === '.' || k === ',' || k === 'Decimal') return { type: 'decimal' };
  if (k === '+') return { type: 'operator', value: '+' };
  if (k === '-' || k === '−') return { type: 'operator', value: '-' };
  if (k === '*' || k === 'x' || k === 'X' || k === '×') return { type: 'operator', value: '*' };
  if (k === '/' || k === '÷') return { type: 'operator', value: '/' };
  if (k === '%') return { type: 'percent' };
  if (k === 'Enter' || k === '=') return { type: 'equals' };
  if (k === 'Backspace' || k === 'Delete') return { type: 'backspace' };
  if (k === 'Escape') return { type: 'clear' };
  return null;
}

function actionKeyIndex(action) {
  return KEYS.findIndex((k) => k.action.type === action.type && (k.action.value || null) === (action.value || null));
}

/** Wire the calculator. Keyboard input is scoped to the calculator itself:
 *  keys only count while focus is inside it, so typing in any form field
 *  anywhere else in the app is never intercepted. */
export function wireCalculator(root) {
  if (!root) return;
  root.addEventListener('click', (e) => {
    const key = e.target.closest('[data-calc-key]');
    if (!key) return;
    const index = Number(key.dataset.calcKey);
    dispatch(root, KEYS[index].action);
    pressFeedback(root, index);
  });
  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target;
    if (target.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    // Enter/Space on a focused key activate that key (normal button
    // behaviour); Enter anywhere else in the calculator means "=".
    if ((e.key === 'Enter' || e.key === ' ') && target.matches?.('[data-calc-key]')) return;
    const action = keyToAction(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    dispatch(root, action);
    pressFeedback(root, actionKeyIndex(action));
  });
  root.addEventListener('animationend', (e) => e.target.classList?.remove('is-pressed', 'is-result'));
}

/** Test/debug helper: the calculator's current display string. */
export function calculatorDisplay() {
  return displayText(calcState);
}
