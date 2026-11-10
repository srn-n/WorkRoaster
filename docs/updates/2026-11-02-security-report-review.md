# Review of an external security report (no code change)

- **Date:** 2026-11-02
- **Commit(s):** none
- **Version:** 0.0.1
- **Done by:** Claude Code

## What changed and why
The owner supplied a third-party white-box report. Each finding was checked:

- **minimatch/exceljs (moderate): no change.** The vulnerable code is in exceljs's Node-only dependency chain. The shipped bundle uses exceljs's prebuilt browser build, which contains no minimatch or glob code (searched). The suggested `minimatch` override was tested: `npm audit --omit=dev` went to 0 but `glob@7` broke (`glob.sync` throws).
- **Trusted Types: rejected as proposed.** A passthrough default policy gives no protection. Escaping already held under the hostile-backup attack.
- **CSP `style-src 'unsafe-inline'`: deferred (low).** 16 inline style values; it only matters if HTML injection exists, and none does.
- **HSTS: false positive.** Vercel sends `max-age=63072000; includeSubDomains; preload` on `*.vercel.app`, and the domain is preloaded.

## Files touched
None.

## How it was verified
- Override tested on a copy of the repo.
- Searched `dist/` and `exceljs.min.js` for minimatch and glob markers.
- Checked Vercel's documentation on HSTS.

## Decisions
- Don't add the `minimatch` override. Replacing ExcelJS with a lighter XLSX writer is the real long-term fix.

## Open / next
- None for this report.
