# SH-3 — the 3 custom-credentials shells held by ex-sh (Tovu, 45 min) — OWNER DECISION NEEDED

`apps/website/src/features/custom-credentials/sets/{host,store,vault-repo}.ts` are re-export shells (SH rule: delete). ex-sh held them (`cloud-results/ex-sh.md`): `apps/website/src/features/custom-credentials/__tests__/extract-s8-c1-source-scan.test.ts` reads all three off disk and asserts each shim imports only `@jini-ai/integrations/credentialed-http/sets`.
- Run only if the owner approves dropping that test's first block (the shell-shape assertion); the rest of the test stays. Then apply the SH-2 recipe: repoint the importers listed in `plans/P9-steps/SH-shells-1.md` for these three files to `@jini-ai/integrations/credentialed-http/sets`, delete the shells.
- Until then the 3 files stay counted in FILES LEFT.
