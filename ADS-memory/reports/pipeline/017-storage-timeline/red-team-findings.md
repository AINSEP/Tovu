# Red-Team Findings: storage-timeline

- Feature: FEAT-017-storage-timeline
- Spec version: 1.0.0
- Spec hash: sha256:3613c3f2ee450216a0296cbd06f6b19b27ea3df3d269956ba052f17d80777974 (mechanically re-verified against `SPEC-017-feature.spec.md`'s current content via `validate_spec_package.py --phase spec`, PASS with no `--update-hash` needed)
- Red-Team completed: 2026-07-14T22:00:00Z
- Finding count: 3 BLOCKING · 4 ADVISORY · 2 CONSTITUTION_FLAG

---

## BLOCKING Findings

Spec must be revised before Software Architect dispatch. **3 BLOCKING findings exist — per the Red-Team persona's Escalation rule, this triggers a stop-and-route-back to Spec Agent. See Routing Decision.**

### RT-001
- Severity: BLOCKING
- Category: ambiguity
- Location: `SPEC-017-ui.spec.md` §2.2 (`DriftBanner` Input Contract) vs §4 (Rendering and Interaction Rules, bullet 1); REQ-02
- Description: §4's rendering rule states `DriftBanner` "renders only when `driftStatus` is `ahead` or `diverged`, or `behind` with a `costClass` other than `'cheap'`" — i.e., the show/hide decision needs both `driftStatus` and `costClass`. But `DriftBanner`'s own Input Contract (§2.2) declares only two props: `driftStatus` and `onOpenMigrateWizard`. There is no `costClass` input anywhere in the component's declared props. A developer implementing strictly from §2.2 cannot satisfy §4's own rendering rule for the `behind`-and-not-cheap case — the component has no way to know `costClass`. Two implementers would diverge: one adds an undeclared `costClass` prop (violating the "typed props" DoD claim C-15/C-16), another implements only REQ-02's literal text (ahead/diverged only) and never shows the banner for `behind`+expensive/unavailable, silently dropping the behavior §4 and AC-02's phrasing ("behind-and-cheap-migratable" implies a "behind-and-NOT-cheap" case exists and is expected to show something) both imply exists. REQ-02 itself only names `ahead`/`diverged` as triggers, never mentioning `behind` at all, so the requirement text and the UI contract are not in agreement on whether a third triggering condition exists.
- Suggested resolution: Either (a) add `costClass` as an explicit, typed input to `DriftBanner` in §2.2 and amend REQ-02 to state the third triggering condition explicitly ("...or `behind` with `costClass` other than `'cheap'`"), or (b) confirm the `behind`+expensive/unavailable case is exclusively `PendingMigrationBanner`'s responsibility (not `DriftBanner`'s) and remove the "or behind..." clause from ui.spec.md §4 bullet 1 so the two banners' rendering conditions don't overlap ambiguously. Either fix removes the developer disagreement; as written, both readings are defensible.

### RT-002
- Severity: BLOCKING
- Category: contradiction
- Location: REQ-12 vs REQ-11; `SPEC-017-state.spec.md` §3 (`APPLY_SCHEMA`/`VERIFY_SCHEMA`/`RESTORE_FROM_MIGRATION_FAILURE` action rows); `SPEC-017-orchestrator.spec.md` §3 (`terminalState`) and §5 (`onApplyOrVerifyFailure`); `SPEC-017-api.spec.md` §5 (`MigrateExecuteResult.finalState` enum)
- Description: REQ-11 (SQLite) explicitly commits to two possible terminal outcomes of an `APPLYING`/`VERIFYING` failure: `(APPLYING|VERIFYING)_FAILED→RESTORING→(RESTORED|RESTORE_FAILED)`. REQ-12 (Postgres), describing the analogous failure edge, commits to only one: `(APPLYING|VERIFYING)_FAILED→RESTORING→RESTORED` — `RESTORE_FAILED` is conspicuously absent from the Postgres wording, and no rationale is given for why Postgres's restore (discarding the unpublished green schema) could never itself fail the way SQLite's whole-file restore can. Every other artifact in the package treats `RESTORE_FAILED` as reachable regardless of dialect: `state.spec.md`'s `RESTORE_FROM_MIGRATION_FAILURE` action row says generically "`RESTORE_FAILED` if the Recovery-executed restore itself fails" with no dialect qualifier; `orchestrator.spec.md`'s `onApplyOrVerifyFailure` hook says "terminal state becomes `RESTORED` or `RESTORE_FAILED`, decided by the Recovery surface's own execute outcome" with no dialect qualifier; and `api.spec.md`'s `MigrateExecuteResult.finalState` enum lists `RESTORE_FAILED` as a plain member with no dialect-conditional annotation (unlike `CUTOVER`, which the model correctly reserves to Postgres only in `MigrationRunStatus`). This is a direct contradiction: is `RESTORE_FAILED` reachable for a Postgres migration's `APPLYING`/`VERIFYING` failure, or not? No AC in the package (AC-12 tests only the SQLite case; AC-13/AC-14 test only `CUTOVER`) resolves this either way for Postgres.
- Suggested resolution: Either (a) amend REQ-12 to include `RESTORE_FAILED` explicitly (`→RESTORING→(RESTORED|RESTORE_FAILED)`), matching REQ-11 and every other artifact, with a new AC covering the Postgres `RESTORE_FAILED` case; or (b) if Postgres's green-discard genuinely cannot fail (a real dialect asymmetry, not an oversight), state that reasoning explicitly in REQ-12/EC and remove `RESTORE_FAILED` from the dialect-agnostic rows in `state.spec.md`, `orchestrator.spec.md`, and the `finalState` enum, or explicitly annotate it Postgres-unreachable there. As written, the artifacts disagree with each other.

### RT-003
- Severity: BLOCKING
- Category: ambiguity (Integration Contracts citation accuracy — extra verification duty)
- Location: `SPEC-017-feature.spec.md` "## Integration Contracts" table, row: `REQ-14, REQ-15 (authorize() before idempotency; live agent-delegation intersection) | ... | AC-09, AC-10`
- Description: This row claims AC-09 and AC-10 are "SPEC-017 ACs that require [SPEC-016 REQ-14/REQ-15] live." Checked against the actual AC text: AC-09 ("Given `db-ops.getCapabilities().restorePoint.costClass === 'unavailable'` at execute time... refused with `RESTORE_POINT_UNAVAILABLE`...") exercises a capability/precondition check, not authorize()-vs-idempotency ordering (REQ-14) or agent live-delegation-intersection re-evaluation (REQ-15). AC-10 ("Given a valid, unexpired, unredeemed token... a second `execute()` call with the same (now-redeemed) token is rejected with `TOKEN_ALREADY_REDEEMED`") exercises single-token-redemption (SPEC-016 REQ-11/REQ-13/INV-03 territory), not REQ-14's authorize-before-idempotency-short-circuit rule or REQ-15's live grant-∩-delegator recomputation. Neither AC constructs an idempotency-key replay scenario or an agent-delegation-permission-change-between-confirm-and-execute scenario (the domain-specific analog of SPEC-016's own EC-04/AC-22). This is the exact citation-drift risk flagged for this review: the same AC-09/AC-10 pair already appears, more defensibly, in the row directly above (`REQ-08–REQ-13`) and appears to have been reused without actually verifying it maps to REQ-14/REQ-15's distinct mechanics. Net effect: the table asserts REQ-14/REQ-15 coverage exists for this domain when no SPEC-017 AC actually demonstrates it — a reviewer trusting this table would wrongly believe the domain-specific authorize-ordering and live-delegation behavior is accounted for.
- Suggested resolution: Either (a) identify and cite the correct SPEC-017 AC(s) that actually exercise REQ-14 (an idempotency-key replay against an unauthorized caller for `storage.migrate-forward`) and REQ-15 (a delegator's grant changing between `confirm()` and `execute()` for an agent-executed migration) — if none currently exist, add them as new ACs before Architect dispatch, since this is exactly the kind of gap the citation table exists to surface; or (b) if the intent is genuinely "SPEC-016's own test suite already covers REQ-14/REQ-15 generically and this domain relies on that without domain-specific re-verification," say so explicitly in the table instead of citing ACs that don't actually test it.

---

## ADVISORY Findings

Spec Agent and human are informed. Human decides whether to revise or accept risk.

### RT-004
- Severity: ADVISORY
- Category: ambiguity (cross-spec, informational — not a SPEC-017 blocker)
- Location: `SPEC-016-feature.spec.md` Open Questions, OQ-02 ("inherited from SPEC-003's OQ-04 lineage..."; "Owner: whoever resolves the original SPEC-003 OQ-04")
- Description: SPEC-017 correctly and thoroughly disambiguates the bare label "SPEC-003" (its own "Numbering Disambiguation" section, its `spec-manifest.md`, and its Agent Directives all state the label now unambiguously belongs to the pre-existing `ADS-project-knowledge/specs/003-site-install-dir/` package, since the Collections spec was renumbered to SPEC-020 this session). However, SPEC-016 — which SPEC-017 depends on and which was edited in the same session (its OQ-04 was resolved via SPEC-017's fold-back) — still uses the bare label "SPEC-003" twice in its own OQ-02, with no disambiguation note of its own. Verified against `ADS-project-knowledge/specs/003-site-install-dir/feature.spec.md`'s own OQ-04 ("siteId vs workspace id relationship... Resolve by: host-open-design adapter spec") that the *topic* SPEC-016's OQ-02 refers to does correctly match that pre-existing package, so the citation itself is not factually wrong — but a reader who opens SPEC-016 alone (e.g., a Software Architect or Red-Team pass for SPEC-018/SPEC-019/SPEC-020) has no way to know that from SPEC-016's own text, since the collision-avoidance context lives only in SPEC-017's sibling files.
- Suggested resolution: Per this review's guardrails, SPEC-016 is not edited here. Recommend the Coordinator add a one-line disambiguation note (or a pointer to SPEC-017's Numbering Disambiguation section) directly into SPEC-016's OQ-02, so the bare-label risk isn't resolved only by accident-of-reading-order.

### RT-005
- Severity: ADVISORY
- Category: missing-failure-mode (process/tracking, not spec content)
- Location: `SPEC-017-feature.spec.md` Scope (Out of scope, REQ-28–REQ-30 bullet) and Dependencies table (`ADS-project-knowledge/specs/003-site-install-dir/` row)
- Description: The required amendment to the pre-existing site-install-dir package's `SERVE_SITE` row and status lifecycle is explicitly and correctly scoped as a tracked follow-up, not a blocker to this spec's own approval — this directly answers the assignment's fourth focus area and is handled well. However, unlike every Open Question in this spec (each of which has an explicit Owner and Resolve-by target), this follow-up item has neither. The Dependencies table's Fallback cell for that row reads only "None — REQ-28–REQ-30 remain unimplemented until that file is amended, tracked as a follow-up, not a blocker to this spec's own approval" — with no named owner or milestone attached.
- Suggested resolution: Add an Owner and a Resolve-by (or "must land before Software Architect/Programmer touches REQ-28–REQ-30" gating language) to this follow-up, matching the rigor already applied to OQ-01 through OQ-06, so it can't silently slip while the rest of the domain proceeds as if the boot-time behavior it depends on already exists.

### RT-006
- Severity: ADVISORY
- Category: contradiction (documentation clarity, not testability-blocking)
- Location: `SPEC-017-behavior.spec.md` §1.2, Example
- Description: The worked example asserts as settled fact that Postgres "is never `'cheap'`" ("not applicable to Postgres, which is never `'cheap'`"), in the same sentence that defers "a configured Postgres site's concrete `costClass` value" to OQ-03/the `db-ops` adapter as unresolved. This doesn't break any AC's testability today — REQ-28/REQ-29/AC-37/AC-38 are written generically over `costClass`'s value, not over dialect, so functional behavior is unaffected either way. But the sentence itself is internally inconsistent: it states a "never" rule as fact while also calling the underlying value undetermined and Architect-owned. A downstream reader (Architect, TDD Agent) could cite the "never 'cheap'" aside as a settled constraint when it is explicitly not one.
- Suggested resolution: Either promote "Postgres MUST NOT report `costClass='cheap'`" to a real REQ/INV if it is actually intended as binding, or soften the aside to something like "this spec does not commit to whether a configured Postgres site can ever report `'cheap'` — that classification is entirely a `db-ops` adapter decision, per OQ-03" so it can't be mistaken for a settled rule.

### RT-007
- Severity: ADVISORY
- Category: ambiguity (Integration Contracts citation accuracy — extra verification duty)
- Location: `SPEC-017-feature.spec.md` "## Integration Contracts" table, row: `REQ-22 (agent-tool naming convention; no confirm tool ever) | ... | AC-25, AC-28`
- Description: AC-25 ("...no tool performing a `confirm()`-equivalent step exists") is a direct, accurate demonstration of SPEC-016 REQ-22. AC-28, however, is about `storage_get_restore_guidance` never itself executing a restore — a rule owned entirely by this domain's own REQ-23, not by SPEC-016 REQ-22's plan/execute-naming-and-callability convention. The fit is looser than a clean citation match; unlike RT-003, there is at least a defensible thematic link (both are about the agent-tool catalog not exposing an unsafe action), but AC-28 doesn't actually verify anything about SPEC-016 REQ-22 being "live."
- Suggested resolution: Either drop AC-28 from this row (AC-25 alone already demonstrates REQ-22), or add a sentence clarifying that AC-28 is cited only as complementary evidence that the domain's whole catalog obeys the same no-unsafe-agent-action spirit REQ-22 establishes, not as a direct test of REQ-22 itself.

---

## CONSTITUTION_FLAG Findings

Likely to require a constitution exception under the Red-Team persona's default provider profile (the project's own `ADS-memory/governance/constitution.md` is an unratified template with no concrete articles to check against — same finding SPEC-017 itself already records honestly in its Constitution Compliance table — so these use the persona's generic Article definitions instead).

### RT-008
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article I — Library-First
- Location: OQ-03 ("the concrete Postgres `CUTOVER` repoint mechanism... is unspecified at this spec's level"); REQ-12
- Description: The Postgres blue/green `CUTOVER` repoint (a stable DSN alias, a database rename, or a connection-pool re-target — the spec explicitly leaves the choice open) has no obvious off-the-shelf library that performs exactly this atomic-repoint contract for an arbitrary Postgres deployment; whichever mechanism the Software Architect picks is likely to require meaningfully custom orchestration code layered on top of whatever primitive (pg connection pool, DNS/alias tooling) is chosen.
- Architect note: Prepare a Complexity Justification entry for the `CUTOVER` repoint mechanism specifically — name the candidate primitives considered (DSN alias vs. db rename vs. pool re-target), why a custom coordination layer around the chosen one is unavoidable, and how it will be tested without a full production-like Postgres HA setup.

### RT-009
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article II — Test-First / testability
- Location: REQ-12, REQ-19 (disk-headroom preflight dependency), EC-03 (`CUTOVER_FAILED→ROLLBACK_TO_BLUE`)
- Description: Deterministically exercising the Postgres blue/green `CUTOVER` failure path (AC-13/AC-14/EC-03) and the ADR-023 §3 disk-headroom preflight this domain's snapshot step depends on both likely require either a real multi-instance Postgres test harness or a nontrivial fake/fault-injection layer around the `db-ops` port — plain unit tests cannot exercise "blue continues serving while green is built" or "repoint fails after a validated green schema" without simulating real connection/repoint behavior.
- Architect note: Prepare a Complexity Justification / test-strategy entry for how `CUTOVER`-path and disk-headroom-preflight tests will be made deterministic and CI-affordable (e.g., a fake `db-ops` adapter that can inject a mid-repoint failure) rather than requiring a live Postgres blue/green environment per test run.

---

## Routing Decision

**3 BLOCKING findings exist (RT-001, RT-002, RT-003).** Per the Red-Team persona's Escalation rule, this is a stop condition: **route back to Spec Agent — do not patch findings inline.** Each BLOCKING finding is a concrete, demonstrable contradiction or interface gap (verified directly against file content, not a stylistic preference), not a systemic pattern requiring a full spec rewrite — but the persona's rule is a hard threshold, not a judgment call, so this recommendation stands regardless of how narrow the three fixes are individually.

ADVISORY (RT-004 – RT-007) and CONSTITUTION_FLAG (RT-008, RT-009) findings are included in Software Architect context once the spec clears revision — none of them independently block dispatch.

**Integration Contracts citation-accuracy check: FAIL.** One BLOCKING citation-accuracy defect (RT-003: the REQ-14/REQ-15 → AC-09/AC-10 row is factually inaccurate — neither cited AC exercises those SPEC-016 mechanics) and one ADVISORY citation-accuracy defect (RT-007: the REQ-22 → AC-28 pairing is a loose/unclear fit). All other rows in the Integration Contracts table were checked individually against SPEC-016's current REQ/AC text and are accurate. The SPEC-016 OQ-04 resolution cross-reference (SPEC-017's dedicated resolution section vs. SPEC-016's own OQ-04, now marked Resolved) was independently verified consistent — no drift found there.
