# External Audit Report — Round 5 (Final internal close-out)

**Date:** 2026-07-14
**Scope:** custom — final full-fresh re-read of all three ADRs (043, 044, 045) in their post-round-4 state, requested explicitly as the last round in this lineage
**Focus:** Genuine falsification attempt on every mandatory invariant one more time, not a rubber-stamp of "external auditors already passed it"
**Suggested Changes Mode:** patches
**Auditor:** Fable (Claude-family, in-host) — the same voice that ran round 1's internal verification originally
**Threat model:** `TM-ADR-CONTENT-ADMIN-005`, round 5 (final)

## Result

**PASS, 9.0 / 10** (floor 8.5). Zero blockers. The hard blocker Fable found in round 1 was independently re-confirmed genuinely fixed. Seven findings, none structural: two substantive (F1, F2), five provenance/citation hygiene (F3–F7). All seven fixed this session — this being explicitly the last round, nothing was left as deferred cleanup debt.

## Findings and dispositions

| Finding | Severity | What | Fix |
|---|---|---|---|
| F1 | low-medium | ADR-044's term lifecycle (reparent, deprecate) named by the `parentId`-validation and revisioning bullets, but not actually representable: op enum had no `reparent`, `terms` table had no `status` column | Added `reparentTerm` to the write-service interface + `op` enum; added `terms.status`; extended the outbox/watermark obligation bullet to name `reparentTerm` |
| F2 | low-medium | ADR-043's outbox obligation named entry transitions only — the tombstone lifecycle step (mass-unpublish semantics) fired no event, so downstream search/webhook consumers would never learn to drop those entries | Extended the outbox obligation to `content_types` lifecycle transitions (`content_type.deprecated`/`content_type.tombstoned`) |
| F3 | low | ADR-043 §5 mis-cited `bodyJson`/`createdAt` to ADR-022 §4a; `bodyJson` is actually §2, and `createdAt` isn't named by ADR-022 at all (verified by direct grep) | Corrected both citations |
| F4 | low | Stale "audited three times" count in both ADR-043/044 status lines after round 4 made it four | Corrected to "four times," with a round legend distinguishing debate-round numbers from audit-round numbers (which use independent counters disambiguated only by threat-model id — a real source of confusion Fable flagged) |
| F5 | low | Round-numbering drift — the same internal-verification pass was labeled "round 2" in some places and "round 3" in others across the three files | Addressed via the round legend added for F4 |
| F6 | low | ADR-045's status block didn't record round 4 (correctly — round 4 didn't cover it) or round 5, reading as inconsistent against ADR-043/044's fuller history on a fresh read | Added explicit round-4-scope-note and round-5 entry |
| F7 | low | ADR-022 §3's index-name template has no workspace component, while `content_types` keys are only unique per-workspace — two workspaces defining the same key with different field kinds could collide on index name | Added a round-5 correction requiring workspace-scoped index identity |

## What was verified fresh, against live sources

- All three ADRs read in full, current (post-round-4) state — not from memory of round 1.
- `src/infra/db/schema.ts`: confirmed `entries`/`content_types`/`taxonomies`/`storage_write_watermark` still don't exist; `sessions`/`member_sessions` still lack a watermark column; `redirect_hits`'s cited precedent comment verified present.
- `src/features/post/post.ts`: re-confirmed `kind` fixed at creation, no conversion path, `updatePost` still non-atomic (matches ADR-043's round-2 correction).
- `src/features/settings/write-service.ts`: deprecate/tombstone precedent re-verified.
- Every ADR-022/ADR-041 section number cited by ADR-043/044/045 resolved to real, matching content.

## The five mandatory invariants — final status

1. No raw DDL from operator input — **holds** (name grammar + kind-enum + now workspace-scoped index identity).
2. Chokepoint same-transaction obligations — **holds** (the two remaining enumeration gaps, F1/F2, fixed this round).
3. Cross-workspace rejection at write time — **holds**.
4. Reversibility claims are genuine or honestly disclosed as not — **holds** (abort lifecycle, merge disclosure, pre-restore snapshot all verified real).
5. ADR-045 never asserts an uncomputable claim — **holds**.

## Markdown integrity check

A byproduct of applying seven edits across three long, heavily-cross-referenced files in one pass: two of the edits (ADR-043's grammar-bullet append, ADR-044's status-line rewrite) introduced genuine bold-marker imbalances — a merged closing/opening marker in one case, a missing closing marker in the other. Caught by a full open/close state trace (not just even/odd total counts, which can coincidentally balance while still being structurally wrong) and fixed. Final state: all three files verified fully closed (no unbalanced bold spans) by sequential trace, not just parity.

## Audit Outcome

This closes the audit lineage for ADR-043, ADR-044, and ADR-045. Summary across the full history:
- **ADR-041** (Storage, the dependency this batch builds on): PASS, 3 rounds, prior session.
- **ADR-043** (Collections): fold → internal verify → external round 3 → external round 4 (PASS) → internal round 5 (PASS). Clean.
- **ADR-044** (Categories & Tags): same lineage, highest finding density of the batch (12 of ~26 total findings across all rounds), now clean.
- **ADR-045** (Backups/Recovery): fold → internal verify → external round 3 (PASS, no further changes) → internal round 5 (PASS, no findings).

No further audit rounds planned or recommended. The only remaining gate is human owner sign-off on all three (a separate action from audit-adversarial review, per each file's own status line).
