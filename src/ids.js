/**
 * ids.js
 * -----------------------------------------------------------------------
 * Record, job and option ids end up inside HTML attributes (data-id,
 * element ids, CSS selectors). Ids WorkRoaster makes itself are always
 * plain (UUIDs, slugs, base-36 stamps), but an id read from storage or an
 * imported backup file could be anything. safeId() passes a plain id
 * through unchanged and maps anything else to a stable "id-…" token, so
 * the same unsafe id always becomes the same safe one and links between a
 * record and its job survive.
 * -----------------------------------------------------------------------
 */

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

export function isSafeId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export function safeId(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value);
  if (SAFE_ID.test(text)) return text;
  // Two independent 32-bit FNV-1a style hashes: stable and collision-resistant enough for ids.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822519);
  }
  return `id-${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}
