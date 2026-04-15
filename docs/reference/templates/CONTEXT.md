---
title: "CONTEXT.md Template"
summary: "Cross-session task breakpoint, resume state, and error recovery"
read_when:
  - Starting a new project workspace
  - Setting up task breakpoint recovery
---

# CONTEXT.md - Current Task State

This is the **save point** file. It is always up-to-date with what the agent was doing when it last stopped. Read this at session start to resume work without re-reading the entire history.

**Golden rule: Update this file immediately when you start, pause, complete, or get blocked on any task.**

---

## Current Status

```
status: idle | in-progress | blocked | awaiting-review | error-recovery
updated: YYYY-MM-DD HH:MM
goal: [Reference to active goal in GOALS.md — Goal Name]
milestone: [Current milestone # and name]
spec: [Path to SPEC.md if this task has one, e.g. specs/2026-04-15-auth-refresh.md]
checkpoint: [Last verified checkpoint — see Checkpoints section below]
```

---

## What I Was Doing

> One paragraph maximum. What was the last action taken, and what is the very next step.

**Last action:** [What was completed most recently — specific, concrete]

**Next step:** [Exact next action to take when resuming — be specific enough to act without re-reading history]

**Working directory:** [Absolute path or relative path to project]

**Branch:** [Git branch name, if applicable]

---

## Checkpoints

> A checkpoint is a verified state — meaning the code at that point compiled, tests passed, and the system was in a known-good state.
> On resume: start from the last checkpoint, not from scratch.

| # | Checkpoint | Verified | Verification result |
|---|-----------|---------|--------------------|
| 1 | [Description of state] | YYYY-MM-DD | `pnpm test` — pass |
| 2 | [Description of state] | YYYY-MM-DD | `pnpm build` — pass |

**Recovery rule:** If the current work is broken, roll back to the last checkpoint:
```bash
git stash  # save current broken state
git log --oneline -5  # find checkpoint commit
git checkout <checkpoint-sha> -- [affected files]  # restore to good state
```

---

## Error Recovery State

> Only fill this section when `status: error-recovery`. Clear it when resolved.

**Error encountered:** [Exact error message or description]  
**Error type:** build-failure / test-failure / type-error / runtime-error / blocked-dependency  
**Retry count:** 0 / 1 / 2  
**Max retries:** 2 (after 2 failed attempts, escalate to human)  

**Recovery attempts:**
- Attempt 1: [What was tried] — Result: [success/fail]
- Attempt 2: [What was tried] — Result: [success/fail]

**Escalation:** If retry count reaches max, run:
```bash
openclaw system event --text "ERROR: [task] blocked after 2 recovery attempts. Error: [description]" --mode now
```

---

## Open Items

> Things that are started but not finished. Clear this list as items complete.

- [ ] [Item — specific file, function, or operation]
- [ ] [Item]

---

## Decisions Made This Session

> Key decisions that affect future work. Don't repeat what's in MEMORY.md — this is short-term.

- **[Decision topic]:** [What was decided and why — one line]

---

## Blockers

> If status is "blocked", explain here.

- **Blocker:** [Description]
  - **Blocked since:** YYYY-MM-DD
  - **Blocked by:** [Dependency / person / external factor]
  - **Escalated to human:** Yes / No

---

## Files Modified This Session

> Quick reference — not a full diff. Update as you work.

```
[path/to/file.ts]  — [brief description of change]
[path/to/file.ts]  — [brief description of change]
```

---

## Session End Checklist

Before ending a session (closing conversation or suspending work), confirm:

- [ ] All open items updated above
- [ ] Latest checkpoint recorded in Checkpoints table
- [ ] `GOALS.md` milestone status updated if any milestone completed
- [ ] `memory/YYYY-MM-DD.md` updated with what happened
- [ ] This file's `status`, `updated`, and `checkpoint` fields reflect current reality
- [ ] Any tests/lint run and results noted (pass/fail)
- [ ] If PDCA retrospective was run, lessons captured in AGENTS.md or MEMORY.md
