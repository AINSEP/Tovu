<<SUBAGENT_DISPATCH>>
# FIX-WAVE FOLLOW-UP B + F9 (owner approved 2026-10-25 ~4:30 PM PT as part of the follow-up lane). Unattended: verify by measuring, never ask.
Read ../BRIEF.md (fix-wave brief: owner rules, OWNER DECISIONS pins), ../TEST-ANTIPATTERNS.md, RUN-PROTOCOL.md + COMMON.md first. Same rules: DI fakes, CCN ≤ 10, smallest change, MOVE "why" comments, failing test FIRST for any source change.

## Part 1 — Codex findings on finished lanes (files beside this brief: CODEX-F1/F2/F3/F5/F6.md). Continue each lane's branch.
Source fixes (real bugs, failing test first):
- F1 (Jini `cloud/fixwave-1025-F1`): aws-sigv4.ts:87 case-colliding headers — normalise the outgoing header map BEFORE adding generated headers and sign those exact values; collision regression.
- F3 (Jini `cloud/fixwave-1025-F3`): agent-runtime auth.ts:126 — keep the self-match fix but recognise explicit negative credential states ("<VAR> is empty", "<VAR> invalid") again; regressions both ways. chat question-answer.ts:42 — replace `labels.push(...selections)` with an iterative append ("never throws" contract).
- F5 (Jini `cloud/fixwave-1025-F5`): analytics ingest.ts:441 — CIDR must have exactly two slash-separated fields; regression for "10.0.0.0/0/24".
Test-quality findings: every MED/LOW in the CODEX files (F1 metadata + sqlite handle teardown; F2 unequal-score ordering, sidecar child cleanup, hard-link title; F3 note-store containment targets; F5 controlled timers; F6 pinned clock in member-password-auth.test.ts, test-owned temp root). Each strengthened test must FAIL against the mutation Codex describes (prove, revert).

## Part 2 — F9: Stryker L15 survivors (Tovu, NEW branch `cloud/fixwave-1025-F9` from `origin/cloud/overnight-1024-tovu`)
Work list: origin/cloud/stryker-1025-tovu:ADS-memory/reports/cloud-runs/2026-10-25-stryker/L15/REPORT.md (+ data/). Priority: (1) meilisearch provider (15–20 %, real gap), (2) agent-plugins commit-site (53.6 %, 81 no-cov), (3) s3-compatible targets (76.3 %), (4) cloudflare domain-status / zones, render deploy-ops, (5) desktop files listed as weakest. Security/credential paths first; negative tests for every guard. Re-score touched files with the L15 config (`--force`), before → after.

## HARD CAPS (first hit → stop, report, push, END)
2 h 30 m wall (stop new work at 2 h 10 m), ~0.9M tokens, no subagents. Do Part 1 source fixes FIRST, then Part 2 (1)–(3), then remaining test findings, then the rest. Never push main, never force-push, never npm publish, never touch any RemoteTrigger, never self-reschedule. Kill by pid only. Never leave test processes running. Never commit .stryker-tmp/coverage output.
Code pushes ONLY to the branches named above. Report → Tovu `cloud/fixwave-1025-reports` `ADS-memory/reports/cloud-runs/2026-10-25-fixwave/FU-B/REPORT.md` (`git pull --rebase` before push).

## REPORT
1. Headline (source bugs fixed, findings closed, F9 files + scores before → after). 2. Per item: test, mutation proof, commit. 3. NOT done. End "FU-B DONE <UTC>", wall, rough tokens.
