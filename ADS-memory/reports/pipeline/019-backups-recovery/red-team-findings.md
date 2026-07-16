# Red-Team Findings: backups-recovery

- Feature: FEAT-019-backups-recovery
- Spec version: 1.0.0
- Spec hash: sha256:7011b97184a3341918d6cb4435b74759fef7f9e488c6a9b477d6d1728a2bcbb7
- Red-Team completed: 2026-07-14T22:30:00Z
- Finding count: 4 BLOCKING · 4 ADVISORY · 1 CONSTITUTION_FLAG

---

## BLOCKING Findings

Spec must be revised before Software Architect dispatch. 4 BLOCKING findings exist (≥3) — per the
Red-Team persona's escalation rule, this is a systemic quality problem; route back to Spec Agent rather
than patching inline.

### RT-001
- Severity: BLOCKING
- Category: contradiction
- Location: Header metadata of `SPEC-019-api.spec.md`, `SPEC-019-state.spec.md`,
  `SPEC-019-orchestrator.spec.md`, `SPEC-019-ui.spec.md`, `SPEC-019-errors.spec.md`,
  `SPEC-019-behavior.spec.md`, `SPEC-019-traceability.spec.md`; contrasted against
  `SPEC-019-spec-dod.md` item G-07.
- Description: `SPEC-019-feature.spec.md`'s header carries the real, provider-computed content hash
  `sha256:7011b97184a3341918d6cb4435b74759fef7f9e488c6a9b477d6d1728a2bcbb7`. Every other file in the
  package — api/state/orchestrator/ui/errors/behavior/traceability — carries the literal placeholder
  `sha256:0000000000000000000000000000000000000000000000000000000000000000` instead. `spec-dod.md`
  item G-07 asserts as PASS: "`feature.spec.md` is the canonical hash anchor... every other file in
  this package carries the same `spec_id`/`content_hash` value for human cross-reference" — this is
  mechanically false; direct inspection shows the secondary files carry an all-zero placeholder, not
  the feature spec's hash. This is not a cosmetic slip: it is a self-attestation in the DoD gate that
  contradicts the artifacts it is attesting to, and it defeats the one mechanism (`grep`-verify the
  hash across files) a human or CI check would use to confirm package-wide hash consistency. Contrast
  with `SPEC-016`'s own package, where every secondary file correctly carries `SPEC-016`'s real hash
  (`sha256:0d527b31e34a595a0c3c8b0715e9134c97ac1bc7389af21f4212d3f395157142`) — proving this is not a
  standing project convention, but a defect specific to this package.
- Suggested resolution: Recompute/copy `SPEC-019-feature.spec.md`'s real content hash into every
  secondary file's header, matching `SPEC-016`'s package pattern, then re-run the validator with
  `--update-hash` and correct `spec-dod.md` G-07's evidence text to reflect the actual (now-true) state
  rather than an assumed one.

### RT-002
- Severity: BLOCKING
- Category: contradiction
- Location: `SPEC-019-feature.spec.md` § Integration Contracts, "Watermark / discarded-write-window
  disclosure" paragraph, citing "AC-16 – AC-19 and AC-06 here require SPEC-016 REQ-01 – REQ-07 to be
  live."
- Description: `AC-06` in `SPEC-019-feature.spec.md` is `AC-06 (REQ-03) [P1]`: "Given
  `dbOps.getCapabilities()` returns `costClass: 'expensive'`... the status bar displays `'expensive'`
  and the operator sees a cost/disk-estimate acknowledgment requirement." That AC concerns the
  capability/status bar and `costClass`, which is squarely SPEC-016 REQ-19 ("`db-ops.getCapabilities()`")
  territory — the `db-ops` capability surface, not the watermark counter. It has nothing to do with
  `storage_write_watermark` (REQ-01), `watermarkAtCapture` (REQ-06), or the disclosure-computation rule
  (REQ-05/REQ-07). Citing `AC-06` as depending on "SPEC-016 REQ-01 – REQ-07" is inaccurate and would
  mislead the Software Architect into believing the cost/disk-estimate UI element requires the
  watermark contract to be live, when it actually requires the `getCapabilities()` contract (already
  correctly cited for `AC-06` a second time, correctly, later in the same section's "`db-ops` capability
  surface" paragraph).
- Suggested resolution: Remove "`and AC-06`" from the Watermark paragraph's citation sentence — `AC-06`
  is already correctly attributed to SPEC-016 REQ-19–REQ-21 in the "`db-ops` capability surface"
  paragraph and does not belong in the watermark paragraph at all.

### RT-003
- Severity: BLOCKING
- Category: contradiction
- Location: `SPEC-019-feature.spec.md` § Integration Contracts, "Composite actor identity / soft
  cross-boundary reference" paragraph, citing "AC-08 and AC-29 here (which display trigger/actor
  context on restore-point and interrupted-run rows) require SPEC-016 REQ-16 – REQ-18 to be live for
  that attribution to render correctly."
- Description: This claim is not supported by any requirement, acceptance criterion, or typed field in
  the package. `AC-08 (REQ-04)` only requires the restore-point row to display "timestamp, trigger,
  captured schema version+tag, size, and `costClass` at capture" — `REQ-04`'s own field list has no
  actor/creator-identity field. `AC-29 (REQ-19)` is the `migration.interrupted` banner requirement and
  says nothing about a "row" or actor attribution at all. Checked against the typed contracts:
  `SPEC-019-state.spec.md` §2's `RestorePointSummary` (`restorePointId`, `capturedAt`, `trigger`,
  `schemaVersion`, `schemaTag`, `sizeBytes`, `costClassAtCapture`, `discardSummary`,
  `watermarkAtCapture`) carries no `actorWorkspaceId`/`actorId`/`delegatedBy` field, and
  `SPEC-019-ui.spec.md` §2.4's `RestorePointRow` props carry no such field either. So either (a) this
  citation names the wrong ACs and should point at whichever AC actually renders actor attribution (no
  such AC currently exists in this package), or (b) `REQ-04`/`AC-08` are themselves missing a
  requirement — SPEC-016 REQ-16 states "every ledger, audit, or revision row that references a
  principal MUST carry the composite pair," and a `restore_points` row plausibly qualifies as such a
  row (it is created by a principal, per `REQ-24`'s `backup_create_restore_point` tool and the
  `manual`/`template-upgrade`/`pre-migration-auto` trigger taxonomy) — yet no field in this package
  exposes that identity anywhere the operator can see it. Either reading is a real defect: an inaccurate
  citation, or an undisclosed missing requirement the citation accidentally reveals.
- Suggested resolution: If actor attribution is intended to render on restore-point rows, add the
  composite-identity field to `RestorePointSummary`/`RestorePointRow` and a corresponding REQ/AC that
  the Integration Contracts citation can legitimately point to. If it is not intended to render there,
  remove this citation sentence (or repoint it to whichever AC actually is gated by SPEC-016 REQ-16–18,
  if one exists elsewhere in the package).

### RT-004
- Severity: BLOCKING
- Category: contradiction
- Location: `SPEC-019-feature.spec.md` § Open Questions, OQ-04; contrasted against AC-03, AC-25, AC-35,
  and every occurrence of the literal string `backup.read` across `SPEC-019-feature.spec.md`,
  `SPEC-019-api.spec.md`, `SPEC-019-state.spec.md`, `SPEC-019-orchestrator.spec.md`, and
  `SPEC-019-ui.spec.md`.
- Description: OQ-04 states the exact read-permission string is unresolved: "ADR-045 names only
  `backup.create`/`backup.restore` in its screen header, but SPEC-016 REQ-09 requires a
  `{domain}.read`-class permission... Owner: Software Architect for SPEC-019 — Resolve by: before
  SPEC-019 architecture sign-off." Yet the literal string `backup.read` is already hard-coded as a
  settled fact in every contract file in this package, including inside multiple **P1, directly
  testable** acceptance criteria: `AC-03 (REQ-02) [P1]`: "Given a principal holding only `backup.read`,
  when it requests the Recovery screen's restore-points list or capability bar, then the request
  succeeds..."; `AC-35 (REQ-25) [P1]`: "Given a `kind='agent'` principal holding `backup.read`..."; the
  entire `AUTH_RECOVERY_READ`/`AUTH_GATEWAY_READ` auth profiles in `api.spec.md` §2; every read action
  in `orchestrator.spec.md` §2/§4; every read-selector in `state.spec.md`. A P1 acceptance criterion
  that asserts a literal permission string cannot simultaneously be "ready to certify tests against"
  (the traceability/DoD posture this package claims) and "the exact string is an open question the
  Architect still owns." If the Architect later resolves OQ-04 to a different string (e.g.
  `recovery.read`, matching a `recovery`-domain naming convention rather than `backup`-domain), every
  P1 AC, API auth profile, and agent-tool `authorization.permission` field that currently reads
  `backup.read` becomes stale simultaneously — a spec-wide find-and-replace with no version bump, which
  is exactly the "spec change without hash update" failure mode `spec-writing/SKILL.md` calls "the most
  dangerous failure."
- Suggested resolution: Either (a) resolve OQ-04 now — confirm `backup.read` is in fact the correct,
  final string (it is a reasonable, ADR-021-consistent choice given `backup.create`/`backup.restore`
  already use the `backup.` prefix) and close the Open Question, since the spec already depends on it
  being final everywhere; or (b) if it is genuinely still open, mark every AC/contract field that
  currently hard-codes `backup.read` as provisional and explicitly out of the P1 testable set until
  OQ-04 resolves, so TDD does not certify tests against a string the spec itself says may change.

---

## ADVISORY Findings

Spec Agent and human are informed. Human decides whether to revise or accept risk.

### RT-005
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-09, AC-16, AC-17; `SPEC-019-api.spec.md` §5 `BackupRestorePlanResponse.details.disclosure.coveredCategories`.
- Description: REQ-09 enumerates "categories whose write path is confirmed watermark-stamped (as of
  this spec: `posts`/`pages` writes and ADR-023 §7 plugin-table typed writes)" but no REQ, AC, or typed
  contract in this package or SPEC-016 defines *where* that confirmation status lives at runtime or how
  `coveredCategories` is computed/sourced. Two developers could satisfy the letter of REQ-09/AC-16/AC-17
  differently: one hardcodes the two-category list directly inside the disclosure-computation function;
  another builds a small registry/config the write-path inventory (ADR-041 item 11) updates over time.
  Both pass today's tests (which only assert the *current* two-category set), but they diverge sharply
  in how cleanly ADR-041 item 11's future write-path work plugs in, and in whether a category's
  "unknown/not-yet-confirmed" state is representable at all versus being indistinguishable from
  "confirmed not covered."
- Suggested resolution: State explicitly whether `coveredCategories` is sourced from a versioned
  constant this spec owns, or from an external write-path-registry capability SPEC-016/`db-ops` should
  expose — even a one-line clarification would remove the implementation-choice ambiguity before
  Software Architect designs the mechanism.

### RT-006
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: OQ-03; EC-08; SPEC-016 REQ-05, REQ-10, REQ-11, EC-05.
- Description: See the dedicated OQ-03 assessment below. Summary: this is a genuine, currently
  unanswered failure mode (can `authorize()` run at all, for *any* gated mutation, when `content.db` —
  which stores `principals` — is unreadable?), but it is a **shared-contract-level** gap inherited from
  SPEC-016/ADR-041, not something SPEC-019 invented or silently glossed over. SPEC-019 handles it
  honestly: EC-08 explicitly states "this spec does not itself resolve whether `confirm()`/`execute()`
  can be authorized in that same state... (see OQ-03)" rather than assuming a behavior. No current
  SPEC-019 P1 AC depends on a specific answer, so it does not block SPEC-019's own testability today.
- Suggested resolution: Recommend the Coordinator route this specifically to SPEC-016 (not solely
  "Software Architect for SPEC-019" as OQ-03's current Owner field states) since it affects SPEC-017's
  `storage.migrate-forward` instantiation identically — a `content.db`-unreadable state blocks
  `authorize()` for both `storage.migrate` and `backup.restore` permissions equally. Whatever answer is
  reached (most likely: fail-closed, deny all gated mutations, matching the project's stated
  no-bypass/no-attestation-override philosophy at ADR-041 §2) should be recorded as a SPEC-016
  REQ/EC addition, not duplicated independently by each dependent domain spec.

### RT-007
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-19; AC-29.
- Description: REQ-19 requires the `migration.interrupted` unblock action be "labeled explicitly as an
  accepted downtime vector rather than an apologetic error," but gives no canonical copy/substring
  requirement the way REQ-10's disclosure-acknowledge control is anchored by `ui.spec.md` §5's
  "accessible name that includes the partial-coverage caveat text" rule. Two implementations could both
  claim to satisfy "labeled explicitly as an accepted downtime vector" with materially different copy,
  and no test can deterministically distinguish "explicitly accepted" tone from "apologetic" tone
  without a concrete string/substring anchor.
- Suggested resolution: Add a `ui.spec.md` accessibility/copy rule for `DegradedStateBanner`'s
  `migration-interrupted` kind analogous to the disclosure's caveat-text rule — e.g., require the
  banner's accessible text to include a specific substring (such as "expected" or "planned downtime")
  so the "accepted vector, not an apology" requirement becomes string-testable.

### RT-008
- Severity: ADVISORY
- Category: ambiguity
- Location: `SPEC-019-feature.spec.md` § Integration Contracts, "Gated-mutation gateway" paragraph,
  citing "AC-12 – AC-15, AC-21 – AC-25, and AC-33 here require SPEC-016 REQ-08 – REQ-15 and REQ-22 to
  be live."
- Description: `AC-23 (REQ-14)`, `AC-24 (REQ-15)`, and `AC-25 (REQ-15)` concern the restore-progress
  panel reading live state from "the sidecar ops journal" — refresh-safety and non-dismissability. That
  mechanism is explicitly listed as a *separate* dependency in this spec's own Dependencies table ("ADR-
  041 sidecar ops journal... If the sidecar journal is unreadable, Recovery cannot list restore points or
  read live operation state"), not as part of SPEC-016's gateway. `SPEC-016-orchestrator.spec.md` defines
  only three gateway actions (`plan`/`confirm`/`execute`) with no polling/progress action at all, and
  none of SPEC-016 REQ-08–REQ-15's text mentions a live-progress or journal-refresh mechanism. Grouping
  `AC-23`–`AC-25` under "requires SPEC-016 REQ-08 – REQ-15 to be live" over-attributes their real
  dependency (the ADR-041 sidecar journal) to the wrong contract. This is lower-severity than RT-002/
  RT-003 because the paragraph's other citations (`AC-12`–`AC-15`, `AC-21`–`AC-22`, `AC-33`) are
  accurate, and the practical effect (Architect over-trusts SPEC-016 as the sole blocking dependency) is
  less actively misleading than RT-002/RT-003's cross-topic misattribution.
- Suggested resolution: Split the sentence: attribute `AC-12`–`AC-15`, `AC-21`–`AC-22`, and `AC-33` to
  SPEC-016 REQ-08–REQ-15/REQ-22 as currently written, and attribute `AC-23`–`AC-25` separately to the
  ADR-041 sidecar ops journal dependency already listed in this spec's own Dependencies table.

---

## CONSTITUTION_FLAG Findings

Likely to require a constitution exception. Flagged for Architect awareness so Complexity
Justification entries can be prepared proactively. Does not block Software Architect dispatch by
itself (only the BLOCKING findings above do).

### RT-009
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: III — Simplicity Gate (default provider profile; the ratified `constitution.md` is an
  unfilled template with no project-specific Article III text, so this flag uses the default-profile
  heuristic per the persona's constitution pre-flight duty, not a ratified rule).
- Location: REQ-06/REQ-08/REQ-13/REQ-20 combined; the five-step restore ceremony plus the separate
  ordinary-mutation `backup.create` path plus the cross-screen (Storage + Recovery) in-flight lock plus
  mandatory server-side envelope re-verification on every deep-link arrival.
- Description: Recovery is not "just" a CRUD screen: it composes four independently-nontrivial pieces of
  machinery (a five-step human-gated wizard, a second non-gated mutation path with its own idempotency
  rule, a site-wide two-screen mutual-exclusion lock, and a stateless-envelope re-verification path) on
  top of an already-complex shared gateway. None of this is gratuitous — every piece traces to a named
  REQ — but the aggregate is exactly the kind of "custom complexity where no single library or pattern
  covers the whole thing" default-profile Article III is meant to catch.
- Architect note: Prepare a Complexity Justification entry naming each of the four pieces above and its
  owning REQ, so the ADR doesn't need to retroactively justify why a "simple admin screen" required this
  much orchestration machinery.

---

## Routing Decision

**4 BLOCKING findings.** Route back to Spec Agent — do not advance to Software Architect dispatch.

Per the Red-Team persona's escalation rule, 3 or more BLOCKING findings indicates a systemic quality
problem in this pass, not four isolated typos: three of the four (RT-002, RT-003, RT-008-adjacent)
cluster in the same `## Integration Contracts` section, suggesting that section was drafted with looser
citation discipline than the rest of the package, and the fourth (RT-001) is a package-wide mechanical
hash defect that likely happened in the same drafting pass. Recommend the Spec Agent re-derive the
Integration Contracts section's citations AC-by-AC against the actual REQ/AC text (not from memory of
what "should" be true), fix the hash propagation across all ten files, and explicitly resolve or
provisionally-flag OQ-04's `backup.read` string before this spec is resubmitted for Red-Team re-review.

ADVISORY and CONSTITUTION_FLAG findings (RT-005 – RT-009) should be carried forward into Software
Architect context once the BLOCKING findings are resolved and this spec is re-submitted — none of them
independently blocks dispatch.
