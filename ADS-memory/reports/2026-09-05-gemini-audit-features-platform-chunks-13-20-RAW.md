# Gemini Adversarial Audit (RAW, UNVERIFIED) — features/ + platform/, chunks 13-20

Generation-only pass. This file contains RAW Gemini 3.8 Flash claims, **none verified**.
A separate Claude Opus 5 verifier agent is responsible for confirming/discarding every
entry below against actual source. Nothing in this file should be treated as a confirmed
finding until that verification pass records it as such (in the companion verified report,
`2026-09-05-gemini-audit-features-platform.md`).

Auditor model: `gemini-3.8-flash-high` via `agy --print --model gemini-3.8-flash-high
--effort high --print-timeout 15m`, print mode, diff (and where noted, full file content)
pasted as text on stdin — no repo tool access given to Gemini.

## Scope enumeration (done fresh from source, not trusted from the dispatch brief)

The dispatch brief's premise — "cover whatever chunks 1-12 of the primary verified report
did not reach" — is **stale**. Read `2026-09-05-gemini-audit-features-platform.md` directly
(not a summary of it) and cross-referenced every one of its per-chunk commit lists against
the actual `git log --since="2026-09-03 00:00" --until="2026-09-05 00:00" -- apps/website/src/features
apps/website/src/platform` output (99 commits, confirmed matching the primary report's own
stated count).

Result: **chunks 1 through 16a of the primary report already account for 92 of the 99
commits** (every commit list from chunk 1 through chunk 16a was checked row-by-row against
the full git log and each one matches exactly, no gaps, no overlaps). Only **chunk 16b**
(7 commits, all 2026-09-04 17:11-17:35, all coverage-padding `test(...)` commits, marked
"(running)" / no findings yet recorded in the primary report) remains uncovered by anyone.

So the real remaining scope for this dispatch is exactly those 7 commits. This RAW file
covers them as **chunks 13-19** (one commit per chunk, per the "chunk by coherent unit"
rule — each of these 7 commits is a single self-contained test-file addition, so one commit
IS one coherent unit here). There is no chunk 20; scope is exhausted at 19.

Remaining-scope commits (all test-only, no production-code diff, in
`apps/website/src/features/**` / `apps/website/src/platform/**`):

- [ ] 13. `1378c7e4` — test(theme): direct-invoke coverage for structure.ts fs-bounds/containment branches
- [ ] 14. `239a90a5` — test(deployments): S3-compatible publish target coverage
- [ ] 15. `54c65bc6` — test(source-control): store.ts branch-coverage fill
- [ ] 16. `383befbc` — test(deployments): credential-verification (static-publish/verify.ts) coverage
- [ ] 17. `4b35a008` — test(source-control): github-git-provider.ts branch-coverage fill
- [ ] 18. `991217ab` — test(theme): handlebars-allowlist.test.ts fixture fix + 2 branches
- [ ] 19. `438ada6a` — test(export): direct unit proof for redirectOutcomeFor's >=400 arm

## Findings

(filled in per chunk below, as each completes)
