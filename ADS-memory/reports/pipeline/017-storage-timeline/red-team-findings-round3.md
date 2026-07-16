# Red-Team Findings (Round 3 — Fresh Re-Review + Mandatory SPEC-016 v1.2.0 Re-Sync): storage-timeline

- Feature: FEAT-017-storage-timeline
- Spec version: 1.2.0
- Spec hash: sha256:d36feb11b1f57477ef4227f331571e7222505f8a24742cdcf70eb8eded37c35d (mechanically
  re-verified against the current `SPEC-017-*` package via
  `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py
  ADS-memory/specs/017-storage-timeline --phase spec`, PASS with no `--update-hash` needed —
  content_hash is current, not stale)
- Red-Team completed: 2026-07-15T00:20:00Z
- This is a fresh, full adversarial pass against v1.2.0 (all 10 files read in full), plus the
  mandatory re-verification of every `## Integration Contracts` citation against SPEC-016's
  **current v1.2.0** text (`ADS-memory/specs/016-content-admin-core-contract/`, content_hash
  `sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`) — SPEC-017's citations
  were last checked against SPEC-016 v1.1.0 in round 2, and SPEC-016 has since been revised to
  v1.2.0 by its own Red-Team round-2-driven pass.
- Finding count (this round): 1 BLOCKING · 2 ADVISORY · 0 new CONSTITUTION_FLAG (RT2-004/RT2-005
  carried forward unchanged)

---

## Part 1 — Disposition of Round 2 Findings (RT2-001 – RT2-005)

| ID | Round 2 Severity | Verdict | Why |
|----|----|----|----|
| RT2-001 | BLOCKING | **RESOLVED** | The Integration Contracts table no longer cites AC-41 under a REQ-14/REQ-15 row. `feature.spec.md`'s table now cites AC-41 under the REQ-08–REQ-13 row (its actual evidence target, alongside AC-06–AC-10), REQ-15 has its own single-citation row (AC-42 only), and a dedicated "Note on SPEC-016 REQ-14" explains why REQ-14 has no independent domain-specific instantiation in this spec. AC-41's own text and its `traceability.spec.md` row were corrected to cite REQ-11, not REQ-14. Verified directly: AC-41 now reads "...an instantiation of SPEC-016 REQ-11's `authorize()`-re-evaluation ordering... this AC evidences REQ-11's ordering rule, not REQ-14's distinct idempotency-key short-circuit rule" — accurate. |
| RT2-002 | ADVISORY | **RESOLVED** | `behavior.spec.md` §2.4 ("Boot-sequence ordering: crash reconciliation vs. cost-gated auto-migrate policy") exists and states the required ordering explicitly. `feature.spec.md` INV-08 and REQ-15's own text cross-reference it. `orchestrator.spec.md`'s `evaluateBootMigrationPolicy` action and `onBootDriftDetected` hook both state the "MUST NOT run while a non-terminal `migration_runs` row exists" rule and cite §2.4. `orchestrator.spec.md` §6 has a matching invariant. `traceability.spec.md` §2 has an INV-08 row and §5 has a "Boot-sequence ordering" row. All consistent. |
| RT2-003 | ADVISORY | **RESOLVED** | `spec-dod.md` F-08 now reads "`1.2.0` in every file (corrected in the v1.2.0 revision, RT2-003 — the prior note read a stale `1.0.0`, when the package was actually consistently `1.1.0` at that time)" — verified directly against every file's header (`feature.spec.md`, `api.spec.md`, `state.spec.md`, `orchestrator.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`), all consistently `1.2.0`. Accurate. |
| RT2-004 (= RT-008) | CONSTITUTION_FLAG | **Unchanged, still valid** | The Postgres `CUTOVER` repoint mechanism (OQ-03) remains architecturally undecided at the spec level — nothing in this revision changed this surface. Carried forward for Software Architect awareness. |
| RT2-005 (= RT-009) | CONSTITUTION_FLAG | **Unchanged, still valid** | The `CUTOVER`-path / disk-headroom-preflight test-determinism concern remains — nothing in this revision changed this surface. Carried forward for Software Architect awareness. |

**All of round 2's findings are resolved or correctly carried forward as unchanged constitution notes.** No regression was introduced by the v1.2.0 revision into any of RT2-001–RT2-003's fixed content.

---

## Part 2 — Mandatory SPEC-016 v1.2.0 Re-Sync

SPEC-016 was revised from v1.1.0 (hash `sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`,
the version SPEC-017's round-2 citation check verified against) to v1.2.0 (hash
`sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`) by SPEC-016's own
Red-Team round-2-driven revision, resolving `red-team-findings-round2.md` (RT-012 through RT-018)
for that spec. I read SPEC-016's current `feature.spec.md` in full and cross-checked every change
against SPEC-017's citations:

| SPEC-016 change (v1.1.0→v1.2.0) | Effect on SPEC-017's citations |
|---|---|
| RT-012: `restorePoint.kind: 'external'` given a concrete trigger (externally-managed PITR/backup, paired with `costClass: 'unavailable'`); new AC-37 | No impact — `SPEC-017-api.spec.md`'s `RestorePointSummary.kind` and `MigratePlanResponse.details.restorePointKind` enums already included `'external'` before this trigger was formalized. No contradiction; SPEC-016 simply backed an already-anticipated value with a defined condition. |
| RT-013: `FORBIDDEN.details.reason` given a closed `details.reasonCode` enum (`AUTHORIZE_DENIED` \| `ACTOR_CLASS_MISMATCH`); AC-18/AC-19 now assert on it exactly | No contradiction — SPEC-017 never restates `FORBIDDEN`'s shape (`errors.spec.md` explicitly reuses it "unchanged... not redefined"), and AC-41/AC-42 assert on which **error code** appears (`FORBIDDEN` vs. `TOKEN_ALREADY_REDEEMED`), which is already deterministic without needing `reasonCode`. Not a defect, but see RT3-003 (ADVISORY) below for an available tightening. |
| RT-014: REQ-18 now explicitly states only the composite-actor-identity flavor of the soft cross-boundary reference is directly instantiated here (`state.spec.md`'s `ActorIdentityRef`); the polymorphic-content-reference flavor is each dependent domain's own responsibility | Not applicable to Storage — this domain owns no polymorphic-content-reference table (`storage_ledger`/`migration_runs`/`restore_points` are not a polymorphic reference pattern); no SPEC-017 obligation is created or contradicted. |
| RT-015: REQ-19's "working" clarified as a static config-presence check, never a live probe; configured-but-broken Postgres tooling also reports `'unavailable'` (new AC-36) | No contradiction — SPEC-017's own OQ-06 (cost/disk estimate mechanism) and `behavior.spec.md` §1.2's Postgres-`costClass` example are unaffected; neither makes a claim about how "working" is verified. |
| RT-016: REQ-14 now explicitly states it is a generic cross-cutting rule not claiming this contract's own three gateway endpoints accept an idempotency-key field | **Confirms and strengthens** SPEC-017's own RT2-001 fix — the "Note on SPEC-016 REQ-14" section's conclusion ("REQ-14 therefore has no independent domain-specific instantiation in this spec") is now independently corroborated by SPEC-016's own clarified text. No update needed; still accurate. |
| **RT-017: `execute()`'s check ordering reordered — the actor-class redemption rule (REQ-13) now runs *before* plan re-derivation/hash comparison, not after** (new EC-10, AC-38); `behavior.spec.md` §2.2's ordering text, `orchestrator.spec.md`'s hooks, and `state.spec.md`'s `REDEEM_TOKEN` precondition order were all updated in SPEC-016 to reflect the new sequence | **Direct contradiction found in SPEC-017 — see RT3-001 (BLOCKING) below.** SPEC-017 restates the *old*, now-superseded ordering in two places. |
| RT-018: two-hour timestamp discrepancy fixed in `SPEC-016-spec-dod.md` | Purely internal to SPEC-016's own DoD artifact; no SPEC-017 citation touches this. |

**Overall re-sync result: one concrete drift found (RT3-001, BLOCKING).** Every other SPEC-016
v1.1.0→v1.2.0 change either has no bearing on SPEC-017's citations or actively confirms content
SPEC-017 already got right in its own round-2 fix.

### Integration Contracts table — row-by-row re-verification against SPEC-016 v1.2.0

| Row (SPEC-016 id(s)) | Cited SPEC-017 evidence | Result |
|---|---|---|
| REQ-01 – REQ-05 | AC-11, AC-16 | Accurate — REQ-01–05 unchanged in v1.2.0 |
| REQ-06, REQ-07 | AC-27 | Accurate — unchanged |
| **REQ-08 – REQ-13** | AC-06 – AC-10, AC-41 | **The cited ACs remain individually accurate, but REQ-08's own body text (part of what this row cites) now contradicts SPEC-016's current REQ-11 ordering — see RT3-001.** |
| REQ-15 | AC-42 | Accurate — REQ-15 unchanged in v1.2.0 |
| **REQ-16 – REQ-18** | AC-19, AC-35 (labeled "REQ-28's `kind='system'` attribution") | **FAIL — AC-35 does not test this; see RT3-002.** Not a SPEC-016-drift issue — a pre-existing SPEC-017-internal mislabel caught by this round's fresh full pass. |
| REQ-19 – REQ-21 | AC-06, AC-09 | Accurate — SPEC-016's new `'external'`/AC-36/AC-37 sub-clauses don't contradict SPEC-017's existing usage |
| REQ-22 | AC-25 | Accurate — unchanged |
| (Note on REQ-14, no row) | n/a | Accurate — now more strongly confirmed by SPEC-016's own RT-016 clarification |

Also re-verified: the SPEC-016 OQ-04 resolution cross-reference (SPEC-017's dedicated "Resolution
of SPEC-016 OQ-04" section vs. SPEC-016's own OQ-04, marked "Resolved 2026-07-14 (Coordinator
fold-back from SPEC-017)") remains fully consistent in v1.2.0 — no drift there. SPEC-016's OQ-02
still uses the bare label "SPEC-003" with no disambiguation note of its own (unchanged status quo
from round 1's RT-004/carried-forward informational note) — not re-flagged as a new finding since
nothing changed here and it is out of this dispatch's scope to edit SPEC-016.

---

## BLOCKING Findings

Spec must be revised before Software Architect dispatch.

### RT3-001
- Severity: BLOCKING
- Category: contradiction (drift against the cited authority's current text — the exact defect
  class this dispatch's mandatory re-sync duty exists to catch)
- Location: `SPEC-017-feature.spec.md` REQ-08 ("...MUST follow SPEC-016 REQ-11–REQ-13's
  authorize-then-token-state-then-plan-hash-then-actor-class ordering..."); `SPEC-017-orchestrator.spec.md`
  §5, `onBeforeQuiesce` row ("...after SPEC-016's `authorize()`/token-state/plan-hash/actor-class
  checks have all passed (REQ-08)..."); vs. `SPEC-016-feature.spec.md` REQ-11 (current v1.2.0 text)
  and its own new AC-38/EC-10
- Description: SPEC-016's round-2 Red-Team fix (RT-017) reordered `execute()`'s check sequence:
  the actor-class redemption rule (REQ-13) now runs **before** plan re-derivation/hash comparison,
  not after — SPEC-016 REQ-11 now reads "...MUST then evaluate the actor-class redemption rule
  (REQ-13) **before** recomputing the plan against live state to detect a hash mismatch," and
  SPEC-016's new AC-38 exists specifically to test this: "a redemption attempt fails the actor-class
  rule and the recomputed plan would also be stale... the response is `FORBIDDEN`... the actor-class
  rule is evaluated before plan re-derivation/hash comparison... never `PLAN_STALE`." This reordering
  was made precisely to close an information-disclosure gap (RT-017 in SPEC-016's own round-2
  findings): under the old order, an actor-class-mismatched caller whose token was also hash-stale
  would have learned `PLAN_STALE` (live-state information) before being told they were never allowed
  to redeem the token at all — in tension with this same contract's REQ-11/REQ-14 non-disclosure
  principle.

  SPEC-017 still states the **old, now-superseded** order in two places: REQ-08's own text
  ("authorize-then-token-state-then-**plan-hash-then-actor-class**") and
  `orchestrator.spec.md`'s `onBeforeQuiesce` row ("`authorize()`/token-state/**plan-hash/actor-class**
  checks"). Both put plan-hash before actor-class — the reverse of SPEC-016's current, controlling
  order. A developer implementing `storage.migrate-forward`'s `execute()` strictly from SPEC-017's
  own text (which explicitly claims to "follow SPEC-016 REQ-11–REQ-13's... ordering") would
  reproduce the exact disclosure defect SPEC-016's RT-017 fix exists to prevent, for this domain's
  own instantiation of the gateway. No SPEC-017 AC currently exercises this domain-specific ordering
  either way (AC-41 tests only authorize()-vs.-token-state, which is unaffected by this reordering).
- Suggested resolution: Correct REQ-08's phrase to "authorize-then-token-state-then-actor-class-then-plan-hash
  ordering" (matching SPEC-016 REQ-11's current text exactly), and correct `orchestrator.spec.md`'s
  `onBeforeQuiesce` ordering cell to the same corrected sequence. Optionally (not required — SPEC-016's
  own AC-38/EC-10 already generically cover this rule, and this spec's "Note on SPEC-016 REQ-14"
  precedent shows a domain can rely on SPEC-016's own generic coverage without a redundant
  domain-specific AC when there is no domain-specific reason to differ) add a short note confirming
  no domain-specific instantiation is needed beyond SPEC-016's own AC-38, or add one if the Spec
  Agent judges this domain's `RESTORE_POINT_UNAVAILABLE` interaction warrants its own test.

---

## ADVISORY Findings

Spec Agent and human are informed. Human decides whether to revise or accept risk. Neither
independently blocks Software Architect dispatch, but RT3-002 should be fixed in the same pass as
RT3-001 since it touches the immediately adjacent row.

### RT3-002
- Severity: ADVISORY
- Category: ambiguity (Integration Contracts citation accuracy — same extra-verification duty as
  RT-003/RT-007/RT2-001, but lower practical impact — the correct evidence exists in the file, just
  mislabeled)
- Location: `SPEC-017-feature.spec.md` "## Integration Contracts" table, row `REQ-16 – REQ-18 | ...
  | AC-19, AC-35 (REQ-28's `kind='system'` attribution)`; `AC-35`'s and `AC-37`'s own definitions
- Description: The row's parenthetical claims `AC-35` evidences "REQ-28's `kind='system'`
  attribution." Checked against the actual AC-35 text in the same file: "AC-35 (REQ-26) [P2]: Given
  a `readRows()` request omits `limit`, when it is evaluated, then the server applies its own ≤200
  cap rather than returning an unbounded result set" — this is about the Tier-3 browser's page-size
  default, entirely unrelated to REQ-28 or actor-identity attribution. The AC that actually evidences
  "REQ-28's `kind='system'` attribution" is **AC-37**: "Given a site boots behind the runtime with
  `costClass='cheap'`... the resulting ledger rows attribute the actor as the seeded `kind='system'`
  principal." This is a plain off-by-two citation error (likely from AC-list growth during earlier
  revisions), unrelated to the SPEC-016 v1.2.0 re-sync — a pre-existing SPEC-017-internal defect this
  round's fresh full pass caught independently. Impact is limited because AC-37 does exist, is
  correctly attached to REQ-28 in the Acceptance Criteria section, and is easily discoverable by
  anyone reading REQ-28's own ACs directly — the risk is narrowly confined to a reader trusting this
  one summary-table cell without cross-checking, not a missing test or an unimplementable
  requirement.
- Suggested resolution: Change the citation from `AC-35` to `AC-37` in that table cell.

### RT3-003
- Severity: ADVISORY
- Category: missing-failure-mode (optional tightening, not a defect)
- Location: `SPEC-017-feature.spec.md` AC-41, AC-42
- Description: SPEC-016 v1.2.0 added a closed `details.reasonCode` enum (`AUTHORIZE_DENIED` |
  `ACTOR_CLASS_MISMATCH`) to disambiguate `FORBIDDEN`'s two producers precisely so a test can assert
  a deterministic value rather than an "identifying" free-text message (this was SPEC-016's own
  round-2 BLOCKING finding RT-013). AC-41 and AC-42 both currently assert only on the error **code**
  (`FORBIDDEN` vs. `TOKEN_ALREADY_REDEEMED`), which is already a fully deterministic, testable
  assertion on its own — this is not the same untestability problem RT-013 fixed, so nothing here is
  broken. However, now that the discriminator exists, AC-41/AC-42 could optionally assert
  `details.reasonCode === 'AUTHORIZE_DENIED'` (both are ordinary `authorize()` denials, not
  actor-class mismatches, per each AC's own scenario) for extra precision, matching the rigor
  SPEC-016's own AC-18/AC-19 now apply to the `ACTOR_CLASS_MISMATCH` case.
- Suggested resolution: Optional — add `details.reasonCode === 'AUTHORIZE_DENIED'` to AC-41/AC-42's
  Then-clauses if the Spec Agent wants parity with SPEC-016's own tightened ACs. Not required for
  this spec to proceed; both ACs are already independently testable as worded.

---

## CONSTITUTION_FLAG Findings (carried forward, unchanged)

### RT3-004 (= round 2's RT2-004, round 1's RT-008)
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article I — Library-First
- Location: OQ-03; REQ-12
- Description: The Postgres blue/green `CUTOVER` repoint mechanism has no obvious off-the-shelf
  library performing exactly this atomic-repoint contract; whichever primitive the Software
  Architect picks is likely to need custom orchestration on top.
- Architect note: Prepare a Complexity Justification entry naming the candidate primitives
  considered and why custom coordination is unavoidable.

### RT3-005 (= round 2's RT2-005, round 1's RT-009)
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article II — Test-First / testability
- Location: REQ-12, REQ-19, EC-03
- Description: Deterministically exercising the Postgres `CUTOVER` failure path and the disk-headroom
  preflight this domain's snapshot step depends on likely requires either a real multi-instance
  Postgres harness or a fault-injection fake `db-ops` adapter.
- Architect note: Prepare a test-strategy entry for how `CUTOVER`-path and disk-headroom-preflight
  tests will be made deterministic and CI-affordable.

---

## Routing Decision

**1 BLOCKING finding exists (RT3-001).** Per the Red-Team persona's Output Format definition, any
BLOCKING finding means the spec must be revised before Software Architect dispatch, regardless of
count — **route back to Spec Agent.** This is a narrow, mechanical fix (correcting a stale ordering
phrase in two places to match SPEC-016's own current, controlling text), not a systemic
spec-quality problem — round 2's fixes (RT2-001–RT2-003) all held cleanly, and this defect was
introduced entirely by SPEC-016's own independent revision landing after SPEC-017's round-2 fix was
finalized, not by any new error in SPEC-017's own round-2 work.

ADVISORY findings (RT3-002, RT3-003) and the carried-forward CONSTITUTION_FLAG findings (RT3-004,
RT3-005) are included in Software Architect context once the spec clears this one remaining
revision — none of them independently block dispatch. RT3-002 is cheap to fix in the same pass as
RT3-001 (both are one-line corrections in the same table/adjacent requirement).

**Integration Contracts citation-accuracy check (mandatory SPEC-016 v1.2.0 re-sync): FAIL** — one
row (REQ-08–REQ-13) is affected by drift against SPEC-016's current text (RT3-001), and one row
(REQ-16–REQ-18) has a pre-existing internal mislabel unrelated to the SPEC-016 resync (RT3-002).
All five other rows, plus the REQ-14 non-citation note and the OQ-04 cross-reference, are confirmed
accurate against SPEC-016 v1.2.0's current text.
