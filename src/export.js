/**
 * export.js
 * -----------------------------------------------------------------------
 * Export to PDF, JPG and Excel. Given ONE "group" (the shape
 * calculations.js#groupByCycle returns: { cycleStart, cycleEnd,
 * cycleLabel, records, totalMinutes, totalPay, ... }, optionally narrowed
 * to a single job by jobScopedGroup() below), each function produces a
 * file containing only that group's data and triggers a download.
 *
 * This module never recomputes a duration, rate or total itself — every
 * number printed here comes from calculations.js, so the export can
 * never drift from what the dashboard shows. It has no DOM state of its
 * own and never touches localStorage.
 * -----------------------------------------------------------------------
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import * as calc from './calculations.js';

const APP_TITLE = 'WorkRoaster';
// WorkRoaster is made by Simply Made Studio. Exports credit the studio —
// never a person, and never a repository link (an export must not point
// at a private or dead link).
const PROFILE_URL = 'https://www.simplymadestudio.net/';
const PROFILE_LABEL = 'Simply Made Studio';
const WATERMARK_PLAIN = `WorkRoaster · ${PROFILE_LABEL}`;

const BASE_COLUMNS = [
  { label: 'Date', key: 'date', w: 92 },
  { label: 'Day', key: 'day', w: 44 },
  { label: 'Active hour', key: 'activeHour', w: 124 },
  { label: 'Duration', key: 'duration', w: 64 },
  { label: 'Break', key: 'brk', w: 50 },
  { label: 'Map/Job', key: 'map', w: 64 },
  { label: 'Day type', key: 'dayType', w: 80 },
  { label: 'Payment type', key: 'paymentType', w: 92 },
  { label: 'Mode', key: 'mode', w: 60 },
  { label: 'Pay', key: 'amount', w: 100 },
  { label: 'Rate/hr', key: 'rate', w: 76 },
];
const NOTES_COLUMN = { label: 'Notes', key: 'notes', w: 200 };

// ---------------------------------------------------------------------
// What a report includes (Settings → General → Export, adjustable per
// export). Anything switched off is never written into the file at all —
// no hidden column, no blank cell holding the value, no summary line.
//   time       → the Active hour column (start / end times)
//   hours      → Duration and Break columns, working-time summary and total
//   amount     → Pay and Rate/hr columns, total pay, average rate, every
//                money total — and therefore base salary as well
//   baseSalary → the "Base salary" line(s) shown when the export contains
//                salaried (monthly / yearly fixed pay) shifts
// All on (the default) gives exactly the report this app always produced,
// plus the Base salary line for exports that contain salaried shifts.
// ---------------------------------------------------------------------
const ALL_VISIBLE = { baseSalary: true, time: true, hours: true, amount: true };
function resolveVisibility(visibility) {
  const v = { ...ALL_VISIBLE };
  if (visibility && typeof visibility === 'object') for (const k of Object.keys(v)) if (typeof visibility[k] === 'boolean') v[k] = visibility[k];
  return v;
}
const COLUMN_NEEDS = { activeHour: 'time', duration: 'hours', brk: 'hours', amount: 'amount', rate: 'amount' };

/** Notes get a column — a wide, wrapping one — only when at least one
 *  record in this export actually has notes; otherwise the space goes to
 *  the columns that carry data. Decided per export, never per row, so
 *  the table stays stable. Columns whose information is switched off are
 *  left out entirely. */
function tableColumns(group, visibility = ALL_VISIBLE) {
  const cols = group.records.some((r) => String(r.notes || '').trim()) ? [...BASE_COLUMNS, NOTES_COLUMN] : BASE_COLUMNS;
  return cols.filter((c) => !COLUMN_NEEDS[c.key] || visibility[COLUMN_NEEDS[c.key]]);
}

/** "Base salary" lines for the salaried shifts in this export, from each
 *  record's own salary snapshot (the salary in force when it was saved —
 *  never today's job settings), one per distinct job + salary. */
function baseSalaryLines(group, currency, jobs = []) {
  const seen = new Map();
  for (const r of group.records) {
    const fx = r.fixedPayAtEntry;
    if (!fx || !calc.isFixedPayMode(fx.mode) || !Number.isFinite(Number(fx.amount))) continue;
    const name = (jobs.find((j) => j.id === r.jobId)?.name || group.jobName || 'Salaried job').trim();
    const per = fx.mode === 'yearlyFixed' ? 'year' : 'month';
    const key = `${name}|${per}|${Number(fx.amount)}`;
    if (!seen.has(key)) seen.set(key, `${name}: ${calc.formatMoney(Number(fx.amount), currency)} / ${per}`);
  }
  return [...seen.values()].map((text) => `Base salary — ${text}`);
}

// ---------------------------------------------------------------------
// Theme — pulled from the same values styles.css defines under :root,
// not an unrelated palette invented for exports. A single source of
// truth here means the PDF/JPG/Excel outputs stay in step with the app's
// actual identity if those tokens ever change. Exports always render on
// the LIGHT surface tokens regardless of the app's active theme (light,
// dark or system) — a document has to stay readable and printable on its
// own, independent of whatever theme happened to be active when it was
// generated (see docs/data-model.md-adjacent reasoning in app.js).
// ---------------------------------------------------------------------
const EXPORT_THEME = {
  page: [243, 238, 229], // --bg / --surface-0
  surface: [255, 253, 249], // --surface-1 / --surface-2
  surfaceAlt: [238, 231, 220], // --surface-3
  border: [223, 214, 199], // solid approximation of --border over --surface-1
  textPrimary: [23, 24, 26], // --text-primary
  textSecondary: [91, 94, 99], // --text-secondary
  textMuted: [133, 136, 141], // --text-muted
  accent: [154, 104, 43], // --accent
  accentOnLight: [125, 81, 31], // --accent-text, for text on a light fill
};

const rgbCss = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/** Filenames use real data: the job (or "All_Records") and the cycle's
 *  actual dates — never a hard-coded example name. e.g.
 *  WorkRoaster_Cleaner_2026-09-21_to_2026-10-04.pdf or
 *  WorkRoaster_All_Records_2026-09-21_to_2026-10-04.pdf */
function slugForFilename(text) {
  return (
    String(text || '')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Records'
  );
}

function cycleFilenameBase(group) {
  const start = group.cycleStart || 'unassigned';
  const end = group.cycleEnd || 'unassigned';
  const scope = group.jobName ? slugForFilename(group.jobName) : 'All_Records';
  return `${APP_TITLE}_${scope}_${start}_to_${end}`;
}

/**
 * Narrow a cycle group (calculations.js#groupByCycle's shape) down to one
 * job's records, re-deriving totals from that subset with the same
 * calculations.js helpers everything else uses — so a per-job export is
 * just this same "group" shape, and every export function below stays
 * completely unaware there's a difference. `jobKey` matches how
 * app.js#groupRecordsByJob keys its groups: a job's id, or '__no_job__'.
 */
export function jobScopedGroup(cycle, jobKey, jobName) {
  const records = cycle.records.filter((r) => (r.jobId || '__no_job__') === jobKey);
  return {
    ...cycle,
    key: `${cycle.key}__job__${jobKey}`,
    jobName: jobName || null,
    records,
    totalMinutes: calc.totalMinutes(records),
    totalPay: calc.totalPay(records),
  };
}

function groupSummary(group, currency, visibility = ALL_VISIBLE, jobs = []) {
  return {
    visibility,
    baseSalary: visibility.amount && visibility.baseSalary ? baseSalaryLines(group, currency, jobs) : [],
    title: APP_TITLE,
    job: group.jobName || null,
    range: group.cycleLabel || 'Unassigned',
    totalDuration: calc.formatDuration(group.totalMinutes),
    totalPay: calc.formatMoney(group.totalPay, currency),
    rate: calc.formatRate(group.totalPay, group.totalMinutes, currency),
    recordCount: group.records.length,
  };
}

function recordRows(group, currency) {
  return group.records.map((r) => {
    const mins = calc.recordMinutes(r);
    const breakMins = Number(r.breakMinutes) || 0;
    const effectiveRate = calc.recordEffectiveRate(r);
    return {
      date: r.date ? calc.dateLabel(r.date) : '—',
      day: r.date ? calc.dayName(r.date) : '—',
      activeHour: calc.formatActiveHour(r),
      duration: calc.formatDuration(mins),
      brk: breakMins ? calc.formatDuration(breakMins) : '—',
      map: r.mapNumber || '—',
      dayType: r.dayType || '—',
      paymentType: r.paymentType || '—',
      mode: { hourlyRate: 'Hourly', payment: 'Actual', monthlyFixed: 'Monthly', yearlyFixed: 'Yearly' }[calc.recordPayMode(r)] || 'Actual',
      amount: calc.formatMoney(r.paymentAmount, currency),
      amountValue: Math.round((Number(r.paymentAmount) || 0) * 100) / 100,
      rate: effectiveRate > 0 ? `${calc.formatMoney(effectiveRate, currency)}/hr` : '—',
      rateValue: effectiveRate > 0 ? Math.round(effectiveRate * 100) / 100 : null,
      notes: r.notes || '',
    };
  });
}

/** Whether the closing "Total" row has anything to total (Duration or Pay
 *  columns present) — with both switched off it is left out. */
function hasTotals(columns) {
  return columns.some((c) => c.key === 'duration' || c.key === 'amount' || c.key === 'rate');
}

/** The summary lines under the title, in the order they have always had,
 *  each only when its information is included. */
function summaryStatLines(summary) {
  const v = summary.visibility;
  return [
    v.hours ? `Total working time: ${summary.totalDuration}` : null,
    v.amount ? `Average hourly rate: ${summary.rate}` : null,
    `Records: ${summary.recordCount}`,
  ].filter(Boolean);
}

/** The table's closing "Total" row, aligned to whichever columns exist. */
function totalsRow(columns, summary) {
  return columns.map((c, i) => {
    if (i === 0) return 'Total';
    if (c.key === 'duration') return summary.totalDuration;
    if (c.key === 'amount') return summary.totalPay;
    if (c.key === 'rate') return summary.rate;
    return '';
  });
}

// ---------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------

/** Draws the small bottom-left credit line on the current page — called
 *  once per page via autoTable's didDrawPage hook so a multi-page export
 *  is watermarked consistently and the mark never lands on top of table
 *  data (it lives in the page's bottom margin, below any content). */
function drawPdfWatermark(doc) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - 24;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...EXPORT_THEME.textMuted);
  const prefix = `${APP_TITLE} · `;
  doc.text(prefix, 40, y);
  const prefixWidth = doc.getTextWidth(prefix);
  doc.setTextColor(...EXPORT_THEME.accentOnLight);
  // Clickable where jsPDF supports link annotations; the visible text is
  // identical to the plain (non-clickable) JPG watermark either way.
  doc.textWithLink(PROFILE_LABEL, 40 + prefixWidth, y, { url: PROFILE_URL });
}

export function exportCyclePDF(group, { currency = 'AUD', visibility, jobs } = {}) {
  const vis = resolveVisibility(visibility);
  const summary = groupSummary(group, currency, vis, jobs);
  const rows = recordRows(group, currency);
  const columns = tableColumns(group, vis);
  const payIndex = columns.findIndex((c) => c.key === 'amount');
  const notesIndex = columns.findIndex((c) => c.key === 'notes');
  // Landscape: with one Active hour column, a mode column and (when
  // present) Notes, portrait A4 forced dates and Start – End ranges to
  // wrap onto three lines.
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...EXPORT_THEME.textPrimary);
  doc.text(summary.title, 40, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...EXPORT_THEME.textSecondary);
  let headY = 64;
  if (summary.job) {
    doc.text(`Job: ${summary.job}`, 40, headY);
    headY += 16;
  }
  doc.text(`Pay cycle: ${summary.range}`, 40, headY);
  headY += 26;

  // Total pay leads, larger and bolder than the supporting stats.
  if (vis.amount) {
    doc.setFontSize(9);
    doc.setTextColor(...EXPORT_THEME.textMuted);
    doc.text('TOTAL PAY', 40, headY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...EXPORT_THEME.accentOnLight);
    doc.text(summary.totalPay, 40, headY + 22);
    headY += 42;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...EXPORT_THEME.textPrimary);
  const statLines = [...summaryStatLines(summary), ...summary.baseSalary];
  statLines.forEach((line, i) => doc.text(line, 40, headY + i * 16));

  // Keep dates and Start – End on one line; give Notes real width.
  const columnStyles = {};
  if (payIndex >= 0) columnStyles[payIndex] = { fontStyle: 'bold', halign: 'right' };
  columnStyles[columns.findIndex((c) => c.key === 'date')] = { minCellWidth: 58 };
  const activeIndex = columns.findIndex((c) => c.key === 'activeHour');
  if (activeIndex >= 0) columnStyles[activeIndex] = { minCellWidth: 86 };
  if (notesIndex >= 0) columnStyles[notesIndex] = { cellWidth: 170 };
  const withTotals = hasTotals(columns);

  autoTable(doc, {
    startY: headY + statLines.length * 16 + 10,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => r[c.key])),
    foot: withTotals ? [totalsRow(columns, summary)] : [],
    showFoot: withTotals ? 'lastPage' : 'never',
    styles: { fontSize: 7.5, cellPadding: 4, textColor: EXPORT_THEME.textPrimary, lineColor: EXPORT_THEME.border, lineWidth: 0.5, overflow: 'linebreak' },
    headStyles: { fillColor: EXPORT_THEME.accent, textColor: [255, 255, 255] },
    footStyles: { fillColor: EXPORT_THEME.surfaceAlt, textColor: EXPORT_THEME.textPrimary, fontStyle: 'bold', fontSize: 8.5 },
    columnStyles,
    alternateRowStyles: { fillColor: EXPORT_THEME.surfaceAlt },
    margin: { left: 40, right: 40, bottom: 44 },
    didParseCell: (data) => {
      // The foot's Total pay cell is the one figure that should pop.
      if (data.section === 'foot' && payIndex >= 0 && data.column.index === payIndex) {
        data.cell.styles.textColor = EXPORT_THEME.accentOnLight;
        data.cell.styles.fontSize = 10;
        data.cell.styles.halign = 'right';
      }
    },
    didDrawPage: () => drawPdfWatermark(doc),
  });

  // In case the table ends on a page didDrawPage already handled but a
  // later page has no table content of its own (rare, but cheap to
  // guarantee): make sure the last page is always watermarked too.
  drawPdfWatermark(doc);

  doc.save(`${cycleFilenameBase(group)}.pdf`);
}

// ---------------------------------------------------------------------
// Excel (.xlsx)
// ---------------------------------------------------------------------

/** Excel number format that shows a money cell the way the app does
 *  (symbol before or after, e.g. "A$"#,##0.00) while the cell itself stays
 *  a real number — so SUM, sorting and charts work in Excel/Sheets. */
function excelMoneyFormat(currency, suffix = '') {
  let parts;
  try {
    parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(1234.5);
  } catch {
    parts = [{ type: 'currency', value: '$' }, { type: 'integer', value: '1' }];
  }
  const firstNumber = parts.findIndex((x) => x.type === 'integer');
  const currencyIndex = parts.findIndex((x) => x.type === 'currency');
  const symbol = (parts[currencyIndex]?.value || '$').replace(/"/g, '');
  const before = currencyIndex !== -1 && currencyIndex < firstNumber;
  const gap = parts.some((x, i) => x.type === 'literal' && /\s/.test(x.value) && (before ? i > currencyIndex && i < firstNumber : i > firstNumber)) ? ' ' : '';
  const tail = suffix ? `"${suffix}"` : '';
  return before ? `"${symbol}${gap}"#,##0.00${tail}` : `#,##0.00"${gap}${symbol}"${tail}`;
}

export async function exportCycleExcel(group, { currency = 'AUD', visibility, jobs } = {}) {
  const vis = resolveVisibility(visibility);
  const summary = groupSummary(group, currency, vis, jobs);
  const rows = recordRows(group, currency);
  const columns = tableColumns(group, vis);
  const payCol = columns.findIndex((c) => c.key === 'amount') + 1;
  const notesCol = columns.findIndex((c) => c.key === 'notes') + 1;
  const rateCol = columns.findIndex((c) => c.key === 'rate') + 1;
  const moneyFmt = excelMoneyFormat(currency);
  const rateFmt = excelMoneyFormat(currency, '/hr');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_TITLE;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(summary.job ? summary.job.slice(0, 28) : 'Cycle');

  sheet.addRow([summary.title]).font = { bold: true, size: 14, color: { argb: 'FF9A682B' } };
  if (summary.job) sheet.addRow([`Job: ${summary.job}`]);
  sheet.addRow([`Pay cycle: ${summary.range}`]);
  if (vis.amount) sheet.addRow([`Total pay: ${summary.totalPay}`]).font = { bold: true, size: 13, color: { argb: 'FF7D511F' } };
  summaryStatLines(summary).forEach((line) => sheet.addRow([line]));
  summary.baseSalary.forEach((line) => sheet.addRow([line]));
  sheet.addRow([]);

  const headerRow = sheet.addRow(columns.map((c) => c.label));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9A682B' } };
  });

  rows.forEach((r) => {
    // Pay and rate are written as numbers with a currency format (not text
    // like "A$102.94"), so the sheet can be summed and sorted.
    const row = sheet.addRow(columns.map((c) => (c.key === 'amount' ? r.amountValue : c.key === 'rate' && r.rateValue !== null ? r.rateValue : r[c.key])));
    if (payCol) {
      row.getCell(payCol).numFmt = moneyFmt;
      row.getCell(payCol).font = { bold: true };
    }
    if (rateCol && r.rateValue !== null) row.getCell(rateCol).numFmt = rateFmt;
    if (notesCol) row.getCell(notesCol).alignment = { wrapText: true, vertical: 'top' };
  });

  if (hasTotals(columns)) {
    const totalRow = sheet.addRow(totalsRow(columns, summary));
    if (payCol) {
      const totalPayValue = Math.round(rows.reduce((sum, r) => sum + r.amountValue, 0) * 100) / 100;
      // A plain number, not a =SUM formula: the workbook stays formula-free, so
      // nothing in it can ever be evaluated as a formula when opened.
      totalRow.getCell(payCol).value = totalPayValue;
      totalRow.getCell(payCol).numFmt = moneyFmt;
    }
    const totalRate = calc.hourlyRate(group.totalPay, group.totalMinutes);
    if (rateCol && totalRate > 0) {
      totalRow.getCell(rateCol).value = Math.round(totalRate * 100) / 100;
      totalRow.getCell(rateCol).numFmt = rateFmt;
    }
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEE7DC' } };
    });
    if (payCol) totalRow.getCell(payCol).font = { bold: true, size: 12, color: { argb: 'FF7D511F' } };
  }

  sheet.columns = columns.map((c) => ({ width: c.key === 'notes' ? 42 : Math.max(10, Math.round(c.w / 7)) }));

  sheet.addRow([]);
  const creditRow = sheet.addRow([WATERMARK_PLAIN]);
  creditRow.font = { italic: true, size: 9, color: { argb: 'FF85888D' } };
  creditRow.getCell(1).value = { text: WATERMARK_PLAIN, hyperlink: PROFILE_URL };
  creditRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF7D511F' }, underline: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cycleFilenameBase(group)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------
// JPG — drawn directly on an offscreen canvas (a clean report, not a
// screenshot of the app UI). Export output must be deterministic, so
// nothing here reads live DOM state or the app's current theme — the
// same EXPORT_THEME constants used above for PDF/Excel.
// ---------------------------------------------------------------------

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Word-wrap text to a width, capped at maxLines (last line ellipsised)
 *  — used only for Notes, so a real note is readable instead of cut to a
 *  few characters. */
function wrapToWidth(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines.map((l) => truncateToWidth(ctx, l, maxWidth));
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = truncateToWidth(ctx, `${kept[maxLines - 1]}…`, maxWidth);
  return kept;
}

export function exportCycleJPG(group, { currency = 'AUD', visibility, jobs } = {}) {
  const vis = resolveVisibility(visibility);
  const summary = groupSummary(group, currency, vis, jobs);
  const rows = recordRows(group, currency);
  const columns = tableColumns(group, vis);
  const withTotals = hasTotals(columns);

  // Never narrower than the summary text needs (a report with few columns
  // still has room for its header lines).
  const width = Math.max(columns.reduce((sum, c) => sum + c.w, 0) + 60, 640);
  const headerH = (summary.job ? 196 : 174) - (vis.amount ? 0 : 50) + summary.baseSalary.length * 20;
  const tableHeaderH = 28;
  const lineH = 14;
  const baseRowH = 24;
  const footerH = 26;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // Measure wrapped notes first (fonts must be set to measure) so each
  // row's height is known before sizing the canvas.
  ctx.font = '11px Arial, Helvetica, sans-serif';
  const notesCol = columns.find((c) => c.key === 'notes');
  const rowLines = rows.map((r) => (notesCol ? wrapToWidth(ctx, r.notes, notesCol.w - 12, 4) : ['']));
  const rowHeights = rowLines.map((lines) => Math.max(baseRowH, 10 + lines.length * lineH));
  const bodyH = rows.length ? rowHeights.reduce((a, b) => a + b, 0) : baseRowH;
  const totalRowH = withTotals ? 30 : 0;
  const height = headerH + tableHeaderH + bodyH + totalRowH + footerH + 16;

  canvas.width = width;
  canvas.height = height;

  // Background + brand accent bar — the app's own warm surface + accent,
  // not an unrelated color.
  ctx.fillStyle = rgbCss(EXPORT_THEME.page);
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = rgbCss(EXPORT_THEME.accent);
  ctx.fillRect(0, 0, width, 5);

  // Title + job / cycle range
  ctx.fillStyle = rgbCss(EXPORT_THEME.textPrimary);
  ctx.font = 'bold 24px Arial, Helvetica, sans-serif';
  ctx.fillText(summary.title, 30, 42);

  let headY = 64;
  ctx.fillStyle = rgbCss(EXPORT_THEME.textSecondary);
  ctx.font = '14px Arial, Helvetica, sans-serif';
  if (summary.job) {
    ctx.fillText(`Job: ${summary.job}`, 30, headY);
    headY += 22;
  }
  ctx.fillText(`Pay cycle: ${summary.range}`, 30, headY);
  headY += 26;

  // Total pay leads, then the supporting stats
  if (vis.amount) {
    ctx.fillStyle = rgbCss(EXPORT_THEME.textMuted);
    ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
    ctx.fillText('TOTAL PAY', 30, headY);
    ctx.fillStyle = rgbCss(EXPORT_THEME.accentOnLight);
    ctx.font = 'bold 26px Arial, Helvetica, sans-serif';
    ctx.fillText(summary.totalPay, 30, headY + 28);
    headY += 50;
  }

  ctx.fillStyle = rgbCss(EXPORT_THEME.textPrimary);
  ctx.font = '13px Arial, Helvetica, sans-serif';
  ctx.fillText(summaryStatLines(summary).join('   ·   '), 30, headY);
  summary.baseSalary.forEach((line, i) => ctx.fillText(truncateToWidth(ctx, line, width - 60), 30, headY + 20 * (i + 1)));

  // Table header
  const tableY = headerH;
  ctx.fillStyle = rgbCss(EXPORT_THEME.surfaceAlt);
  ctx.fillRect(30, tableY, width - 60, tableHeaderH);
  ctx.fillStyle = rgbCss(EXPORT_THEME.textPrimary);
  ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
  let x = 30;
  columns.forEach((c) => {
    ctx.fillText(truncateToWidth(ctx, c.label, c.w - 10), x + 6, tableY + 18);
    x += c.w;
  });

  // Table rows
  if (!rows.length) {
    ctx.font = '11px Arial, Helvetica, sans-serif';
    ctx.fillStyle = rgbCss(EXPORT_THEME.textMuted);
    ctx.fillText('No records in this selection.', 36, tableY + tableHeaderH + 17);
  }
  let y = tableY + tableHeaderH;
  rows.forEach((r, i) => {
    const rowH = rowHeights[i];
    if (i % 2 === 1) {
      ctx.fillStyle = rgbCss(EXPORT_THEME.surface);
      ctx.fillRect(30, y, width - 60, rowH);
    }
    ctx.fillStyle = rgbCss(EXPORT_THEME.textPrimary);
    let cx = 30;
    columns.forEach((c) => {
      if (c.key === 'notes') {
        ctx.font = '11px Arial, Helvetica, sans-serif';
        rowLines[i].forEach((line, li) => ctx.fillText(line, cx + 6, y + 16 + li * lineH));
      } else {
        ctx.font = c.key === 'amount' ? 'bold 12px Arial, Helvetica, sans-serif' : '11px Arial, Helvetica, sans-serif';
        ctx.fillText(truncateToWidth(ctx, String(r[c.key] ?? ''), c.w - 10), cx + 6, y + 16);
      }
      cx += c.w;
    });
    y += rowH;
  });
  if (!rows.length) y += baseRowH;

  // Total row
  if (withTotals) {
    ctx.fillStyle = rgbCss(EXPORT_THEME.surfaceAlt);
    ctx.fillRect(30, y, width - 60, totalRowH);
    const totals = totalsRow(columns, summary);
    let tx = 30;
    columns.forEach((c, i) => {
      if (totals[i]) {
        const isPay = c.key === 'amount';
        ctx.fillStyle = rgbCss(isPay ? EXPORT_THEME.accentOnLight : EXPORT_THEME.textPrimary);
        ctx.font = isPay ? 'bold 14px Arial, Helvetica, sans-serif' : 'bold 11px Arial, Helvetica, sans-serif';
        ctx.fillText(truncateToWidth(ctx, totals[i], c.w - 10), tx + 6, y + 20);
      }
      tx += c.w;
    });
  }

  // Bottom-left watermark — a raster image can't carry a real hyperlink,
  // so this is the plain-text equivalent of the PDF's clickable one.
  ctx.fillStyle = rgbCss(EXPORT_THEME.textMuted);
  ctx.font = '10px Arial, Helvetica, sans-serif';
  ctx.fillText(WATERMARK_PLAIN, 30, height - 12);

  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cycleFilenameBase(group)}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    'image/jpeg',
    0.92
  );
}
