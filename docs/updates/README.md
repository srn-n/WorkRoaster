# Update log

One Markdown note per change, newest file name last (they sort by date).
Together with [`AGENTS.md`](../../AGENTS.md), these notes are how any agent
(Codex, Claude Code) or person continues the work without the original chat.

**Required for every update.** Name the file `YYYY-MM-DD-short-title.md` (add
`-2`, `-3` for several on one day), copy the template below, and keep it short
and factual. Also update `AGENTS.md` §8 "Current status".

## Template

```markdown
# <Short title>

- **Date:** YYYY-MM-DD
- **Commit(s):** <short sha(s), or "not committed yet">
- **Version:** <package.json version at the time>
- **Done by:** <Codex / Claude Code / person>

## What changed and why
<2–6 bullets: the problem or request, and what was done about it.>

## Files touched
<Key files only, one line each on what changed.>

## How it was verified
<Commands run and results, e.g. `npm test` 85/85, build, manual/browser checks, CI run.>

## Decisions
<Anything decided that future work must respect, or "None".>

## Open / next
<What is unfinished, risky, or the obvious next step.>
```
