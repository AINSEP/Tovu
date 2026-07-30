# Red-Team Findings: content-entry-authoring

- Feature: FEAT-002-content-entry-authoring
- Spec version: 1.0.0
- Spec hash: sha256:a7cb993a5926fbef1ddf6069587615c7e98314507aef0dbcd172d5b075a0c79e
- Red-Team completed: 2026-07-07T04:25:00Z
- Red-Team agent: Claude Opus 4.8 (persona `AI-Dev-Shop/agents/red-team/skills.md` loaded this session)
- Finding count: 0 BLOCKING · 6 ADVISORY · 1 CONSTITUTION_FLAG

---

## BLOCKING Findings

None. The package is internally consistent, ACs are in Given/When/Then, invariants are falsifiable, and every error code maps to a failure kind. Spec is cleared for Software Architect dispatch (< 3 BLOCKING). The ADVISORY items below are for human decision and do not block.

---

## ADVISORY Findings

### RT-001
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: BR-02 (slug uniqueness), errors.spec.md §2/§4, INV-01
- Description: Slug uniqueness is enforced two ways that don't meet: (a) the BR-02 read-then-suffix check in the feature layer, and (b) the `UNIQUE (workspace_id, slug)` index (INV-01). Only path (a) maps to `SLUG_CONFLICT`. If two creates pass the BR-02 read and both reach `INSERT` (a TOCTOU window), the second hits the DB UNIQUE constraint, which is **not mapped** — it would surface as `INTERNAL_ERROR` (500). EC-10 closes the window *only* by single-process event-loop serialization; the moment concurrency is real (SPEC-003 desktop host, a future async driver, or multi-process serve) the 500 path opens.
- Suggested resolution: Map a `UNIQUE(workspace_id, slug)` constraint violation to `SLUG_CONFLICT` (409) as the constraint backstop, so the DB is the source of truth and the feature-layer check is an optimization. Note it in errors.spec.md §4 ownership rules. Low cost, removes the latent 500.

### RT-002
- Severity: ADVISORY
- Category: contradiction
- Location: BR-01/BR-02 vs BR-03 step 3 (reserved slugs)
- Description: Derived-slug collision handling is asymmetric. A derived slug that collides with an *existing entry* auto-suffixes (`about-us-2`, BR-02). A derived slug that collides with a *reserved word* (`admin`/`api`, BR-03 step 3) hard-fails `VALIDATION_ERROR`. So a user who types the title "Admin" and provides no slug gets "slug 'admin' is reserved" — a slug error for an input they never gave, with no auto-recovery, unlike every other derived-slug collision.
- Suggested resolution: Either (a) auto-suffix a derived slug that hits a reserved word (`admin-2`) — consistent with BR-02; or (b) keep the hard fail but change the user-facing message for the *derived* case to name the title, and document the asymmetry explicitly in BR-01. Human call; (a) is the smoother UX.

### RT-003
- Severity: ADVISORY
- Category: ambiguity
- Location: AC-16, EC-09 (migration test) — fallout of the R1 Drizzle revision
- Description: AC-16/EC-09 say "a pre-existing `content.db` created before this feature." After the R1 revision moved migrations onto Drizzle (adopted 2026-07-06), "before this feature" is ambiguous: the Drizzle baseline (`drizzle/0000_*`) already defines `posts` *without* `kind`, so the test needs to pin which migration state the fixture db is at. Otherwise "prior rows read `kind 'post'`" isn't a deterministic setup.
- Suggested resolution: Reword AC-16/EC-09 to "a `content.db` at the current Drizzle migration baseline (the migration set *before* the `kind` migration)"; the test fixture applies migrations up to that point, then boots the runtime with the `kind` migration and asserts additive behavior.

### RT-004
- Severity: ADVISORY
- Category: untestable
- Location: behavior.spec.md §4 (Limits) vs Acceptance Criteria
- Description: The limits table defines boundaries (title 1–200, slug 1–120, suffix search n≤999) but no AC exercises the boundary values. There is no AC for title=200 accepted / 201 rejected, slug=120 / 121, or the n=999→`SLUG_CONFLICT` exhaustion (EC-03 states it but no AC pins the assertion). Boundaries are the classic off-by-one bug site.
- Suggested resolution: Add boundary ACs, or explicitly delegate boundary coverage to TDD with a note in traceability that §4 limits are TDD-owned. Either closes the "who tests the edges" gap.

### RT-005
- Severity: ADVISORY
- Category: ambiguity
- Location: TB-01 (tie-break)
- Description: TB-01 breaks `updatedAt` ties by "`id` descending." `id` is a UUID from `IdGeneratorPort` (state.spec.md §2). UUIDv4 is random, so "id descending" is deterministic but semantically arbitrary — it does *not* mean "most recently created first." If the intent behind the tie-break is recency, it doesn't deliver it; if the intent is only determinism, it's fine but worth stating.
- Suggested resolution: Confirm the intent is determinism-only (accept as-is, add one sentence to TB-01) — or, if recency-within-tie matters, tie-break on a monotonic key (insert rowid / a creation sequence) instead of the random id.

### RT-006
- Severity: ADVISORY
- Category: untestable
- Location: AC-07 (`REVERT_NOT_POSSIBLE`)
- Description: AC-07 asserts a revert of a create returns 422 `REVERT_NOT_POSSIBLE`, but that code is not in this package's error registry (errors.spec.md §2) — it is inherited from SPEC-001. A reader validating AC-07 against this package alone can't find the code's contract (status/shape), weakening "implementable from the package alone."
- Suggested resolution: Add a one-line "inherited from SPEC-001 (REQ-10)" row/note for `REVERT_NOT_POSSIBLE` in errors.spec.md §2, cross-referencing where it's defined. No behavior change.

---

## CONSTITUTION_FLAG Findings

### RT-007
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article I — Library-First
- Location: REQ-03/BR-01/BR-02 (slug derivation + suffix search)
- Description: Slug derivation and numeric-suffix search are ~15+ lines of custom string logic where mature libraries exist (`slugify`, `@sindresorhus/slugify`). The spec pre-justifies the custom call (feature.spec.md Constitution table, Art. I). This is defensible (unicode/locale slug edge cases are a known library-vs-custom tradeoff, and the suffix search is Tovu-specific), but it is exactly the kind of "custom where a library exists" the Architect must consciously ratify.
- Architect note: Prepare an Article I Complexity Justification in the ADR: either (a) adopt a tiny slug library for the normalization step and keep only the suffix search custom, or (b) justify the fully-custom implementation (control over the exact `^[a-z0-9-]+$` charset + 120-char/suffix rules, zero-dependency posture matching SPEC-003's CLI stance). Decide before Programmer.

---

## Routing Decision

`0` BLOCKING findings. **Spec cleared for Software Architect dispatch.**

ADVISORY and CONSTITUTION_FLAG findings are included in Software Architect context. Two ADVISORYs are worth a human decision before the Architect runs because they change a contract: **RT-002** (derived-slug reserved-word handling — auto-suffix vs hard-fail) and **RT-001** (map the UNIQUE-constraint violation to `SLUG_CONFLICT`). **RT-003** is cheap cleanup the Spec Agent can apply to remove the R1 ambiguity. The rest (RT-004/005/006) are low-risk and can be accepted or folded into TDD.
