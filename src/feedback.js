/**
 * feedback.js
 * -----------------------------------------------------------------------
 * Settings → Feedback. WorkRoaster has no backend (it is a static,
 * localStorage-only site), so feedback is sent the plain, honest way: the
 * person's OWN email app opens with a message to FEEDBACK_EMAIL already
 * written. Nothing leaves the device until they press Send in that app,
 * and WorkRoaster itself never transmits anything.
 *
 * The address is public on purpose (the owner chose a mailto link over a
 * server). Device details are only added when the person ticks the box.
 * -----------------------------------------------------------------------
 */

export const FEEDBACK_EMAIL = 'samiiiur@yahoo.com';
export const FEEDBACK_SUBJECT = 'WorkRoaster feedback';
// mailto: links travel as a URL; email apps (and Windows' URL handler)
// reliably accept about 2,000 characters, so the message is kept well
// inside that once it has been URL-encoded.
export const FEEDBACK_MAX_LENGTH = 1500;
const MAX_URL_LENGTH = 1900;

/** A short, non-identifying description of the device — only used when the
 *  person chooses to include it (helps reproduce layout bugs on phones). */
export function feedbackDeviceSummary(env = {}) {
  const parts = [];
  if (env.userAgent) parts.push(`Browser: ${String(env.userAgent).slice(0, 180)}`);
  if (env.screen) parts.push(`Screen: ${env.screen}`);
  if (env.theme) parts.push(`Theme: ${env.theme}`);
  if (env.standalone) parts.push('Opened from the home screen');
  return parts.join('\n');
}

/**
 * Build the email for the person's mail app. Always resolves to an object —
 * never throws: { ok: true, url, body } or { ok: false, error }.
 */
export function buildFeedbackEmail(message, { device = '' } = {}) {
  const trimmed = String(message || '').trim();
  if (!trimmed) return { ok: false, error: 'Please write a message before sending.' };
  if (trimmed.length > FEEDBACK_MAX_LENGTH) {
    return { ok: false, error: `That's a little long — please keep feedback under ${FEEDBACK_MAX_LENGTH.toLocaleString()} characters, or copy it into an email yourself.` };
  }
  const footer = ['—', 'Sent from WorkRoaster (work-roaster.vercel.app)', device ? `\n${device}` : ''].filter(Boolean).join('\n');
  const body = `${trimmed}\n\n${footer}`;
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(body)}`;
  if (url.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'That message is too long for an email link — please shorten it, or copy it into an email yourself.' };
  }
  return { ok: true, url, body };
}
