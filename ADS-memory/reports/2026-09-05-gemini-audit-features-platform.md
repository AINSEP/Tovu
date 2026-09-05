# Gemini Adversarial Audit — features/ + platform/ (2026-09-03 & 2026-09-04)

Scope: `apps/website/src/features/**` and `apps/website/src/platform/**`.
Commits in range: 99 (matched via `git log --since="2026-09-03 00:00" --until="2026-09-05 00:00"` scoped to those two paths).
Auditor model: `gemini-3.8-flash-high` via `agy --print`, driven chunk-by-chunk (diff text pasted into the prompt, no repo tool access given to Gemini).
Verifier: this agent, reading the actual source at the claimed file:line for every finding before it is recorded here.

Machine constraint for this run: no test/coverage/typecheck execution — verification is read-only (git + source reading). Findings that would require running code are marked UNVERIFIED.

## Status

IN PROGRESS — chunk plan below, filled in as each chunk completes.

## Chunk plan (20 chunks, all 99 commits)

- [ ] 1. Architecture fixes/revert: 5d90b1b5, 978aab02, af4b365d, c57f3791
- [ ] 2. Security/architecture fixes: 226fbbd7, 8ef2f6a2, cfd48066
- [ ] 3. Coverage-padding tests batch 1 (14 commits, 09-03 morning)
- [ ] 4a. Custom-credentials fixes (small): a4fe6766, 86df1179, 922f2ef6, 6f9f4add, f0783b49
- [ ] 4b. Custom-credentials fixes+refactor (large): 44b7555a, 8604b018, 3b773dcb, 06624d8c
- [ ] 5. Mail/webhooks fixes: 704f0a4c, fbc0a37b, 95bd5f9d, c7bba21a
- [ ] 6. Media/website/backfill fixes: 4f023623, 64e6c029, c412bc75
- [ ] 7. Menu/deployments/oauth/http fixes: 92494e7c, 9dbfa0e7, bb18a3cb, 045fca55
- [ ] 8a. refactor(identity,members,credentials) 05b9713c
- [ ] 8b. refactor(complexity) batch E 753b3eba
- [ ] 8c. refactor(complexity) batch F c62c95a4
- [ ] 9. Docs/site-evidence/batch G/media gating: 33cd80b3, 08bfa88f, a60c86b6, 67b93b80
- [ ] 10. Theme menu-href security cluster: a47a23e0, a69f5892, 20112f69, 38e022fc
- [ ] 11. Comments/users/database fixes: 9b67d4c6, 1ae2ac19, 1738b578, 96caeb7d
- [ ] 12. "/" root-slug feature cluster: 710b6cf4, ae4fecda, a99576d4, 06f3ea87, d4a10b35
- [ ] 13. Widgets header-opt-out + SEO robots/sitemap: c74fcb3b, 0dd4baab, 58d61280, 6aaa0e15, 1ce20715, b7328239
- [ ] 14. Seed/Sites-screen/llms.txt cluster: cf0df979, 115687af, 3815496b, caa11611
- [ ] 15. Migration-manifest + platform http/oauth/connectors refactor chain (17 commits, 09-04)
- [ ] 16a. Coverage-padding tests batch 2a: 9e5ec771, a0f3aba4, 7b931128, c00ae566
- [ ] 16b. Coverage-padding tests batch 2b: 1378c7e4, 239a90a5, 54c65bc6, 383befba, 4b35a008, 991217ab, 438ada6a

## Summary counts

(filled in at the end)

- Chunks audited: 0 / 20
- Findings raised by Gemini:
- Confirmed:
- Unverified:
- Discarded (disproved):

## Findings

(appended below as chunks complete, ordered by severity within each batch; final report re-sorts globally)
