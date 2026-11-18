# S4 — function-level splits and real inputs, in place inside `deps.ts`

Responsibility: DESIGN §2.4 only; nothing leaves `deps.ts`. Budget ≤190k. Commits: one per row (≈12). Prerequisites: S3; COMMON §1-§3 (`DS_SHEET=S4`); `wave2/publish-p0-rest` merged into the base (it edits `selectConnectedDestination(rows)` inside `configureSiteSharing` and `publishTrustRevocationStoreFor(kernel)`; freeze-lanes: before S4). After it merges, the boot-order anchor for the deny store is its new text — re-run `facts` and `tests sr` first.

Locate every item by binding (COMMON §2 awk) — S1-S3 shifted lines; this sheet's own commits shift indices again (hoisted closure functions become module functions), so S5+ never use indices.

| commit | binding | change |
|---|---|---|
| 1-2 | `trashFollowUpHooks` | module functions below the closure: `snapshotMediaRepo({ mediaRepo, assets })`, `snapshotPostRepo({ postRepo, posts })`, `formAttachmentPurger(required)` (the `prepareRemoval` body), `composeTrashFollowUpHooks(required)`; the `const trashFollowUpHooks =` statement keeps its position and becomes one call. Forward reads (`mediaRepo`, `postRepo`, `assetBlobRepo`, `entryRefsRepo`, `routeDeps`) are getters |
| 3 | `trashAdapters` | `mediaTrashAdapter(required)`, `userTrashAdapter(required)`, `composeTrashAdapters(required)` returning the **same** `Map` instance the theme step later `.set`s |
| 4 | `publishContentApplyPort` | `publishContentPorts(required)` + `composePublishContentApplyPort(required)` |
| 5 | `configureSiteSharing` | `shareHostKit`, `shareStaticSite`, `shareDelivery`, `configureSiteSharing` (all `(required, optional = {})`) |
| 6-12 | hoisted closure functions `warnCompositionChatOrphans`, `registerBootOrigin`, `compositionCustomCredentials`, `compositionProjectKeys`, `composeContentHttpClients`, `resolveCompositionPublicOrigin`, `compositionSharedOAuth`, `compositionCommerce`, `configureSiteImports` | module functions with real inputs, **called at the same position**; an `await`ed call stays `await`ed at the same position (`await warnCompositionChatOrphans(required)`), a sync one stays sync. `compositionProjectKeys` takes `getBindSharedApiOAuth: () => bindSharedApiOAuth` and keeps the throw text verbatim; `compositionSharedOAuth`'s inputs all exist before the literal (census eager column of the literal row) |

## Carries
| behaviour (base lines) | pin |
|---|---|
| purge snapshots are taken under the trash lock before removal; a form attachment without a proven owner is kept with the exact error (1388-1455) | new `trash-follow-up-hooks.unit.test.ts` (fakes): no asset → no-op; non-private asset → exact text "Form attachment ${mediaId} has no proven form upload owner. The submission and file were kept."; remove updates the snapshot; S0 pin 2 |
| one shared trash adapter `Map`; theme adapter added later to the same instance (1464, 2007) | new unit: `composeTrashAdapters` returns a Map; S0 pin 2 (`removeTheme`) |
| OAuth binding read at call time: undefined → exact domain error; set later → delegated (1860-1874) | new `composition-project-keys.unit.test.ts`: getter returns `undefined` → `bindOAuth` throws the exact text; flip the getter after construction → the next call delegates (mutation: read the getter at construction → red); S0 pin 3a |
| boot origin registration for 3 origin kinds (1325-1351) | new `register-boot-origin.unit.test.ts` |
| site sharing: HEAD goes through the guarded client; failure → `routeDeps.siteShareBackend` stays undefined + one `console.error` line (2837-2912) | new `site-sharing.unit.test.ts`; `site-share-wiring` test at sheet end |
| chat-orphan warning stays awaited, SQLite-only, failure logged not thrown (1039-1055) | `chat-orphan-check.integration.test.ts`; S0 pin 6 (the root's `await warnCompositionChatOrphans(`) |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"; D=apps/website/src/server/runtime/composition
$G forbid S4-PLACEHOLDER '_required: Record<string, never>' $D/deps.ts
npx eslint --no-config-lookup -c designs/deps-split/work/limits.eslint.config.mjs -f json $D/deps.ts > /tmp/ds-s4-limits.json || [ $? -eq 1 ]   # exit 1 = findings (read below); 2 = crash stops here
node -e '
  const r = JSON.parse(require("fs").readFileSync("/tmp/ds-s4-limits.json", "utf8"))[0].messages;
  const bad = r.filter((m) => m.ruleId === "max-lines-per-function" && !/composeSiteRouteDeps/.test(m.message));
  if (bad.length) { console.log("STOP-S4-LIMITS " + bad.map((m) => m.line + " " + m.message).join("; ")); process.exit(1); }'
```
(The first line's `|| [ $? -eq 1 ]` accepts only eslint's "findings" status; a crash exits 2 and stops.) Gates: COMMON §5; S0 pins every commit (they are in `tests sr`).
