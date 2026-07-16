# Spec Manifest: storage-timeline

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-017 |
| feature_name | FEAT-017-storage-timeline |
| version | 1.3.0 |
| last_edited | 2026-07-15T00:45:00Z |
| spec_naming | prefixed |
| spec_root | ADS-memory/specs/017-storage-timeline/ |
| spec_entrypoint | SPEC-017-feature.spec.md |
| spec_readiness_artifact | SPEC-017-spec-dod.md |
| depends_on | SPEC-016 (content-admin-core-contract) |

**Purpose:** This manifest is the package index for the Storage/Timeline dependent domain spec. It
instantiates SPEC-016's shared core contract (watermark, gated-mutation gateway, composite actor
identity, `db-ops` capability shape) for `domain="storage.migrate"`, per ADR-041.

**Numbering note (see feature.spec.md's own disambiguation section for the full explanation):**
ADR-041 §10 amends a spec it calls "SPEC-003" — this refers to the pre-existing
`ADS-project-knowledge/specs/003-site-install-dir/` package. The new dependent Collections spec,
which would otherwise have collided with that label, was renumbered to SPEC-020 under
`ADS-memory/specs/020-collections/` (Coordinator decision, 2026-07-14) to avoid the ambiguity
rather than touch the pre-existing, already-Accepted ADRs and historical audit records that cite
the old SPEC-003 by name. This manifest and its sibling files cite the older package by full path
throughout regardless.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `SPEC-017-feature.spec.md` | Canonical primary requirements spec for the Storage/Timeline domain |
| `api.spec.md` | PRESENT | `SPEC-017-api.spec.md` | Concrete route surface (Timeline reads, migrate-forward gateway instantiation, Tier-3 browser) and agent-tool catalog |
| `state.spec.md` | PRESENT | `SPEC-017-state.spec.md` | This domain owns durable state directly: `storage_ledger`, `migration_runs`, `restore_points`, the dialect-conditional state machine, and `site.servingStatus` |
| `orchestrator.spec.md` | PRESENT | `SPEC-017-orchestrator.spec.md` | The `MigrateForwardOrchestrator` instantiates SPEC-016's generic gateway plus boot-time-only orchestration (crash reconciliation, cost-gated auto-migrate) that has no SPEC-016 equivalent |
| `ui.spec.md` | PRESENT | `SPEC-017-ui.spec.md` | Real user-facing screen: the Timeline, the migrate-forward wizard, the restore-points panel, the optional Tier-3 browser |
| `errors.spec.md` | PRESENT | `SPEC-017-errors.spec.md` | Domain-specific error codes (`SCHEMA_DRIFT_DIVERGED`, `RESTORE_POINT_UNAVAILABLE`, `TIER3_DISABLED`, `MIGRATION_ALREADY_IN_FLIGHT`) beyond SPEC-016's reused gateway/watermark codes |
| `behavior.spec.md` | PRESENT | `SPEC-017-behavior.spec.md` | Real precedence (drift tag-vs-index), ordering (dialect-conditional state machines), default, limit, and dedup rules exist and are load-bearing |
| `traceability.spec.md` | PRESENT | `SPEC-017-traceability.spec.md` | Seeds REQ/AC/INV/EC/error/behavior coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `SPEC-017-spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `SPEC-017-spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `SPEC-017-feature.spec.md`, `SPEC-017-api.spec.md`, `SPEC-017-state.spec.md`, `SPEC-017-orchestrator.spec.md`, `SPEC-017-ui.spec.md`, `SPEC-017-errors.spec.md`, `SPEC-017-behavior.spec.md`, `SPEC-017-traceability.spec.md`, `SPEC-017-spec-dod.md`, plus SPEC-016's full package (this spec's `## Integration Contracts` section names the exact ids cited) |
| `tdd` | `SPEC-017-feature.spec.md`, `SPEC-017-traceability.spec.md`, `SPEC-017-spec-dod.md`, plus SPEC-016's `feature.spec.md`/`state.spec.md`/`orchestrator.spec.md` for the mechanisms this spec instantiates rather than restates |
| `programmer` | `SPEC-017-feature.spec.md`, `SPEC-017-traceability.spec.md`, all `PRESENT` contract files listed above, plus SPEC-016's contract files for the shared gateway/watermark/actor-identity/`db-ops` implementation, and certified tests |

---

## Brownfield / Reverse-Spec References

This feature is `brownfield` — it extends a running application (per the Coordinator's directive)
even though no prior code implements this exact contract yet; ADR-041 was itself written directly
against the live `src/infra/db/schema.ts` and its surrounding write paths.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-project-knowledge/reports/architecture/ADR-041-storage-timeline.md` | source touchpoint | Origin of the Timeline, the migrate-forward ceremony, the dialect-conditional state machine, the sidecar ops journal, the ledger schema, the agent-tool catalog, the deep-link envelope, the Tier-3 browser, the quiesce residual, and the `SERVE_SITE`/`PENDING_MIGRATION` amendment this spec instantiates |
| `ADS-memory/specs/016-content-admin-core-contract/` (all files) | source touchpoint | The shared watermark/gateway/actor-identity/`db-ops` contract this spec cites by REQ/AC id throughout `## Integration Contracts` — never restated |
| `ADS-project-knowledge/reports/architecture/ADR-023-core-mediated-plugin-data-modules.md` §3, §4, §8 | source touchpoint | Disk-headroom preflight this spec's snapshot step depends on; the snapshot-before-DDL rule this spec's ADR-041-amended carve-out (REQ-18/REQ-19) modifies; the sandboxed-read floor the Tier-3 browser (REQ-25/REQ-26) builds on top of |
| `ADS-project-knowledge/reports/architecture/ADR-024-plugin-execution-and-trust-model.md` §4 | source touchpoint | The Rung 1/Rung 2 isolation distinction behind the `quiesceIntegrity: 'chokepoint-only'` residual disclosure (REQ-27) |
| `ADS-project-knowledge/reports/architecture/ADR-015-...` (Drizzle/migrations) | source touchpoint | The `__drizzle_migrations` journal and tag-identity comparison (RT-005) the drift check (REQ-03) depends on |
| `ADS-project-knowledge/reports/architecture/ADR-021-identity-and-authorization.md` §9 | source touchpoint | The seeded `kind='system'` principal the boot auto-migrate path (REQ-28) attributes ledger rows to |
| `ADS-project-knowledge/specs/003-site-install-dir/state.spec.md` §3 (`SERVE_SITE` row), §4 (status lifecycle) | source touchpoint | The pre-existing unconditional auto-migrate behavior REQ-28–REQ-30 require amending — see this manifest's Numbering note and `feature.spec.md`'s Numbering Disambiguation section for why this is cited by path, not by the label "SPEC-003" |
| `src/infra/db/schema.ts` | source touchpoint (verified present, spot-checked) | Confirms no `storage_ledger`/`migration_runs`/`restore_points` tables exist yet in the live schema, and that the sensitive-column tables ADR-041 §8 names (`users`/`api_keys`/`sessions`) do not yet exist under those exact names in this codebase (the closest existing tables are `principals`, `identityUsers`, `sessions`) — this spec follows ADR-041's own naming and defers the concrete schema mapping to Software Architect, per this project's Brownfield Rule 3 (cite, don't restate or invent the mapping) |
| No `ANALYSIS-*` / `MIGRATION-*` / `TESTABILITY-*` reports exist in `ADS-memory/reports/codebase-analysis/` | codebase-analysis | Directory confirmed absent before this run (same finding as SPEC-016's own manifest) — this spec proceeds directly from the Accepted ADR's own direct-codebase verification instead |

---

## Validation Notes

- Validator last run: 2026-07-15T00:45:00Z (v1.3.0 Red-Team-round-3-fix revision)
- Validator result: PASS (`--phase spec --update-hash`) — passed on the first invocation of this
  revision, no repair round was needed. New `content_hash`:
  `sha256:2f09a7f1fa6e0de45592f3829bd491dd9d89a47e3a9d0a6a8ae295ed9b85066f`, propagated to every
  sibling file's own header. Re-run afterward without `--update-hash` and confirmed a clean,
  idempotent pass (exit 0, no diff).
- Validator manual waiver: N/A — `python3` available and used directly
- Notes: This is the first draft of SPEC-017. Zero `[NEEDS CLARIFICATION]` markers were required —
  every mechanism in scope was already decided by ADR-041 and SPEC-016. One open question owned by
  this spec (SPEC-016's OQ-04) was resolved directly in `feature.spec.md`'s dedicated resolution
  section rather than left open. Route/tool parameterization follows SPEC-016's precedent of using
  curly-brace notation (e.g. `{table}`) rather than angle brackets, to avoid colliding with the
  banned template-placeholder marker convention SPEC-016's own validator repair round found. One
  self-review fix was made before finalizing `spec-dod.md`: `api.spec.md` §6 was missing an
  explicit HTTP-status row for `MIGRATION_ALREADY_IN_FLIGHT` — added (409) before hash finalization.

### Revision 1.1.0 (Red-Team round 1 fixes, 2026-07-14T23:00:00Z)

Revised in response to `ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings.md`
(3 BLOCKING, 4 ADVISORY, 2 CONSTITUTION_FLAG) and to re-sync against SPEC-016 v1.1.0
(`content_hash: sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8`). Summary:

- RT-001 (BLOCKING): `ui.spec.md` §2.2/§4 fixed so `DriftBanner` never renders for `behind` in
  either `costClass` case — that scenario is exclusively `PendingMigrationBanner`'s responsibility
  (REQ-29) or resolves via silent boot auto-migrate (REQ-28). `feature.spec.md` AC-02 updated to
  match. REQ-02's own text required no change — it already named only `ahead`/`diverged`.
- RT-002 (BLOCKING): `feature.spec.md` REQ-12 amended to include the `RESTORE_FAILED` outcome for
  Postgres (discarding the abandoned green schema can itself fail), matching
  `state.spec.md`/`orchestrator.spec.md`/`api.spec.md`, which already treated it as
  dialect-agnostic. New AC-40 added.
- RT-003 (BLOCKING): Integration Contracts row for SPEC-016 REQ-14/REQ-15 was citing AC-09/AC-10,
  neither of which exercises those mechanics. Two new domain-specific ACs were added (AC-41, AC-42)
  and the row now cites them.
- RT-004 (ADVISORY, cross-spec): informational only — SPEC-016's own OQ-02 still uses the bare
  label "SPEC-003" with no disambiguation note of its own. Not fixed here per this dispatch's
  guardrail against editing SPEC-016; flagged to Coordinator in `pipeline-state.md`.
- RT-005 (ADVISORY): `feature.spec.md` Dependencies table's `ADS-project-knowledge/specs/003-site-install-dir/`
  row now carries an explicit Owner and Resolve-by for the REQ-28–REQ-30 follow-up.
- RT-006 (ADVISORY): `behavior.spec.md` §1.2 softened the "Postgres is never `'cheap'`" aside to
  match its own "deferred to OQ-03" framing, and updated the citation to include SPEC-016's new
  AC-33 (`'expensive'` case).
- RT-007 (ADVISORY): Integration Contracts row for SPEC-016 REQ-22 now cites only AC-25 (dropped
  the loosely-fitting AC-28).
- Re-sync against SPEC-016 v1.1.0: the confirmation-token TTL was tightened from "~10 minutes" to
  the exact 600-second figure throughout (`feature.spec.md` User Journey, AC-08;
  `behavior.spec.md` §4; `traceability.spec.md`). All other Integration Contracts rows were
  re-verified against SPEC-016's current REQ/AC text and needed no further change beyond the
  RT-003/RT-007 fixes above.

### Revision 1.2.0 (Red-Team round 2 fixes, 2026-07-14T23:58:00Z)

Revised in response to
`ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings-round2.md` (1 BLOCKING,
2 ADVISORY, 2 CONSTITUTION_FLAG carried forward unchanged). Summary:

- RT2-001 (BLOCKING, fixed): Round 1's RT-003 fix for the REQ-14/REQ-15 Integration Contracts row
  only partially resolved the finding — AC-42 correctly evidences SPEC-016 REQ-15, but AC-41 did
  not actually exercise REQ-14's idempotency-key/`DUPLICATE_COMMAND` mechanism; it re-tested
  REQ-11's `authorize()`-before-token-state ordering under REQ-14's label. Resolved via **option
  (b)**: verified directly against SPEC-016 `behavior.spec.md` §1.1 and `feature.spec.md` REQ-14
  that REQ-14 is a distinct, general-purpose idempotency-key rule, and confirmed (via
  `SPEC-017-api.spec.md` §4's `storage_execute_migrate_forward` body, SPEC-016
  `GATEWAY_EXECUTE`'s body, `errors.spec.md`, and ADR-041 §3's execute() precondition list) that no
  idempotency-key input or `DUPLICATE_COMMAND` mechanism exists anywhere in this domain — ADR-041
  §3's use of the word "idempotency" refers loosely to the same token-redemption-state check REQ-11
  already governs. `feature.spec.md`'s Integration Contracts table now cites AC-41 under the
  REQ-08–REQ-13 row (its actual evidence target) instead of a REQ-14/REQ-15 row, REQ-15 now has its
  own single-citation row (AC-42), and an explicit "Note on SPEC-016 REQ-14" states why REQ-14 has
  no independent domain-specific instantiation here. AC-41's own text and its
  `traceability.spec.md` row were corrected to cite REQ-11, not REQ-14.
- RT2-002 (ADVISORY, fixed): Added `behavior.spec.md` §2.4 ("Boot-sequence ordering: crash
  reconciliation vs. cost-gated auto-migrate policy"), stating `reconcileInterruptedMigrationOnBoot`
  (REQ-15) must resolve or block before `evaluateBootMigrationPolicy` (REQ-28/REQ-29) is ever
  invoked. Referenced from `orchestrator.spec.md`'s `onBootDriftDetected` hook and its two Action
  Contract rows, added as a new `orchestrator.spec.md` §6 invariant, added as new
  `feature.spec.md` INV-08, and cross-referenced from REQ-15's own text. `traceability.spec.md`
  gained a Section 2 row (INV-08) and a Section 5 row (§2.4) to keep D-10/E-04 coverage complete.
- RT2-003 (ADVISORY, fixed): `spec-dod.md` F-08's stale evidence note ("1.0.0 in every file") was
  corrected — see `spec-dod.md`'s own revision note for the current text.
- New version: `1.2.0`. New `content_hash`:
  `sha256:d36feb11b1f57477ef4227f331571e7222505f8a24742cdcf70eb8eded37c35d`.

### Revision 1.3.0 (Red-Team round 3 fixes, 2026-07-15T00:45:00Z)

Revised in response to
`ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings-round3.md` (1 BLOCKING,
2 ADVISORY, 2 CONSTITUTION_FLAG carried forward unchanged), driven by the mandatory re-sync
against SPEC-016's independent v1.1.0→v1.2.0 revision. Summary:

- RT3-001 (BLOCKING, fixed): SPEC-016's own round-2 Red-Team fix (RT-017) reordered `execute()`'s
  check sequence so the actor-class redemption rule (REQ-13) now runs before plan
  re-derivation/hash comparison, not after (current SPEC-016 REQ-11 text, backed by its new AC-38/
  EC-10). SPEC-017 still stated the old, superseded order in two places. `feature.spec.md` REQ-08's
  text corrected from "authorize-then-token-state-then-plan-hash-then-actor-class ordering" to
  "authorize-then-token-state-then-actor-class-then-plan-hash ordering" (matching SPEC-016 REQ-11
  exactly), with an added note confirming no domain-specific instantiation is needed beyond
  SPEC-016's own AC-38/EC-10 — no `storage.migrate-forward`-specific interaction with
  `RESTORE_POINT_UNAVAILABLE` was found that would differ under either ordering.
  `orchestrator.spec.md` §5's `onBeforeQuiesce` row corrected from "authorize()`/token-state/
  plan-hash/actor-class checks" to "authorize()`/token-state/actor-class/plan-hash checks" to match.
- RT3-002 (ADVISORY, fixed): `feature.spec.md`'s Integration Contracts table row `REQ-16 – REQ-18`
  cited `AC-35` as evidence for "REQ-28's `kind='system'` attribution" — `AC-35` is actually about
  the Tier-3 browser's ≤200 page-size cap (REQ-26), unrelated to REQ-28. Corrected the citation to
  `AC-37`, which is REQ-28's actual `kind='system'`-attribution AC.
- RT3-003 (ADVISORY, fixed): AC-41 and AC-42 previously asserted only on the `FORBIDDEN` error
  code (already deterministic and testable on its own). For parity with SPEC-016's own tightened
  AC-18/AC-19 (which assert on the new `details.reasonCode` enum SPEC-016 v1.2.0 added), both ACs'
  Then-clauses now also assert `details.reasonCode === 'AUTHORIZE_DENIED'` — both scenarios are
  ordinary `authorize()` denials, not actor-class mismatches.
- RT3-004/RT3-005 (CONSTITUTION_FLAG, carried forward unchanged): the Postgres `CUTOVER` repoint
  mechanism's library-fit and test-determinism concerns remain valid for Software Architect
  awareness; nothing in this revision changed that surface.
- New version: `1.3.0`. New `content_hash`:
  `sha256:2f09a7f1fa6e0de45592f3829bd491dd9d89a47e3a9d0a6a8ae295ed9b85066f`, propagated to every
  sibling file's own header (`api.spec.md`, `behavior.spec.md`, `errors.spec.md`,
  `orchestrator.spec.md`, `state.spec.md`, `traceability.spec.md`, `ui.spec.md`).
