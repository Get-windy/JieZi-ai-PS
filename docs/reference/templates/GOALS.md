---
title: "GOALS.md Template"
summary: "Project-level objectives, milestones, and Definition of Done"
read_when:
  - Starting a new project workspace
  - Setting up autonomous goal tracking
---

# GOALS.md - Project Objectives

This is the **north star** file. It survives across all sessions. Every agent reads this at startup to understand what it is trying to achieve and how far along it is.

## How to Use This File

- **Agent:** Read at session start. Update milestone status immediately when work progresses.
- **Human:** Edit to assign new goals, adjust priorities, or mark goals as frozen.
- **Rule:** A goal is not complete until ALL its milestones pass their DoD (Definition of Done).

---

## Active Goals

### Goal: [Goal Name]

**Priority:** P0 / P1 / P2  
**Target date:** YYYY-MM-DD  
**Owner:** agent / human  
**Description:** One sentence explaining what we're trying to achieve and why.

#### Milestones

| # | Milestone | Status | DoD (Verification Command) |
|---|-----------|--------|---------------------------|
| 1 | [Milestone description] | ⏳ Pending | `pnpm test && pnpm lint` |
| 2 | [Milestone description] | 🔄 In Progress | `curl localhost:3000/health` |
| 3 | [Milestone description] | ✅ Done | `pnpm build` exits 0 |

**Status legend:** ⏳ Pending · 🔄 In Progress · ✅ Done · ❌ Blocked · ⏸ Paused

#### Blockers (if any)

- [ ] [Blocker description] — blocked by: [reason / who]

---

## Frozen Goals

> Goals that are paused indefinitely. Not abandoned — just waiting.

<!--
### Goal: [Goal Name]
**Frozen:** YYYY-MM-DD
**Reason:** [Why frozen]
**Resume when:** [Condition to unfreeze]
-->

---

## Completed Goals

> Archive of finished goals. Keep for context — don't delete.

<!--
### ✅ Goal: [Goal Name]
**Completed:** YYYY-MM-DD
**Outcome:** [What was achieved]
**Key milestones:**
- Milestone 1: [description]
- Milestone 2: [description]
-->

---

## Rules for Agents

1. **Never skip DoD.** A milestone is not done until its verification command passes.
2. **Update immediately.** When a milestone completes, change its status in this file before doing anything else.
3. **Blocker = stop and report.** If you hit a blocker, add it to the Blockers section and notify the human. Do not silently work around it.
4. **Scope creep = frozen.** If a task grows beyond the current goal, freeze the expansion as a new goal candidate. Do not silently expand scope.
5. **One in-progress milestone at a time** (unless explicitly parallelizing). Finish what you started.
