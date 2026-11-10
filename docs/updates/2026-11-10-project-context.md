# Project context for AI agents (AGENTS.md) and the update log

- **Date:** 2026-11-10
- **Commit(s):** see `git log` for "Add AGENTS.md project context and the update log"
- **Version:** 0.0.1
- **Done by:** Claude Code

## What changed and why
- The owner wants Codex (or any agent) to be able to continue the project whenever asked.
- Added `AGENTS.md`, which Codex reads automatically: what the project is, non-negotiable rules, commands, repo map, architecture, testing expectations, release steps, current status and the key decisions.
- Added `CLAUDE.md`, which points Claude Code at `AGENTS.md`.
- Started this update log. **Standing rule from the owner: every update must add a note here and refresh `AGENTS.md` §8.**
- Backfilled notes for the Android app (2026-11-01), the hardening / 0.0.1 work (2026-11-02) and the security-report review (2026-11-02).

## Files touched
- `AGENTS.md`, `CLAUDE.md` (new)
- `docs/updates/` (new: README with the template, 4 notes)
- `README.md` (link to `AGENTS.md`)

## How it was verified
- `npm test` 85/85 (docs-only change).
- Facts in `AGENTS.md` cross-checked against the code: storage keys, CSP source, version flow, file roles, test count.

## Decisions
- `AGENTS.md` is the single context file; `docs/updates/` is the change trail; `CHANGELOG.md` stays user-facing.

## Open / next
- Unchanged from `AGENTS.md` §8: device checklist, APK binary check, signing secrets plus `v0.0.1` tag, Play listing, closed test.
