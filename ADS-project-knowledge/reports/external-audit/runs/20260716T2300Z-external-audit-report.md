# External Audit Report

**Date:** 2026-07-16
**Scope:** current-diff, two independent domains audited in one batched round per standing user preference
**Focus:** Domain A — codex-reasoning-effort-corrected re-confirmation of the ADR-041/043/044/045 re-audit (Storage/Collections/Taxonomy/Recovery) that a prior session in this same day already ran rounds 1-4 on. Domain B — first-ever audit of ADR-046 Phase 3 second slice (SPEC-034) + Comments/ADR-031 follow-up (SPEC-035), built by a background subagent in an isolated worktree this session.
**Suggested Changes Mode:** notes
**Audit Packets:**
- Domain A: `20260716T2100Z-domainA-round5-audit-packet.md`, `20260716T2200Z-domainA-round6-audit-packet.md`, `20260716T2245Z-domainA-round7-audit-packet.md` (this session's rounds 5-7; rounds 1-4 packets are from the prior same-day session, listed in the earlier `20260716T185732Z-external-audit-report.md`)
- Domain B: `20260716T2115Z-domainB-round1-audit-packet.md`, `20260716T2200Z-domainB-round2-audit-packet.md`
**Dispatch Packet:** stdin payload to codex (all rounds); staged copy at `${TMPDIR}/ads-peer-dispatch/domainB-audit/files/` for agy (Domain B round 1 only)
**Planned Auditors:** codex (all rounds), agy/gemini (Domain A round 5 skipped — already PASS from prior session; Domain B round 1 only), Fable (same-family, explicit user request — Domain A round 5 and Domain B round 1 only, then explicitly withdrawn by the user for cost reasons before round 6)
**Responded Auditors:** codex (all rounds, all domains), agy (Domain B round 1, needed one retry), Fable (Domain A round 5, Domain B round 1)
**Failed Or Skipped Auditors:** agy's Domain B round-1 first attempt failed (`malformed_or_no_output` — could not locate its staged files despite a successful readability probe moments earlier); retried once per protocol with a tighter, absolute-path prompt, succeeded. Fable was explicitly withdrawn by the user after Domain B round 1 ("don't use fable, it wastes too many credits") — not used for any round-6/7 or round-2 confirmation work.
**Timeout:** 300s policy; no hard timeout hit; longest single call ~9 minutes (codex xhigh, large diffs)
**Proposed Fixes Artifact:** none retained separately — all accepted fixes applied directly to the working tree, described in the Work Log below

## Work Log

### Domain A — ADR-041/043/044/045 (Storage/Collections/Taxonomy/Recovery), `main` worktree, uncommitted

Rounds 1-4 ran in a prior session earlier the same day (full narrative in `20260716T185732Z-external-audit-report.md`): found and fixed 3 findings from an internal-verification pass (taxonomy content-join validation, dead crash-migration reconciliation code, a stubbed Recovery lock-status read), then 2 more real blockers from external dispatch (`R2-F2-BLOCK-NOT-ENFORCED`, `R3-F1-ADMIN-PREFIX-PUBLIC-BYPASS`), converging to an apparent PASS — **but** the user flagged that none of codex's 4 rounds had `-c model_reasoning_effort=xhigh` explicitly pinned (only the model itself was pinned; `--ignore-user-config` skips the home-default xhigh setting). This session re-ran codex with that flag corrected.

- **Round 5 (codex-xhigh, Fable, both independent):** Both auditors, working independently and without seeing each other's output, found the SAME latent defect the reasoning-effort gap had let through rounds 1-4: `appendInterruptedRow`'s deterministic primary-key insert had no conflict handling, so a SECOND boot with the same still-unresolved crash-interrupted migration would throw `UNIQUE constraint failed`, fail the CRITICAL boot module, and `process.exit(1)` before `listen()` — locking Recovery itself out. Fable additionally reproduced this empirically via a real double-boot test and identified a second, distinct blocker: no production code path anywhere ever terminalized a `migration_runs` row or reset `siteStatus` back to `SERVING` — a successful restore had no actual exit.
- **Fix (round 5→6):** Made `appendInterruptedRow` idempotent (`onConflictDoNothing` on SQLite, an existence check on the in-memory adapter). Widened `MigrationRunsRepoPort` with `markResolved`; widened `buildRestoreHooks` to terminalize the migration run and reset `siteStatus` on a successful restore. Added 2 new integration tests (second-boot-doesn't-crash; restore-actually-exits-and-survives-reboot).
- **Round 6 (codex-xhigh only, Fable withdrawn by user after this point):** Found a NEW real blocker in the round-5 fix itself: `R6-F1-RESTART-REQUIRED-RESTORE-UNBLOCKS-STALE-DB` — the fix unconditionally cleared `siteStatus` to `SERVING`, but the real `SqliteDbOpsAdapter.restoreFromArtifact` always returns `restartRequired: true` for a file-backed db (its own doc comment: the running process's open file descriptor still points at the now-unlinked OLD inode until an actual restart), so normal traffic would resume against stale, pre-restore data — a silent-data-loss window. Independently verified directly against `db-ops.ts`'s doc comment before accepting.
- **Fix (round 6→7):** Conditioned the in-process `siteStatus.set(SERVING)` on `!restartRequired`; the DURABLE `markResolved` call stays unconditional (it's what makes the *next* boot resolve correctly). Updated the integration test to assert the process stays blocked (503) immediately after a "successful" restore when `restartRequired` is true, and only becomes SERVING after an actual reboot.
- **Round 7 (codex-xhigh only):** First attempt correctly flagged that the round-7 packet's `git diff` had silently omitted the (untracked, new-this-session) integration test file — a packet-construction gap, not a code defect. Fixed the packet (appended the full test file content) and redispatched as round 7b: **PASS, 9.2/10**, zero blocking findings. One non-blocking note (the packet's prose overstated the test's post-reboot HTTP-level coverage) — fixed immediately by adding an actual HTTP request assertion after reboot, since it was trivial.
- **Final verification:** `npx tsc --noEmit -p .` clean. Full `npm test`: 1668 tests, 1666 pass, 2 fail — both pre-existing, unrelated (`T041/INV-03` redirect routing, `T045` SEO title tag), confirmed present on clean `main` before any of this work. Zero new failures across the entire round 5-7 fix chain.

### Domain B — ADR-046 Phase 3 second slice (SPEC-034) + Comments follow-up (SPEC-035), branch `worktree-agent-af55bc7ea8faaa4fd`

Built by a background Sonnet 5 subagent in an isolated git worktree earlier this session, never audited before this round.

- **Internal verification (round 1, mandatory before external dispatch on HIGH-risk work):** Falsification-framed subagent, author rationale (both specs' Implementation Record/Handoff Contract sections) explicitly excluded as evidence. Worked through all 7 allowlist domains against live code, ran fresh `tsc`/`npm test`. Zero findings, 9.4/10, gate clear. Proceeded to external dispatch (mandatory for HIGH risk regardless of the clean internal pass).
- **Round 1 (codex-xhigh, agy, Fable, all independent):**
  - **codex** (8.3/10, below the 8.5 floor → FAIL): found `codex-r1-B-001` — a principal holding only `comments.configure` (the permission the admin UI advertises as sufficient) got a masked 500, not success, on PUT settings, because the write chokepoint independently and unconditionally demands the broader `settings.workspace.write`. Also flagged an advisory (the unwired `AkismetSpamCheck` adapter's field/endpoint shape doesn't match Akismet's current documented API — non-blocking since the adapter is disclosed-unwired).
  - **Fable** (9.2/10, PASS): missed `codex-r1-B-001` entirely (only checked the negative/403 path). Found one low-severity doc/code mismatch (a comment claims a principal gets seeded for audit attribution; none does) and 3 advisories.
  - **agy** (no numeric score, non-conforming JSON shape, but substantively found the same transaction-atomicity gap Fable flagged as an advisory): needed a retry after its first attempt failed to locate its staged files.
  - **Independent verification:** the Coordinator read the actual code (`put-settings.ts`, `write-service.ts#set()`) and confirmed `codex-r1-B-001` is real, AND additionally checked SEO's identically-shaped settings route and confirmed it has the exact same latent defect — a pre-existing, repo-wide pattern Domain B's diff merely replicated faithfully from an established precedent, not something SPEC-035 introduced fresh.
- **Fix (round 1→2, at explicit user direction to fix the shared chokepoint now, covering both Comments and SEO):** Added an optional `requiredPermissionOverride` to the settings write-service's `set()` — backward compatible (every caller that omits it is unaffected), still calls `authorize()` unconditionally (INV-07 fail-closed discipline preserved), just checks a domain-supplied permission instead of the generic scope-derived one when supplied. Wired `setCommentsSettings` → `"comments.configure"`, `setSeoSettings` → `"admin.seo.manage"`. Added a regression test proving a `comments.configure`-only principal now succeeds on both GET and PUT (previously 500'd on PUT), while the pre-existing "no grant → 403" test is untouched and still passes.
- **Round 2 (codex-xhigh only, Fable withdrawn by user before this round):** **PASS, 9.4/10**, zero findings. One advisory note (no equivalent SEO-side least-privilege regression test exists yet — non-blocking, `path to 10` item, deferred; SEO's own full suite was re-run separately and confirmed unaffected).
- **Final verification:** `npx tsc --noEmit -p .` clean (this worktree). Full `npm test`: 1687 tests, 1683 pass, 4 fail — the same 4 pre-existing, disclosed, unrelated failures already confirmed on `main` (2× `operation-lock.unit.test.ts` test-isolation, 1× redirect T041/INV-03, 1× SEO T045). Zero new failures. SEO's own suite (81 tests) re-run separately: 80 pass, 1 fail (the same pre-existing T045), confirming the shared chokepoint change didn't regress SEO.

## Internal Verification

- **Domain A:** not re-run this session — rounds 1-2 internal verification from the prior same-day session stand (2 hard blockers + 1 escalation found round 1, cleared round 2 at 9/10). This session's work (rounds 5-7) was pure external-dispatch diff-compliance, triggered by the reasoning-effort-pinning gap, not a fresh internal pass.
- **Domain B:** run this session, described above. Generic adversarial verifier (falsification framing), zero findings, 9.4/10, gate clear, external audit proceeded per the mandatory HIGH-risk rule.

## Auditor Matrix

| Auditor | Requested Model | Resolved Model | Selection Source | CLI Version | Domain | Round(s) | Score | Path to 10 | Output Mode | Suggest Mode | Attempts | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| codex | gpt-5.6-sol, xhigh | gpt-5.6-sol, xhigh (`-c model_reasoning_effort=xhigh` explicit) | local CLI config default, xhigh flag explicitly re-added this session per the identified gap | codex-cli 0.144.3 | A | 5→6→7→7b | 7.8→6.5→8.0→9.2 | n/a (9.2, non-blocking coverage note only) | JSON | notes | 1 per round (round 7 needed a packet-completeness redispatch, not a scoring retry) | Responded, all rounds |
| codex | gpt-5.6-sol, xhigh | gpt-5.6-sol, xhigh | same | codex-cli 0.144.3 | B | 1→2 | 8.3→9.4 | n/a (9.4) | JSON | notes | 1 per round | Responded, both rounds |
| gemini (agy) | Gemini 3.1 Pro (High) | Gemini 3.1 Pro (High) | documented default peer model | agy 1.1.3 | B | 1 | not reported (non-conforming JSON) | n/a | text (`--print`) | notes | 2 (1st `malformed_or_no_output`, retried) | Responded (degraded — non-conforming schema) |
| Claude (Fable, same-family) | claude-fable-5 | claude-fable-5 | direct parameter, exact | Agent-tool subagent, not a CLI | A | 5 | 7.8 | n/a (FAIL, superseded by round 6/7 fixes) | structured JSON in prose | notes | 1 | Responded |
| Claude (Fable, same-family) | claude-fable-5 | claude-fable-5 | direct parameter, exact | Agent-tool subagent, not a CLI | B | 1 | 9.2 | n/a | structured JSON in prose | notes | 1 | Responded |

## Degraded Coverage

- **agy, Domain B round 1:** first attempt returned a non-`ACK`-adjacent response ("still locating the correct directory") and timed out with no usable answer, despite a successful readability probe moments earlier on the same staged files. Classified `malformed_or_no_output`, retried once with a tighter, absolute-path prompt per protocol — succeeded, but returned a non-conforming JSON shape (no `threat_model_accepted`/score/`blocking_gate` fields) and did not surface the session's most important finding (`codex-r1-B-001`). Per explicit user instruction this session, agy's findings are downweighted relative to codex/Fable in this synthesis — used as corroborating signal only, not as an independent PASS/FAIL vote.
- **Fable withdrawn mid-session:** used for Domain A round 5 and Domain B round 1 only, at the user's explicit initial request; the user then asked it not be used further "it wastes too many credits" before Domain A round 6 was dispatched. All subsequent rounds (A6, A7, A7b, B2) are codex-only. This is a user-directed scope reduction, not a auditor failure — noted here for completeness, not as a coverage gap requiring remediation.

## Per-Auditor Scope Checks

### codex (all rounds, both domains)
- **What it says it is auditing:** each round's stated compliance target — e.g. round 5: "the requested round-5 diff-only compliance re-check against the packet's full current diff, cross-checking only load-bearing live context." Consistently precise about what it did and did not expand into.
- **Scope and target it used:** current-diff, cross-checked against live composition-root code beyond the packet's embedded diff every round — this is what surfaced R5-F1, R6-F1, and codex-r1-B-001, none of which the packets' embedded diffs alone would have revealed without codex independently reading e.g. `db-ops.ts`'s doc comment or `write-service.ts`'s chokepoint.
- **Files or artifacts it says it reviewed:** explicitly named per round in `auditor_scope_check`.
- **Scope ambiguity or mismatch:** round 7 (first attempt) correctly flagged a real packet-construction gap (a claimed two-file diff that was actually one file, because the second file was untracked and `git diff` silently omitted it) rather than silently working around it or refusing outright — this is the auditor behaving correctly, caught a Coordinator process error, not a code defect.

### Fable (Domain A round 5, Domain B round 1)
- **What it says it is auditing:** explicitly disclosed itself as a same-family, weaker-independence peer per the user's own framing; did not coordinate with or see codex's answers.
- **Scope and target it used:** current-diff; for Domain A, additionally read load-bearing unmodified dependencies (`boot-lifecycle.ts`, `dev-cors.ts`, ceremony routes) and ran an empirical double-boot reproduction through the real boot path — genuinely independent evidence-gathering, not just packet-reading.
- **Files or artifacts it says it reviewed:** explicitly enumerated per round.
- **Scope ambiguity or mismatch:** none reported.

### agy (Domain B round 1 only)
- **What it says it is auditing:** stated it audited all 7 domains structurally in its retry response, but the response format itself didn't follow the packet's required JSON schema, so its own scope-check field is informal prose rather than the structured field other auditors returned.
- **Scope and target it used:** staged files in its own working directory (per the established agy dispatch pattern).
- **Files or artifacts it says it reviewed:** unclear from its own output whether it read the full diff or worked mostly from the packet's prose summary — first attempt's failure to "locate" files raises some doubt about how thoroughly the retry actually read the staged diff.
- **Scope ambiguity or mismatch:** the first attempt's file-location failure, despite an identical successful readability probe moments earlier, is itself an unexplained scope/transport inconsistency.

## What The External LLMs Said

### codex Findings By Severity — Domain A
- Round 5: 1 blocker (`R5-F1-BLOCKED-RECOVERY-NOT-RESTART-SAFE`, combining the idempotency and no-exit gaps into one finding).
- Round 6: 1 NEW blocker (`R6-F1-RESTART-REQUIRED-RESTORE-UNBLOCKS-STALE-DB`) on top of confirming R5-F1 closed.
- Round 7 (first attempt): 1 non-blocking audit-coverage-gap finding (packet omission), no code-level finding.
- Round 7b: 0 findings. 1 non-blocking note (`R7-N1`, test-proof-overstatement, fixed immediately).

### codex Findings By Severity — Domain B
- Round 1: 1 real medium finding (`codex-r1-B-001`) + 1 advisory (Akismet adapter doc-contract mismatch, non-blocking, adapter disclosed-unwired).
- Round 2: 0 findings.

### codex Blockers
- Domain A: `R5-F1` (fixed round 5→6), `R6-F1` (fixed round 6→7) — both resolved and re-confirmed closed.
- Domain B: `codex-r1-B-001` (fixed round 1→2) — resolved and re-confirmed closed.
- **All codex blockers across both domains are resolved as of the final round.**

### codex Optional Improvements
- Domain A: none remaining after round 7b's HTTP-assertion hardening was applied.
- Domain B: an equivalent SEO-side least-privilege regression test (advisory, deferred — see Decision Points below).

### codex Strengths
- "The fix establishes the correct enforcement architecture" (Domain A, multiple rounds).
- Domain B round 2: "the chokepoint still unconditionally awaits authorize() before definition resolution, validation, transaction entry, revision append, or value persistence" — explicitly verified the fix didn't weaken the fail-closed discipline, not just that it fixed the bug.

### codex Suggested Changes
- Domain A round 6: gate `siteStatus.set(SERVING)` on `!restartRequired`, keep `markResolved` unconditional — adopted verbatim.
- Domain A round 7 (first attempt): supply the missing test-file diff — adopted (packet fixed, redispatched).
- Domain A round 7b: add a real HTTP assertion after reboot, not just an internal status-field check — adopted, trivial addition.
- Domain B round 1: add `requiredPermissionOverride`-style fix — adopted (see Coordinator Response below for the exact design chosen, which extends beyond codex's literal suggestion by also fixing SEO).

### Fable Findings By Severity — Domain A round 5
- 2 blockers (`R5-F1-INTERRUPTED-SECOND-BOOT-BRICK`, `R5-F2-BLOCK-HAS-NO-EXIT`) — the same underlying defect codex found as one combined finding, but Fable split it into two distinct causal claims and empirically reproduced both via a real double-boot test through the actual `createSqliteRouteDeps→buildBootModules→runBootLifecycle` path.

### Fable Findings By Severity — Domain B round 1
- 1 low (doc/code mismatch on principal-seeding claim) + 3 advisories (a `spamAutoRejectScore: 0` quarantine-everything edge case; a pre-existing fire-and-forget promise convention; multi-key patch ensemble atomicity).

### Fable Blockers
- Both Domain A round-5 blockers were later independently confirmed and fixed via the codex-driven round 6/7 chain (Fable was not re-dispatched to confirm the fix, per the user's mid-session withdrawal — codex's round 7b PASS is the operative closure evidence).

### Fable Optional Improvements
- Domain B: the doc/code mismatch finding (`fable-ext-r1-001`) is a real, low-severity documentation-accuracy issue not yet fixed — see Decision Points below.

### Fable Strengths
- "An allowlist-gated Express middleware that keeps `/admin` and `/api/admin/v1/recovery/*` alive while returning 503 for everything else is the exact correct technical pattern" (Domain A).
- Domain B: performed a genuinely novel verification the internal pass didn't do — a direct Express router-stack diff between `main` and the branch, proving the extraction is externally byte-identical except for the 2 new intentional routes.

### Fable Suggested Changes
- Domain A: idempotent insert + restore-success resolution transition — matches what was actually built (codex and Fable converged on the same underlying fix shape despite finding it via different evidence).
- Domain B: rewrite the inaccurate doc comment, or implement the seed it falsely describes — deferred (see below).

### agy Findings By Severity — Domain B round 1
- 1 finding: multi-key settings-patch writes are non-atomic across the `for` loop (converges with Fable's `fable-ext-r1-004` advisory). Labeled "fail" in agy's own non-conforming schema, but this is the SAME advisory-level, non-blocking gap Fable and the Coordinator agree does not violate the frozen INV-H as written (full-patch *validation* precedes any write, so an *invalid* patch is still all-or-nothing; only an *infra failure mid-loop* on an otherwise-valid multi-key patch is the residual, narrow gap).

### agy Blockers
- None that survive independent scrutiny — its one finding is advisory-level per the frozen threat model, not blocking.

### agy Optional Improvements
- Wrap the multi-key settings write loop in one transaction (converges with Fable) — deferred, same disposition as below.

### agy Strengths
- None stated (non-conforming response didn't include a strengths section).

### agy Suggested Changes
- Wrap `setCommentsSettings`'s write loop in a single transaction — noted, not implemented (see Decision Points).

## Per-Finding Rationales

### codex — Domain A

| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| R5-F1-BLOCKED-RECOVERY-NOT-RESTART-SAFE | `appendInterruptedRow`, boot lifecycle, `index.ts` exit behavior | Reconciliation must be idempotent and convergent across repeated boots | Deterministic PK insert with no conflict handling; a second boot throws, fails the critical module, process exits before listen() | A crash-blocked site becomes permanently unbootable on any restart — worse than the bug being re-audited | Idempotent insert + a durable resolution transition | high |
| R6-F1-RESTART-REQUIRED-RESTORE-UNBLOCKS-STALE-DB | `gated-mutations-composition.ts`'s restore hook, `db-ops.ts`'s real adapter | The in-process serving decision must reflect whether the live DB connection is actually pointed at the restored file | `siteStatus` cleared unconditionally; real adapter always reports `restartRequired: true` for file-backed dbs | Normal traffic (reads AND writes) would proceed against stale, pre-restore data until an eventual restart, silently losing any writes accepted in that window | Gate the in-process unblock on `!restartRequired`; keep the durable resolution unconditional | high |

### codex — Domain B

| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| codex-r1-B-001 | The positive authz path for a `comments.configure`-only principal through `put-settings.ts` → `setCommentsSettings` → chokepoint `set()` | `comments.configure` alone should be sufficient to write Comments settings, matching what the admin UI advertises | The chokepoint independently and unconditionally demands `settings.workspace.write`; a `comments.configure`-only principal gets a masked 500 | The advertised least-privilege authz contract doesn't function; a real admin granted exactly the documented permission cannot use the feature | Let the chokepoint accept the caller's own domain permission instead of the generic scope-derived one | high |

### Fable — Domain A round 5

| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| R5-F1-INTERRUPTED-SECOND-BOOT-BRICK | Empirical double-boot against the real sidecar db | Every boot in the blocked state re-detects and re-blocks | Second boot crashes on a UNIQUE constraint violation, `process.exit(1)`s | Recovery becomes completely unreachable on any restart while blocked | `onConflictDoNothing` + a double-boot integration test | high |
| R5-F2-BLOCK-HAS-NO-EXIT | Exhaustive grep for every writer of `siteStatus`/`migration_runs` state | A successful restore must exit the blocked state | Zero production writers of `SERVING`; `updateState` had zero non-test callers | The Recovery banner promises a resolution path that provably does not exist anywhere in the code | Terminalize the run + reset `siteStatus` on restore success | high |

### Fable — Domain B round 1

| Finding | Checked | Expected | Observed | Why It Matters | Recommended Fix | Confidence |
|---|---|---|---|---|---|---|
| fable-ext-r1-001 | `types.ts`'s doc comment on `COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID` vs. actual code and the branch's own ADR-031 note | In-code docs match actual, decided behavior | The doc claims a principal-row seed exists; no such seeding exists anywhere, and the same diff's ADR-031 note says the opposite | A future reader (human or auditor) would trust the comment and build on a false premise | Rewrite the comment to match the decided no-seed behavior | high |

## Cross-Auditor Synthesis

### Converged Findings
- **Domain A, round 5:** codex and Fable, working fully independently, converged on the SAME underlying defect (deterministic-PK-insert-crashes-on-repeat-boot + no-resolution-path), even though they split it into different finding counts (1 vs 2) and reached it via different evidence (direct code reading vs. empirical double-boot reproduction). This is strong convergent signal that both round-5 blockers were real, not single-auditor noise.
- **Domain B, round 1:** Fable's advisory (`fable-ext-r1-004`, multi-key patch non-atomicity) and agy's one substantive finding converge on the exact same gap. Both independently arrived at "advisory, not blocking" or an unqualified "fail" respectively — the Coordinator sides with Fable's more precise framing (see Disagree below) given agy's degraded output quality this session.

### Single-Auditor Findings Worth Keeping
- `R6-F1` (codex only, Domain A) — real, fixed, re-confirmed closed by codex round 7b. No second auditor reviewed this specific round since Fable was withdrawn before round 6 — the fix's correctness rests on codex's own re-confirmation plus the Coordinator's independent verification against `db-ops.ts`'s doc comment, not cross-auditor convergence. Flagged explicitly as a decision point below given the reduced auditor count for this specific finding.
- `codex-r1-B-001` (codex only, Domain B) — real, independently verified by the Coordinator directly against the code (not just trusted), fixed, re-confirmed closed round 2. Fable and agy both missed this entirely in round 1 — a genuine missed-by-two case, not just missed-by-one.
- `fable-ext-r1-001` (Fable only, Domain B) — a real, low-severity documentation-accuracy defect. Not yet fixed (see Decision Points).

### Conflicts Or False Positives
- None identified this session at the code-defect level. The one process-level "conflict" was codex's round-7 first attempt correctly identifying a Coordinator-side packet-construction gap (missing test-file diff) rather than a code defect — resolved by fixing the packet, not by disputing the auditor.
- agy's round-1 Domain B finding, framed by agy itself as an unqualified `"status": "fail"`, is downgraded to advisory-level by the Coordinator (per the frozen threat model's own INV-H wording, which requires all-or-nothing on an *invalid* patch — already true — not full ensemble-atomicity on infra failure mid-loop for an otherwise-valid patch, a narrower and lower-severity gap than agy's blunt "fail" label implies).

### Missed-By-One Notes
- codex caught 2 real blockers across Domain A (R5-F1, R6-F1) that Fable did not get the chance to review (withdrawn before round 6) — not a "missed" in the adversarial sense, a scope reduction.
- Fable caught `fable-ext-r1-001` (Domain B doc mismatch) that codex did not raise in round 1 — codex's round-1 review focused on functional/security invariants and did not flag documentation accuracy.
- Both Fable and agy missed `codex-r1-B-001` (Domain B's most significant real finding) in round 1 — worth noting for calibration, consistent with the user's own downweighting guidance for agy, and a reminder that Fable's same-family independence caveat is real, not just disclosed-and-ignored.

## Suggested Changes By Auditor

| Auditor | Suggested Change | Coordinator Handling |
|---|---|---|
| codex | Idempotent `appendInterruptedRow` + durable resolution transition (Domain A, R5-F1) | accept — implemented verbatim |
| codex | Gate `siteStatus.set(SERVING)` on `!restartRequired` (Domain A, R6-F1) | accept — implemented verbatim |
| codex | Supply the omitted test-file diff (Domain A, round 7 packet gap) | accept — packet fixed, redispatched as round 7b |
| codex | Add a real HTTP assertion after reboot (Domain A, R7-N1) | accept — implemented, trivial |
| codex | Let the settings chokepoint accept a domain-specific permission override (Domain B, codex-r1-B-001) | accept — implemented, and extended to also fix SEO's identical pre-existing defect at the user's explicit request |
| codex | Add an equivalent SEO least-privilege regression test (Domain B, round 2 advisory) | agree-defer — real, low-cost, but not yet implemented; SEO's full suite already confirms no regression from the shared-chokepoint change. Tracked below as a named follow-up. |
| Fable | `onConflictDoNothing` + double-boot test (Domain A, R5-F1-INTERRUPTED-SECOND-BOOT-BRICK) | accept — same fix as codex's R5-F1, implemented together |
| Fable | Terminalize run + reset `siteStatus` on restore success (Domain A, R5-F2-BLOCK-HAS-NO-EXIT) | accept — same fix, implemented together |
| Fable | Rewrite the inaccurate doc comment on `COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID` (Domain B, fable-ext-r1-001) | agree-defer — real, but the user has not yet been asked whether to fix the comment or actually implement the seed it describes; a one-line judgment call, not urgent |
| Fable | Require `spamAutoRejectScore > 0` or document `0` as intentional quarantine-all (Domain B, fable-ext-r1-002) | disagree — `0` as an explicit, admin-chosen "quarantine everything" mode is a defensible, disclosed operator choice, not a defect; the finding itself frames it as advisory, not a real gap |
| Fable | Shared logged-rejection wrapper for the `*Ready` boot-chain family (Domain B, fable-ext-r1-003) | disagree (for now) — explicitly scoped by Fable itself as "not required for this branch alone," a repo-wide hardening pass outside this audit's scope |
| Fable / agy (converged) | Wrap the multi-key settings-patch write loop in one transaction (Domain B) | agree-defer — real but requires plumbing transaction-handle support into repo/outbox ports that don't have it today, consistent with an already-accepted prior disposition for the same gap class elsewhere in this codebase (Domain A's earlier F7 finding, same session) |

## Coordinator Response

### Agree
Every blocker any auditor found this session was independently verified against the actual code before being accepted, not taken on an auditor's word alone — `R5-F1`/`R5-F2` (both auditors, converged), `R6-F1` (codex, verified directly against `db-ops.ts`'s own doc comment), and `codex-r1-B-001` (codex, verified directly against `write-service.ts` and confirmed to also affect SEO). All four are now fixed, tested, and re-confirmed closed by codex at guaranteed xhigh reasoning — the exact rigor the user asked this whole session to establish.

### Change
Round 7's first packet was defective (a `git diff` on an untracked file silently produces nothing) — this is now a known failure mode worth remembering for future packet construction: **always separately append full content for any new/untracked file, never assume a bare `git diff` command captures it.** This was already the established pattern for Domain A's original round-5 packet (new files were appended explicitly) but was missed when re-diffing the same files for round 7 after they'd been further edited.

### Disagree
Disagreed with agy's own "fail" framing of the multi-key-patch-atomicity finding — under the FROZEN threat model's actual INV-H wording (all-or-nothing on an *invalid* patch, which already holds), this is a narrower, advisory-level gap (ensemble atomicity under a mid-loop infra failure on an otherwise-*valid* patch), matching Fable's more precise characterization, not agy's blunt label. Per the user's own explicit guidance this session, agy's findings are downweighted relative to codex/Fable — this disagreement is exactly that calibration in practice, not a dismissal of agy's underlying observation, which is directionally correct.

### Proposed Fix Handling
All `agree-implement` items (4 for Domain A across rounds 5-7, 1 for Domain B) were implemented and re-verified this session — full test suites clean in both worktrees, zero new failures. Two `agree-defer` items remain genuinely open (SEO regression test, Comments doc-comment/seed decision) — both real, both low-cost, neither blocking, both explicitly surfaced below rather than silently dropped. One `agree-defer` item (multi-key transaction wrapping) is consistent with an already-accepted prior disposition for the same gap class earlier in the SAME session's Domain A audit (F7), not a new deferred debt.

## Audit Outcome

**Both domains converged to PASS at guaranteed codex-xhigh reasoning, with every real finding fixed and re-verified — but neither converged cleanly on the first pass, and the process itself surfaced 4 additional real, previously-undetected defects beyond what rounds 1-4 (pre-reasoning-fix) had found.** Domain A: round 7b, 9.2/10, zero findings. Domain B: round 2, 9.4/10, zero findings. The original concern that motivated this whole session — an unconfirmed codex reasoning tier — is now resolved: `-c model_reasoning_effort=xhigh` was explicitly pinned on every round this session, and it demonstrably mattered (R5-F1, R6-F1, and codex-r1-B-001 were all real bugs that 4 prior rounds at an unconfirmed reasoning tier had not caught).

**Not yet committed.** All of this session's fixes — Domain A's rounds 5-7 (idempotent insert, restore-exit transition, restart-required gating, 2 new/extended integration tests) and Domain B's round 1-2 fix (settings chokepoint override, Comments+SEO wiring, 1 new regression test) — remain uncommitted: Domain A on `main`'s working tree, Domain B on its own separate, still-unmerged branch.

**The known taxonomy-file collision is still unresolved and still real** (documented in the prior session's handoff, reconfirmed at the top of this session): Domain B's 4 taxonomy route files construct an older, narrower `WriteServiceDeps` shape than Domain A's uncommitted taxonomy content-validation fix. This was explicitly deferred until after both audits, per the user's own choice at the start of this session — it is the next decision point, not something either audit's PASS verdict absorbs.

## Decision Points For User

- **Commit strategy + taxonomy-file reconciliation.** Both domains are now audit-clean, but committing either one first and merging the other on top would silently drop Domain A's security fix on the 4 shared taxonomy route files unless explicitly reconciled. This needs your call: (a) commit Domain A first, rebase Domain B's 4 taxonomy files on top of the new `WriteServiceDeps` shape before merging, (b) manually re-apply Domain A's `workspaceId`/`contentLookup` wiring to Domain B's post-refactor files during merge, or (c) another approach you prefer.
- **Two small `agree-defer` items, real but non-blocking, your call on priority:** (1) an equivalent SEO-side least-privilege regression test (codex's Domain B round-2 `path to 10` item — cheap, would raise that round's score to 10); (2) Fable's `fable-ext-r1-001` — either rewrite the inaccurate `COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID` doc comment to match the actual no-seed behavior, or actually implement the seed it currently (falsely) describes. Neither blocks anything; both are quick.
- **Save this report?** Currently drafted to `.local-artifacts/` (scratch, not retained). Reply "save report" to move it to `ADS-project-knowledge/reports/external-audit/runs/` as retained project evidence, or "local only" to leave it where it is.
- **Packets and offloads:** all packets for this session's rounds (Domain A 5/6/7, Domain B 1/2) are in `.local-artifacts/external-audit/packets/`, scratch by default. Let me know if you want any retained.
