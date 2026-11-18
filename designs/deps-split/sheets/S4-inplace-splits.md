# S4 — function-level splits and real inputs, in place inside `deps.ts`

Responsibility: DESIGN §2.4 only; nothing leaves `deps.ts`. Budget ≤160k. Commits: one per row (≈11). Prerequisites: S3; COMMON §1-§4 (`DS_SHEET=S4`). Locate every item by binding / function name (COMMON §3); this sheet's own commits turn hoisted closure functions into module functions, so S5+ never use indices.

| commit | binding (lines on `b5fbf2a5`) | change |
|---|---|---|
| 1-2 | `trashFollowUpHooks` Map (1388-1455, 62 code lines) | module functions below the closure: `snapshotMediaRepo({ mediaRepo, assets })`, `snapshotPostRepo({ postRepo, posts })`, `formAttachmentPurger(required)` (the `prepareRemoval` body), `composeTrashFollowUpHooks(required)`; the `const trashFollowUpHooks =` statement keeps its position and becomes one call. Forward reads (`mediaRepo`, `postRepo`, `assetBlobRepo`, `entryRefsRepo`, `routeDeps`) are getters |
| 3 | `publishContentApplyPort` (2010-2073, 58) | `publishContentPorts(required)` + `composePublishContentApplyPort(required)` |
| 4 | `configureSiteSharing` (2837-2912, 68) | `shareHostKit`, `shareStaticSite`, `shareDelivery`, `configureSiteSharing`, all `(required, optional = {})`; the nested `createShareHostKit(_required: Record<string, never>, …)` (2849) becomes `shareHostKit(required)` with its real inputs |
| 5-10 | hoisted closure functions `warnCompositionChatOrphans` (1041), `registerBootOrigin` (1325), `compositionCustomCredentials` (1835), `compositionProjectKeys` (1860), `composeContentHttpClients` (1933), `resolveCompositionPublicOrigin` (2089), `compositionSharedOAuth` (2788), `compositionCommerce` (2803), `configureSiteImports` (2915) | module functions `(required, optional = {})` with their real inputs, **called at the same position**; an `await`ed call stays `await`ed at the same position (`await warnCompositionChatOrphans({ … })`), a sync one stays sync. `compositionProjectKeys` takes `getBindSharedApiOAuth: () => bindSharedApiOAuth` and keeps the throw text verbatim; `compositionSharedOAuth`'s inputs all exist before the literal (census eager column of the literal row). Six of them are `_required: Record<string, never>` placeholders today (1041, 1325, 1933, 2089, 2837, 2915); four take no parameters (1835, 1860, 2788, 2803) |
| 11 | public factory `createSiteRouteDeps` (`deps.ts:827-829`: `_required: Record<string, never> = {}`) | owner rule for retained public factories: `_required = {}` (the bag stays, the default stays, the `Record<string, never>` annotation goes). Callers unchanged (they pass `{}`). `createSiteRouteDepsForWorkspace` (3004) has real required inputs and is not touched |

The `trashAdapters` Map (1461-1512, 43 code lines) is **not** split (judge 2, over-engineering): S7 moves it whole, as one statement, into one slice function and keeps the one `Map` instance the theme step later `.set`s. Only if `check:size` then fails that slice function does S7 split it, in the same commit.

## Carries
| behaviour (lines on `b5fbf2a5`) | test (`SHEET_TESTS`) |
|---|---|
| purge snapshots are taken under the trash lock before removal; a form attachment without a proven owner is kept with the exact error (1388-1455) | new `$D/__tests__/trash-follow-up-hooks.unit.test.ts` (fakes): no asset → no-op; non-private asset → exact text "Form attachment ${mediaId} has no proven form upload owner. The submission and file were kept."; remove updates the snapshot; S0 pin 2 |
| OAuth binding read at call time: undefined → exact domain error; set later → delegated (1860-1874) | new `$D/__tests__/composition-project-keys.unit.test.ts`: getter returns `undefined` → `bindOAuth` throws the exact text; flip the getter after construction → the next call delegates (mutation: read the getter at construction → red); S0 pin 3a |
| boot origin registration for its 3 origin kinds (1325-1351) | new `$D/__tests__/register-boot-origin.unit.test.ts` |
| site sharing: HEAD goes through the guarded client; failure → `routeDeps.siteShareBackend` stays undefined + one `console.error` line (2837-2912) | new `$D/__tests__/site-sharing.unit.test.ts`; `$D/__tests__/site-share-wiring.integration.test.ts` |
| chat-orphan warning stays awaited, SQLite-only, failure logged not thrown (1039-1055) | `chat-orphan-check.integration.test.ts`; S0 pin 6 (the root's `await warnCompositionChatOrphans(`) |
| the public factory still accepts `createSiteRouteDeps({}, { dbPath })` from all callers | `typecheck` + `typecheck:tests`; S0 pin 1 |

```bash
SHEET_TESTS=(
  apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts
)   # the four new unit tests are picked up by SR_TESTS' composition glob and by CHANGED_TESTS
```

## STOP (before the report commit; COMMON §9 rule 8 form)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
test -f "$D/deps.ts"
grep -nE '_required: Record<string, never>' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S4-PLACEHOLDER"; exit 1; }
grep -nE '^  (async )?function ' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S4-HOISTED-LEFT"; exit 1; }
```
The placeholder check covers parameters only (`_required: …`); the `optional?: Record<string, never>` **callback types** at `deps.ts:492, 686, 853, 952, 3007` are existing callback contracts of `onStoreOpened`/`onClose`/`onStoreClose` and are out of scope. Gates: COMMON §5 on every commit (S0 pins are in `SR_TESTS`).
