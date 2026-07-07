# Red-Team Findings: admin-command-gateway

- Feature: FEAT-001-admin-command-gateway
- Spec version: 1.0.0
- Spec hash: sha256:d47c72376bb7ff82b5506e9b69b03215f50eae1ea24b98573fb43ffc103aba73
- Red-Team completed: 2026-07-07T04:10:00Z
- Red-Team agent: Claude Opus 4.8 (persona `AI-Dev-Shop/agents/red-team/skills.md` loaded this session)
- Finding count: 0 BLOCKING · 6 ADVISORY · 1 CONSTITUTION_FLAG
- Resolution (2026-07-07, owner "fold in the 3, then Architect"): **RT-001, RT-002, RT-006 APPLIED** in spec revision R2 (spec hash `d47c72…aba73` → `0230e96c…c7a0`, re-validated PASS); `tovu/→src/` path drift also corrected. **RT-003, RT-004 CARRIED FORWARD** to Software Architect / SQLite-adapter stage. **RT-005 ACCEPTED** (doc-only). **RT-007 → Software Architect** (Art. VI permission seam prep).
- Re-affirmation R3 (2026-07-07, external audit `20260707T043122Z` deltas F1–F4): spec hash `0230e96c…c7a0` → `768af10e…e5d6` (re-validated PASS via `--update-hash`). Red-Team re-examined the audit deltas — **0 BLOCKING**. See "## Re-Affirmation — Audit R3 (F1–F4)" at the end of this file.
- Brownfield grounding: `src/features/post/post.ts` (has `version`, `updatePost` increments), `src/features/presentation/presentation.ts` (NO `version` field today), `src/core/commands/{command,change-set}.ts` (draft gateway/vocabulary)

---

## BLOCKING Findings

None. The package is internally consistent: the gateway ordering (BR-01…BR-04) and revert precedence (BR-05…BR-09) are deterministic and total, every AC is Given/When/Then, invariants INV-01…INV-05 are falsifiable, every error code maps to an AC/EC, and the state machine (`applied → reverted`, terminal) is closed. Spec is cleared for Software Architect dispatch (< 3 BLOCKING). The ADVISORY items below are human-decision and do not block; three are cheap spec clarifications worth folding in before wiring (RT-001, RT-002, RT-006).

---

## ADVISORY Findings

### RT-001
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-04, REQ-05, behavior.spec.md §3 (`summary` default) / §4 (`summary` 1…500, empty ⇒ thrown programming error)
- Description: `summary` is a required, non-empty change-set field, and an empty summary is a thrown programming error (behavior §4). But the two wired mutations (`POST_UPDATE`, `PRESENTATION_PATCH`) have unchanged request bodies (api.spec §4) that carry **no summary**, and REQ-04/REQ-05 never say what summary the route synthesizes. A developer wiring the routes must invent the audit string ("Updated post {id}", "Set active theme to {themeId}", …). Two developers will produce different audit history text, and a route that forgets to pass one triggers the thrown programming-error path.
- Suggested resolution: Specify the summary each wired route records (a template per endpoint, e.g. `"Update post {postId}"` / `"Set active theme {activeThemeId}"`), or state that the route MUST supply a non-empty summary and give the canonical templates in api.spec §4. Cheap; removes an implementation-blocking blank.

### RT-002
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-05, AC-07, state.spec.md §2 (`ChangeSetItemRecord.entityType`/`entityId`)
- Description: The change-set item's identity fields are specified **only for the post case** — AC-02 pins `entityType "post"` and the post id. For the presentation mutation, nothing states the item's `entityType`/`entityId`. Presentation settings are workspace-keyed (one row per workspace, no standalone id — see `presentation.ts`), so the applier registry key and the entity the revert guard/applier must locate are undefined. AC-07 checks `version` and the inverse `activeThemeId` but never the item identity, so a developer must guess `entityType` (`"presentation-settings"`? `"presentation"`?) and `entityId` (the `workspaceId`?).
- Suggested resolution: Add an AC (or extend AC-07) fixing the presentation item's `entityType` (e.g. `"presentation-settings"`) and `entityId` (the `workspaceId`, since that is the entity key). This is the second registry key the applier registry needs and pins the revert path for the non-post mutation.

### RT-003
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: BR-05 (revert precondition ordering), EC-07, AC-12
- Description: The revert executor evaluates preconditions (status `applied`, applier present, non-null inverse, version guard) and *then* applies inverses and flips status — with `await` points in between (guard read, applier `save`, status write are all async). EC-07 addresses concurrency **only for the idempotency-key race**; nothing addresses two concurrent reverts of the *same* `applied` change set. In single-process Node the event loop does **not** serialize across `await`, so R1 and R2 can both read status `applied`, both pass the version guard (neither has bumped the entity yet), and both apply the inverse — double-restoring and double-incrementing the version, with the change set flipped to `reverted` twice. AC-12 (second revert ⇒ `CHANGE_SET_INVALID_STATUS`) assumes strictly *sequential* calls; a local admin double-clicking "Revert" opens the window.
- Suggested resolution: Add an EC (sibling to EC-07): the executor re-asserts status `applied` in the same synchronous step as the status flip (compare-and-set), so the second concurrent revert loses and gets `CHANGE_SET_INVALID_STATUS`; or explicitly document the single-actor / single-in-flight-revert assumption and defer true isolation to the SQLite adapter (transaction + row lock), mirroring the idempotency posture.

### RT-004
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: errors.spec.md §2/§4, EC-07, state.spec.md §7 (Persistence Notes)
- Description: Idempotency uniqueness in v1 is a `findByIdempotencyKey` read-then-check in the in-memory adapter. state.spec §7 already anticipates the SQLite adapter enforcing a `UNIQUE (workspaceId, idempotencyKey)` index — but there is no mapping rule saying a **DB unique-constraint violation** surfaces as `DUPLICATE_COMMAND`. The moment concurrency is real (SPEC-003 desktop host, an async driver, or multi-process serve), two commands with the same fresh key can both pass the read and the second hits the index → today that is an unmapped `INTERNAL_ERROR` (500). This is the exact latent-500 pattern already flagged and fixed in SPEC-002 RT-001.
- Suggested resolution: Pre-empt the SQLite adapter: add an errors.spec §4 ownership note that a `(workspaceId, idempotencyKey)` unique-constraint violation maps to `DUPLICATE_COMMAND` (409) as the constraint backstop, with the read-then-check as an optimization. No behavior change to the in-memory adapter; removes the future 500.

### RT-005
- Severity: ADVISORY
- Category: ambiguity
- Location: INV-01, REQ-07, User Journey step 2.5
- Description: The revert executor mutates an entity (restores content, `version + 1` via BR-08) **without** recording a new change set — it flips the original set to `reverted`. INV-01 ("a mutation through the gateway must always … record exactly one change set … never a mutation without a record") is scoped to *the gateway*, so this is technically consistent, but a reader can miss that the restore write bypasses the "no mutation without a record" spirit: the only audit artifact for the restore is the `change-set.reverted` outbox event, not a durable row, and there is consequently **no redo** (a `reverted` set is terminal, and the restore isn't itself revertible). This is defensible for v1 but is an easy source of a wrong mental model in the Architect/Programmer.
- Suggested resolution: Add one sentence to REQ-07 (or INV-01's note) stating explicitly that revert is a distinct executor that does NOT record a new change set, the restore write is audited via the `change-set.reverted` event only, and redo/undo-of-undo is out of scope for v1. Documentation-only.

### RT-006
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: REQ-05, AC-07 ("seed = 1"), state.spec.md §2 (`PresentationSettingsRecord.version` NEW)
- Description: REQ-05 adds `version` "starting at 1" to `PresentationSettingsRecord`, and AC-07 asserts "version is 2 then 3 (seed = 1)." But the current `PresentationSettingsRecord` (`presentation.ts`) has **no** `version` field, and a seeded settings row already exists in `content.db`. The spec never says what version a **pre-existing** settings row gets when this feature lands — AC-07 assumes the seed is (re)created at version 1, but a brownfield row read after the field is added would have `version` undefined/NaN, breaking the first guard/increment. This is the same migration/backfill gap class as SPEC-002/003 (Drizzle baseline).
- Suggested resolution: Specify the backfill: existing presentation-settings rows default `version` to `1` on read/migration (state.spec §2 or §7), so AC-07's "seed = 1" is deterministic for both a fresh seed and a pre-existing row. If migrations are Drizzle-managed (per ADR-015), note the column addition + default there.

---

## CONSTITUTION_FLAG Findings

### RT-007
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article VI — Security-by-Default
- Location: api.spec.md §2 (`AUTH_LOCAL_DEV`), `CHANGE_SET_REVERT` endpoint, REQ-07/REQ-12
- Description: The feature already carries the project-wide Art. VI EXCEPTION (no auth in the dev server), so this is not a new violation — but `POST …/change-sets/:id/revert` is a materially higher-risk surface than the read endpoints: it is an unauthenticated, destructive, content-mutating operation gated **only** by path-param workspace scoping (ADR-007). The audit/undo plane is precisely the plane an AI agent will drive next (the feature's own "why now"), and retrofitting authorization onto revert after agents can call it is the breaking rewrite the spec set out to avoid.
- Architect note: In the Implementation Outline / ADR, design the permission-action seam **now** even though it resolves to the fixed `user-local` actor: have `executeCommand` and the revert executor accept an actor/authorization context parameter from day one (REQ-12 already fixes the value, not the shape), and reserve the named actions (`admin.change-sets.read`, `admin.change-sets.revert`) referenced in api.spec §2 so the permissions feature swaps the profile without changing the gateway signature. Prepare the Art. VI Complexity/Exception Justification entry accordingly. (Also consider a light Art. I note: change-set semantics are justified custom core code on existing ports — no library implements this — but the Architect should ratify that explicitly.)

---

## Routing Decision

`0` BLOCKING findings. **Spec cleared for Software Architect dispatch** (and, per the owner's intent to wire, SPEC-001 is the legitimate dependency-root first target).

ADVISORY and CONSTITUTION_FLAG findings are included in Software Architect context. Three ADVISORYs are cheap spec clarifications worth resolving **before wiring** because they remove real implementation blanks: **RT-001** (what summary the wired routes record — a required non-empty field with no source), **RT-002** (the presentation change-set item's `entityType`/`entityId` — the second applier-registry key), and **RT-006** (the `version` backfill for the pre-existing presentation-settings row). **RT-003** (concurrent-revert TOCTOU) and **RT-004** (map the future SQLite unique-constraint to `DUPLICATE_COMMAND`) are correctness-forward and can be pinned in the spec or explicitly delegated to the Architect/SQLite-adapter stage. **RT-005** is documentation-only. **RT-007** is Architect prep, not a blocker.

---

## Re-Affirmation — Audit R3 (F1–F4)

- Re-affirmed: 2026-07-07 (this session), Red-Team persona (`AI-Dev-Shop/agents/red-team/skills.md`) loaded.
- Trigger: external audit `20260707T043122Z` edited specs 001/003/004/005 in place (blockers F1–F4). Specs re-validated with `--update-hash` (all PASS). SPEC-001 feature hash `0230e96c…c7a0` → `768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6`.
- Scope of this re-affirmation: whether the audit deltas introduce new BLOCKING problems (ambiguity, contradiction, untestability, new attack surface) at the new hashes.
- **Verdict: 0 BLOCKING.** The four deltas are correctness/coherence hardening that *remove* failure modes; they do not add attack surface.

| Delta | Where | Red-Team assessment |
|---|---|---|
| **F4 — gateway atomicity** | SPEC-001 REQ-01 / BR-04 / EC-08 / AC-17 | Closes a partial-write hole (mutation-without-record, the exact INV-01 case). The observable contract is deterministic and testable: AC-17 = injected change-set-item persist failure ⇒ post unchanged, no change set, no outbox event. "One transaction on SQL / all-or-nothing on memory" leaves the *memory-adapter mechanism* (buffered txn vs compensating rollback) to implementation — an implementation choice, not a spec ambiguity. BR-04 keeps outbox enqueue explicitly outside the boundary; no contradiction with the revert executor (separate path). **Affirmed.** |
| **F1 — ext under revert** | SPEC-001 AC-02 / AC-10, SPEC-005 BR-08 / AC-17, REQ-06 | Extends the inverse pre-image to capture pre-edit `ext`; revert restores it verbatim and does NOT re-fire `content.entry.beforeSave` (a revert is a pre-image re-apply, not a create/update). Coherent with the gateway pre-image model; restore is pure data and needs no plugin installed. Concrete Given/When/Then in SPEC-005 AC-17 (count 5→9→revert→5). **Not yet exercised** by the current post-only path (posts carry no `ext`); becomes load-bearing when SPEC-002 content-entries + SPEC-005 plugins land — the post/content reverter's inverse pre-image must then include `ext`. **Affirmed, with carry-forward.** |
| **F2 — schemaVersion+schemaTag** | SPEC-003 REQ-05 / INV-04 / BR-05 / BR-06 / AC-07 | Resolves a hard self-contradiction (D1): both fields written together, atomically, only after `migrate()`. A bumped `schemaVersion` beside a stale `schemaTag` is now an explicit illegal state. AC-07 adds a follow-up-serve assertion that proves the tag was stamped (guard passes cleanly). Testable; no new surface. **Affirmed.** |
| **F3 — error-code namespace** | SPEC-004 / SPEC-005 errors §3 | Resolves a cross-spec code collision by scoping validation codes to their envelope (`(parent envelope, code)` identity); the two validators mirror shape but never share a registry. Coherence/tooling fix; traceability keys by the pair. **Affirmed.** |

- No delta introduces a new BLOCKING finding. Prior RT-001…RT-007 dispositions are unchanged by the audit. Clearance carries forward to SPEC-001 hash `768af10e…e5d6`.
- Carry-forward note for the Programmer/TDD: F1's `ext`-in-pre-image obligation is currently latent (post-only). When content-entries/plugins land, `appliers.ts` post/content reverter and the route's `captureInverse` must include the pre-edit `ext` snapshot, and the reverter must not re-fire `beforeSave`.
