/**
 * feedback.js
 * -----------------------------------------------------------------------
 * The frontend side of the Settings → Feedback form. Deliberately kept
 * separate from app.js and from every other module so the eventual swap
 * to real email delivery is a single, obvious, isolated change: submitFeedback()
 * below is the ONLY function that will need to change once a backend
 * exists — nothing else in this app needs to know or care how (or
 * whether) delivery actually happens.
 *
 * WorkRoaster has no backend today (see README.md / docs/data-model.md —
 * it's a static, localStorage-only site). Wiring real delivery requires:
 *
 *   WorkRoaster frontend
 *     -> a Vercel serverless function (e.g. POST /api/feedback)
 *       -> an email-sending provider (not chosen yet)
 *         -> the destination inbox
 *
 * The destination address is intentionally absent from this entire
 * codebase — it must never ship to the browser (no `mailto:`, no
 * client-readable env var, nothing in this file or anywhere else client-
 * side). Choosing a provider and adding the serverless function is a
 * separate piece of work with its own decision to make first.
 * -----------------------------------------------------------------------
 */

const MAX_LENGTH = 4000;

/**
 * Validates and "submits" feedback text. Always resolves — never throws —
 * with { ok: true } or { ok: false, error, notConnected? }.
 *
 * Today this always resolves ok:false with notConnected:true: there is no
 * endpoint to send to yet, so nothing here pretends a message was
 * delivered. That is the honest, correct behaviour until a real backend
 * exists — see the module comment above. When that endpoint exists, only
 * the body of this function changes (e.g. to a `fetch('/api/feedback', …)`
 * call); the caller in app.js does not need to change at all.
 */
export async function submitFeedback(message) {
  const trimmed = String(message || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Please write a message before sending.' };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, error: `That's a little long — please keep feedback under ${MAX_LENGTH.toLocaleString()} characters.` };
  }

  return {
    ok: false,
    notConnected: true,
    error: "Feedback delivery isn't connected yet, so this message wasn't sent anywhere — the interface is ready, the sending backend isn't built yet.",
  };
}
