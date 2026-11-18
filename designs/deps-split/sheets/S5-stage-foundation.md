# S5 — slices `agent-plugin-bootstrap`, `media-storage`, `store-prelude-tail` (A2-A4; the root keeps `kernel` and the four prelude awaits)

Responsibility: bindings `assistantAgentInventory` … `resolvedThemesDir` (+ its seeding statement), `resolvedUploadsDir` … `isMediaRemote`, and `logMediaProviderRefusals(…)` … `pluginActivationRepo` (`b5fbf2a5` 961-986, 989-1016, 1062-1084). **Stay in the root, at their positions:** the A1 cells; `const kernel = store.content;` (989 — after theme seeding, before the media block: the store's content kernel is read there today and nowhere earlier); `const storeBound = storeBoundServicesFor({ store, dbPath });` (one line); the four prelude awaits (`workspaceId`, `publishTrustRevocations`, `await warnCompositionChatOrphans(…)`, `mediaProviders`); `chatDbPath`/`chat`. Budget ≤130k. Commits: 3. Prerequisites: S4; COMMON §1-§4, §9 (`DS_SHEET=S5`). Locate by binding (COMMON §3).

| commit | slice file | bindings (first … last) | values in | getters (late) | returns |
|---|---|---|---|---|---|
| 1 | `slices/agent-plugin-bootstrap.ts` (+ `agentPluginIdentityAdmission` and its type) | `assistantAgentInventory` … `resolvedThemesDir` (incl. the seeding statement after it) | `onStoreClose`, `overrides` | `lifecycleTracker`, `routeDeps` | `assistantAgentInventory`, `resolvedSiteBinding`, `agentPluginLayout`, `agentPluginLifecycle`, `federatedMcpPresetRegistry`, `skillLayout`, `resolvedThemesDir` |
| 2 | `slices/media-storage.ts` | `resolvedUploadsDir` … `blobStore, mediaIsRemoteByEnv, isMediaRemote` — called **after** the root's `const kernel = store.content;` | `kernel`, `resolvedSiteBinding`, `agentPluginLifecycle`, `overrides` | `observability`, `workspaceId`, `settingsRepo` | the same names + `provideMediaCredentials` (returned function; the slice's local `let` is written once by the Promise executor at the same position) |
| 3 | `slices/store-prelude-tail.ts` (+ `logMediaProviderRefusals`) and `site-deps/chat-orphans.ts` (`warnCompositionChatOrphans`, a module function since S4, single user = the root) | `logMediaProviderRefusals({ refusals: mediaProviders.refusals })` … `pluginActivationRepo` (after the root's `mediaProviders` await) | `kernel`, `workspaceId`, `mediaProviders`, `agentPluginLifecycle`, `logger` | — | `postSearchBackfillReady`, `clock`, `idGen`, `reportToolAuditError`, `pluginActivationRepo` |

Root order after S5 (unchanged statement order): cells → `composeAgentPluginBootstrap(…)` → `const kernel = store.content;` → `composeMediaStorage(…)` → `const storeBound = …` → 4 awaits (with `chatDbPath`/`chat` between) → `composeStorePreludeTail(…)`. No slice here is `async` or contains a top-level `await`. `warnCompositionChatOrphans` moves as the original async callee holding the original inner `await warnOnOrphanedChatRows(…)`; the root's `await warnCompositionChatOrphans(…)` line is unchanged. `chat-orphan-check.integration.test.ts:38-40,265-266` (reads the warning call's text) is repointed to `site-deps/chat-orphans.ts` in commit 3.

## Carries
| behaviour (lines on `b5fbf2a5`) | test |
|---|---|
| buffered lifecycle: events before provider boot are captured and routed to the tracker after the swap (959-960, 975-982) | S0 pin 3c (behaviour + source order); `deps-observability-wiring.integration.test.ts` |
| lifecycle owner built once, in one file (975-982) | `wiring-identity.test.ts:213` `BASELINE_OWNER_FILES`: `server/runtime/composition/deps.ts` → `…/site-deps/slices/agent-plugin-bootstrap.ts` (commit 1; set size stays 11) |
| `kernel` is read from the store after theme seeding and before media storage (989) | `composition-boot-order.unit.test.ts` new assertion (commit 2): in `composeSiteRouteDeps`, `composeAgentPluginBootstrap(` < `const kernel = store.content;` < `composeMediaStorage(` |
| lazy media credentials: the promise is created at the same position, resolved only by the after-assembly call; store ports read `observability`/`workspaceId`/`settingsRepo` at call time (1001-1015) | new `$D/__tests__/media-storage.unit.test.ts` (fakes): getters that throw until set → building does not call them; `resolveSharedCredential` stays pending until `provideMediaCredentials` is called; S0 pin 3e |
| `storeBound` is built from `{ store, dbPath }` once, in the root (1019) | `composition-boot-order` assertion `/const storeBound = storeBoundServicesFor\(\{ store, dbPath \}\);/` keeps reading `deps.ts` |
| prelude awaits order and "no boot promise before the prelude awaits finish" (1029-1061, `preparePostSearchIndex(` 1073) | `composition-boot-order` prelude test: the four awaits stay in `composeSiteRouteDeps` (anchors unchanged); `firstBootPromise` = the `composeStorePreludeTail(` call in the root; a new assertion pins `preparePostSearchIndex(` inside `store-prelude-tail.ts` |
| search backfill failure is logged with the same text, not thrown (1073-1075) | new `$D/__tests__/store-prelude-tail.unit.test.ts`: a case with a rejecting fake and a recording `logger` |
| "no `db` identifier", "no `sqliteDb`" in the composition body | COMMON §9 rule 7: the assertions read each moved slice function's body |

```bash
SHEET_TESTS=(
  apps/website/src/server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts
)   # the rest are in SR_TESTS; new unit tests run as CHANGED_TESTS, then via the composition glob
```

## STOP (before the report commit; COMMON §9 rule 8 form)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
S="$D/site-deps/slices"
test -f "$S/agent-plugin-bootstrap.ts"; test -f "$S/media-storage.ts"; test -f "$S/store-prelude-tail.ts"; test -f "$D/site-deps/chat-orphans.ts"
grep -rn 'createTovuAgentPluginLifecycle(' "$D/deps.ts" "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S5-LIFECYCLE-OWNER"; exit 1; }
grep -nE '^(export )?async function|^  (const [^=]+= )?await ' "$S/agent-plugin-bootstrap.ts" "$S/media-storage.ts" "$S/store-prelude-tail.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S5-ASYNC-SLICE"; exit 1; }
grep -nE '^  (const [^=]+= )?await (resolveWorkspaceIdOverride|publishTrustRevocationStoreFor|warnCompositionChatOrphans|loadMediaProviderRegistry)\(' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 4 || { cat "$W/hits"; echo "STOP-S5-PRELUDE-AWAITS"; exit 1; }
grep -nF 'const kernel = store.content;' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S5-KERNEL-IN-ROOT"; exit 1; }
```
(`async` arrows **inside** a slice are today's code and allowed: the pattern matches only module-level `async function` declarations and awaits at a function body's own two-space indent.)
