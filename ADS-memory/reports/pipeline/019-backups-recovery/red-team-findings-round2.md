# Red-Team Findings (Round 2): backups-recovery

- Feature: FEAT-019-backups-recovery
- Spec version: 1.1.0
- Spec hash: sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1
- Prior round: `red-team-findings.md` (v1.0.0, sha256:7011b97184a3341918d6cb4435b74759fef7f9e488c6a9b477d6d1728a2bcbb7) — 4 BLOCKING · 4 ADVISORY · 1 CONSTITUTION_FLAG
- Red-Team completed: 2026-07-14T23:59:00Z
- Finding count (this round, new only): 0 BLOCKING · 1 ADVISORY · 0 CONSTITUTION_FLAG (RT-009 carried forward unchanged, not recounted as new)

This is a fresh, full adversarial pass over the current package content — not a checklist replay of round 1.
All 10 files were read in full, cross-checked against each other and against SPEC-016 v1.1.0's current
`feature.spec.md`/`traceability.spec.md`, and re-attacked with the full standard vector set (ambiguity,
contradiction, untestability, missing failure modes, scope creep, constitution pre-flight).

---

## Part 1 — Verification of Round-1 Findings

### RT-001 (was BLOCKING — hash placeholder defect) → **RESOLVED**

Hand-verified by direct `grep`/`head` inspection of all 10 files (not by trusting the revision's own claim).
Every one of the 8 files that carry a `content_hash`/`Content Hash` field now shows the identical value:

| File | Hash |
|---|---|
| `SPEC-019-feature.spec.md` | `sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1` |
| `SPEC-019-api.spec.md` | `sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1` |
| `SPEC-019-state.spec.md` | `sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1` |
| `SPEC-019-orchestrator.spec.md` | `sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1` |
| `SPEC-019-ui.spec.md` | `sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1` |
| `SPEC-019-errors.spec.md` | `sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1` |
| `SPEC-019-behavior.spec.md` | `sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1` |
| `SPEC-019-traceability.spec.md` | `sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1` |

The remaining 2 files (`SPEC-019-spec-manifest.md`, `SPEC-019-spec-dod.md`) carry no `content_hash` field at
all — confirmed this is the standing package convention, not an omission, by checking SPEC-016's own
`spec-manifest.md`/`spec-dod.md`, which show the identical no-hash-field pattern. No placeholder
`sha256:0000...0000` string remains anywhere in the package (verified by grep across all 10 files).
`spec-dod.md` item G-07's evidence text was also corrected to describe direct-inspection verification
rather than an assumed-true claim, matching what I independently re-verified. **RESOLVED, no residual gap.**

### RT-002 (was BLOCKING — AC-06 miscited under the watermark paragraph) → **RESOLVED**

The Watermark/discarded-write-window disclosure paragraph in `SPEC-019-feature.spec.md` § Integration
Contracts no longer cites AC-06, and now carries an explicit parenthetical redirect: "(`AC-06` here is a
`db-ops` capability-surface concern, not a watermark concern — see that paragraph below; it does not belong
in this one.)" AC-06 is now cited exactly once, correctly, in the `db-ops` capability surface paragraph.
**RESOLVED.**

### RT-003 (was BLOCKING — unsupported actor-identity citation on AC-08/AC-29) → **RESOLVED, judgment call holds up**

The revision chose option (b) from the original finding: remove the citation rather than invent a new field.
I independently re-verified the underlying fact the correction rests on — that no typed contract anywhere in
this package exposes an actor/creator-identity field on the restore-point artifact:
- `SPEC-019-state.spec.md` §2 `RestorePointSummary`: `restorePointId, capturedAt, trigger, schemaVersion,
  schemaTag, sizeBytes, costClassAtCapture, discardSummary, watermarkAtCapture` — no actor field.
- `SPEC-019-api.spec.md` §5 `RestorePointSummary` (wire shape): identical field list, no actor field.
- `SPEC-019-ui.spec.md` §2.4 `RestorePointRow` props: `restorePoint, canRestore, isFocused` — no actor field.
- `SPEC-019-ui.spec.md` §2.5 `DegradedStateBanner` (the `migration.interrupted`/AC-29 surface): no actor
  field either.

The rewritten paragraph correctly relocates composite actor identity to where it does exist — the
`executeRestore` action note in `SPEC-019-orchestrator.spec.md` §4 ("stamps composite actor identity per
SPEC-016 REQ-16"), which is a real, load-bearing citation on the restore-execution ledger row, not the
`restore_points` display artifact. This is internally consistent and does not paper over a real gap: it
correctly identifies that "who created/ran this" is not something today's UI renders anywhere, and says so
plainly rather than silently. **Judgment call holds up as sound — RESOLVED.**

### RT-004 (was BLOCKING — OQ-04 vs. hard-coded `backup.read` contradiction) → **RESOLVED, judgment call holds up**

The revision resolved OQ-04 in place (`backup.read` confirmed final) rather than making the P1 ACs
provisional. I checked this both ways:
- Internal consistency: `backup.read` was already hard-coded in every P1 AC (AC-03, AC-35), every auth
  profile (`AUTH_RECOVERY_READ`, `AUTH_GATEWAY_READ` in `api.spec.md` §2), every agent-tool
  `authorization.permission` field (`api.spec.md` §7), and `orchestrator.spec.md`/`state.spec.md`'s
  `backup.read`-gated preconditions. Confirming it as final produces zero remaining contradictions anywhere
  I checked — no file still treats the string as pending.
- Reasoning quality: the naming choice (`backup.` prefix, matching `backup.create`/`backup.restore` already
  in place, per ADR-021 §3's flat-dotted house style) is not arbitrary — it is the naming convention this
  package was already using everywhere else. Walking it back to something else (e.g. `recovery.read`) would
  have been the more disruptive, less-consistent choice.

This is a sound resolution of a genuine self-contradiction, not a rubber-stamp. **RESOLVED.**

### RT-005 (was ADVISORY — `coveredCategories` sourcing ambiguity) → **RESOLVED**

REQ-09 now states explicitly that `coveredCategories` "MUST be sourced from a versioned constant this spec
owns... not from an external write-path-registry capability — no such capability is exposed anywhere in
SPEC-016." This closes the two-developer divergence the original finding identified. **RESOLVED.**

### RT-006 (was ADVISORY — OQ-03 ownership/routing) → **PARTIALLY RESOLVED**

The revision reassigned OQ-03's Owner field to "SPEC-016, not SPEC-019 alone," with reasoning that matches
the original suggested resolution's intent (shared-contract-level gap affecting SPEC-017 identically). This
part is done and is a real, correct improvement.

However, I checked SPEC-016's *current* `feature.spec.md` directly (v1.1.0, matching the hash SPEC-019
cites) and the actual REQ/EC addition the original suggested resolution called for — "recorded as a SPEC-016
REQ/EC addition, not duplicated independently by each dependent domain spec" — has **not** landed in SPEC-016
yet. SPEC-016's own EC-05 ("What happens when `content.db` cannot be opened at boot?") still only addresses
watermark/disclosure degradation, not whether `authorize()` itself (which reads `principals` from the same
`content.db`) can run at all in that state. SPEC-016's Dependencies table has a generic fail-closed statement
("If `authorize()` is unavailable... fail-closed; the mutation is denied") but this is not scoped
specifically to the `content.db`-unreadable case the way EC-05 is. This is not a fault of SPEC-019 — OQ-03 is
honestly still open, correctly owned, and does not gate any current P1 AC — but the underlying gap this
ADVISORY flagged is still live in the dependency it was reassigned to. Since this is ADVISORY, not BLOCKING,
it does not block dispatch; flagging for Coordinator/human visibility that the reassignment happened but the
actual fix has not yet been picked up by SPEC-016.

### RT-007 (was ADVISORY — untestable "not apologetic" tone requirement) → **RESOLVED**

REQ-19 and AC-29 now require the literal substring `"planned downtime"` in the `migration.interrupted`
banner's accessible name/text, and `SPEC-019-ui.spec.md` §5 adds a matching accessibility rule for
`DegradedStateBanner`'s `migration-interrupted` kind, explicitly modeled on the disclosure's caveat-text
rule. This is now string-testable. **RESOLVED.**

### RT-008 (was ADVISORY — AC-23–AC-25 misattributed to SPEC-016's gateway) → **RESOLVED**

The Gated-mutation-gateway Integration Contracts paragraph now explicitly carves out AC-23–AC-25 and
attributes them to "the ADR-041 sidecar ops journal already named in this spec's own Dependencies table,"
noting correctly that SPEC-016's own gateway (per `SPEC-016-orchestrator.spec.md` §4) defines only
`plan()`/`confirm()`/`execute()` with no polling/progress action. **RESOLVED.**

### RT-009 (CONSTITUTION_FLAG — Article III complexity) → **Carried forward, unchanged, no action required**

Still present, folded into the Constitution Compliance table's Article III row with a structured note naming
all four composed-machinery pieces and their owning REQs, ready for the Software Architect's Complexity
Justification entry. Not a blocking finding in round 1 and nothing about the revision changes that
assessment.

---

## Part 2 — Citation Accuracy Against SPEC-016's Current Text (Fresh Verification)

Independently re-derived, not spot-checked:

- SPEC-016 v1.1.0's `content_hash` (`sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`)
  matches what SPEC-019 cites in its Integration Contracts re-sync note and in `pipeline-state.md`'s
  `depends_on` field. Confirmed by direct read of `SPEC-016-feature.spec.md`'s header.
- REQ-01–REQ-22 numbering in SPEC-016's current text is unchanged from what SPEC-019 cites throughout —
  confirmed by grepping every `- REQ-NN:` line in `SPEC-016-feature.spec.md`.
- SPEC-016 REQ-10's confirmation-token TTL is "a fixed TTL of exactly 600 seconds (10 minutes)... with no
  jitter or tolerance band" — matches SPEC-019's re-synced `behavior.spec.md` §4 claim exactly.
- SPEC-016 AC-33 (`dbOps.getCapabilities()` against a Postgres-backed site with tooling configured →
  `costClass: 'expensive'`) exists and is the correct AC for SPEC-019's AC-06 to depend on for the
  `'expensive'` case — confirmed by direct read.
- SPEC-016 REQ-16's `APPEND_ACTOR_REFERENCE` action and the `ActorIdentityRef` entity exist in
  `SPEC-016-orchestrator.spec.md` §4 and `SPEC-016-state.spec.md` §2 respectively — confirmed, matching
  SPEC-019's re-sync note.
- REQ-14 ("`authorize()` MUST be evaluated before any idempotency short-circuit... for a gated **or
  ordinary** mutation") is generically scoped, not gateway-only — so SPEC-019's AC-11 citing REQ-14 for the
  non-gated `backup.create` path is accurate, not a stray citation.

No new citation defect found. RT-002/RT-003/RT-008's corrections all hold up against SPEC-016's actual
current text, not just against memory of what "should" be true.

---

## Part 3 — New Findings (This Round)

### RT-010
- Severity: ADVISORY
- Category: ambiguity
- Location: `SPEC-019-feature.spec.md` AC-06 (REQ-03) [P1]: "...the operator sees a cost/disk-estimate
  acknowledgment requirement before the restore flow proceeds past `plan()`."
- Description: AC-06 asserts a "cost/disk-estimate acknowledgment requirement" as if it is a distinct gate
  from the Step 2 discarded-write-window disclosure acknowledgment (REQ-08/REQ-10, `AC-14`/`AC-15`). No REQ,
  invariant, or typed contract anywhere in the package defines such a control: `ui.spec.md` §2.6
  `RestorePlanPreview` has no acknowledgment input at all; `ui.spec.md` §2.7 `DiscardedWindowDisclosure` has
  exactly one acknowledgment field (`acknowledged`/`onAcknowledge`, gated to the partial-coverage caveat
  text, REQ-10) and it is not costClass-specific; `state.spec.md` §1 has exactly one acknowledgment field
  (`restoreFlow.disclosureAcknowledged`). REQ-26 additionally requires the ceremony to be uniform regardless
  of `costClass` — no abbreviated *or* extended path is described for `'expensive'`. Two developers reading
  AC-06 literally could diverge: one adds a second, cost-specific acknowledgment control shown only for
  `'expensive'` (arguably in tension with REQ-26's uniformity requirement, since that would make the
  `'expensive'` ceremony longer than the `'cheap'` one); another treats AC-06 as already, trivially satisfied
  by the existing Step 2 disclosure gate (which blocks `confirm()` regardless of `costClass` anyway),
  making AC-06 redundant with AC-14/AC-15 rather than testing anything AC-06-specific.
- Suggested resolution: Either (a) clarify that AC-06's "acknowledgment requirement" *is* the existing Step 2
  disclosure gate — i.e., reword AC-06 to say the disclosure's existing acknowledgment control also covers
  the cost/disk estimate shown in the plan preview, so there is no second control — or (b) if a distinct
  cost-specific acknowledgment is actually intended, add a typed field for it in `ui.spec.md`/`state.spec.md`
  and reconcile the wording with REQ-26's uniform-ceremony requirement so the two don't read as contradictory
  for the `'expensive'` case.

No BLOCKING or CONSTITUTION_FLAG findings were found in this round beyond RT-009 (carried forward, not new).

---

## Routing Decision

**0 new BLOCKING findings.** All 4 prior BLOCKING findings (RT-001–RT-004) are RESOLVED and independently
hand-verified, including the RT-001 hash-consistency re-check called for by name. All 4 prior ADVISORY
findings are RESOLVED (RT-005, RT-007, RT-008) or PARTIALLY RESOLVED (RT-006 — ownership correctly
reassigned, but the suggested SPEC-016-side REQ/EC addition has not yet landed; this remains a live,
non-blocking gap to track, not a defect in SPEC-019 itself). RT-009's CONSTITUTION_FLAG carries forward
unchanged for Software Architect awareness.

One new ADVISORY finding (RT-010) was found on this fresh pass — an ambiguity in AC-06's "cost/disk-estimate
acknowledgment requirement" phrasing that could produce two divergent implementations. It does not rise to
BLOCKING: the disclosure gate (AC-14/AC-15) already provides a deterministic, testable confirm-reachability
gate regardless of how AC-06 is read, so a test suite can be written against this package today without
resolving the ambiguity first — but the Spec Agent/human should resolve it before Programmer implementation
to avoid two valid-looking but different builds.

**Recommendation: spec cleared for Software Architect dispatch.** Carry RT-010 (new) and RT-006's residual
gap forward into Software Architect context as ADVISORY notes, alongside RT-009's CONSTITUTION_FLAG.
