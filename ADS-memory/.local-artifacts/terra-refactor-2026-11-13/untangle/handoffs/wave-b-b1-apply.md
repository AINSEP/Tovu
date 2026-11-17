# wave-b B1 apply handoff (2026-11-15)
Done: pass B1 applied in order C3, C3t, C4, C5, C7, C8, C9a, C9-ui, C11 (all 0 stale/0 error with default phase `wave`; the "all" phase dry-run shows stale rows only for lane/done-phase rows, expected). B0 re-dry-run: 0 to apply; C1-plus row 12 fixed (phase done, note) in sheets/C1-plus.repoint.tsv.
MANUAL rows done: C3 1 (db core barrel), C3t 3 (already deleted by lane), C4 3 (already done by lane), C5 64 (36 needed nothing: mocks spread importOriginal / type-only; edits in platform entry-barrels, integration-contracts, secrets/exports tests), C8 13 (sdk test only; rest no moved value names), C11 15 (13 Jini = lane-done; 2 Tovu dynamic imports repointed to @jini-ai/platform/system). C9a MANUAL (45) skipped (R1).
Follow-ups done: C3 B1/B2 digests (commerce 4, Tovu 51), C4 B checks, C2 B (all already in place), C8 B1/B2/B3, C9-ui B1/B2, db import-isolation fixes.
Remaining:
- C9a §B1/B2/B4: BLOCKED. Tovu apps/admin/src/integrations/jini-kits.ts does not exist (only integrations/jini-admin, chart-providers); B1 copies adminKit from it. Needs C9-ui §A2 decision first. B3 = cloud run.
- C9-ui §B3, §B4 (cloud / coordinator roots).
- C11a §1-§3 and C11-ids followups not in this task.
- db tests still red (not touched): loads-without-driver (allowed loaded packages must now include @jini-ai/core; peer range ^0.6.10 vs ^0.7.0 pre-existing; platform dist stale), security-defaults.source (74 "apps/website" comment hits, likely pre-existing), secrets-vault.repo.contract (stale platform/dist).
- cms: repo.dialects "update rewrites..." gets version 99 vs expected 1 (forms repo update keeps caller version; not import related, unverified vs base); platform/http-kit dist stale for 5 files.
Scratch: /Users/la/.claude/harness-tmp/ (eslint jsons, commit helper in scratchpad).
