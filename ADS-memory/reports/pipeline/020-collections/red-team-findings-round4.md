# Red-Team Findings (Round 4 — Re-Review of v1.3.0 Revision): collections

- Feature: FEAT-020-collections
- Spec version: 1.3.0
- Spec hash: sha256:e56cbf6ff00e3d75746fcf71b521f11a18d0f1fa4cb8a53eb3f786ec77a26dec (mechanically
  verified via `validate_spec_package.py --phase spec --print-hash`, no `--update-hash` needed —
  computed hash matched the stored value; exit code 0, PASS)
- Red-Team completed: 2026-07-15T04:30:00Z
- Finding count: 0 BLOCKING · 1 ADVISORY (new) · 0 new CONSTITUTION_FLAG (1 carried forward
  unchanged)

Fresh full read of all 9 v1.3.0 files, verdicts on round 3's four findings, mandatory SPEC-016
v1.3.0 re-sync, and a fresh adversarial pass on REQ-30/AC-54–56/EC-18–19's own new content.

---

## Part 1 — Verdicts on Round 3 Findings (RT-015 through RT-018)

### RT-015 (BLOCKING — REQ-27/REQ-29 mutually exclusive, leaving a brand-new-queryable-field-via-update case and a combined kind+queryable-change case ungoverned) — **RESOLVED**

New REQ-30 explicitly closes both residual scenarios: "(a) A field name that is not present in the
content type's schema immediately before the call, submitted... with `queryable=true`, MUST have
its index provisioned in the same transaction... this is index provisioning for a newly-introduced
field, not a resubmission of an existing field, so it is a REQ-30 obligation, not a REQ-29 one. (b)
When a single existing field's `kind` AND `queryable` both change in the same...call, its index
state MUST be resolved according to its *post-call* `queryable` value and `kind`: REQ-27 and REQ-29
combine, not exclude..." New AC-54 (scenario a) and AC-55 (scenario b) are both concrete
Given/When/Then tests with specific field values, not restatements of the requirement. New EC-18/
EC-19 mirror the same two scenarios. `state.spec.md`'s `UPDATE_CONTENT_TYPE_FIELDS` action row and
`orchestrator.spec.md`'s Lifecycle Hooks table were both updated to cite REQ-30 for the "newly
added" case (correcting the prior misattribution to REQ-29 that RT-015 named). INV-10 was reworded
to enumerate all three trigger paths (explicit resubmission, newly-introduced-via-full-replace,
full-replace removal) rather than implying only two. Independently re-checked: no gap remains
between REQ-27/REQ-29/REQ-30's combined trigger conditions and what a full-replace
`UPDATE_CONTENT_TYPE_FIELDS` call (REQ-26) can actually produce. Resolved.

### RT-016 (ADVISORY — ambiguous ordering between the `expectedVersion` guard and the fields_empty rejection) — **RESOLVED**

`state.spec.md`'s `UPDATE_CONTENT_TYPE_FIELDS` Precondition cell now reads "`expectedVersion`
matches current `version` — checked **first**, before the fields_empty guard below or any other
precondition in this cell (REQ-26); only once `expectedVersion` matches: when `fields` is
present..." `orchestrator.spec.md`'s `onBeforeContentTypeWrite` row was reworded to match exactly:
"...first checks `expectedVersion` matches the content type's current `version`... a stale
`expectedVersion` fails here before any field-related check runs, including the fields_empty check;
only once `expectedVersion` matches does it check a present `fields` array is non-empty..." New
AC-56 gives the combined-failure scenario (stale `expectedVersion` + empty `fields: []`) a concrete
test: rejected with a version-conflict error, not `VALIDATION_ERROR`. Both files now agree, and the
previously-untested combined scenario has a test. Resolved.

### RT-017 (ADVISORY — `entries.type`→`content_types.key` citation implied it was the "polymorphic content reference" flavor of SPEC-016 REQ-18, which v1.2.0's expanded text narrowed to `entry_terms` specifically) — **RESOLVED**

The Integration Contracts bullet now reads: "`entries.type`'s soft reference to `content_types.key`
instantiates REQ-18's *general opening rule* directly... rather than either of REQ-18's two named
example flavors... `entries.type` is neither: it always references exactly one fixed target table
(`content_types`)... so it is a third, plainer flavor not named in REQ-18's parenthetical examples.
This does not change this spec's behavioral obligation..." This is RT-017's second suggested-
resolution option (SPEC-020 states explicitly it instantiates the general rule, independent of
either named flavor) rather than the first (have SPEC-016 add a third named flavor) — an acceptable
choice per the finding's own either/or framing, and it does not require touching SPEC-016.
Resolved.

### RT-018 (ADVISORY — `depends_on` stuck at stale SPEC-016 v1.1.0) — **RESOLVED, with an explicit self-aware caveat**

`SPEC-020-spec-manifest.md` and `pipeline-state.md`'s `depends_on` fields both now read "SPEC-016
v1.2.0" with the correct hash — exactly what RT-018 asked for. `spec-manifest.md` additionally adds
an unusually transparent note: "SPEC-016 is being independently revised to v1.3.0 in a parallel
dispatch; this `depends_on` pin intentionally cites the v1.2.0 text this round verified, not
SPEC-016's in-flight v1.3.0 hash." This is a materially better practice than SPEC-018's silent
version-lag (RT4-003's package) — it documents the staleness as intentional and time-scoped rather
than leaving a reader to discover it independently. Resolved.

**Summary: all 4 of round 3's findings are genuinely resolved.**

---

## Part 2 — Mandatory SPEC-016 v1.3.0 Re-Sync

Re-diffed every SPEC-020 citation against SPEC-016's current v1.3.0 text (not the v1.2.0 text the
package's own `depends_on` pin cites, per this round's explicit re-sync mandate):

- **REQ-18 (soft cross-boundary reference, RT-017's own subject):** confirmed unchanged between
  v1.2.0 and v1.3.0 — SPEC-016's v1.3.0 revision touched only REQ-01, REQ-03, REQ-14, EC-01, the
  Dependencies table, and `state.spec.md`'s `watermark.value` row. RT-017's fix remains fully valid
  against the current text; no new drift.
- **REQ-16, REQ-17 (composite actor identity):** unchanged. `ContentTypeRevision`/`EntryRevision`
  `delegatedByWorkspaceId`/`delegatedById` fields remain accurate.
- **REQ-01, REQ-02 (watermark counter/stamping):** cited generically at multiple points (e.g.
  Dependencies table's SPEC-016 row: "The watermark-stamping function, the generic
  `plan()→confirm()→execute()` gated-mutation gateway..."). SPEC-020 never restates the
  SQLite-specific type language RT-019 scoped, so no drift — but see RT4-004 below for one place
  where an unscoped concurrency claim is made in this spec's own text (not a SPEC-016 citation
  per se, but adjacent).
- **REQ-08–REQ-15, REQ-22; INV-03–INV-05 (gateway/actor-class ordering):** unchanged since round 3's
  own re-verification against v1.2.0. No new drift from v1.3.0.
- **REQ-19 (`db-ops` capability shape):** unchanged in substance for this citation's purposes.

**Result: no new citation-content drift against SPEC-016 v1.3.0.** RT-017's fix remains valid.

---

## Part 3 — Fresh Findings (this round's own adversarial pass)

### RT4-004
- Severity: ADVISORY
- Category: documentation-integrity (stale evidence cells in `spec-dod.md`)
- Location: `SPEC-020-spec-dod.md` B-04, B-06 rows
- Description: The file's Header Metadata correctly shows `version | 1.3.0` and
  `filled_date | 2026-07-15T03:30:00Z` (matching `feature.spec.md`'s own `last_edited` of
  `2026-07-15T03:30:00Z` exactly), and F-08 (line 167) correctly reads "`1.3.0` in every file
  (bumped from `1.2.0` in this revision)." But B-06's Notes cell still reads
  `2026-07-14T23:00:00Z` — a timestamp from an earlier revision, one or two versions behind the
  file's own header and F-08's already-correct text — and B-04's Notes cell reads "Recomputed for
  v1.1.0 and verified by the provider-local validator with `--update-hash`, then re-verified
  idempotent with `--phase spec` and no `--update-hash`," which describes only the v1.1.0 hash
  recompute event and has not been updated across the v1.2.0 or v1.3.0 bumps even though B-04's
  underlying PASS status is accurate (this round's own mechanical hash check confirms the current
  hash is canonical). This is the same defect shape as SPEC-017's RT4-002 this round and SPEC-016's
  own round-1/round-2 RT-018 — a `spec-dod.md` evidence cell not updated in step with a later
  revision, even though the item it's attached to (F-08, the version-consistency check) was
  correctly updated in the same file.
- Suggested resolution: Update B-04's Notes cell to reference the current v1.3.0 hash recompute
  (or state generically that it has been recomputed and re-verified at every revision since v1.1.0,
  with a pointer to `pipeline-state.md` for the current value, matching how F-08 already handles
  this), and update B-06's Notes cell to the current `2026-07-15T03:30:00Z` last_edited value.

---

## CONSTITUTION_FLAG Findings

### RT-011 (carried forward, unchanged from rounds 1–3)
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: I — Library-First
- Location: REQ-04, REQ-06; `SPEC-020-behavior.spec.md` §3/§4
- Description: Unchanged — re-verified still accurate against the current v1.3.0 spec text. The
  core-mediated `kind`→`CAST` lookup table and workspace-scoped index-name construction remain a
  bespoke, hand-rolled dynamic-DDL layer.
- Architect note: Unchanged — prepare a Complexity Justification entry for the ADR.

---

## Routing Decision

**0 BLOCKING findings.** All 4 of round 3's findings (1 BLOCKING, 3 ADVISORY) are confirmed
genuinely resolved on independent re-derivation, with concrete new REQ/AC/EC content, not mere
restatements. The mandatory SPEC-016 v1.3.0 re-sync found no new citation-content drift. **This
package is cleared for Software Architect dispatch.**

RT4-004 (ADVISORY) is a minor `spec-dod.md` bookkeeping fix, optional before dispatch. RT-011
(CONSTITUTION_FLAG) carries forward unchanged into Software Architect context.
