# Critical Internal Constraints: site-install-dir

- Spec: SPEC-003 v1.0.0 (hash: sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142)
- ADR: ADR-PIPE-003
- Implementation Outline: `ADS-memory/reports/pipeline/003-site-install-dir/implementation-outline.md`
- Prior designations consulted: searched all existing `critical-internal-constraints.md` artifacts under `ADS-memory/reports/pipeline/*/` and `ADS-memory/reports/pipeline/*/` for prior designations of `createSqliteRouteDeps`, `openContentDb`, `seededWorkspace`, or `resolveWorkspace` — **none found**. This is the first CIC designation touching `server/deps.ts`'s composition root or the install-dir domain.
- Status: PRODUCED
- Trigger result: Algorithmic Correctness Constraint (2 units), Concurrency/Ordering/Idempotency Constraint (1 unit), Failure/Recovery Constraint (1 unit), Characterization Parity Constraint (1 unit) — 4 designated units total
- Source sync: verified 2026-07-28 — every `C-xxx`/`INV-xxx` referenced below exists in `implementation-outline.md`
- Date: 2026-07-28
- Author: Software Architect

> This artifact is a constraint ledger for designated complex units only. It does not restate the Implementation Outline's contracts or wiring.

## Trigger Decision Matrix

| Trigger | Applies? | Designated Unit(s) | Plausible Wrong Implementation | Broken Property | Required Constraint | Source Trace |
|---|---:|---|---|---|---|---|
| Algorithmic Correctness Constraint | yes | U-001, U-002 | (U-001) One of the 15 `seededWorkspace.id` sites inside `createSqliteRouteDeps` is left as a literal while the other 14 are switched to the resolved variable. (U-002) The schema guard compares only `schemaVersion` (index/count), never `schemaTag` | (U-001) AC-08's "route workspace id equals the db's one row" silently fails for exactly the one missed repo. (U-002) RT-005's divergent-lineage detection — two runtime builds sharing an index but bundling different migrations falsely pass the guard | (U-001) Every workspace-scoped construction inside `createSqliteRouteDeps` must read one local resolved variable, never re-reference the `seededWorkspace` import. (U-002) The guard must compare `schemaTag` string equality whenever `schemaVersion` index is equal, not only ordering on the index | REQ-06/AC-08, ADR-PIPE-003 §Rationale (U-001); REQ-05/RT-005/INV-04 (U-002) |
| Stateful Protocol Constraint | no | — | — | — | — | No state machine spans this feature — install-dir lifecycle (state.spec.md §4) is a linear 2-state progression (`initializing`→`complete`) with no branching transitions worth a state-machine ledger |
| Concurrency / Ordering / Idempotency Constraint | yes | U-002 | The `.site-meta.json` `schemaVersion`+`schemaTag` stamp is written as two separate file writes (or written before `migrate()` is confirmed to have committed) | INV-04's "bumped version beside a stale tag is an illegal state" — a crash between the two writes leaves a torn stamp that trips a false `SITE_NEWER_THAN_RUNTIME` on the next boot | Both fields must be written in one atomic temp-file+rename operation, only after `migrate()` returns successfully, and never partially | BR-06, INV-04, EC-09, RT-005 |
| Security-Critical Sequencing Constraint | no (see U-004 note) | — | — | — | — | No authn/z/crypto ordering exists in this local-process, no-auth-layer feature (standing Art. VI exception). U-004 below is designated instead under Algorithmic Correctness (path-containment correctness), not this trigger — see U-004's Design Context for why |
| Explicit Performance Budget Constraint | no | — | — | — | — | No spec/NFR names a latency, throughput, or memory budget for `init`/`serve`; ADR-PIPE-003's scalability axis (score 5) records this as structurally inapplicable, not merely unmeasured |
| Failure / Recovery Constraint | yes | U-003 | `.site-meta.json` is written speculatively early (e.g., right after `config.json`, "to simplify the happy path"), or a cleanup failure is silently swallowed without naming the partial dir | INV-02's "failed init never leaves a partial dir treated as valid" — a marker written too early makes a half-built dir look complete to `serve`; a silently-swallowed cleanup failure leaves an operator with a corrupt dir and no diagnostic | `.site-meta.json` must be the physically last write in `initSite`, gated on every step 2–7 having already succeeded; any cleanup failure must surface the partial dir's path in the error message rather than being caught-and-ignored | BR-01, INV-02, EC-10, RT-003 |
| Characterization Parity Constraint | yes | U-001 | Same as above — an incomplete replacement of the 15 hardcoded sites is indistinguishable from a complete one by reading any single line, and by construction a partial replacement still passes a superficial code review and even most of today's existing tests (which only assert the final `workspaceId` field, not every internal repo's scoping) | REQ-10/AC-13's legacy-path byte-for-byte behavior, and REQ-06/AC-08's install-dir correctness, for whichever internal usage was missed | A single, mechanically-verifiable rule: zero remaining references to `seededWorkspace.id` inside `createSqliteRouteDeps`'s body outside the one `resolveWorkspace` call site | REQ-06, REQ-10, AC-08, AC-13 |

## Designated Units

| Unit ID | Name | Location (module / contract ref) | Designating Trigger(s) | Outline Refs | Trace |
|---|---|---|---|---|---|
| U-001 | Workspace-id single-source-of-truth in `createSqliteRouteDeps` | `server/deps.ts` / C-010 | Algorithmic Correctness, Characterization Parity | C-010, C-005 | REQ-06, REQ-10, AC-08, AC-13 |
| U-002 | Schema guard comparison + atomic stamp write | `site-dir/schema-guard.ts`, `site-dir/boot-site-dir.ts` / C-006, C-008 | Algorithmic Correctness, Concurrency/Ordering/Idempotency | C-006, C-008, INV-04, INV-05 | REQ-05, RT-005, BR-05, BR-06, INV-04, INV-05, AC-06, AC-07 |
| U-003 | Init commit-marker ordering + cleanup-on-failure | `site-dir/init-site.ts` / C-007 | Failure/Recovery | C-007, INV-02 | BR-01, INV-02, EC-10, RT-003, AC-01, AC-03, AC-04 |
| U-004 | Install-dir path containment | `site-dir/init-site.ts`, `site-dir/boot-site-dir.ts` (all fs-writing paths) / C-007, C-008 | Algorithmic Correctness | C-007, C-008, INV-01 | INV-01 |

## Unit Constraints

### U-001 Workspace-id single-source-of-truth in `createSqliteRouteDeps`

- Responsibility: `createSqliteRouteDeps` must scope every internal repo/service construction to one correctly-resolved workspace id, for both the legacy default path and the new install-dir override path.
- Designation: Algorithmic Correctness + Characterization Parity — a partial replacement across 15 usage sites is a plausible, review-resistant wrong implementation that breaks REQ-06 (install-dir correctness) and REQ-10 (legacy byte-parity) simultaneously, in whichever single site is missed.
- Outline refs: C-010, C-005

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-001-B1 | `createSqliteRouteDeps` must call `resolveWorkspace` (C-005) exactly once per invocation and bind its result to a single local variable; every one of the function's internal constructions that today reference `seededWorkspace.id` must read that variable instead | — (no money/deletion/privilege-mutation/authn-authz property; recorded reason for omitting a default marker: this is a data-scoping correctness property, not a security-sequencing one) | REQ-06 — the workspace id used by every wired repo/service equals the db's one actual row | `audit-only: structural review — grep for `seededWorkspace.id` inside the function body finds zero matches outside the one resolution call` | REQ-06, C-010 |
| U-001-B2 | The existing test suite's assertions against `workspaceId === "workspace-local"` (and every downstream field scoped to it) must remain true with zero test-file changes after the resolution mechanism is swapped in | — | REQ-10/AC-13 — legacy path stays byte-for-byte identical | Observable: `database-migration-reconciliation-boot.integration.test.ts`, `boot-lifecycle-real-deps.integration.test.ts`, `settings-principal-check.test.ts`, `settings-register-definitions-op-validation.test.ts`, `newsletter-routes.test.ts` all pass unmodified | REQ-10, AC-08, AC-13 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| (none — REQ-06/REQ-10 are spec requirements, not outline INV-xxx entries) | feature.spec.md | U-001-B1, U-001-B2 |

#### Design Context (optional, non-binding)

`resolveWorkspace`'s failure mode (0 or >1 workspace rows) did not exist as an observable check before this feature — the legacy path previously just referenced a literal and could never "fail" this way. Introducing the check universally (not only on the install-dir path) is the cleaner mechanism (one code path, not two), and is safe because every existing seeded fixture has exactly one workspace row; U-001-B2's regression suite is exactly the evidence this equivalence holds in practice, not merely in theory.

---

### U-002 Schema guard comparison + atomic stamp write

- Responsibility: Determine whether a site's schema is older, equal-and-compatible, equal-and-divergent, or newer than the runtime, and — when migration is required — persist the runtime's new identity back to `.site-meta.json` correctly.
- Designation: Algorithmic Correctness (index+tag comparison, not index alone) + Concurrency/Ordering/Idempotency (the stamp write's atomicity and its ordering relative to `migrate()`).
- Outline refs: C-006, C-008, INV-04, INV-05

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-002-B1 | The guard must treat "equal `schemaVersion` index but different `schemaTag`" identically to "site newer than runtime" (both raise `SiteNewerThanRuntimeError`) — index-only comparison is not a legal implementation | — | RT-005 — divergent-lineage detection; INV-04's illegal-state definition | Observable: unit test feeding a fixture pair with equal index, different tag, asserting the error is raised | REQ-05, RT-005, AC-06 |
| U-002-B2 | `.site-meta.json`'s `schemaVersion` and `schemaTag` fields must be written together in one atomic file operation (temp-file+rename), and this write must only be attempted after Drizzle's `migrate()` call has returned successfully | — | INV-04 — no state where version is bumped and tag is stale, or vice versa | Observable: fault-injection test that interrupts the process between `migrate()` returning and the stamp write, asserting the next boot's guard behaves correctly (re-migrates idempotently, does not see a torn stamp) | BR-06, INV-04, EC-09 |
| U-002-B3 | After a successful `serve` that performed a migration, a subsequent `serve` of the same (now-migrated) site with the same runtime must pass the guard cleanly — no false `SiteNewerThanRuntimeError` | — | INV-05 — guard soundness under repeated boots; AC-07's explicit round-trip requirement | Observable: integration test — migrate once, re-serve, assert success | INV-05, AC-07 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-002-ORD1 | `migrate()` must complete successfully before the `.site-meta.json` stamp write is attempted | INV-04 — a stamp must never claim a migration that did not actually commit | Observable: fault-injection killing the process mid-migrate must leave the stamp unchanged (old version), never bumped | — | BR-06, INV-04 |
| U-002-ORD2 | The stamp write must complete (both fields) before `resolveWorkspace` (C-005) is treated as the final gate before listener bind | INV-05 — the stamp reflects reality before the site is declared servable | Observable: a boot that fails at workspace-resolution must still have already durably bumped the stamp (if migration ran), matching BR-05's step ordering (5 before 6) | — | BR-05, BR-06 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-04 | feature.spec.md / implementation-outline.md | U-002-B1, U-002-B2, U-002-ORD1 |
| INV-05 | feature.spec.md / implementation-outline.md | U-002-B3, U-002-ORD2 |

#### Design Context (optional, non-binding)

Drizzle's own `__drizzle_migrations` journal (ADR-015) already makes `migrate()` idempotent — the crash-safety argument here relies on that existing property, not a new transactional mechanism. U-002-ORD1/ORD2 exist to pin the *file-write* half of the picture, which Drizzle's journal does not cover.

---

### U-003 Init commit-marker ordering + cleanup-on-failure

- Responsibility: Guarantee that `.site-meta.json`'s presence is a trustworthy signal that every prior init step completed, and that a failure at any point leaves either nothing or a clearly-named partial dir — never a silently-corrupt one.
- Designation: Failure/Recovery Constraint.
- Outline refs: C-007, INV-02

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-003-B1 | `.site-meta.json` must be written strictly after steps 1–7 (validation, dir creation, `config.json` write, db create+migrate, seed insertion) all succeed — never speculatively earlier | — | INV-02 — `serve` trusts the marker's presence completely; an early-written marker would make `serve` boot against an incomplete dir | Observable: fault-injection at each of steps 4–7 asserts `.site-meta.json` is absent afterward | BR-01, INV-02 |
| U-003-B2 | On any failure in steps 2–7, `initSite` must attempt to remove everything it created before exiting | — | INV-02 — no partial install dir survives a failed init | Observable: fault-injection test asserts the target path does not exist after a mid-flight failure (AC-03) | AC-03, INV-02 |
| U-003-B3 | If the cleanup attempt in U-003-B2 itself fails (e.g., `EACCES` on `rmdir` under the same disk-full/permission condition that caused the original failure), the error message must name the partial directory's path rather than swallowing the cleanup failure silently | — | EC-10/RT-003 — INV-02 must hold "even under failed cleanup" per the spec's own wording: the commit marker is still absent, so `serve` still refuses the dir, but the operator needs to know a manual removal is required | Observable: fault-injection test simulating a cleanup-write failure asserts the thrown/logged error text contains the partial dir's path | EC-10, RT-003 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-003-ORD1 | `.site-meta.json` write must be the physically last file-system operation `initSite` performs on success | INV-02 | Observable: a test that makes the `.site-meta.json` write itself fail (e.g., permission-denied only on that specific file) must show every other file already existed at the moment of that failure, and cleanup then removes them all | — | BR-01, INV-02 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-02 | feature.spec.md / implementation-outline.md | U-003-B1, U-003-B2, U-003-B3, U-003-ORD1 |

#### Design Context (optional, non-binding)

None of these constraints require a distributed or cross-process transaction — `initSite` runs in one process against one local filesystem, so "atomicity" here means ordering discipline plus best-effort cleanup, not a two-phase commit.

---

### U-004 Install-dir path containment

- Responsibility: Guarantee that no `init`/`serve` operation ever writes a file outside the resolved target install dir, regardless of what the `dir` argument contains (relative paths, `..` segments, or a symlink at the target).
- Designation: Algorithmic Correctness Constraint (sanitize/resolve-then-use pattern). Not designated under Security-Critical Sequencing: that trigger's examples (authorize-before-effect, verify-before-trust, crypto ordering) concern authn/z sequencing, which this standing-no-auth-layer, `LOCAL_PROCESS`-trust feature does not have (Article VI's constitution exception already covers that). Escalation marker omitted for the recorded reason below.
- Outline refs: C-007, C-008, INV-01

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-004-B1 | Every fs write inside `initSite`/`boot-site-dir` must target a path that is first resolved (`path.resolve`/`fs.realpath`-equivalent) and confirmed to be inside — or, for `init`, to *become* — the target dir; no write may be constructed by naive string concatenation against an unresolved `dir` argument | — (recorded reason: this is a path-containment correctness property under the existing `LOCAL_PROCESS` trust model, not an authn/z sequencing decision; Article VI's standing exception already covers the trust-model question itself) | INV-01 — no writes outside the target install dir | Observable: integration test passing a `dir` argument containing `../` segments, or a symlink at the target pointing outside a sandboxed test root, asserts no file appears outside the intended root | INV-01 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-01 | feature.spec.md / implementation-outline.md | U-004-B1 |

#### Design Context (optional, non-binding)

This becomes materially more important once the desktop host (ADR-011 topology 2) starts supplying `dir` programmatically rather than a human typing it at a terminal — see ADR-PIPE-003's Re-evaluation Triggers (topology trigger). Nothing in v1's scope requires more than the containment check itself.

## Deviation And Promotion Protocol

- No constraint in this artifact carries `ESCALATE_SECURITY` or `ESCALATE_IRREVERSIBLE` — none involves money movement, permanent deletion, privilege mutation, non-idempotent external effects, or authn/z sequencing. Standard `[CIC_DEVIATION]` recording applies to any deviation from U-001…U-004's Binding constraints.
- Before final Programmer handoff, each in-scope Binding constraint (U-001-B1/B2, U-002-B1/B2/B3, U-003-B1/B2/B3, U-004-B1) must be confirmed, deviated-with-record, or reclassification-requested per the standard protocol.

## Downstream Handoff Notes

- Coordinator: tasks touching `server/deps.ts` must reference U-001; tasks touching `site-dir/schema-guard.ts`/`boot-site-dir.ts` must reference U-002; tasks touching `site-dir/init-site.ts` must reference U-003 and U-004. Source-sync IDs to watch: C-005, C-006, C-007, C-008, C-010, INV-01, INV-02, INV-04, INV-05.
- TDD focus: encode U-001-B2, U-002-B1/B2/B3, U-003-B1/B2/B3, and U-004-B1 as observable tests before any new behavior is added (all are observable surfaces; none of this artifact's constraints are audit-only except U-001-B1's structural grep check, which is a Code Review Agent responsibility, not a TDD assertion).
- Programmer audit focus: confirm U-001-B1's grep check (zero remaining literal usages), confirm U-002-ORD1/ORD2's ordering in the actual `boot-site-dir.ts` implementation, confirm U-003-ORD1's marker-last ordering, confirm U-004-B1's path-resolution discipline across every fs-write call site in `site-dir`.
- Open risks or ambiguities: none.
