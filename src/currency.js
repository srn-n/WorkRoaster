/**
 * currency.js
 * -----------------------------------------------------------------------
 * Which currency codes Settings accepts. A fixed list of active ISO 4217
 * codes is used rather than "does Intl.NumberFormat accept it?", because
 * Intl happily formats any well-formed three-letter code — including
 * made-up ones like "ZZZ" — so construction alone proves nothing.
 *
 * Only NEW input is validated. A code already saved by an older version
 * is never rewritten (see app.js general settings): amounts keep the
 * label the user has been seeing, and Settings explains the problem.
 * -----------------------------------------------------------------------
 */

// Active ISO 4217 currency codes (excluding funds, precious metals and
// testing codes such as XAU, XDR, XTS, XXX).
const ISO_4217_ACTIVE =
  'AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD ' +
  'CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP ' +
  'GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD ' +
  'KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN ' +
  'NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP ' +
  'SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND ' +
  'VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG';

export const SUPPORTED_CURRENCIES = new Set(ISO_4217_ACTIVE.split(' '));

/** Normalise user input: trimmed and upper-cased. */
export function normalizeCurrencyInput(value) {
  return String(value ?? '').trim().toUpperCase();
}

/** True only for a supported (active ISO 4217) code, e.g. "AUD". */
export function isSupportedCurrency(code) {
  return SUPPORTED_CURRENCIES.has(normalizeCurrencyInput(code));
}

/** Shown first in Settings, in this order (AUD is the default currency). */
export const MAJOR_CURRENCIES = [
  'AUD', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'MYR', 'BDT', 'NZD', 'CAD', 'SGD', 'INR',
  'CNY', 'HKD', 'CHF', 'AED', 'SAR', 'PHP', 'IDR', 'THB', 'VND', 'NPR', 'PKR', 'LKR', 'ZAR',
];

/** "Australian dollar" for "AUD" (falls back to the code itself). */
export function currencyName(code, locale = undefined) {
  try {
    const name = new Intl.DisplayNames(locale, { type: 'currency' }).of(code);
    return name && name !== code ? name.charAt(0).toUpperCase() + name.slice(1) : code;
  } catch {
    return code;
  }
}

// Characters a custom symbol or name may NOT contain. Money strings are
// placed into the page's HTML in many places, so anything that could form
// markup or break an attribute is refused here, at the source, as well as
// control characters.
const UNSAFE_CUSTOM = /[<>&"'`\\\u0000-\u001f\u007f]/g;

/**
 * A personalised currency: the person's own symbol (e.g. "Tk", "₩", "pts")
 * and an optional name. Nothing is converted — amounts are whatever the
 * person enters; this only changes how they are labelled.
 * Returns { symbol, name } or null when there is no usable symbol.
 */
export function normalizeCustomCurrency(value) {
  if (!value || typeof value !== 'object') return null;
  const symbol = String(value.symbol ?? '').replace(UNSAFE_CUSTOM, '').trim().slice(0, 6);
  const name = String(value.name ?? '').replace(UNSAFE_CUSTOM, '').trim().slice(0, 30);
  return symbol ? { symbol, name } : null;
}
