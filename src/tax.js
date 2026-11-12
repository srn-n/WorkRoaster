/**
 * tax.js
 * -----------------------------------------------------------------------
 * Optional income-tax ESTIMATE (Settings → Tax estimate, off by default).
 *
 * How it works: a pay cycle's pay is annualised (× cycles per year), the
 * country's annual tax is worked out on that, and the cycle's share is
 * taken back out (÷ cycles per year) — the same idea employers use for
 * withholding. It is an estimate for a resident employee with no other
 * income, deductions, offsets or credits beyond the ones listed for each
 * country below. Everything runs on the device; no data leaves it.
 *
 * Every figure below comes from the official source listed with it. When a
 * country changes its rates, update that country's entry (rates, year,
 * `checked`) and its test in tests/unit/tax.test.mjs.
 * -----------------------------------------------------------------------
 */

/** Tax on `income` under progressive bands: [[upTo, rate], …, [Infinity, rate]]. */
export function progressive(income, bands) {
  let tax = 0;
  let lower = 0;
  for (const [upTo, rate] of bands) {
    if (income <= lower) break;
    tax += (Math.min(income, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

const round2 = (n) => Math.round(n * 100) / 100;
const pos = (n) => (n > 0 ? n : 0);

// ---------------------------------------------------------------------
// Country rules. Each: name, currency, year, checked (when the figures were
// last verified), options (shown in Settings), bands (shown to the person),
// notes (what the estimate leaves out), sources, and compute(income, opts)
// → [{ label, amount }] annual amounts.
// ---------------------------------------------------------------------

const AU = {
  id: 'AU',
  name: 'Australia',
  currency: 'AUD',
  year: '2026–27 income year (1 Jul 2026 – 30 Jun 2027)',
  checked: '2026-11',
  options: [{ id: 'medicare', type: 'toggle', label: 'Include the 2% Medicare levy', default: true }],
  bands: [
    ['$0 – $18,200', 'Nil'],
    ['$18,201 – $45,000', '15%'],
    ['$45,001 – $135,000', '30%'],
    ['$135,001 – $190,000', '37%'],
    ['Over $190,000', '45%'],
  ],
  explain: [
    'Resident rates. The 15% rate (down from 16%) applies from 1 July 2026.',
    'Low income tax offset (LITO) of up to $700 is applied: $700 up to $37,500, reducing to nil at about $66,667.',
    'Medicare levy 2%, phased in above the low-income threshold of $28,011 (singles).',
  ],
  notes: 'Assumes an Australian resident claiming the tax-free threshold, with no HELP debt, Medicare levy surcharge, deductions or other offsets.',
  sources: [
    { label: 'Moneysmart (ASIC) – Income tax rates 2026–27', url: 'https://moneysmart.gov.au/work-and-tax/income-tax' },
    { label: 'Australian Taxation Office', url: 'https://www.ato.gov.au/' },
  ],
  compute(income, o) {
    const gross = progressive(income, [[18200, 0], [45000, 0.15], [135000, 0.3], [190000, 0.37], [Infinity, 0.45]]);
    const lito = income <= 37500 ? 700 : income <= 45000 ? 700 - 0.05 * (income - 37500) : income <= 66667 ? 325 - 0.015 * (income - 45000) : 0;
    const parts = [{ label: 'Income tax', amount: pos(gross - pos(lito)) }];
    if (o.medicare) {
      const low = 28011;
      const medicare = income <= low ? 0 : Math.min(0.1 * (income - low), 0.02 * income);
      parts.push({ label: 'Medicare levy', amount: medicare });
    }
    return parts;
  },
};

const US_BANDS = {
  single: { deduction: 16100, bands: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]], addlMedicare: 200000 },
  married: { deduction: 32200, bands: [[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]], addlMedicare: 250000 },
};

const US = {
  id: 'US',
  name: 'United States',
  currency: 'USD',
  year: 'Tax year 2026 (federal)',
  checked: '2026-11',
  options: [
    { id: 'filing', type: 'select', label: 'Filing status', default: 'single', choices: [{ value: 'single', label: 'Single' }, { value: 'married', label: 'Married filing jointly' }] },
    { id: 'fica', type: 'toggle', label: 'Include Social Security and Medicare (FICA)', default: true },
  ],
  bands: [
    ['Standard deduction', '$16,100 single · $32,200 joint'],
    ['$0 – $12,400 (single)', '10%'],
    ['$12,401 – $50,400', '12%'],
    ['$50,401 – $105,700', '22%'],
    ['$105,701 – $201,775', '24%'],
    ['$201,776 – $256,225', '32%'],
    ['$256,226 – $640,600', '35%'],
    ['Over $640,600', '37%'],
  ],
  explain: [
    'Federal income tax on income after the standard deduction (joint filers: thresholds roughly double; 37% above $768,700).',
    'FICA: Social Security 6.2% on wages up to $184,500, Medicare 1.45% (plus 0.9% above $200,000 single / $250,000 joint).',
  ],
  notes: 'Federal only — state and local income taxes are not included. No credits (child tax credit, EITC) or itemised deductions.',
  sources: [
    { label: 'IRS – Tax inflation adjustments for tax year 2026 (IR-2025-103)', url: 'https://www.irs.gov/node/151941' },
    { label: 'SSA – 2026 Social Security changes (wage base)', url: 'https://www.ssa.gov/news/en/cola/factsheets/2026.html' },
  ],
  compute(income, o) {
    const t = US_BANDS[o.filing] || US_BANDS.single;
    const parts = [{ label: 'Federal income tax', amount: progressive(pos(income - t.deduction), t.bands) }];
    if (o.fica) {
      parts.push({ label: 'Social Security', amount: 0.062 * Math.min(income, 184500) });
      parts.push({ label: 'Medicare', amount: 0.0145 * income + 0.009 * pos(income - t.addlMedicare) });
    }
    return parts;
  },
};

const UK = {
  id: 'UK',
  name: 'United Kingdom',
  currency: 'GBP',
  year: '2026–27 tax year (6 Apr 2026 – 5 Apr 2027)',
  checked: '2026-11',
  options: [{ id: 'ni', type: 'toggle', label: 'Include employee National Insurance', default: true }],
  bands: [
    ['Personal Allowance', '£12,570 (0%)'],
    ['£12,571 – £50,270', '20%'],
    ['£50,271 – £125,140', '40%'],
    ['Over £125,140', '45%'],
  ],
  explain: [
    'England, Wales and Northern Ireland rates. The Personal Allowance falls by £1 for every £2 of income over £100,000.',
    'Employee Class 1 National Insurance: 8% between £12,570 and £50,270, 2% above.',
  ],
  notes: 'Scottish income tax rates are different and are not used here. No pension contributions, student loan or other reliefs.',
  sources: [
    { label: 'GOV.UK – Income Tax rates and allowances', url: 'https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past' },
    { label: 'GOV.UK – Rates and thresholds for employers 2026 to 2027', url: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027' },
  ],
  compute(income, o) {
    const allowance = pos(12570 - pos(income - 100000) / 2);
    const taxable = pos(income - allowance);
    const parts = [{ label: 'Income tax', amount: progressive(taxable, [[37700, 0.2], [125140, 0.4], [Infinity, 0.45]]) }];
    if (o.ni) parts.push({ label: 'National Insurance', amount: 0.08 * pos(Math.min(income, 50270) - 12570) + 0.02 * pos(income - 50270) });
    return parts;
  },
};

/** Korea: employment income deduction (근로소득공제), capped at ₩20M. */
export function krEmploymentDeduction(salary) {
  const d =
    salary <= 5e6 ? salary * 0.7
      : salary <= 15e6 ? 3.5e6 + (salary - 5e6) * 0.4
        : salary <= 45e6 ? 7.5e6 + (salary - 15e6) * 0.15
          : salary <= 100e6 ? 12e6 + (salary - 45e6) * 0.05
            : 14.75e6 + (salary - 100e6) * 0.02;
  return Math.min(d, 20e6);
}

const KR = {
  id: 'KR',
  name: 'South Korea',
  currency: 'KRW',
  year: '2026 (calendar year)',
  checked: '2026-11',
  options: [{ id: 'local', type: 'toggle', label: 'Include local income tax (10% of national tax)', default: true }],
  bands: [
    ['Up to ₩14,000,000', '6%'],
    ['₩14M – ₩50M', '15%'],
    ['₩50M – ₩88M', '24%'],
    ['₩88M – ₩150M', '35%'],
    ['₩150M – ₩300M', '38%'],
    ['₩300M – ₩500M', '40%'],
    ['₩500M – ₩1B', '42%'],
    ['Over ₩1B', '45%'],
  ],
  explain: [
    'Salary first gets the employment income deduction (70% / 40% / 15% / 5% / 2% bands, up to ₩20M) and the ₩1.5M basic deduction.',
    'The earned income tax credit is applied (55% of tax up to ₩1.3M, 30% above; limited by salary).',
    'Local income tax adds 10% of the national tax.',
  ],
  notes: 'Progressive rates for a resident employee. Social insurance (pension, health, employment) and other credits are not included. Not for the 19% flat-rate option for foreign workers.',
  sources: [
    { label: 'PwC Worldwide Tax Summaries – Korea: deductions', url: 'https://taxsummaries.pwc.com/republic-of-korea/individual/deductions' },
    { label: 'PwC Worldwide Tax Summaries – Korea: tax credits', url: 'https://taxsummaries.pwc.com/republic-of-korea/individual/other-tax-credits-and-incentives' },
    { label: 'National Tax Service (NTS)', url: 'https://www.nts.go.kr/' },
  ],
  compute(income, o) {
    const taxable = pos(income - krEmploymentDeduction(income) - 1.5e6);
    const calc = progressive(taxable, [[14e6, 0.06], [50e6, 0.15], [88e6, 0.24], [150e6, 0.35], [300e6, 0.38], [500e6, 0.4], [1e9, 0.42], [Infinity, 0.45]]);
    const credit = calc <= 1.3e6 ? calc * 0.55 : 715000 + (calc - 1.3e6) * 0.3;
    const cap = income <= 70e6 ? 740000 : income <= 120e6 ? Math.max(500000, 660000 - (income - 70e6) / 2) : Math.max(200000, 500000 - (income - 120e6) / 2);
    const national = pos(calc - Math.min(credit, cap));
    const parts = [{ label: 'Income tax', amount: national }];
    if (o.local) parts.push({ label: 'Local income tax', amount: national * 0.1 });
    return parts;
  },
};

/** Japan 2026: employment income deduction (給与所得控除), minimum ¥740,000. */
export function jpEmploymentDeduction(salary) {
  const d =
    salary <= 1.9e6 ? 650000
      : salary <= 3.6e6 ? salary * 0.3 + 80000
        : salary <= 6.6e6 ? salary * 0.2 + 440000
          : salary <= 8.5e6 ? salary * 0.1 + 1.1e6
            : 1.95e6;
  return Math.min(salary, Math.max(740000, d));
}

/** Japan 2026: national basic deduction (基礎控除) by total income. */
export function jpBasicDeduction(totalIncome) {
  if (totalIncome <= 4.89e6) return 1.04e6;
  if (totalIncome <= 6.55e6) return 670000;
  if (totalIncome <= 23.5e6) return 620000;
  if (totalIncome <= 24e6) return 480000;
  if (totalIncome <= 24.5e6) return 320000;
  if (totalIncome <= 25e6) return 160000;
  return 0;
}

const JP = {
  id: 'JP',
  name: 'Japan',
  currency: 'JPY',
  year: '2026 (calendar year)',
  checked: '2026-11',
  options: [{ id: 'resident', type: 'toggle', label: 'Include resident tax (about 10%, billed the following year)', default: true }],
  bands: [
    ['Up to ¥1,950,000', '5%'],
    ['¥1.95M – ¥3.3M', '10%'],
    ['¥3.3M – ¥6.95M', '20%'],
    ['¥6.95M – ¥9M', '23%'],
    ['¥9M – ¥18M', '33%'],
    ['¥18M – ¥40M', '40%'],
    ['Over ¥40M', '45%'],
  ],
  explain: [
    'Salary first gets the employment income deduction (at least ¥740,000 for 2026) and the basic deduction (¥1,040,000 for total income up to ¥4.89M; less above).',
    'National income tax plus the 2.1% reconstruction surtax.',
    'Resident tax (municipal + prefectural) is about 10% of income after a ¥430,000 deduction, and is billed the following year.',
  ],
  notes: 'Social insurance (health, pension, employment — roughly 15% of salary) is not included, nor are dependant or other deductions.',
  sources: [
    { label: 'JETRO – Taxes in Japan (rates and employment income deduction)', url: 'https://www.jetro.go.jp/en/invest/setting_up/section3/page7/' },
    { label: 'BDO – Japan 2026 tax reform (deductions)', url: 'https://www.bdo.global/en-gb/insights/tax/expatriate-tax/japan-2026-tax-reform-new-exemptions,-new-surtax,-new-global-mobility-implications' },
    { label: 'National Tax Agency', url: 'https://www.nta.go.jp/english/' },
  ],
  compute(income, o) {
    const employmentIncome = pos(income - jpEmploymentDeduction(income));
    const taxable = Math.floor(pos(employmentIncome - jpBasicDeduction(employmentIncome)) / 1000) * 1000;
    const national = progressive(taxable, [[1.95e6, 0.05], [3.3e6, 0.1], [6.95e6, 0.2], [9e6, 0.23], [18e6, 0.33], [40e6, 0.4], [Infinity, 0.45]]);
    const parts = [{ label: 'Income tax (incl. 2.1% surtax)', amount: national * 1.021 }];
    if (o.resident) parts.push({ label: 'Resident tax', amount: pos(employmentIncome - 430000) * 0.1 });
    return parts;
  },
};

const MY = {
  id: 'MY',
  name: 'Malaysia',
  currency: 'MYR',
  year: 'Year of assessment 2026',
  checked: '2026-11',
  options: [],
  bands: [
    ['RM0 – 5,000', '0%'],
    ['RM5,001 – 20,000', '1%'],
    ['RM20,001 – 35,000', '3%'],
    ['RM35,001 – 50,000', '6%'],
    ['RM50,001 – 70,000', '11%'],
    ['RM70,001 – 100,000', '19%'],
    ['RM100,001 – 400,000', '25%'],
    ['RM400,001 – 600,000', '26%'],
    ['RM600,001 – 2,000,000', '28%'],
    ['Over RM2,000,000', '30%'],
  ],
  explain: [
    'Chargeable income = income minus the RM9,000 individual relief.',
    'A RM400 rebate applies when chargeable income is RM35,000 or less.',
  ],
  notes: 'Resident individual. EPF, insurance, lifestyle and other reliefs are not included, so the estimate may be higher than your actual tax. (Budget 2027 proposes changes from YA 2027.)',
  sources: [
    { label: 'PwC Malaysian Tax Booklet 2026/2027 – Personal income tax', url: 'https://www.pwc.com/my/en/publications/mtb/personal-income-tax.html' },
    { label: 'LHDN (HASiL) – Inland Revenue Board of Malaysia', url: 'https://www.hasil.gov.my/' },
  ],
  compute(income) {
    const chargeable = pos(income - 9000);
    const tax = progressive(chargeable, [[5000, 0], [20000, 0.01], [35000, 0.03], [50000, 0.06], [70000, 0.11], [100000, 0.19], [400000, 0.25], [600000, 0.26], [2e6, 0.28], [Infinity, 0.3]]);
    return [{ label: 'Income tax', amount: pos(tax - (chargeable <= 35000 ? 400 : 0)) }];
  },
};

const BD_THRESHOLDS = { general: 375000, women: 425000, disability: 500000, freedomFighter: 525000 };

const BD = {
  id: 'BD',
  name: 'Bangladesh',
  currency: 'BDT',
  year: 'Income year 2026–27 (tax years 2026–27 and 2027–28 slabs)',
  checked: '2026-11',
  options: [
    {
      id: 'category', type: 'select', label: 'Taxpayer category', default: 'general',
      choices: [
        { value: 'general', label: 'General (Tk 375,000 tax-free)' },
        { value: 'women', label: 'Women or aged 65+ (Tk 425,000)' },
        { value: 'disability', label: 'Disability or third gender (Tk 500,000)' },
        { value: 'freedomFighter', label: 'War-wounded freedom fighter / July Warrior (Tk 525,000)' },
      ],
    },
    { id: 'salaried', type: 'toggle', label: 'Salaried: one-third of salary (up to Tk 500,000) is exempt', default: true },
  ],
  bands: [
    ['First Tk 375,000 (general)', '0%'],
    ['Next Tk 300,000', '10%'],
    ['Next Tk 400,000', '15%'],
    ['Next Tk 500,000', '20%'],
    ['Next Tk 2,000,000', '25%'],
    ['Above that', '30%'],
  ],
  explain: [
    'Slabs announced in the FY2026–27 budget for tax years 2026–27 and 2027–28; the old 5% slab is gone.',
    'For salaried people, one-third of income from employment or Tk 500,000, whichever is lower, is exempt first.',
  ],
  notes: 'Investment tax rebate and the minimum tax (which depends on where you live) are not included.',
  sources: [
    { label: 'Budget speech FY2026–27 (Annex B, income tax tables)', url: 'https://awproddc.customs.gov.bd/files/BudgetSpeech_2026_2027_E.pdf' },
    { label: 'PwC Worldwide Tax Summaries – Bangladesh: deductions', url: 'https://taxsummaries.pwc.com/bangladesh/individual/deductions' },
    { label: 'National Board of Revenue', url: 'https://nbr.gov.bd/' },
  ],
  compute(income, o) {
    const exempt = o.salaried ? Math.min(income / 3, 500000) : 0;
    const taxable = pos(income - exempt);
    const free = BD_THRESHOLDS[o.category] || BD_THRESHOLDS.general;
    const tax = progressive(taxable, [[free, 0], [free + 300000, 0.1], [free + 700000, 0.15], [free + 1.2e6, 0.2], [free + 3.2e6, 0.25], [Infinity, 0.3]]);
    return [{ label: 'Income tax', amount: tax }];
  },
};

export const TAX_COUNTRIES = [AU, US, UK, KR, JP, MY, BD];
const BY_ID = Object.fromEntries(TAX_COUNTRIES.map((c) => [c.id, c]));

export function taxCountry(id) {
  return BY_ID[id] || null;
}

/** Saved settings → a clean { enabled, country, options } (unknown bits dropped). */
export function normalizeTaxSettings(value) {
  const v = value && typeof value === 'object' ? value : {};
  const country = BY_ID[v.country] ? v.country : 'AU';
  const options = {};
  for (const opt of BY_ID[country].options) {
    const raw = v.options && typeof v.options === 'object' ? v.options[opt.id] : undefined;
    if (opt.type === 'toggle') options[opt.id] = typeof raw === 'boolean' ? raw : opt.default;
    else options[opt.id] = opt.choices.some((c) => c.value === raw) ? raw : opt.default;
  }
  return { enabled: v.enabled === true, country, options };
}

/** Annual estimate: { parts:[{label, amount}], total } rounded to cents. */
export function annualTax(countryId, annualIncome, options = {}) {
  const c = BY_ID[countryId];
  const income = Number(annualIncome) > 0 ? Number(annualIncome) : 0;
  if (!c || income <= 0) return { parts: [], total: 0 };
  const opts = normalizeTaxSettings({ country: countryId, options }).options;
  const parts = c.compute(income, opts).map((p) => ({ label: p.label, amount: round2(pos(p.amount)) }));
  return { parts, total: round2(parts.reduce((s, p) => s + p.amount, 0)) };
}

/** Cycles per year for a pay-cycle length in days (7 → 52, 14 → 26, 30 → 12, 365 → 1). */
export function cyclesPerYear(cycleLengthDays) {
  const d = Number(cycleLengthDays);
  if (d === 7) return 52;
  if (d === 14) return 26;
  if (d === 30) return 12;
  if (d === 365) return 1;
  return d > 0 ? 365 / d : 26;
}

/**
 * Estimate for one pay cycle: annualise its pay, take the country's tax,
 * and return the cycle's share. null when the estimate is off.
 */
export function cycleTaxEstimate(cyclePay, cycleLengthDays, taxSettings) {
  const t = normalizeTaxSettings(taxSettings);
  if (!t.enabled) return null;
  const pay = Number(cyclePay) > 0 ? Number(cyclePay) : 0;
  const n = cyclesPerYear(cycleLengthDays);
  const year = annualTax(t.country, pay * n, t.options);
  const parts = year.parts.map((p) => ({ label: p.label, amount: round2(p.amount / n) }));
  const tax = round2(parts.reduce((s, p) => s + p.amount, 0));
  return { country: t.country, tax, net: round2(pay - tax), parts, rate: pay > 0 ? tax / pay : 0 };
}
