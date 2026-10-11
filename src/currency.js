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
