# External Audit Report — Round 4 (Compliance Inspector pass)

**Date:** 2026-07-14
**Scope:** custom (diff-only compliance pass — the round-3 fold edits to ADR-043 and ADR-044; ADR-045 excluded, both round-3 external auditors already found it clean)
**Focus:** Do the round-3 fold edits actually satisfy what round-3's auditors (Fable internal, Codex, agy) asked for? Did any edit introduce a new problem?
**Suggested Changes Mode:** patches
**Audit Packet:** `ADS-project-knowledge/reports/external-audit/packets/20260714-adr-043-044-round4-audit-packet.md`
**Dispatch Packet:** same as audit packet
**Planned Auditors:** Codex, agy/Gemini (external only — no internal-verification re-run this round; Fable's own round-3 findings are what's being reconciled, so re-verifying with Fable first would be circular)
**Responded Auditors:** both
**Failed Or Skipped Auditors:** none
**Timeout:** 480s per auditor call
**Proposed Fixes Artifact:** applied directly (agy's one finding, fixed this session)

**Threat model:** `TM-ADR-CONTENT-ADMIN-005`, round 4 (same series as rounds 2/3 — no material threat-model change).

## Work Log

- Before dispatching round 4, re-checked my own round-3 fold for self-consistency and caught two things the auditors hadn't seen yet: ADR-044's "until ADR-043 ships" claim had been fixed in only 2 of 3 occurrences (Consequences section was missed), and ADR-045's status line still said external re-dispatch was "pending" despite round 3 already having cleared it. Fixed both before building the round-4 packet.
- Built a round-4 packet: same threat model, `Audit round: 4`, a Prior-Round Disposition Ledger carrying forward all 11 round-3 findings (10 `fixed`, 1 `wontfix` with evidence), and a numbered list of the 12 specific text changes made since round 3.
- Dispatched to Codex and agy independently, framed as a compliance-inspector pass (verify the ledger, audit the diff, not a fresh full pass).

## Auditor Matrix

| Auditor | Requested Model | Resolved Model | Selection Source | CLI Version | Score | Rationale | Path to 10 | Output Mode | Suggest Mode Used | Attempts | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| codex | gpt-5.6-terra | gpt-5.6-terra | session_success | codex-cli 0.144.3 | 9.6 | "All round-3 findings have a concrete, consistent, and adequately scoped resolution in the supplied diff and context." | none — 10/10 on substance, no path-to-10 items named | json | patches | 1 | Responded |
| agy | Gemini 3.1 Pro (High) | Gemini 3.1 Pro (High) | session_success | agy 1.1.2 | 9.8 | "Round 3 findings were resolved thoroughly and robustly; the single low-severity finding is a minor consistency omission in a new schema snippet." | Add `perTaxonomySeq` to the new `taxonomyRevisions` table (fixed this fold) | text | patches | 1 | Responded |

## Degraded Coverage
- None.

## Per-Auditor Scope Checks

### Codex
- **What it says it is auditing:** the 12 listed round-3-fold changes and their cited ledger dispositions in ADR-043/044 only
- **Scope and target it used:** custom — diff-only compliance pass
- **Files or artifacts it says it reviewed:** the packet's current text + diff description; ADR-045 explicitly excluded
- **Scope ambiguity or mismatch:** none

### agy
- **What it says it is auditing:** ADR-043/044 against the round-4 diff and the 11-entry disposition ledger
- **Scope and target it used:** custom — diff-only compliance pass, ADR-045 excluded per instructions
- **Files or artifacts it says it reviewed:** the packet only
- **Scope ambiguity or mismatch:** none

## What The External LLMs Said

### Codex Findings By Severity
- Zero findings. All 10 ledger entries independently verified as genuinely resolved; the `wontfix` disposition on agy's kind-mutation finding was also independently assessed as internally consistent (not just rubber-stamped).

### Codex Strengths
- "The kind-to-SQL mapping closes the remaining DDL interpolation path, the taxonomy join now checks the correct lens, and merge loss is disclosed rather than mischaracterized as reversible."

### agy Findings By Severity
- 1 low.

### agy Blockers
- None.

### agy Optional Improvements
- F-R4-01: the new `taxonomyRevisions` table (added during round 3's fold to fix a different finding) reintroduced the exact indexing inconsistency just fixed elsewhere in the same fold — a global `seq` instead of a proper `perTaxonomySeq`, breaking the gapless-per-entity-sequence pattern `entryRevisions`/`contentTypeRevisions` both use.

### agy Strengths
- "Adding a check for the lens exact match... perfectly seals the tenant scoping and polymorphism gap. This is a subtle but critical guard against confused-deputy-style read/write issues."
- "Treating field `kind` strictly as a closed core enum... is the correct architectural answer to the DDL injection finding."
- "Re-writing the destructiveness of the `mergeTerm` operation... honors the spirit of the audit rather than trying to wave the issue away."

## Per-Finding Rationales

### agy
| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| F-R4-01 | New `taxonomyRevisions` table vs. `entryRevisions`/`contentTypeRevisions` pattern | Per-entity gapless sequence with a real unique constraint | Global `seq` + non-unique index on `(taxonomyId, seq)` | Ledger tables inconsistent with each other; not a correctness bug but a design-consistency gap introduced by the very fold that fixed the same issue elsewhere | Add `perTaxonomySeq`, make the index unique | high |

## Cross-Auditor Synthesis

### Converged Findings
- None this round (both auditors independently verified the ledger clean; only agy found one new item).

### Single-Auditor Findings Worth Keeping
- agy's F-R4-01. Genuinely correct, ironic (introduced by the same fold that fixed the identical pattern in the sibling table), cheap. Fixed.

### Conflicts Or False Positives
- None.

### Missed-By-One Notes
- Codex reviewed the same diff and returned zero findings, including on the `taxonomyRevisions` table specifically named in ledger entry `ADR-044-sample-completeness`. agy's closer read of the *index shape*, not just the table's *existence*, caught what Codex's review didn't. Consistent with round 3's pattern where different auditors catch different classes of defect from the same material.

## Suggested Changes By Auditor

| Auditor | Suggested Change | Coordinator Handling |
|---|---|---|
| agy | Add `perTaxonomySeq` to `taxonomyRevisions`, make index unique | accept — implemented this fold |

## Coordinator Response

### Agree
agy's F-R4-01 — correct, cheap, consistent with the pattern already established in `content_type_revisions` two folds ago.

### Change
Nothing beyond the one fix.

### Disagree
Nothing.

### Proposed Fix Handling
Accept as-is — applied directly to `ADR-044-categories-and-tags.md`.

## Proposed-Fix Disposition Gate

| Finding | Source | Disposition | Rationale |
|---|---|---|---|
| `taxonomyRevisions` missing `perTaxonomySeq` | agy F-R4-01 | agree-implement | Fixed this fold — mirrors the identical fix already applied to `content_type_revisions` in round 3 |

Re-verification: re-confirmed bold-marker and triple-backtick balance in both files after the edit (96/76 and 2/4 respectively, both even).

## Audit Outcome

- **Round 4: PASS.** Both auditors: no validated blockers, both scores above the 8.5 floor (Codex 9.6, agy 9.8). Dual gate satisfied independently by both.
- **ADR-043 and ADR-044 have now cleared adversarial external audit** across this ADR batch's full lineage: round 1 (fold), round 2/internal-verification (fold), round 3 (fold), round 4 (compliance-confirmed, PASS). ADR-045 cleared in round 3 with no further changes needed.
- Not Accepted yet — human owner sign-off is still a separate, required step for all three ADRs, per each file's own status line.

## Decision Points For User

- **Human owner sign-off** on ADR-043, ADR-044, and ADR-045 is the only remaining gate before any of them can move from PROPOSED to Accepted.
- No further audit rounds are recommended — round 4 found nothing beyond one trivial, now-fixed consistency gap, and both auditors independently reached scores near the ceiling.
- Ready to proceed to spec/outline work for the Storage/Collections/Categories-Tags/Backups-Recovery admin surfaces whenever you want to pick that back up.
