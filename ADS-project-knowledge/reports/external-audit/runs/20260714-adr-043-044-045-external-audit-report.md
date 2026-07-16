# External Audit Report

**Date:** 2026-07-14
**Scope:** custom (three pre-implementation ADR design documents, no code diff)
**Focus:** Are ADR-043 (Collections), ADR-044 (Categories & Tags), and ADR-045 (Backups/Recovery screen) internally sound, mutually consistent, and safe to spec/implement from, as a fresh audit before starting spec/outline work for these surfaces?
**Suggested Changes Mode:** patches (bounded text-level edits to the three named ADR files)
**Audit Packet:** `ADS-project-knowledge/reports/external-audit/packets/20260714-adr-043-044-045-audit-packet.md`
**Dispatch Packet:** same as audit packet — served self-contained via stdin to each auditor
**Planned Auditors:** Codex (external), agy/Gemini (external), Fable (in-host subagent — mandatory Internal Subagent Verification pass, added as an explicitly-surfaced voice per user request, not folded in silently)
**Responded Auditors:** all three
**Failed Or Skipped Auditors:** none
**Timeout:** 480s per external auditor call; internal verifier ran to natural completion
**Proposed Fixes Artifact:** applied directly to the three ADR files this session (see Coordinator Response → Proposed Fix Handling below); no separate proposed-fixes.md bundle — every accepted fix is already folded into the files of record

**Threat model:** `TM-ADR-CONTENT-ADMIN-005` (round 1, fresh — a new threat model, not a continuation of the earlier `TM-ADR-STORAGE-CONTENT-004` these three ADRs went through in a prior session). Risk tier: medium/high, score floor 8.5.

## Work Log

- Built a combined audit packet for all three ADRs (broad scope, batched per standing preference), with a frozen Threat Model & Scope Contract (5 allowlist domains, 5 mandatory invariants, gate formula `blocking_gate = FAIL iff blockers > 0 OR score < 8.5`).
- Ran the mandatory Internal Subagent Verification pass (Fable, in-host, falsification-framed) BEFORE any external dispatch, per protocol. It found a hard blocker (ADR-045's disclosure asserted coverage of a table that doesn't exist and isn't obligated to be tracked) plus 8 more findings.
- Applied Fable's four pre-dispatch-required fixes directly to the ADR files (not just the packet), refreshed the packet to match, then dispatched Codex and agy independently on the corrected text.
- Both external auditors confirmed the pre-dispatch fixes held, and both independently converged on the same remaining defect cluster in ADR-044 that Fable had flagged as escalation/advisory (allow-list timing contradiction, false merge-reversibility claim, missing `taxonomy_revisions` sample, missing outbox/watermark obligations) — three-way convergence from three structurally different reviewers.
- Codex additionally found a new blocker Fable's grammar fix hadn't covered (field *kind*, not just key/field *names*, also reaches DDL interpolation).
- agy additionally raised a kind-mutation cascade concern; verified directly against `src/features/post/post.ts` and found not applicable (`posts.kind` is fixed at creation, no conversion path exists in v1) — dispositioned as disagree with evidence, not silently accepted.
- Applied every agree-implement fix directly to ADR-043/044 this session (see disposition table below) and re-verified fence/formatting balance.
- Verification performed: direct repo reads (`src/infra/db/schema.ts`, `src/navigation/types.ts`, `src/features/post/post.ts`) to check every ADR claim about current shipped-code state, not just trust the ADR's own assertions. Verification not performed: no code exists yet for any of these three surfaces, so no test/build/typecheck was run — this is a design-level audit only.

## Internal Verification
- **Verifier persona:** generic adversarial verifier (Fable, Claude-family in-host subagent — no code-review/security/TDD persona applied since no code exists; explicitly surfaced as a distinct voice per user request, not folded in silently)
- **Evidence packet:** the full audit packet (self-contained: threat model, all three ADR texts, dependency summaries) plus direct repo access for verification
- **Excluded rationale statement:** confirmed — the verifier was not given any Coordinator opinion on which findings would be real; it worked from the packet and repo alone
- **Findings:** 1 blocker (F1), 1 high/root-cause (F2), 4 escalations (F3, F4, F5, F6 — F6 reclassified high), 2 advisory (F7, F8), 1 provenance-only (F9) — 9 total
- **Gate recommendation:** hard blocker (F1) — stop before external dispatch
- **Mutation-quality interpretation:** N/A (no code, no tests)
- **Residual risk:** ADR-041's watermark machinery is itself unbuilt, so every disclosure claim in this batch remains design-conditional until that Phase 0 work ships — disclosed, not a defect in these three ADRs
- **External peer audit still required:** yes — architecture-significant work, mandatory regardless of internal result
- **Score:** 8.0 (below the 8.5 floor independently of the blocker)

## Auditor Matrix

| Auditor | Requested Model | Resolved Model | Selection Source | CLI Version | Score | Rationale | Path to 10 | Output Mode | Suggest Mode Used | Attempts | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Fable (internal) | fable | Claude-family (Fable) | in-host subagent | n/a | 8.0 | "Disciplined, honestly disclosed, mostly consistent, but the Recovery disclosure asserted uncomputable coverage, backed by real cross-ADR consistency defects" | Fix F1-F9 (all fixed or dispositioned this fold) | tool result | patches | 1 | Responded |
| codex | gpt-5.6-terra | gpt-5.6-terra | session_success (proven earlier this session) | codex-cli 0.144.3 | 7.8 | "Recovery disclosure now correctly partial, but two unresolved destructive/DDL-boundary defects make the set unsafe as a SPEC source" | Fix F1 (field-kind grammar), F2 (mergeTerm reversibility) — both fixed this fold | json | patches | 1 | Responded |
| agy | Gemini 3.1 Pro (High) | Gemini 3.1 Pro (High) | session_success (proven earlier this session) | agy 1.1.2 | 6.5 | "ADR-043/045 solid post-round-2; ADR-044 has four blockers — contradictory expectations, false reversibility, missing schema/watermark obligations, an injectivity gap" | Fix F-044-1 through F-044-4 — three fixed this fold, one (F-044-4) dispositioned disagree with evidence | text | patches | 1 | Responded |

## Degraded Coverage
- None. All three planned auditors (1 internal, 2 external) responded successfully within budget; `min_auditors` was met with room to spare.

## Per-Auditor Scope Checks

### Fable (internal)
- **What it says it is auditing:** the three embedded ADR texts under `TM-ADR-CONTENT-ADMIN-005`, round 1
- **Scope and target it used:** custom — full ADR text plus direct repo verification
- **Files or artifacts it says it reviewed:** the packet; `src/infra/db/schema.ts`; `ADR-022`, `ADR-041` (full text, on disk)
- **Scope ambiguity or mismatch:** none

### Codex
- **What it says it is auditing:** the full embedded ADR-043/044/045 texts, fresh round-1 review under `TM-ADR-CONTENT-ADMIN-005`, reconciled against accepted ADR-022/021 and ADR-041
- **Scope and target it used:** custom — self-contained packet plus live repo schema verification (`-C` repo access)
- **Files or artifacts it says it reviewed:** the packet; `src/infra/db/schema.ts` (confirmed `posts` exists, `entries`/`content_types`/`taxonomies`/`terms`/`entry_terms` do not)
- **Scope ambiguity or mismatch:** none

### agy (Gemini)
- **What it says it is auditing:** ADR-043/044/045 pre-implementation design texts against `TM-ADR-CONTENT-ADMIN-005`'s invariants and allowlist, focused on cross-ADR consistency, implementation fidelity, and Recovery-disclosure safety
- **Scope and target it used:** custom — self-contained packet (no file access from `/tmp`, as expected for this transport)
- **Files or artifacts it says it reviewed:** the packet only (no repo file access this round, by design)
- **Scope ambiguity or mismatch:** none

## What The External LLMs Said

### Codex Findings By Severity
- 2 blocker, 1 high, 1 medium

### Codex Blockers
- F1: ADR-043's round-2 grammar fold constrained key/field *names* but not field *kind*, which ADR-022 §3's index template also interpolates into `CAST(...AS {type})` — the same DDL-injection class, one level deeper.
- F2: ADR-044's `mergeTerm` "reversible narrative" claim doesn't hold — `entry_terms_unique` dedup during merge permanently drops rows with no way to reconstruct them from the term-level `taxonomy_revisions` mapping alone.

### Codex Optional Improvements
- F3 (high): ADR-044's "until ADR-043 ships" allow-list claim is internally impossible given ADR-043's permanent key reservation.
- F4 (medium): `taxonomy_revisions` promised in prose but absent from the schema sample.

### Codex Strengths
- ADR-043's `entries` table genuinely leaves `posts` untouched.
- Reserved `post`/`page` keys make the polymorphic join injective for Collections entries.
- ADR-044 requires cross-workspace validation at write time, not read-time filtering.
- ADR-045 now matches ADR-041's partial-coverage model honestly.

### Codex Suggested Changes
- Extend ADR-043's grammar rule to a closed field-kind enum with a core-owned SQL mapping.
- Make `mergeTerm` reversibility concrete or explicitly destructive.
- Correct the ADR-044 allow-list wording to permanent legacy behavior.
- Add the `taxonomy_revisions` sample table.

### agy Findings By Severity
- 4 blocker, 1 low

### agy Blockers
- F-044-1: same allow-list contradiction as Codex F3, elevated to blocker.
- F-044-2: same mergeTerm reversibility defect as Codex F2, elevated to blocker.
- F-044-3: missing `taxonomy_revisions` sample AND missing outbox/watermark obligations, elevated to blocker.
- F-044-4: a claimed kind-mutation cascade gap (post→page transitions orphaning `entry_terms`) — **checked against live code and found not applicable** (see Cross-Auditor Synthesis → Conflicts below).

### agy Optional Improvements
- F-043-1 (low): vacuous unique index on `content_type_revisions` (same as Fable's F8).

### agy Strengths
- ADR-043 and ADR-045 "look incredibly solid following the fixes folded from round 1 and internal verification."
- ADR-045's disclosure wording "avoids setting a trap where the recovery screen makes promises the backend can't compute."

### agy Suggested Changes
- Same core ADR-044 fixes as Codex, plus a proposed (and, per verification, unneeded) `contentType` cascade-update mandate.

## Per-Finding Rationales

### Fable (internal)
| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| F1 (blocker) | ADR-045 §2/§3/§4 vs mandatory invariant 5 | Disclosure names only actually-computable categories, labeled partial | Named `entries` (nonexistent, unstamped) as covered "today"; unconditional total-N headline; no unreadable-watermark degraded mode | Operator's highest-stakes decision made on an overstated disclosure | 3 bounded text edits (applied) | high |
| F2 (high/root cause) | ADR-043/044 wiring vs ADR-041 §5 watermark requirement | New chokepoints stamp the watermark at birth | Neither ADR mentioned `storage_write_watermark` | Every new uncovered path re-opens the gap ADR-041's inventory exists to close | Add watermark-stamping obligation bullet (applied to both) | high |
| F3 (medium→escalation) | ADR-044 vs ADR-043's reserved-key rule | Consistent claim about allow-list transition | "Until ADR-043 ships" vs ADR-043's permanent rejection | Domain-4 contradiction an implementer hits immediately | Reword to permanent legacy allow-list (applied) | high |
| F4 (medium→escalation) | Workspace-scoped join validation vs `posts.kind` | Chokepoint verifies resolved row's type/lens matches `contentType` | Only workspace match required; lens mismatch passes | Corrupts dedup, reverse lookups, orphan sweeps | Add lens/type-match check (applied) | high |
| F5 (medium→escalation) | `mergeTerm` "reversible narrative" vs `entry_terms` non-recoverability disclosure | Consistent reversibility claim | Contradiction: term-level ledger can't reconstruct dropped membership rows | Documents a false safety property | Disclose merge as non-reversible for membership (applied) | high |
| F6 (high) | ADR-043 validation rules vs ADR-022 §3's DDL interpolation | Strict name grammar | No grammar stated | Operator input reaching raw DDL text | Add grammar rule (applied) | high |
| F7 (medium/advisory) | ADR-044 sample vs its own prose claims | `taxonomy_revisions` in sample; outbox/attribution stated | All three absent | Same defect class ADR-043's fold already fixed once | Add sample, outbox bullet, attribution (applied) | high |
| F8 (low/advisory) | `content_type_revisions` sample index | Meaningful composite uniqueness | Vacuous (already implied by global PK) | Sample is the implementation template | Add `perTypeSeq` (applied) | high |
| F9 (low/advisory) | On-disk status lines vs audit-fold sections | Internally consistent | Contradictory ("not audited" + audit-fold present) | Confusing provenance | Correct status lines (applied) | high |

### Codex
| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| F1 (blocker) | ADR-043 grammar rule vs ADR-022 §3's `CAST(...AS {type})` | Field `kind` also grammar/enum-constrained | Only names constrained, not `kind` | DDL-injection class one level deeper than the round-2 fix caught | Closed field-kind enum + core-owned SQL mapping (applied) | high |
| F2 (blocker) | `mergeTerm` reversibility vs `entry_terms` exemption | Consistent claim | Mathematically impossible to fully reverse given the exemption | False safety property documented as fact | Disclose as destructive (applied) | high |
| F3 (high) | ADR-044 vs ADR-043 dependency | Consistent transition claim | Impossible as written | Unimplementable promise | Permanent legacy allow-list (applied) | high |
| F4 (medium) | Sample completeness | `taxonomy_revisions` present | Absent | Under-specified audit mechanism | Add sample (applied) | high |

### agy (Gemini)
| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| F-044-1 (blocker) | Same as Codex F3 | — | — | — | Applied | high |
| F-044-2 (blocker) | Same as Codex F2 | — | — | — | Applied | high |
| F-044-3 (blocker) | Sample + ecosystem obligations | `taxonomy_revisions`, outbox, watermark all present | All three absent | Breaks downstream integrations + storage snapshot integrity | Add all three (applied) | high |
| F-044-4 (blocker) | Polymorphic join injectivity under content mutation | A mutable `kind`/type should cascade to `entry_terms` | Claimed `posts.kind` changes post↔page in normal operation | **Verified against `src/features/post/post.ts`: `kind` is "fixed at creation; v1 has no post<->page conversion path," and `UpdatePostInput` has no `kind` field at all — the premise is false for the current design.** | No fix needed; disposition: disagree, with evidence | high (verified false) |
| F-043-1 (low) | Same as Fable F8 | — | — | — | Applied | high |

## Cross-Auditor Synthesis

### Converged Findings
- **Allow-list timing contradiction** (Fable F3, Codex F3, agy F-044-1) — three independent voices, three different severities (escalation/high/blocker), same underlying defect. Fixed.
- **`mergeTerm` false reversibility claim** (Fable F5, Codex F2, agy F-044-2) — three independent voices. Fixed.
- **Missing `taxonomy_revisions` sample + ecosystem obligations** (Fable F7, Codex F4, agy F-044-3) — three independent voices. Fixed.
- **Vacuous `content_type_revisions` index** (Fable F8, agy F-043-1) — two independent voices. Fixed.
- This is the strongest convergent evidence pattern in this run: three structurally different reviewers (an in-host Claude-family verifier working from falsification framing, an OpenAI model with live repo access, a Google model working packet-only) landed on the identical core ADR-044 defects from different angles. High confidence these are real.

### Single-Auditor Findings Worth Keeping
- **ADR-043 field-kind grammar gap** (Codex only, blocker) — Fable's grammar fix covered names, missed the `kind` field specifically; Codex's live repo access plus close reading of ADR-022 §3's template caught what a text-only reviewer plausibly wouldn't (it requires tracing exactly which tokens the index-provisioning DDL template interpolates). Fixed.
- **Lens-level injectivity at write time** (Fable only, escalation) — neither external auditor independently raised this specific gap (they raised the adjacent-but-distinct kind-*mutation* concern instead). Fixed anyway since it's cheap and the underlying concern (contentType not matching the resolved row's actual type) is real regardless of whether kind is ever mutated.

### Conflicts Or False Positives
- **agy's F-044-4 (kind-mutation cascade)** is a false positive against the actual codebase. agy's packet-only transport (no repo file access) means it reasoned from the ADR text's implicit assumption that `kind` might be mutable, rather than the actual code, which explicitly forbids this in v1 (`src/features/post/post.ts`: "Fixed at creation; v1 has no post<->page conversion path" — verified directly, `UpdatePostInput` has no `kind` field). This is exactly the kind of claim the Coordinator is required to verify rather than accept on authority — disposition: disagree, with cited evidence, not silently dropped.

### Missed-By-One Notes
- Only Codex had live repo access this round (via `-C`); agy worked packet-only. Codex's F1 (field-kind grammar) is plausibly a case where direct schema/template inspection caught a defect a text-only reviewer would need to trace much more carefully to find — worth remembering for future dispatch decisions on this kind of DDL-adjacent design work.

## Suggested Changes By Auditor

| Auditor | Suggested Change | Coordinator Handling |
|---|---|---|
| Fable | ADR-045 disclosure fixes (F1) | accept — implemented pre-dispatch |
| Fable | ADR-043/044 watermark stamping (F2) | accept — implemented (043 pre-dispatch, 044 this fold) |
| Fable | ADR-043 name grammar (F6) | accept — implemented pre-dispatch |
| Fable | ADR-044 allow-list wording (F3) | accept — implemented this fold |
| Fable | ADR-044 lens-match validation (F4) | accept — implemented this fold |
| Fable | ADR-044 merge reversibility disclosure (F5) | accept — implemented this fold |
| Fable | ADR-044 sample completeness (F7) | accept — implemented this fold |
| Fable | ADR-043 index fix (F8) | accept — implemented this fold |
| Fable | Status-line corrections (F9) | accept — implemented across the fold |
| Codex | Field-kind grammar/enum (F1) | accept — implemented this fold |
| Codex | Merge reversibility disclosure (F2) | accept — same fix as Fable F5, already implemented |
| Codex | Allow-list wording (F3) | accept — same fix as Fable F3, already implemented |
| Codex | `taxonomy_revisions` sample (F4) | accept — same fix as Fable F7, already implemented |
| agy | Allow-list wording (F-044-1) | accept — already implemented |
| agy | Merge reversibility disclosure (F-044-2) | accept — already implemented |
| agy | Sample + outbox/watermark (F-044-3) | accept — already implemented |
| agy | `contentType` cascade-update mandate (F-044-4) | **reject** — premise verified false against live code; no cascade needed since `kind` is immutable post-creation in v1 |
| agy | ADR-043 index fix (F-043-1) | accept — same fix as Fable F8, already implemented |

## Coordinator Response

### Agree
All convergent findings (allow-list contradiction, merge reversibility, missing sample/ecosystem obligations, vacuous index) and both single-auditor findings that survived verification (field-kind grammar, lens-level injectivity). Three independent reviewers landing on the same core defects from different angles is strong evidence; both single-voice findings held up under direct verification against the ADR-022 §3 template and the write-chokepoint design respectively.

### Change
Nothing beyond what's captured in the disposition table — every accepted finding was fixed directly in the ADR files this session, not deferred.

### Disagree
agy's F-044-4 (kind-mutation cascade). Checked directly against `src/features/post/post.ts`: `kind` is explicitly documented as fixed at creation with no post↔page conversion path in v1, and `UpdatePostInput` (the only mutation surface for an existing post) structurally has no `kind` field. The premise the finding depends on — that a post's kind changes during normal operation — does not hold for the current design. This is disclosed here rather than silently dropped, consistent with the disposition-gate requirement for a "disagree."

### Proposed Fix Handling
Accept as-is for every convergent and verified single-voice finding (17 of 18 total proposed fixes); reject agy's cascade-update mandate with cited evidence. All accepted fixes are already applied to `ADR-043-collections.md` and `ADR-044-categories-and-tags.md` — see the Proposed-Fix Disposition Gate table below for the complete accounting.

## Proposed-Fix Disposition Gate

| Finding | Source(s) | Disposition | Rationale |
|---|---|---|---|
| ADR-045 disclosure exhaustiveness/coverage claim | Fable F1 | agree-implement | Fixed pre-dispatch (3 edits to ADR-045 §2/§3/§4) — verified by both external auditors as resolved, no remaining finding on ADR-045 |
| ADR-043/044 watermark-stamping obligation | Fable F2 | agree-implement | ADR-043 fixed pre-dispatch; ADR-044 fixed this fold (bundled with F-044-3) |
| ADR-043 key/field-name grammar | Fable F6 | agree-implement | Fixed pre-dispatch |
| ADR-043 field-kind grammar (deeper gap) | Codex F1 | agree-implement | Fixed this fold — extended the grammar bullet with a closed kind enum + core-owned SQL mapping |
| ADR-044 allow-list "until ADR-043 ships" contradiction | Fable F3, Codex F3, agy F-044-1 | agree-implement | Fixed this fold — three convergent voices; reworded to permanent legacy allow-list in 3 places |
| ADR-044 lens-level injectivity at write time | Fable F4 | agree-implement | Fixed this fold — extended the workspace-scoped join-resolution bullet |
| ADR-044 `mergeTerm` false reversibility claim | Fable F5, Codex F2, agy F-044-2 | agree-implement | Fixed this fold — three convergent voices; disclosed as non-reversible for membership, consistent with the existing `entry_terms` exemption |
| ADR-044 missing `taxonomy_revisions` sample + outbox/watermark obligations | Fable F7, Codex F4, agy F-044-3 | agree-implement | Fixed this fold — three convergent voices; added sample table + outbox/watermark wiring bullet |
| ADR-043 vacuous unique index | Fable F8, agy F-043-1 | agree-implement | Fixed this fold — added `perTypeSeq` |
| ADR-043/044/045 stale status-line contradictions | Fable F9 | agree-implement | Fixed across the fold — all three status lines now reflect the real (multi-round) audit history |
| ADR-044 `contentType` cascade-update mandate for kind mutation | agy F-044-4 | **disagree** | Verified false against `src/features/post/post.ts`: `kind` is fixed at creation, no post↔page conversion path exists in v1, `UpdatePostInput` has no `kind` field. No implementation needed. |

Re-verification after implementing the `agree-implement` set: re-read both edited files, confirmed triple-backtick and bold-marker counts are balanced (no broken markdown), confirmed each fix's cross-reference (e.g. ADR-045 pointing to ADR-043's watermark bullet) resolves to text that actually exists post-edit.

## Audit Outcome

- **This round: FAIL** (dual gate: validated blockers existed at every stage — internal F1; external Codex F1/F2; external agy F-044-1/2/3 — and every score was below the 8.5 floor: Fable 8.0, Codex 7.8, agy 6.5).
- **All findings from this round are now fixed or explicitly dispositioned** (17 agree-implement, all applied; 1 disagree, evidenced). No finding was silently dropped.
- **Recommended next step: one confirming re-audit round** before treating these three ADRs as ready for spec work without reservation — this exact pattern (fold fixes, then re-dispatch to confirm) is what took ADR-041 to its own eventual unanimous PASS across 3 rounds. This round's fixes are substantial (11 distinct defects across 2 files) and, while each is individually well-evidenced and cross-checked against live code where relevant, a confirming pass is the only way to know whether the fold introduced anything new or missed a subtler interaction between the fixes (e.g. does the new `taxonomy_revisions` sample's `pluginId` column actually compose cleanly with the merge-reversibility disclosure's wording?).
- Not a stop condition, not blocked — this is a normal, expected point in an iterative audit-fold cycle, not a sign the underlying designs are unsound. ADR-045 in particular is now clean across both external auditors' fresh review.

## Decision Points For User

- **Run a confirming round-4 re-audit** on ADR-043/044 now (cheap — the fix set is bounded and specific, unlike a fresh full pass), or **proceed to spec/outline work treating this round's fixes as sufficient**, accepting that a subsequent audit might still be owed before these ADRs formally reach Accepted status. Recommended: confirming round, given ADR-044 specifically had the highest finding density of anything in this batch (11 of 18 total findings).
- **Human owner sign-off** is still explicitly required before any of these three ADRs can move from PROPOSED to Accepted — this audit closes the adversarial-review gate, not the ownership gate. None of the three status lines claim Accepted.
- **What would raise scores to 10:** Fable named none beyond the fixed findings; Codex's and agy's "path to 10" items are fully covered by the fixes already applied this fold — a re-audit would be testing whether they actually landed, not chasing new items.
