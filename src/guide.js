/**
 * guide.js
 * -----------------------------------------------------------------------
 * Static content for the in-app Guide (Header → Guide). Content only —
 * rendering, search and navigation live in app.js (renderGuideModal).
 *
 * Every statement here describes behaviour that exists in the current
 * code (calculations.js, jobs.js, storage.js, export.js, app.js). When a
 * feature changes, update the matching topic here. Nothing in this file
 * is read by any calculation, storage or export code.
 *
 * Shape: sections → topics. A topic's `body` is trusted static HTML;
 * `keywords` are extra search terms; `example` names an interactive
 * example rendered by app.js#renderGuideExample (it only reads its own
 * inputs and never touches records or settings).
 * -----------------------------------------------------------------------
 */

export const GUIDE_INTRO =
  'WorkRoaster is a personal ledger for the work you do and what it pays. Log shifts across one or more jobs — hourly, paid per task, or on a monthly or yearly salary — let it work out your pay (or your real hourly rate), and see everything organised by pay cycle — all stored in this browser, on this device.';

export const GUIDE_SECTIONS = [
  {
    id: 'start',
    label: 'Getting started',
    summary: 'What WorkRoaster does and the quickest path from zero to your first pay cycle.',
    topics: [
      {
        title: 'What WorkRoaster is for',
        keywords: 'about overview purpose ledger',
        body: `<p>WorkRoaster answers two everyday questions: <strong>“How much have I worked?”</strong> and <strong>“What should I have been paid?”</strong> It keeps a record of every shift, calculates pay from your rates (or your real hourly rate from what you were paid), and groups everything into pay cycles so you can check each pay against your own records.</p>`,
      },
      {
        title: 'The basic workflow',
        keywords: 'steps first time setup how to begin',
        body: `<ol class="guide-steps">
          <li><strong>Add a job</strong> — Settings → Jobs. Optional, but it's what unlocks automatic rates.</li>
          <li><strong>Configure it</strong> — choose how it's paid (Hourly rate, Actual payment, Monthly fixed pay or Yearly fixed pay), then its rate or salary and schedule.</li>
          <li><strong>Record work</strong> — fill in <em>Add a work record</em> and press <em>Add record</em>.</li>
          <li><strong>See it in its pay cycle</strong> — the dashboard and <em>Pay-cycle history</em> update straight away.</li>
          <li><strong>Review earnings</strong> — totals per cycle, per job and overall.</li>
          <li><strong>Export or back up</strong> — PDF, JPG or Excel per cycle; JSON/CSV for everything.</li>
        </ol>`,
      },
      {
        title: 'Your first job and record',
        keywords: 'create first job first record add work',
        body: `<p>Open <strong>Settings → Jobs</strong>, fill in <em>Add a job</em> (a name, how it's paid, and its rate or salary) and press <em>Save job</em>. Back on the main page, pick that job in the record form, set the date (typed, or picked on the <em>Work calendar</em>) and times, and press <em>Add record</em>.</p>
          <p>You don't need a job to start: choose <em>No job (manual entry)</em> and type your rate or payment yourself. On an empty ledger, <em>Load sample data</em> fills in a few example records to explore.</p>`,
      },
      {
        title: 'Where your history lives',
        keywords: 'find old records history past cycles',
        body: `<p>Scroll below the record form to <strong>Pay-cycle history</strong>. Every cycle you've worked in has a summary row; the current one is open, older ones are collapsed — click one to open it. The dashboard at the top can also page back through past cycles with its arrow buttons.</p>`,
      },
    ],
  },
  {
    id: 'jobs',
    label: 'Jobs',
    summary: 'Each job carries its own pay mode and rates, applied automatically to new records.',
    topics: [
      {
        title: 'Creating a job',
        keywords: 'add job new job setup employer name',
        body: `<p>Settings → Jobs → <em>Add a job</em>. Everything is set in one step:</p>
          <ul>
            <li><strong>Job name</strong> and an optional <strong>employer</strong>.</li>
            <li><strong>How is this job paid?</strong> — one of four methods (below). The form only shows the fields that method uses.</li>
            <li>For <em>Hourly rate</em> and <em>Actual payment</em>: a <strong>Standard / base hourly rate</strong> (required for an hourly job; for an actual-payment job it's an optional <em>expected</em> rate, used only for comparison), plus <strong>Saturday</strong>, <strong>Sunday</strong> and <strong>Additional loading</strong> rules.</li>
            <li>For <em>Monthly fixed pay</em> and <em>Yearly fixed pay</em>: the <strong>salary</strong>, your <strong>working days</strong> and a <strong>standard start, end and break</strong> (see <em>Fixed-pay jobs</em>).</li>
            <li>Optional <strong>notes</strong>.</li>
          </ul>`,
      },
      {
        title: 'The four ways a job can be paid',
        keywords: 'payment method hourly actual monthly yearly salary fixed mode',
        body: `<ul>
            <li><strong>Hourly rate</strong> — paid for your time, e.g. $30/hour. Pay = working hours × the applicable rate.</li>
            <li><strong>Actual payment</strong> — you enter what you were paid, e.g. $40 per delivery or task. WorkRoaster works out your effective hourly rate.</li>
            <li><strong>Monthly fixed pay</strong> — a monthly salary, e.g. $4,840 a month, on a regular schedule.</li>
            <li><strong>Yearly fixed pay</strong> — an annual salary, e.g. $62,400 a year, on a regular schedule.</li>
          </ul>
          <p>Each job has its own method, so different jobs can be paid in different ways.</p>`,
      },
      {
        title: 'Rate rules: Saturday, Sunday, additional loading',
        keywords: 'weekend penalty rate saturday sunday loading percentage multiplier flat rate',
        body: `<p>Each rule is one of:</p>
          <ul>
            <li><strong>No adjustment</strong></li>
            <li><strong>Percentage (+%)</strong> — e.g. +50% turns $30 into $45.</li>
            <li><strong>Multiplier (×)</strong> — e.g. 1.5× is the same as +50%.</li>
            <li><strong>Flat rate ($)</strong> — on a Saturday/Sunday rule it <em>replaces</em> the hourly rate; as additional loading it <em>adds</em> that many dollars per hour.</li>
          </ul>
          <p>Saturday and Sunday rules follow the record's <strong>date</strong> — not its Day type or Payment type label. Additional loading applies on any day.</p>`,
      },
      {
        title: 'Public holidays and overtime',
        keywords: 'public holiday overtime loading rate',
        body: `<p>There's no separate public-holiday rate. When a record's Day type or Payment type mentions <em>Public Holiday</em>, or its Payment type mentions <em>Overtime</em>, WorkRoaster asks whether to apply the job's <strong>additional loading</strong> before saving. Weekend shifts get a similar question for the Saturday/Sunday rule.</p>`,
      },
      {
        title: 'Pay-cycle length is app-wide',
        keywords: 'pay cycle configuration per job fortnight',
        body: `<p>Jobs don't have their own pay-cycle settings — cycle length is one setting for the whole app (Settings → General). See <em>Pay cycles</em>.</p>`,
      },
      {
        title: 'Editing a job',
        keywords: 'edit job change rate change mode',
        body: `<p>Settings → Jobs → <em>Edit</em>. You can change anything, including how it's paid, its rates, or its salary and schedule. Changes apply only to records you add <strong>afterwards</strong> — every saved record keeps the rates, salary and mode it was entered with.</p>`,
      },
      {
        title: 'Archiving instead of deleting',
        keywords: 'archive restore delete job remove',
        body: `<p>Jobs are never deleted. <em>Archive</em> hides a job from the job list for new records; every record already linked to it keeps showing it. <em>Restore</em> brings it back.</p>`,
      },
    ],
  },
  {
    id: 'fixed',
    label: 'Fixed-pay jobs',
    summary: 'Monthly and yearly salaries: how the schedule is set, and how each day’s pay is recorded.',
    topics: [
      {
        title: 'Setting up a salaried job',
        keywords: 'monthly fixed yearly fixed salary setup working days schedule standard hours weekend',
        body: `<p>In Add a job (or Edit), choose <strong>Monthly fixed pay</strong> or <strong>Yearly fixed pay</strong> and fill in:</p>
          <ul>
            <li><strong>Monthly pay</strong> / <strong>Yearly pay</strong> — the salary, e.g. $4,840 a month or $62,400 a year.</li>
            <li><strong>Working days</strong> — tick the days you normally work. Days left unticked are days off, so any pattern works — Monday to Friday, Wednesday to Sunday, weekends only.</li>
            <li><strong>Standard start</strong>, <strong>Standard end</strong> and <strong>Break</strong> — your usual hours, e.g. 9:00 AM – 5:00 PM with a 30-minute break.</li>
          </ul>`,
      },
      {
        title: 'Standard hours fill in the record form',
        keywords: 'auto fill autofill default times standard start end break record',
        body: `<p>When you pick a salaried job in the record form, its standard start, end (or working time) and break are filled in for you. They're only a starting point: change any of them for a shift that ran differently. The hours you save are the hours recorded.</p>`,
      },
      {
        title: 'How a day’s pay is worked out',
        keywords: 'day share salary per day scheduled working days calculation formula',
        body: `<p>A salary isn't turned into an hourly rate. Instead, each record on one of your working days carries that day's share of the salary:</p>
          <p class="guide-formula">Monthly pay ÷ scheduled working days in that calendar month = <strong>day's share</strong><br>Yearly pay ÷ scheduled working days in that calendar year = <strong>day's share</strong></p>
          <p>For example, $4,840 a month with Monday–Friday working days in a month that has 22 weekdays is $220 a day. Log every scheduled day of that month and the shares add up to exactly the month's salary: when it doesn't divide into whole cents, the leftover cents go one each to the first scheduled days (May 2026 has 21 weekdays, so thirteen days are $230.48 and eight are $230.47).</p>
          <ul>
            <li>A record on a day that isn't one of your working days is saved with <strong>$0</strong> — the salary already covers your scheduled days.</li>
            <li>If you add a second record for the same job on the same day (a split shift), only the first carries the day's share; the others are $0, so a day is never paid twice. If you delete that first record, or move it to another day, the next record for that day takes over the share.</li>
          </ul>
          <p>The record form shows the calculation, whether the day counts, and how the month is adding up so far.</p>`,
      },
      {
        title: 'Effective hourly rate is for insight only',
        keywords: 'effective rate analytical salaried hourly comparison overtime unpaid',
        body: `<p>For a salaried record WorkRoaster still shows an <strong>effective hourly rate</strong> — the day's share ÷ the hours you logged. It's only there to show what your salary works out to per hour (long days lower it). It never changes what the record pays.</p>`,
      },
      {
        title: 'Salary changes never rewrite history',
        keywords: 'pay rise salary change raise history snapshot old records',
        body: `<p>Each salaried record saves the salary, working days and schedule it was entered with. If your pay goes from $4,840 to $5,060 a month, edit the job: records you add from then on use $5,060, while earlier records keep $4,840. Open a record's <em>Rate breakdown</em> to see the salary and schedule it used.</p>`,
      },
    ],
  },
  {
    id: 'recording',
    label: 'Recording work',
    summary: 'The record form, field by field — including breaks and overnight shifts.',
    topics: [
      {
        title: 'Adding a record',
        keywords: 'add record work entry form save shift',
        body: `<p>In <strong>Add a work record</strong>:</p>
          <ul>
            <li><strong>Job</strong> — pick one, or <em>No job (manual entry)</em>. The pay section switches to that job's mode; a salaried job also fills in its standard hours.</li>
            <li><strong>Date</strong> — type it, use the calendar button, or click a day on the <em>Work calendar</em>. The <em>Pay cycle</em> it belongs to is shown beside it.</li>
            <li><strong>Time</strong> — a starting time plus either your working time (hours + minutes) or an end time (see below).</li>
            <li><strong>Day type</strong>, optional <strong>Period</strong>, <strong>Break</strong>, <strong>Payment type</strong>, and <strong>notes</strong>.</li>
          </ul>
          <p>Press <em>Add record</em>. It appears immediately in its pay cycle.</p>`,
      },
      {
        title: 'End times instead of typing hours',
        keywords: 'end time ending time start end working time calculate',
        body: `<p>Turn on <strong>Settings → Workflow → Calculate working time from ending time</strong> and the form asks for Start and End, working the duration out for you. With it off, you type the working time directly. Records keep whichever way they were entered.</p>`,
      },
      {
        title: 'Breaks: gross vs working time',
        keywords: 'break unpaid break net paid time gross working minutes lunch',
        example: 'break',
        body: `<p>Choose a break of 15, 30 or 60 minutes. It's subtracted <strong>once</strong>, when you save: the time span is the <em>gross</em> time, and what's left after the break is the <em>working</em> (paid) time — shown live as <em>Net paid time</em>. The break must be shorter than the shift, and a record needs more than 0 minutes of working time. Minutes are typed as 0–59 (write 1h 75m as 2h 15m).</p>
          <p>Everything afterwards — pay, rates, cycle totals, exports — uses the working time.</p>`,
      },
      {
        title: 'Overnight shifts',
        keywords: 'overnight night shift past midnight next day',
        body: `<p>If the end time is earlier than the start time, the shift is treated as ending the next day: <strong>10:00 PM – 2:00 AM</strong> is 4 hours. No separate end date is needed.</p>`,
      },
      {
        title: 'Day types and payment types',
        keywords: 'day type payment type options normal overtime casual custom list',
        body: `<p>They label a record (defaults: <em>Day, Afternoon, Night, Overnight</em> and <em>Normal, Overtime, Weekend, Public Holiday, Casual loading</em>). Customise both lists in <strong>Settings → Options</strong>. Deleting an option that records already use archives it instead, so those records keep their label.</p>`,
      },
      {
        title: 'Editing and deleting records',
        keywords: 'edit record delete record change mistake',
        body: `<p>Use the pencil (edit) or bin (delete) on any record. Editing reopens it in the form; it keeps the pay mode it was saved with. If you change its date, it moves to the right pay cycle. Deleting asks for confirmation and can't be undone.</p>`,
      },
    ],
  },
  {
    id: 'pay',
    label: 'Pay & calculations',
    summary: 'How pay and hourly rates are worked out, and why saved records never change.',
    topics: [
      {
        title: 'Hourly mode',
        keywords: 'hourly rate calculation pay formula rate times hours',
        example: 'hourly',
        body: `<p>For an hourly job the rate is built in a fixed order, each step rounded to the cent:</p>
          <p class="guide-formula">Base rate → Saturday/Sunday rule → Additional loading = <strong>effective rate</strong><br>Effective rate × working hours = <strong>pay</strong></p>
          <p>With no job, you type an hourly rate yourself and pay is rate × working hours.</p>`,
      },
      {
        title: 'Actual-payment mode',
        keywords: 'actual payment effective hourly rate paid amount per job flat pay',
        example: 'actual',
        body: `<p>For work paid a set amount, you enter what you were actually paid. WorkRoaster works out your <strong>effective hourly rate</strong>:</p>
          <p class="guide-formula">Actual payment ÷ working hours = effective hourly rate</p>
          <p>If a job has an expected rate, the form shows the expected payment and the difference, so you can spot being under- or over-paid. Your entered amount is always what's saved. With zero working time the rate shows “—”.</p>`,
      },
      {
        title: 'Which mode a record uses',
        keywords: 'mode global setting no job workflow',
        body: `<p>A record with a job uses that job's mode. A record with <em>No job</em> uses <strong>Settings → Workflow → Pay calculation for records without a job</strong>. Salaried records always belong to their job. Every record shows its mode as a tag (<em>Hourly</em>, <em>Actual payment</em>, <em>Monthly fixed pay</em> or <em>Yearly fixed pay</em>).</p>`,
      },
      {
        title: 'Historical rates never change',
        keywords: 'history snapshot preserved old records rate change retroactive',
        body: `<p>When you save a record, WorkRoaster stores the rates actually used — base rate, weekend and additional rules, effective rate, or for a salaried job the salary and schedule — and its pay mode. Later edits to a job, or to settings, never recalculate saved records. On a record saved with a job, open <em>Rate breakdown</em> to see exactly how its pay was worked out.</p>`,
      },
      {
        title: 'Salaried (fixed-pay) jobs',
        keywords: 'monthly yearly fixed salary day share',
        body: `<p>For a monthly or yearly salary, each record on a scheduled working day carries that day's share of the salary. See <em>Fixed-pay jobs</em> for the full explanation.</p>`,
      },
      {
        title: 'Changing a weekend rate for one shift',
        keywords: 'override weekend adjustment custom one off',
        body: `<p>With a job selected, the form's <strong>Rate</strong> section offers <em>Use job default</em>, <em>No adjustment</em> or <em>Custom</em> for that one record's weekend adjustment. It doesn't change the job.</p>`,
      },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    summary: 'See which days you worked, and pick a record’s date with one click.',
    topics: [
      {
        title: 'Reading the work calendar',
        keywords: 'calendar work days month dots today selected cycle',
        body: `<ul>
            <li>A tinted day with a <strong>dot</strong> has a record; a number shows how many records that day has. Longer days are tinted more strongly.</li>
            <li><strong>Today</strong> has a dark outline; the date currently in the record form is <strong>selected</strong> with an accent outline.</li>
            <li>A thin amber line across the top of a day marks the <strong>active pay cycle</strong> — the cycle the dashboard is showing.</li>
          </ul>`,
      },
      {
        title: 'Moving between months',
        keywords: 'previous next month today navigate',
        body: `<p>Use the <strong>←</strong> and <strong>→</strong> buttons for the previous or next month, and <strong>Today</strong> to jump back to the current month. Moving around doesn't change the record's date.</p>`,
      },
      {
        title: 'Choosing a date for a record',
        keywords: 'select date click day record form',
        body: `<p>Click a day and it becomes the <em>Date</em> of the record you're adding or editing — the pay cycle, rates and any salary share update to match. Typing a date into the form moves the calendar's selection too. Clicking a day never creates or changes a saved record by itself.</p>`,
      },
      {
        title: 'Using the keyboard',
        keywords: 'keyboard arrows enter space accessibility',
        body: `<p>Tab to the calendar, then use the <strong>arrow keys</strong> to move between days (across months too), <strong>Page Up</strong>/<strong>Page Down</strong> for the previous or next month, and <strong>Enter</strong> or <strong>Space</strong> to choose a day. In the date field's pop-up calendar, <strong>Escape</strong> closes it.</p>`,
      },
    ],
  },
  {
    id: 'calculator',
    label: 'Calculator',
    summary: 'A quick calculator under the calendar — handy for checking pay, never changes your data.',
    topics: [
      {
        title: 'What it does',
        keywords: 'calculator sums add subtract multiply divide percent',
        body: `<p>The calculator under the Work calendar handles <strong>+ − × ÷</strong>, <strong>%</strong>, decimals, <strong>C</strong> (clear) and <strong>⌫</strong> (backspace). For example, 30 × 7.5 = 225 checks a shift's pay. It's separate from your records: nothing you calculate is saved or changes any record, job or setting, and it resets when the page reloads.</p>`,
      },
      {
        title: 'How it calculates',
        keywords: 'repeated equals percent chain divide by zero decimal rounding',
        body: `<ul>
            <li>Operations run left to right, like a basic calculator: 2 + 3 × 4 = 20.</li>
            <li>Pressing <strong>=</strong> again repeats the last operation: 5 + 3 = = gives 11.</li>
            <li><strong>%</strong> divides by 100 (15 % → 0.15). After + or −, it takes a percentage of the first number: 200 + 15 % = 230.</li>
            <li>Dividing by zero shows <em>Cannot divide by 0</em>; type a number or press C to carry on.</li>
            <li>Results are tidied so 0.1 + 0.2 shows 0.3.</li>
          </ul>`,
      },
      {
        title: 'Keyboard shortcuts',
        keywords: 'keyboard keys enter backspace escape typing',
        body: `<p>Click the calculator's display (or any of its keys) and type: <strong>0–9</strong>, <strong>.</strong>, <strong>+ − * / %</strong>, <strong>Enter</strong> for =, <strong>Backspace</strong> and <strong>Escape</strong> to clear. The keys only work while the calculator has focus, so typing in the record form or anywhere else is never affected.</p>`,
      },
    ],
  },
  {
    id: 'cycles',
    label: 'Pay cycles',
    summary: 'How records are grouped into pay periods, and how to read them.',
    topics: [
      {
        title: 'What a pay cycle is',
        keywords: 'pay cycle period fortnight weekly length',
        body: `<p>A pay cycle is the period one pay covers. Set its length in <strong>Settings → General</strong>: 7, 14, 30 or 365 days. Each record's cycle is worked out from its date — weekly and fortnightly cycles start on a Monday. 30- and 365-day cycles are rolling blocks of that many days, not calendar months or years (a 30-day cycle can run, say, 15 Sep – 14 Oct). Changing the length just regroups the display; records themselves aren't changed.</p>`,
      },
      {
        title: 'The dashboard: your visual overview',
        keywords: 'dashboard graph chart current cycle earned worked bars',
        body: `<p>The card at the top shows one cycle at a time: what you earned, hours worked, a daily earnings chart and a marker for today. Use its arrows to page through older cycles. Below it are all-time totals: hours, pay, average rate and record count.</p>`,
      },
      {
        title: 'Pay-cycle history: the detail',
        keywords: 'history expand collapse cycle summary shifts jobs count',
        body: `<p>Each cycle's summary row shows its <strong>dates, total pay, hours, number of shifts and number of jobs</strong>. Click (or press Enter/Space on) a row to open or close it. The cycle containing today opens by default; older ones stay compact. Inside, records are grouped by job.</p>
          <p class="guide-note">Graph = quick overview. Pay-cycle history = every record, organised.</p>`,
      },
    ],
  },
  {
    id: 'multi',
    label: 'Multiple jobs',
    summary: 'Keep several jobs side by side, each with its own rules.',
    topics: [
      {
        title: 'One ledger, many jobs',
        keywords: 'multiple jobs several jobs second job',
        body: `<p>Add as many jobs as you have, each paid its own way. For example:</p>
          <ul>
            <li><strong>Office Administrator</strong> — Monthly fixed pay, $4,840 a month, Monday–Friday, 9:00 AM – 5:00 PM with a 30-minute break.</li>
            <li><strong>Café Barista</strong> — Hourly rate, $30/hour, with a Saturday rule.</li>
            <li><strong>Food Delivery</strong> — Actual payment, e.g. $40 per delivery block.</li>
          </ul>
          <p>Switching jobs in the record form switches the pay section to match — and picking Office Administrator fills in its standard hours.</p>`,
      },
      {
        title: 'How jobs appear in your records',
        keywords: 'job grouping per job totals job name',
        body: `<p>Every record shows its job. Inside each pay cycle, records are grouped by job with their own shift count, hours and pay, and the cycle's summary counts how many different jobs you worked. Records stay linked to their job even if it's archived later.</p>`,
      },
    ],
  },
  {
    id: 'exports',
    label: 'Exports',
    summary: 'Get your records out: reports per cycle or job, and full backups.',
    topics: [
      {
        title: 'Cycle and per-job reports (PDF, JPG, Excel)',
        keywords: 'export pdf jpg excel xlsx report cycle job download',
        body: `<p>In <strong>Pay-cycle history</strong>:</p>
          <ul>
            <li>Each cycle's <em>PDF / JPG / Excel</em> buttons export <strong>every record in that cycle</strong>.</li>
            <li>Each job group inside a cycle has its own buttons for <strong>just that job's records</strong> in that cycle.</li>
          </ul>
          <p>Reports lead with <strong>Total pay</strong>, then working time, average rate and record count, followed by a table: date, day, <strong>Active hour</strong> (e.g. 8:00 AM – 12:30 PM, or “From 9:00 AM” when only a duration was entered), duration, break, day and payment type, mode (<em>Hourly</em>, <em>Actual</em>, <em>Monthly</em> or <em>Yearly</em>), pay, rate per hour and — when any record has them — notes, with a closing total row. For a salaried record, pay is the day's salary share and the rate is its effective hourly rate; reports that contain salaried shifts also show a <strong>Base salary</strong> line (e.g. “Base salary — Office Administrator: A$4,840.00 / month”). Each carries a small credit line: <em>WorkRoaster · github.com/srn-n</em>.</p>
          <p>Before each PDF, JPG or Excel file is made, an <strong>Export options</strong> window lets you choose what goes in it: <em>Base salary</em>, <em>Time</em> (start and end times), <em>Total hours worked</em> (durations, breaks and hours totals) and <em>Total amount</em> (every money figure — pay, rates, subtotals, totals, and base salary). Anything switched off is left out of the file completely. The choices start from <strong>Settings → General → Export</strong>; changing them in the window affects that one file only. JSON backups and CSV always include everything.</p>`,
      },
      {
        title: 'All records: JSON backup and CSV',
        keywords: 'backup json csv all records spreadsheet',
        body: `<p><strong>Backup &amp; export</strong> (top of the page) offers a <strong>JSON backup</strong> — every record plus your settings and jobs — and a <strong>CSV</strong> of all records for spreadsheets.</p>`,
      },
      {
        title: 'Restoring from a backup',
        keywords: 'import restore merge replace backup file',
        body: `<p>In Backup &amp; export, <em>Import &amp; merge</em> adds records from a JSON backup, skipping ones you already have. <em>Import &amp; replace all</em> replaces your records (and settings) with the file's contents — it asks first.</p>
          <p>Every record in the file is checked first (a real date and start time, more than 0 minutes of working time, a valid break and payment). If anything is wrong, WorkRoaster tells you which record and why, and imports nothing — your current records stay exactly as they were. Backups made by older versions of the app still import.</p>`,
      },
    ],
  },
  {
    id: 'data',
    label: 'Data & privacy',
    summary: 'Where your data is kept, and how to keep it safe.',
    topics: [
      {
        title: 'Stored in this browser only',
        keywords: 'privacy storage local browser device account cloud server',
        body: `<p>Your records, jobs and settings are saved in this browser's local storage on this device. There's no account, no server and no cloud sync — nothing is uploaded, and another browser or device won't see your data. WorkRoaster doesn't encrypt it; it's as private as this browser profile.</p>`,
      },
      {
        title: 'Working without a connection',
        keywords: 'offline internet connection',
        body: `<p>Once the page is open, recording, calculating, exporting and this Guide all run in your browser without needing the internet.</p>`,
      },
      {
        title: 'Backups matter',
        keywords: 'clear browser data lost records backup regularly',
        body: `<p>Clearing this site's data in your browser, or using a private window, <strong>deletes your records</strong>. Download a JSON backup now and then (Backup &amp; export) — it's also how you move your data to another device. <em>Clear all records</em> permanently erases every record on this device.</p>`,
      },
      {
        title: 'Changes never rewrite history',
        keywords: 'settings change job change history preserved',
        body: `<p>Changing settings or editing a job affects what you do next — never what's already saved. Saved records keep their rates, salary, mode and pay. Changing the pay-cycle length only regroups how records are displayed.</p>`,
      },
    ],
  },
];
