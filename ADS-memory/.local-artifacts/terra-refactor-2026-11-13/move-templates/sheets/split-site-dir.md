# website/platform/site-dir (W1 #25) — NOT FILLED
Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`. **NOT FILLED** in this run (context budget: Group B stopped at ~250k tokens after 6 features). Facts below are from `make-sheet.py --kind all` + CLASSIFY-files.tsv + the untangle TSVs; nothing here is executable yet.

untangle_overlap: yes: C3t.repoint.tsv:284 (`duplicate-pglite-store.ts`) -> that slice **execute after wave B merge**

## Files and labels
10 files / 1,473 lines: MIXED active-site (179), duplicate-pglite-store (97, also listed under db/kernel), local-admin-bundle (179), site-registry (566), site-trash (150), sites-home (48), sites-workspace-options (35); DELETE atomic-write.ts (90, 7 prod importers, KIND-SUSPECT: 2 runtime decls); DEDUPE nested-sites-root (63); MOVE resolve-install-dir-target (66, pure fs).

## Judgment notes for the sheet author
atomic-write.ts: survey target `@jini-ai/platform/fs` — re-kind to REPOINT/DEDUPE once a census shows the two functions equal the Jini ones (not checked). sites-home/sites-workspace-options: survey says the dedupe target is a shared TOVU module (product names in the config literal) — no Jini change. depends_on db/kernel + server-logs. Tier: Opus for site-registry; Sonnet for resolve-install-dir-target and atomic-write.

## Owner question
-
