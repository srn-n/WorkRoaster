// Settings → Feedback: the mailto link handed to the person's email app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedbackEmail, feedbackDeviceSummary, FEEDBACK_EMAIL, FEEDBACK_SUBJECT, FEEDBACK_MAX_LENGTH } from '../../src/feedback.js';

const bodyOf = (url) => decodeURIComponent(new URL(url).searchParams.get('body') ?? '');

test('an empty or blank message is refused with a friendly error', () => {
  for (const m of ['', '   \n  ', null, undefined]) {
    const r = buildFeedbackEmail(m);
    assert.equal(r.ok, false);
    assert.match(r.error, /write a message/i);
  }
});

test('a message builds a mailto link to the feedback address with subject and body', () => {
  const r = buildFeedbackEmail('  Love the pay cycle view!  ');
  assert.equal(r.ok, true);
  assert.ok(r.url.startsWith(`mailto:${FEEDBACK_EMAIL}?`));
  const params = new URL(r.url).searchParams;
  assert.equal(params.get('subject'), FEEDBACK_SUBJECT);
  assert.ok(params.get('body').startsWith('Love the pay cycle view!'), 'trimmed message first');
  assert.match(params.get('body'), /Sent from WorkRoaster/);
});

test('special characters are URL-encoded and survive the round trip', () => {
  const msg = 'Rate & tax? 50% off #2 — "quotes" + emoji 🎉\nSecond line';
  const r = buildFeedbackEmail(msg);
  assert.equal(r.ok, true);
  assert.ok(!r.url.includes(' '), 'no raw spaces in the link');
  assert.ok(!/[&#?]\s/.test(r.url.split('?')[1].replace(/&body=/, '').replace(/^subject=/, '')), 'no stray separators');
  assert.ok(new URL(r.url).searchParams.get('body').startsWith(msg));
});

test('device details are only included when given', () => {
  const plain = buildFeedbackEmail('Hello');
  assert.doesNotMatch(plain.body, /Browser:/);
  const device = feedbackDeviceSummary({ userAgent: 'TestAgent/1.0', screen: '390×844', theme: 'dark', standalone: true });
  const withDevice = buildFeedbackEmail('Hello', { device });
  assert.match(withDevice.body, /Browser: TestAgent\/1\.0/);
  assert.match(withDevice.body, /Screen: 390×844/);
  assert.match(withDevice.body, /home screen/);
  assert.equal(feedbackDeviceSummary({}), '');
});

test('over-long messages are refused instead of producing a broken link', () => {
  const tooLong = buildFeedbackEmail('x'.repeat(FEEDBACK_MAX_LENGTH + 1));
  assert.equal(tooLong.ok, false);
  // Within the character limit but heavy to encode (each emoji ≈ 12 URL chars).
  const heavy = buildFeedbackEmail('🎉'.repeat(600));
  assert.equal(heavy.ok, false);
  assert.match(heavy.error, /too long/i);
  const fine = buildFeedbackEmail('ok '.repeat(300));
  assert.equal(fine.ok, true);
  assert.ok(bodyOf(fine.url).length > 0);
});
