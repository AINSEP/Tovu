# Gemini Adversarial Audit — features/ + platform/ (2026-09-03 & 2026-09-04)

Scope: `apps/website/src/features/**` and `apps/website/src/platform/**`.
Commits in range: 99 (matched via `git log --since="2026-09-03 00:00" --until="2026-09-05 00:00"` scoped to those two paths).
Auditor model: `gemini-3.8-flash-high` via `agy --print`, driven chunk-by-chunk (diff text pasted into the prompt, no repo tool access given to Gemini).
Verifier: this agent, reading the actual source at the claimed file:line for every finding before it is recorded here.

Machine constraint for this run: no test/coverage/typecheck execution — verification is read-only (git + source reading). Findings that would require running code are marked UNVERIFIED.

## Status

IN PROGRESS — chunk plan below, filled in as each chunk completes.

## Chunk plan (20 chunks, all 99 commits)

- [x] 1. Architecture fixes/revert: 5d90b1b5, 978aab02, af4b365d, c57f3791
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

### Chunk 1 — architecture fixes/revert (5d90b1b5, 978aab02, af4b365d, c57f3791)

Gemini raised 5 findings. 3 discarded (all false positives caused by this chunk's own path-scoping — the diff handed to Gemini was filtered to `features/**`+`platform/**`, and each discarded finding claimed something was "missing" that was actually present in the same commit, just in a file outside that filter, e.g. `server/runtime/composition/{app,deps}.ts` or `development/scripts/src-complexity-debt.json`). 2 confirmed.

**MEDIUM — CONFIRMED.** `apps/website/src/features/external-mcp/__tests__/unit/save-form.unit.test.ts` test `"neither env nor secret fields ever carry a value key, regardless of input"`. `ExternalMcpSaveInput` (save-form.ts:38-55) has no `env`/`oauthClientSecret` fields at all, so nothing in this test's input can ever flow into `fieldValue(input.env)`-style code — `buildEnvField`/the `oauthClientSecret` entry in `buildOAuthCoreFields` don't even call `fieldValue()`, they just never emit `value`. A mutant that changed either builder to leak a stored secret into `value` would not be caught by this test, because the type system (not the assertion) is what prevents `input.env`/`input.oauthClientSecret` from ever being defined here. The test reads as a regression guard on a security-sensitive property but can't actually fail against a broken implementation — false confidence.
Verification: read `save-form.ts` — confirmed `ExternalMcpSaveInput` has no `env`/`oauthClientSecret` property, and `buildEnvField`/`buildOAuthCoreFields`'s secret field hardcode omission rather than deriving it from input.

**LOW — CONFIRMED (corrected: field is `postRepo`, not `presentationRepo` as Gemini first named it).** `apps/website/src/platform/export/route-manifest.ts:81` (`RouteManifestDeps.postRepo: PostRepoPort`) is dead within this file after 5d90b1b5: the only prior read (`listPublishedPosts({ deps: { repo: deps.postRepo }, ... })`) moved to the composition roots, which now bind `listPublishedPosts` as a nullary closure over their own `routeDeps.postRepo` — nothing in `route-manifest.ts` reads `deps.postRepo` anymore (verified via grep, one hit: the declaration itself). `presentationRepo` is NOT dead (Gemini's original claim) — it's still read, just not by name: `resolveActiveTheme(deps, activeThemeId)` (route-manifest.ts:280) takes the whole `deps` object and structurally needs `presentationRepo`/`workspaceId`/`themes`, per this file's own header doc. Real-world impact of the genuine `postRepo` dead field is low: nobody hand-builds a `RouteManifestDeps`, the real `RouteDeps` object satisfies it structurally and already carries `postRepo` for unrelated reasons, so no caller feels an extra burden — this is a documentation/hygiene nit (an interface field with no reader in its own file), not a functional defect.
Verification: `git show 5d90b1b5 -- route-manifest.ts` — confirmed `postRepo`'s only consumer was the removed direct call; grep confirms no other read in the file.

**Discarded (3), all false positives from this chunk's path-scoped diff, not from the code itself:**
- Gemini claimed `RouteManifestDeps`'s new `resolveActiveThemeId`/`listPublishedPosts` fields (5d90b1b5) were never bound at the composition roots, calling it CRITICAL (`TypeError: ... is not a function`). Disproved: `git show 5d90b1b5 -- server/runtime/composition/app.ts deps.ts` shows both roots bind them (`resolveActiveThemeId: () => resolveActiveThemeId(routeDeps)`, `listPublishedPosts: () => listPublishedPosts({...})`) in the *same* commit — those files just aren't under `features/**`/`platform/**` so weren't in the chunk Gemini saw.
- Gemini claimed `command: input.command ?? existing.command` (save-form.ts, c57f3791) leaks `null` into a `string`-typed field because `existing.command` mirrors `existing.url`'s nullability. Disproved: `ExternalMcpServerView.command` is typed `string` (not `string | null`) in `external-mcp-store.ts:293` — only `url` is nullable. No leak possible.
- Gemini claimed the c57f3791 commit message's claim of recording a complexity exception in `src-complexity-debt.json` was false because that file wasn't in the diff. Disproved: `git show c57f3791 --stat` (unfiltered) shows `development/scripts/src-complexity-debt.json` genuinely updated in the same commit — outside the features/platform path filter, not missing.

### Chunk 2 — security/architecture fixes (226fbbd7, 8ef2f6a2, cfd48066)

(running)
