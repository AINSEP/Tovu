# S4 — function-level splits and real inputs, in place inside `deps.ts`

Responsibility: DESIGN §2.4 only; nothing leaves `deps.ts`. Budget ≤180k. Commits: one per row (≈12).
Prerequisites: S3. COMMON §2, §3. Lines below are `f0613d9e`; after S1-S3 they shift — re-take them with `node designs/deps-split/work/closure-census.cjs .` (statement index is stable: S1-S3 do not touch the closure).

| commit | statement (index) | change |
|---|---|---|
| 1-2 | 74 `trashFollowUpHooks` | module functions below the closure: `snapshotMediaRepo(required: { mediaRepo, assets })`, `snapshotPostRepo(required: { postRepo, posts })`, `formAttachmentPurger(required)` (the `prepareRemoval` body), `composeTrashFollowUpHooks(required)`; the Map statement keeps its position and becomes one call. Late reads (`mediaRepo`, `postRepo`, `assetBlobRepo`, `entryRefsRepo`, `routeDeps`) are passed as getters (`mediaRepo: () => mediaRepo`) because they are declared later (closure-census row 74). Keep the error text "Form attachment ${mediaId} has no proven form upload owner. The submission and file were kept." verbatim |
| 3 | 76 `trashAdapters` | `mediaTrashAdapter(required)`, `userTrashAdapter(required)`, `composeTrashAdapters(required)`; getters for row 76's forward reads |
| 4 | 167 `publishContentApplyPort` | `publishContentPorts(required)` + `composePublishContentApplyPort(required)` |
| 5 | 208 `configureSiteSharing` | `shareHostKit`, `shareStaticSite`, `shareDelivery`, `configureSiteSharing` (all `(required, optional = {})`) |
| 6-12 | 24, 62, 130, 135, 150, 171, 194, 196, 210 (hoisted) | `warnCompositionChatOrphans`, `registerBootOrigin`, `compositionCustomCredentials`, `compositionProjectKeys`, `composeContentHttpClients`, `resolveCompositionPublicOrigin`, `compositionSharedOAuth`, `compositionCommerce`, `configureSiteImports` become module functions with real inputs, **called at the same statement position**. `compositionProjectKeys` gets `getBindSharedApiOAuth: () => bindSharedApiOAuth` and keeps the throw text verbatim. `compositionSharedOAuth` is called by the literal (2267) — its inputs all exist before 2134 (closure-census row 183 "eager") |

Tests: red-first unit tests with interface fakes in `apps/website/src/server/runtime/composition/__tests__/` for `registerBootOrigin` (3 origin kinds), `formAttachmentPurger` (no asset → no-op; non-private asset → the exact error text; remove updates the snapshot), `shareDelivery` (HEAD goes through the guarded client), `configureSiteSharing` failure → `routeDeps.siteShareBackend` undefined + one `console.error` line. S0 pins stay green after every commit.

## STOP
```bash
npx eslint --no-config-lookup -c designs/deps-split/work/limits.eslint.config.mjs apps/website/src/server/runtime/composition/deps.ts 2>&1 | grep -E "configureSiteSharing|too many lines \((5[1-9]|[6-9][0-9])\)" | grep -v composeSiteRouteDeps && echo "STOP: a non-root function is still over 50"
grep -nE "_required: Record<string, never>" apps/website/src/server/runtime/composition/deps.ts && echo "STOP: placeholder signature left"
```
Gates: COMMON §5.
