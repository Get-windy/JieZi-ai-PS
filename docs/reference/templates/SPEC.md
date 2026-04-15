---
title: "SPEC.md Template"
summary: "Task specification — requirements, acceptance criteria, technical constraints"
read_when:
  - Starting any non-trivial feature, fix, or refactor
  - Before running plan-execute-verify workflow
---

# SPEC.md - Task Specification

This file is the **source of truth for a single task or feature**. Write it before writing any plan or code. Agent reads it during Phase 1 (Explore) and Phase 2 (Plan) of the workflow.

**Naming convention:** `specs/YYYY-MM-DD-short-name.md` (e.g. `specs/2026-04-15-auth-refresh.md`)

---

## Overview

**Task title:** [Short imperative phrase — e.g. "Add token refresh to auth flow"]  
**Type:** feature / bug / refactor / chore  
**Priority:** P0 / P1 / P2  
**Created:** YYYY-MM-DD  
**Author:** [human / agent]  
**Linked issue:** [#123 or N/A]  
**Goal reference:** [Goal name in GOALS.md]  

**Summary:** One paragraph. What problem does this solve? What does success look like?

---

## User Stories

> Format: "As a [role], I want [goal] so that [benefit]."
> Write at least one. Add more if the feature serves multiple roles.

- As a **[role]**, I want **[goal]** so that **[benefit]**.
- As a **[role]**, I want **[goal]** so that **[benefit]**.

---

## Acceptance Criteria

> Format: "WHEN [condition] THEN the system SHALL [expected behavior]"
> Each criterion must be independently testable. Cover: happy path, edge cases, error states.

### Happy Path

- WHEN [normal condition] THEN the system SHALL [expected behavior].
- WHEN [normal condition] THEN the system SHALL [expected behavior].

### Edge Cases

- WHEN [edge condition] THEN the system SHALL [safe fallback behavior].
- WHEN [empty/null input] THEN the system SHALL [validation behavior].

### Error States

- WHEN [error condition] THEN the system SHALL [error message / recovery behavior].
- WHEN [network failure] THEN the system SHALL [retry or graceful degradation].

---

## Technical Constraints

> What the implementation MUST and MUST NOT do from a technical standpoint.

**Must:**
- Follow existing patterns in `[relevant directory]`
- Use `[framework/library]` — do not introduce new dependencies without discussion
- Maintain backwards compatibility with `[API/interface]`
- Pass: `[verification command]`

**Must not:**
- Modify `[out-of-scope file or module]`
- Change the public API signature of `[function/endpoint]`
- Introduce breaking changes to `[schema/contract]`

**Architecture notes:**
- [Any relevant architectural decision or constraint from MEMORY.md or AGENTS.md]

---

## Scope

**In scope:**
- [Explicit list of what this task covers]

**Out of scope (explicitly excluded):**
- [Explicit list of what is NOT part of this task — prevents scope creep]

---

## Definition of Done

All of the following must be true before this spec is considered complete:

- [ ] All acceptance criteria above are satisfied
- [ ] Verification command passes: `[command]`
- [ ] Tests added/updated covering acceptance criteria
- [ ] No regressions: `pnpm lint && pnpm build && pnpm test` all pass
- [ ] GOALS.md milestone updated (if applicable)
- [ ] CONTEXT.md updated to reflect completion

---

## Notes & Open Questions

> Capture uncertainties, design decisions, and things to investigate during Explore phase.

- [ ] **Open question:** [Question that needs answering before implementation]
- **Decision:** [Decision already made and why]
- **Risk:** [Known risk and mitigation]
