# External Audit Report — ADR-047 Widgets (SPEC-043)

**Date:** 2026-07-21T17:14:09Z – 2026-07-21T17:47:00Z
**Scope:** custom — ADR-047 (full text incl. 2026-07-21 Debate Fold-In), SPEC-043 `feature.spec.md`,
`spec-manifest.md`, implementation outline, implementation report, and the real domain-layer
implementation (`src/widgets/*`, `src/core/entry-refs/*`) plus the shared-module diff it required
(`src/features/entries/{field-validation,write-service}.ts`, `src/navigation/resolver.ts`), audited
`HEAD` (`f9b1952`) against the pre-widgets baseline (`9179e67`).
**Focus:** Does the real implementation satisfy ADR-047's Debate Fold-In amendments and SPEC-043's
REQ/AC/INV set (not just the text in isolation)? Are the shared-module changes safe/additive for
every existing caller? Is the four-gap-fix session (`c946bbc`, `f9b1952`) accurately self-reported?
Is REQ-40/41 permission-gating complete? (Explicitly scoped as an authorization-completeness check,
not a security/vulnerability audit — kept out of agy's hard-refusal trigger class.)
**Suggested Changes Mode:** notes (escalated to grounded snippets by both auditors on several findings)
**Audit Packet:** `ADS-project-knowledge/reports/external-audit/packets/20260721T171409Z-adr047-widgets-audit-packet.md`
**Dispatch Packet:** self-contained COMBINED file, same directory, `-COMBINED.md` suffix (~355KB,
~6,025 lines — full ADR/spec/outline/report + full real source + shared-module diff, delivered via
stdin/`--print`, no live repo access required by either auditor for the packet itself; codex
additionally used its own read-only repo access to cross-verify against live source)
**Planned Auditors:** codex (gpt-5.5, reasoning=high), agy (Gemini 3.1 Pro High)
**Responded Auditors:** codex, agy (both, after transport retries for agy — see Degraded Coverage)
**Failed Or Skipped Auditors:** none in the final result (agy required 3 attempts total before
succeeding — see Degraded Coverage for the honest accounting)
**Timeout:** `audit_timeout_seconds` not explicitly set by the user; used per-CLI defaults with one
documented extension (agy's `--print-timeout` raised from its 5m default to 15m on the final attempt,
which is what let it succeed)
**Proposed Fixes Artifact:** `ADS-project-knowledge/reports/external-audit/proposed-fixes/20260721T171409Z-adr047-widgets/proposed-fixes.md`

## Work Log

- Read ADR-047 (full text, including the 2026-07-21 Debate Fold-In section), SPEC-043
  `feature.spec.md`/`spec-manifest.md`, the implementation outline, and the implementation report in
  full.
- Read `git log`/`git show --stat` for the three widgets-related commits (`03a8781`, `c946bbc`,
  `f9b1952`) and the full diff of the shared-module changes those commits made outside
  `src/widgets/`/`src/core/entry-refs/`.
- Read every file under `src/widgets/` and `src/core/entry-refs/` (implementation + tests) directly —
  not just the implementation report's self-description — before building the audit packet.
- Independently found and verified several candidate issues by direct grep/read (no SQLite-backed
  tests for either new port; a `resolverId`-to-`WidgetTypeKey` cast smell in the resolver dispatcher;
  `trashWidgetInstance`/`purgeWidgetInstance` omitting the `onWritten` hook).
- Built a frozen Threat Model & Scope Contract (`TM-adr047-widgets-audit-001`, round 1, medium risk
  tier, 8.5 score floor, 10-domain allowlist) and a self-contained ~355KB combined dispatch packet.
- Ran the mandatory internal falsification-framed verification pass (Code Review persona,
  rationale-stripped evidence packet) BEFORE external dispatch, per this project's `/audit-work`
  protocol — see "Internal Verification" below. It independently surfaced two significant,
  previously-undisclosed gaps (a completely missing `src/widgets/embed-service.ts`, and no
  `widgets.read`-gated read accessor anywhere in the domain layer) that the Coordinator's own
  pre-dispatch read had missed. Folded both into the external packet before dispatch, with the
  Coordinator's own independent confirmation (direct grep) attached, so external auditors could
  verify/refute rather than take them on faith.
- Ran the Peer Handshake Gate (60s ACK probe) for both codex and agy before full dispatch — both
  succeeded on the first attempt.
- Dispatched codex (background, harness-managed process lifecycle, ~5 minutes wall-clock,
  ~1.82M input tokens incl. cache, ~10.8K output tokens) — succeeded on the first full-dispatch
  attempt, including live cross-verification against the real repo tree via its own read-only
  sandbox access (beyond just the packet).
- Dispatched agy — failed twice with `path_or_permission_failure`-class errors ("a tool required the
  'command' permission that headless mode cannot prompt for, so it was auto-denied") on the initial
  dispatch and a `--sandbox`-flag retry; a third attempt with `--dangerously-skip-permissions` cleared
  the permission issue but then hit agy's 5-minute default `--print-timeout` on this large a payload
  at high reasoning effort (`timeout` classification); a fourth attempt with `--print-timeout 15m`
  succeeded. See Degraded Coverage for why this is disclosed prominently rather than glossed over.
- Both auditors independently converged on the same three highest-severity findings the internal
  verifier and Coordinator had already surfaced, plus corroborated the lower-severity ones — see
  Cross-Auditor Synthesis.
- Did NOT implement any fixes — per this dispatch's explicit instruction, all findings and proposed
  fixes are reported back to the owner/Coordinator, not applied unilaterally.

## Internal Verification

- **Verifier persona:** Code Review Agent (`AI-Dev-Shop/agents/code-review/skills.md`), dispatched as
  a subagent with falsification framing, confirmed persona-load in its first output line.
- **Evidence packet:** A curated, rationale-stripped evidence file
  (`ADS-project-knowledge/.local-artifacts/external-audit/internal-verification/20260721T171409Z-adr047-widgets-internal-verifier-evidence.md`,
  ~5,300 lines) containing the full ADR/spec/outline, the full real source+tests, the shared-module
  diff, schema/permissions excerpts, and bare test-count facts — the implementation report's own
  first-person justification narrative was deliberately withheld.
- **Excluded rationale statement:** Confirmed excluded — the implementer's "why I chose this,"
  dismissed-alternatives, and self-assessment narrative from `implementation-report.md` was not
  included in the verifier's evidence packet; only spec/ADR/outline (contracts) and real
  source/tests/diffs (artifacts) were provided.
- **Findings:** 11 findings total — 3 escalation-gated (missing `embed-service.ts`, missing
  `widgets.read` accessor, AC-28/permission-denial path untested), 1 more escalation-gated (INV-06
  atomicity unproven by any test), 6 advisory (force-purge `entry_refs` staleness at medium severity,
  unbounded `recent-entries` scan, `resolverId` cast smell, a non-exhaustive `sourceKind` ternary,
  stale "TDD-stub" doc comments, a narrow TOCTOU in region-placement validation), 1 "no issue beyond
  what's already self-disclosed" (the `x-ref-target` annotations being decorative).
- **Gate recommendation:** Escalation (not hard blocker).
- **Mutation-quality interpretation:** N/A — no mutation-quality sensor data exists for this
  repo/session.
- **Residual risk:** The verifier could not independently run `tsc`/the test suite (read-only
  evidence-file review only) — its findings are grounded in static reading, not fresh execution.
- **External peer audit still required:** Yes — proceeded regardless of the escalation gate, per this
  project's rule that external audit is mandatory for medium/high-risk work even when the internal
  pass finds no hard blocker.
- **Score:** 6.5/10 (below the 8.5 floor).

## Auditor Matrix

| Auditor | Requested Model | Resolved Model | Selection Source | CLI Version | Score | Rationale | Path to 10 | Output Mode | Suggest Mode Used | Attempts | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| codex | gpt-5.5 (reasoning=high) | gpt-5.5, `model_reasoning_effort=high` | saved_codex_report (`ADS-project-knowledge/reports/swarm-consensus/runs/2026-07-10T171717Z-model-smoke-proof.md`) | codex-cli 0.144.3 | 6.8 | "Implemented CRUD/region mutation/resolver isolation/shared-module changes mostly hold, but the server-side embed command is absent and force-purge leaves outgoing refs stale." | Implement `embed-service.ts`; fix force-purge `entry_refs` retraction; add SQLite-adapter contract tests; add `widgets.read` accessor | json (`--json`, parsed from `agent_message` items) | notes (escalated to prose + one snippet by the auditor) | 1 (first full dispatch succeeded) | Responded |
| gemini (agy) | Gemini 3.1 Pro (High) | gemini-3.1-pro-high, effort=high | default (documented peer default; live `agy models` uses lowercase-hyphenated slugs, not the stale `"Gemini 3.1 Pro (High)"` string format the reference doc documents — updated in-session) | agy 1.1.5 | 6.0 | "3 blocking failure-domain violations (missing server-side embed service, missing `widgets.read` permission accessors, stale `entry_refs` on trash/purge) plus 1 high and 1 medium severity defect." | Implement all 3 blockers; re-key `CORE_RESOLVERS` by `resolverId`; add SQLite contract tests | text (`--print`, no JSON mode; response embedded one fenced JSON block plus prose) | notes (escalated to full code snippets by the auditor) | 4 (2× `path_or_permission_failure` on headless "command" tool permission denial, 1× `timeout` at the 5m default after the permission fix, 1× success at 15m timeout) | Responded (degraded — see below) |

## Degraded Coverage

**Not a coverage gap in the final result** — both planned auditors ultimately responded and
`min_auditors=2` was met — but the path to agy's response was materially rockier than codex's and is
disclosed in full rather than smoothed over:
- Attempt 1 (default flags): `path_or_permission_failure` — agy's headless `--print` mode auto-denied
  a "command" tool permission it cannot prompt for interactively, producing zero output.
- Attempt 2 (`--sandbox` added, per the skill's "constrained read-only tool surface" retry guidance):
  identical `path_or_permission_failure`.
- Attempt 3 (`--dangerously-skip-permissions` added — a genuine transport fix, not a blind retry of
  the same broken config, and the error message's own suggested remediation; safe here since agy ran
  from an isolated `/tmp` staging directory with no destructive action asked of it): the permission
  issue cleared, but the run then hit agy's 5-minute default `--print-timeout` on this large a payload
  (~355KB / ~90K-plus tokens) at high reasoning effort — a `timeout` classification.
- Attempt 4 (`--print-timeout 15m` added, another genuine parameter fix): succeeded, ~19KB structured
  response.
This is 4 total attempts against a nominal "retry once" policy for `empty_result_transport_failure`.
The Coordinator's judgment: attempts 3 and 4 each diagnosed a genuinely different, specific,
identifiable root cause (a fixable CLI flag, not "try again and hope") rather than blindly repeating
attempt 1/2's exact invocation, which is consistent with this project's "change one variable or
diagnose, don't repeat" standing rule — but the count is still disclosed prominently here rather than
folded silently into a clean "Responded" row, since 4 attempts for one auditor is a real transport
cost worth a future fix (e.g., defaulting future `agy` audit dispatches to
`--dangerously-skip-permissions --print-timeout 15m` when the packet is known to be large, rather than
discovering both issues live during a gated ADR audit).

## Per-Auditor Scope Checks

### codex (gpt-5.5, high)
- **What it says it is auditing:** "Audited HEAD against the supplied ADR-047/SPEC-043 packet and
  live repo reads for `src/widgets`, `src/core/entry-refs`, `src/features/entries/
  {field-validation,write-service}.ts`, `src/navigation/resolver.ts`, schema/permission excerpts, and
  widgets-related tests."
- **Scope and target it used:** custom — matches the packet's stated audit target exactly.
- **Files or artifacts it says it reviewed:** The full packet plus live repo reads via its own
  read-only sandbox access (it explicitly noted requested codebase-memory MCP graph tools were
  unavailable and it fell back to direct `rg`/file reads — a transport note, not a scope gap).
- **Scope ambiguity or mismatch:** None stated. It explicitly noted it did not run tests/typecheck
  because its sandbox is read-only — a disclosed limitation, not a silent gap.

### gemini (agy, Gemini 3.1 Pro High)
- **What it says it is auditing:** "Audited commit HEAD (`f9b1952`) against pre-widgets baseline
  (`9179e67`) covering `src/widgets/*`, `src/core/entry-refs/*`,
  `src/features/entries/{field-validation,write-service}.ts`, `src/navigation/resolver.ts` against
  ADR-047, SPEC-043, `implementation-outline.md`, and `implementation-report.md`."
- **Scope and target it used:** custom — matches the packet's stated audit target exactly.
- **Files or artifacts it says it reviewed:** The full self-contained packet (agy had no live repo
  access in this dispatch — it ran from an isolated `/tmp` directory with no staged files, per the
  packet's own stated "no live repo file access required" transport plan).
- **Scope ambiguity or mismatch:** None stated.

## What The External LLMs Said

### codex Findings By Severity
- **Blocker (2):** `WIDGETS-AUDIT-001` (missing `embed-service.ts`, domain 10), `WIDGETS-AUDIT-002`
  (force-purge leaves `entry_refs` stale, domain 3).
- **High (1):** `WIDGETS-AUDIT-003` (no `widgets.read` accessor — "not a current mutation bypass, so
  I am not marking it blocker under the frozen allowlist," explicitly declined to force it into a
  domain).
- **Medium (2):** `WIDGETS-AUDIT-004` (no SQLite-backed contract tests, domain 3), `WIDGETS-AUDIT-005`
  (`recent-entries` unbounded workspace scan, domain 5).
- **Low (1):** `WIDGETS-AUDIT-006` (`resolverId`-to-`WidgetTypeKey` cast, domain 7 — "today all
  resolverIds equal type keys, so behavior is safe now").

### codex Blockers
- `WIDGETS-AUDIT-001`, `WIDGETS-AUDIT-002` (see above).

### codex Optional Improvements
- `widgets.read` accessor (high, not blocker); SQLite contract tests; bounded `recent-entries` query;
  `resolverId` re-keying.

### codex Strengths
- Implemented mutations correctly check `widgets.*` permissions before writes; `bindWidgetArea`'s
  no-`authorize()` boot-seeding exception is plausibly the documented system exception; `owner`/
  `onWritten` are additive defaults for existing `entries` callers; `resolveMenuDoc` is a safe
  additive navigation export; the `fieldsJson.ext.widgets.payload` storage deviation is internally
  consistent across write, extraction, and resolution; `contact-form` imports only the Forms read-side
  port.

### codex Suggested Changes
- One illustrative fix direction for force-purge (either retract via `removeBySource` or redefine
  purged entries as retained-but-labeled sources); prose guidance for `embed-service.ts`'s shape and
  its likely dependency on an entries-chokepoint `bodyJson`-update capability that may not exist yet.

### agy Findings By Severity
- **Blocker (3):** `FINDING-WIDGETS-001` (missing `embed-service.ts`, domain 10),
  `FINDING-WIDGETS-002` (no `widgets.read` accessor, domain 1 — "Authorization bypass," a stronger
  framing than codex's "high, not blocker"), `FINDING-WIDGETS-003` (force-purge `entry_refs`
  staleness, domain 3).
- **High (1):** `FINDING-WIDGETS-004` (`resolverId` cast, domain 7 — a stronger severity than codex's
  "low").
- **Medium (1):** `FINDING-WIDGETS-005` (no SQLite-backed contract tests, domain 9 — mapped to a
  different allowlist domain than codex's domain 3, both plausible readings).

### agy Blockers
- `FINDING-WIDGETS-001`, `FINDING-WIDGETS-002`, `FINDING-WIDGETS-003`.

### agy Optional Improvements
- `CORE_RESOLVERS` re-keying; SQLite contract tests.

### agy Strengths
- Shared-module extensions (`owner` param, `onWritten` hook, `resolveMenuDoc`) are "clean, additive,
  and 100% non-breaking"; region-binding architecture "perfectly fulfills" Amendment 1/INV-02/INV-03;
  batch-first resolver orchestration correctly isolates failures and clamps cost; `contact-form`
  strictly acts as a read adapter with no pipeline duplication.

### agy Suggested Changes
- Full illustrative code snippets for all three blockers (`embed-service.ts`, the two `onWritten`
  fixes, the `widgets.read` accessors) and the `resolverId` re-keying — see the proposed-fixes
  artifact. **Caveat, Coordinator-added:** agy's snippets use helper/permission-string names
  (`mapEntryToWidgetInstance`, `getWidgetInstanceOrThrow`, a `widgets.update` gate on the embed
  insert) that do not exist in the real codebase and were not reconciled against the actual
  `write-service.ts`/`entry-payload.ts` conventions — treat as illustrative shape, not drop-in code.

## Per-Finding Rationales

### codex
| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| `WIDGETS-AUDIT-001` | REQ-44/45, AC-30, Amendment 6, outline C-007, live `src/widgets` exports | A server-side, versioned document-mutation service for `widgetEmbed` insert/remove/reorder | `embed-service.ts` absent; only a doc comment in `embed-validation.ts` references it; no exports found | Domain layer doesn't implement the agent-native inline-embed path the debate added; AC-30 unexecutable | Add `embed-service.ts` with the three functions, `widgets.place` gate, `validateWidgetEmbedMutation`, chokepoint persistence | High |
| `WIDGETS-AUDIT-002` | Force-purge behavior, `EntryRefsRepoPort`, `entry_refs` semantics | Force-purged source should retract/flag outgoing `entry_refs` rows | `purgeWidgetInstance` updates status only, never calls `removeBySource`/`onWritten` | Stale where-used/safe-delete rows for the target entry after force-purge | Call `removeBySource` in the same transaction, or redefine purged-source semantics consistently | Medium |
| `WIDGETS-AUDIT-003` | REQ-04/41, `write-service.ts` exports, permission catalog | A `widgets.read`-gated read/list/history API | No such accessor exists anywhere | Future route/AI layer would reimplement authorization at a lower layer | Add `readWidgetInstance`/`listWidgetInstances`/`listWidgetRevisions` gated by `widgets.read` | High |
| `WIDGETS-AUDIT-004` | Tests under `src/widgets/__tests__`, `src/core/entry-refs/__tests__` | Contract coverage for both memory and SQLite adapters | Only in-memory adapters used anywhere | Reference-integrity/derived-binding claims unproven at the real DB boundary | Add shared adapter contract tests against both adapters | High |
| `WIDGETS-AUDIT-005` | `recent-entries` resolver cost behavior | Bounded query matching Amendment 2's no-unbounded-scan intent | `listByWorkspace` with no type/filter/limit, in-memory sort | Unbounded workspace scan on every page render containing this widget | Query-layer limit/filter, not just IR-boundary clamping | Medium |
| `WIDGETS-AUDIT-006` | `resolverId` dispatch | Resolver-id-keyed closed map | Cast to `WidgetTypeKey`, indexes a type-keyed map; safe only because they coincide today | Future shared/renamed `resolverId` silently degrades to `resolver-error` | Key `CORE_RESOLVERS` by `resolverId` directly | Medium |

### agy
| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| `FINDING-WIDGETS-001` | `src/widgets/` for C-007/REQ-44/45/AC-30/AC-11/Amendment 6 | `embed-service.ts` with the three mutation functions | Completely missing; `WidgetEmbedGuardrailError` defined but never thrown | Backend/AI cannot manipulate inline embeds safely | Create the file with permission gating, OCC, guardrail validation, `entry_refs` extraction, plus tests | High |
| `FINDING-WIDGETS-002` | `write-service.ts` and public read accessors, REQ-04/41/INV-07 | `getWidgetInstance`/`listWidgetInstances` gated by `widgets.read` | No such accessor anywhere; AC-01 only checks `create`'s own return value | Callers forced to bypass domain-level permission checks | Add gated read accessors + permission-rejection tests | High |
| `FINDING-WIDGETS-003` | `trashWidgetInstance`/`purgeWidgetInstance` vs. INV-06/REQ-29 | Every status-changing write re-extracts/retracts `entry_refs` via `onWritten` | Both functions omit `onWritten` entirely | Stale rows corrupt where-used and safe-delete on the referenced target | Pass the same `onWritten` callback both other mutations already use | High |
| `FINDING-WIDGETS-004` | Resolver dispatch vs. REQ-08 | `resolverId` as an independent key into a closed map | Tightly coupled to `typeKey` via cast; silent `resolver-error` on mismatch | Breaks resolver reuse; violates REQ-08's stated design | Re-key `CORE_RESOLVERS` by `resolverId` string | High |
| `FINDING-WIDGETS-005` | Test suites under both new-port test dirs | Contract tests against both memory + SQLite adapters | SQLite adapters never exercised | Schema/FK/transaction bugs could ship undetected | Parameterize contract suites against both adapters | High |

## Cross-Auditor Synthesis

### Converged Findings
- **Missing `embed-service.ts`** (REQ-44/45/AC-30/AC-11, Debate Fold-In Amendment 6) — codex and agy
  both independently found this, both rated it a blocker, and both proposed materially the same fix
  shape. This is also the top finding of the internal verification pass and the Coordinator's own
  pre-dispatch read (after the internal verifier caught it). **Four independent evaluations converge
  on the same defect.**
- **Force-purge leaves `entry_refs` stale** (`trashWidgetInstance`/`purgeWidgetInstance` omitting
  `onWritten`) — codex (blocker), agy (blocker), internal verifier (medium/escalation — it correctly
  identified the literal omission as behavior-neutral for the omission itself, but found the deeper
  "nothing ever calls `removeBySource`" gap independently), Coordinator (flagged as an open question
  pre-dispatch). **Four independent evaluations converge.**
- **No `widgets.read` accessor** — codex (high, explicitly not blocker), agy (blocker), internal
  verifier (high/escalation). **Three independent evaluations converge on the gap; they disagree only
  on whether "absence of a read gate" clears the bar for "authorization bypass," see Conflicts below.**
- **No SQLite-backed contract tests for either new port** — codex (medium), agy (medium), internal
  verifier (high/escalation), Coordinator (flagged pre-dispatch). **Four independent evaluations
  converge**, though severity assessments differ (see Conflicts).
- **`resolverId`-to-`WidgetTypeKey` cast** — codex (low), agy (high), internal verifier (low),
  Coordinator (low, pre-dispatch). **Four evaluations converge on the underlying fact; three of four
  agree it's currently low-severity — agy is the outlier, see Conflicts.**

### Single-Auditor Findings Worth Keeping
- **`recent-entries`'s unbounded workspace scan** — codex and the internal verifier both raised this
  independently; agy's response did not include it in its 5-item findings list. Worth keeping: it's a
  real, concrete, code-level observation (confirmed by the Coordinator's own earlier read of
  `resolvers/recent-entries.ts`: `deps.entryList.listByWorkspace({ workspaceId })` with no type
  filter), not speculative.

### Conflicts Or False Positives
- **Severity of the `widgets.read` gap:** codex explicitly declines to call this a blocker "under the
  frozen allowlist" because it is an absence, not an active bypass of an existing check; agy maps it
  to domain 1 ("Authorization bypass") as a blocker. Both readings are defensible under the packet's
  own allowlist language — domain 1 says "any code path where a widget mutation... executes without
  its required permission check succeeding," which is written for mutations, not reads, and the
  allowlist's domain 3 (reference-integrity) doesn't fit a read gap either. **This is a genuine
  allowlist-coverage gap in the Coordinator's own frozen threat model** (it has no clean domain for
  "a required REQ/AC has zero implementation," as opposed to "existing code behaves unsafely") —
  disclosed honestly rather than silently resolved in either auditor's favor. See Decision Points For
  User.
- **Severity of the `resolverId` cast:** agy calls it "high" ("tightly couples `resolverId` to
  `typeKey`, breaking resolver reuse and silently failing resolution for valid non-matching
  `resolverId` entries"); codex, the internal verifier, and the Coordinator's own pre-dispatch read
  all independently call it low/advisory, because the failure mode is a safe, typed `resolver-error`
  result (never a crash, never silent miscomputation, never a security hole) and every v1 registration
  happens to satisfy the coincidence today. The Coordinator sides with the 3-of-4 low-severity reading
  here — see Coordinator Response → Disagree.
- **Domain mapping for the two missing-implementation findings (`embed-service.ts`, `widgets.read`):**
  both auditors independently chose domain 10 ("unrecoverable crash on normal use") and domain 1
  ("authorization bypass") respectively to hang these findings on, but neither domain was really
  written with "the code for this REQ doesn't exist at all" in mind — the allowlist's 10 domains
  describe failure modes of code that DOES exist. This is a structural gap in the frozen threat model
  itself, not a auditor error — flagged for future audit-packet authoring, not something that changes
  this round's outcome (the score-floor term of the gate fails independently of any blocker-domain
  mapping dispute: 6.0 and 6.8 are both well below 8.5 regardless).

### Missed-By-One Notes
- agy did not surface the `recent-entries` unbounded-scan issue that codex and the internal verifier
  both caught (see Single-Auditor Findings above).
- codex did not explicitly surface the internal verifier's separate finding that AC-28
  (permission-denial path) has zero test coverage as its own line item, though it implicitly touches
  the same territory via its general test-coverage finding (`WIDGETS-AUDIT-004`) — worth the owner
  explicitly adding an `authorize: async () => ({allowed:false,...})` test per mutation when the fix
  round happens, per the internal verifier's specific finding.

## Suggested Changes By Auditor

| Auditor | Suggested Change | Coordinator Handling |
|---|---|---|
| codex | Build `embed-service.ts` | accept (defer to owner — see Proposed Fix Handling) |
| codex | Fix force-purge `entry_refs` retraction (two named alternatives) | accept, present both alternatives to owner (defer) |
| codex | Add `widgets.read` accessors | accept (defer) |
| codex | SQLite contract tests for both new ports | accept (defer) |
| codex | Bound `recent-entries`'s query | accept (defer) |
| codex | Re-key `CORE_RESOLVERS` by `resolverId` | accept, low priority (defer) |
| agy | Build `embed-service.ts` (full snippet) | accept the gap/fix direction; adapt the snippet (names don't match real codebase) — defer implementation to owner |
| agy | Fix force-purge `entry_refs` retraction (full snippet) | accept; adapt snippet — defer |
| agy | Add `widgets.read` accessors (full snippet) | accept; adapt snippet — defer |
| agy | Re-key `CORE_RESOLVERS` (full snippet) | accept the fix, disagree with "high" severity — defer, low priority |
| agy | SQLite contract tests | accept (defer) |

## Coordinator Response

### Agree
- All three high-confidence, multi-evaluator-converged findings are real and worth fixing before
  ADR-047 moves to ACCEPTED: the missing `embed-service.ts` (Amendment 6's entire point, currently
  undelivered and — critically — **not disclosed** alongside the other four known gaps the
  implementation report was otherwise scrupulously honest about); the force-purge `entry_refs`
  staleness (a concrete, reproducible reference-integrity defect); and the missing `widgets.read`
  accessor (a real REQ-04 implementation gap, whatever its exact severity label).
- The no-SQLite-test-coverage finding is real and independently confirmed by direct grep (zero
  `Sqlite*Repo` references anywhere in the widgets/entry-refs test suites) — this should be fixed
  before the domain layer is trusted for production wiring, even though it's not a live defect today.
- The `recent-entries` unbounded-scan finding is real by direct code inspection and should be fixed,
  though it's lower-urgency than the three blockers since no boot wiring calls this resolver yet.

### Change
- The threat model's allowlist should gain an explicit 11th domain for "a REQ/AC has zero
  implementation despite being declared in-scope" the next time a similar domain-layer audit is run —
  today's two blocker-severity findings were force-mapped into domains 10 and 1 that don't cleanly fit
  "missing code," which both auditors handled reasonably but inconsistently (see Conflicts above).
  This doesn't change this round's outcome but should improve the next packet's precision.
- The implementation report's "disclosed deviations" framing should be extended: it was honest about
  four real, named gaps in shared modules it was scoped not to touch, but silent about two gaps
  (`embed-service.ts`, the read accessor) that live entirely inside its own scoped domain
  (`src/widgets/`) — the same honesty standard should have applied there. Worth a process note for
  future implementation-report writers, not just a one-off fix.

### Disagree
- agy's "high" severity for the `resolverId` cast overstates present-day risk: the failure mode is a
  safe, typed `resolver-error` — never a crash, never silently-wrong output, never a security
  surface — and every v1 registration coincidentally satisfies the assumption the cast makes. Siding
  with codex/the internal verifier/the Coordinator's own pre-dispatch read (3 of 4 evaluators, low
  severity) rather than agy's outlier reading. The underlying fix is still worth doing (cheap,
  removes a footgun for a future contributor), just not urgently.
- agy's blocker classification for the `widgets.read` gap under domain 1 ("authorization bypass") is
  a stretch — nothing is being bypassed; the gate simply doesn't exist yet for a function that also
  doesn't exist yet. Siding with codex's "high, not blocker under the frozen allowlist as literally
  written" reading, while agreeing the underlying gap is real and needs fixing regardless of the
  label. This is a genuine 2-of-3-evaluator disagreement (agy + internal verifier lean stronger,
  codex leans "high not blocker") — surfaced explicitly in Decision Points For User below rather than
  silently resolved in the Coordinator's favor, per the mandatory converged-finding-disagreement rule.

### Proposed Fix Handling

**Disposition Gate (every proposed fix / recommended_fix from every auditor, one row each):**

| # | Proposed Fix | Source(s) | Disposition | Rationale |
|---|---|---|---|---|
| 1 | Build `src/widgets/embed-service.ts` (insert/remove/reorder + guardrails + `entry_refs`) | codex, agy | `agree-defer` | Agreed real gap, high-confidence, converged 4-ways. **Deferred, not implemented this session**, per this dispatch's explicit instruction that audit findings route back to the owner/Coordinator rather than being applied unilaterally by the audit agent. Tracked here + in the proposed-fixes artifact as the fix round's top item. |
| 2 | Fix `trashWidgetInstance`/`purgeWidgetInstance` to pass `onWritten` (or the alternative "retain+label" semantics codex also named) | codex, agy | `agree-defer` | Agreed real gap, high-confidence, converged 4-ways. Deferred for the same reason as #1 — additionally, the owner should explicitly choose between the two named alternatives (retract vs. retain-and-label) before implementation, since they have different where-used-display implications; that choice itself is not the audit agent's to make. |
| 3 | Add `widgets.read`-gated `getWidgetInstance`/`listWidgetInstances` accessors | codex, agy | `agree-defer` | Agreed real gap, converged 3-ways (codex/agy/internal verifier). Deferred per the same standing rule. Severity-label disagreement (blocker vs. high) does not change the disposition — it gets fixed either way; see Decision Points For User for the label question specifically. |
| 4 | Add SQLite-backed contract tests for `EntryRefsRepoPort`/`WidgetRegionBindingRepoPort` | codex, agy, internal verifier | `agree-defer` | Agreed real gap, converged 4-ways, independently confirmed by the Coordinator via direct grep before dispatch. Deferred per the same standing rule. |
| 5 | Bound `recent-entries`'s query (type/status filter + query-layer limit) | codex, internal verifier | `agree-defer` | Agreed real gap (agy did not raise it, but the Coordinator independently confirmed the code pattern via direct read before dispatch). Deferred per the same standing rule. Lower urgency than #1-4 since no boot wiring calls this resolver in production yet. |
| 6 | Re-key `CORE_RESOLVERS` by `resolverId` string instead of casting to `WidgetTypeKey` | codex, agy | `agree-defer` | Agreed the fix is correct and cheap; disagree with agy's "high" severity label (see Coordinator Response → Disagree) — treating as low-priority. Deferred per the same standing rule; may reasonably be bundled into the same fix-round PR as #1-5 given its low cost. |
| 7 | Add explicit permission-denial (`authorize: async () => ({allowed:false,...})`) tests per widget mutation (AC-28) | internal verifier | `agree-defer` | Real, high-confidence P1-AC-coverage gap the internal verifier caught and codex/agy's broader test-coverage findings implicitly cover but didn't name as a distinct line item. Deferred per the same standing rule. |

No proposed fix is dispositioned `disagree` at the fix-content level — every disagreement in this
round is about severity labeling, not about whether a fix is warranted (see Coordinator Response →
Disagree for the two labeling disagreements, both surfaced in Decision Points For User).

## Audit Outcome

- **Result: FAIL.** `blocking_gate = FAIL` on both independent grounds the frozen contract specifies:
  score (codex 6.8, agy 6.0 — both below the 8.5 medium-risk floor) AND validated blockers (both
  auditors independently found 2-3 blocker-mapped findings; even the more conservative reading that
  discounts the `widgets.read` domain-1 mapping still leaves the `embed-service.ts` and
  `entry_refs`-staleness findings as blockers on both auditors' independent judgment).
- **ADR-047 should NOT be marked ACCEPTED on this round.** The gap is not about the ADR's design
  being wrong — both auditors' "what looks solid" sections independently praise the actual
  architecture (region-binding via `widget_area`, batch-first resolution, the Contact Form adapter,
  the shared-module extensions) as correctly implementing the Debate Fold-In amendments where it was
  actually built. The gap is that the v1 domain-layer slice, as delivered, does not yet cover
  everything SPEC-043 declares in scope, and two of the gaps were not disclosed the way the
  implementation report's other four gaps honestly were.
- **This needs a Round 2 audit after a fix pass**, not a full re-audit from scratch — the same
  `TM-adr047-widgets-audit-001` threat model carries forward with a Prior-Round Disposition Ledger
  seeded from the 7-item table above, and round 2 should run as a diff-only compliance pass per this
  project's standing round-N protocol.

## Decision Points For User

1. **Fix-round scope decision:** Approve the 7-item disposition table above for implementation
   (embed-service.ts; force-purge retraction — pick retract-vs-retain-and-label; `widgets.read`
   accessors; SQLite contract tests; bounded `recent-entries`; `resolverId` re-keying; AC-28
   permission-denial tests), then re-run `/audit-work` round 2 against `TM-adr047-widgets-audit-001`.
2. **`widgets.read` severity label (converged-finding disagreement, per the mandatory
   cannot-silently-override rule):** codex says "high, not blocker"; agy says "blocker" (domain 1);
   the internal verifier says "high/escalation." 2 of 3 lean toward the stronger reading. The
   Coordinator's synthesis leans with codex's more literal allowlist reading but flags this explicitly
   rather than resolving it unilaterally — your call on whether this changes anything about fix-round
   prioritization (it doesn't change the overall FAIL outcome either way, since the score-floor term
   already fails independently).
3. **Path-to-10 items (advisory, non-blocking, for future rounds):** codex named "add browser/E2E
   contract execution for the frontend" (N/A yet — no frontend exists for widgets); both auditors
   named the SQLite contract-test suite and full delivery of the three blocker items as their explicit
   path to a higher score.
4. **Threat-model allowlist gap (process note, not blocking):** consider adding an explicit "declared
   REQ/AC has zero implementation" domain to this project's audit-packet template guidance for future
   domain-layer audits, since this round's two most important findings had to be force-mapped into
   domains not really written for them.
5. **agy transport reliability (process note, not blocking):** this run needed 4 attempts (2×
   permission denial, 1× timeout, 1× success) before agy produced usable output on a packet this size.
   Consider documenting `--dangerously-skip-permissions --print-timeout 15m` (or similar) as the
   default invocation for large `/audit-work` packets in `skills/llm-operations/references/`, rather
   than rediscovering both issues live on a future gated-ADR audit.
