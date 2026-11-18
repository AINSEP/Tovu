# S5 — stage `foundation` (A2-A3 + `storeBound`) and slice `store-prelude-tail` (A4 after the root awaits)

Responsibility: bindings `assistantAgentInventory` … `storeBound` and `logMediaProviderRefusals(…)` … `pluginActivationRepo` (`f0613d9e` 964-1022, 1065-1087). The A1 cells, `kernel`, and the four prelude awaits (`workspaceId`, `publishTrustRevocations`, `await warnCompositionChatOrphans(…)`, `mediaProviders`) and `chatDbPath`/`chat` **stay in the root** (DESIGN §2.2 segments s0/s1). Budget ≤150k. Commits: 4. Prerequisites: S4; COMMON §1-§3, §9 (`DS_SHEET=S5`). Locate by binding (COMMON §2), never by index.

| commit | slice file | bindings (first … last) | values in | getters (late) | returns |
|---|---|---|---|---|---|
| 1 | `slices/agent-plugin-bootstrap.ts` (+ `agentPluginIdentityAdmission` and its type) | `assistantAgentInventory` … `resolvedThemesDir` (incl. the unnamed seeding statement after it) | `onStoreClose`, `overrides` | `lifecycleTracker`, `routeDeps` | `assistantAgentInventory`, `resolvedSiteBinding`, `agentPluginLayout`, `agentPluginLifecycle`, `federatedMcpPresetRegistry`, `skillLayout`, `resolvedThemesDir` |
| 2 | `slices/media-storage.ts` | `resolvedUploadsDir` … `blobStore, mediaIsRemoteByEnv, isMediaRemote` (`kernel` stays in the root above the call) | `kernel`, `resolvedSiteBinding`, `agentPluginLifecycle`, `overrides` | `observability`, `workspaceId`, `settingsRepo` | the same names + `provideMediaCredentials` (returned function; the slice's local `let` is written once by the Promise executor at the same position) |
| 3 | `stages/foundation.ts` `composeFoundationStage(required, optional)` — synchronous; calls 1, 2 and builds `storeBound` (`storeBoundServicesFor({ store, dbPath })`, verbatim) | | | | union |
| 4 | `slices/store-prelude-tail.ts` (+ `logMediaProviderRefusals`) | `logMediaProviderRefusals({ refusals: mediaProviders.refusals })` … `pluginActivationRepo` (after the root's `mediaProviders` await) | `kernel`, `workspaceId`, `mediaProviders`, `agentPluginLifecycle`, `logger` | — | `postSearchBackfillReady`, `clock`, `idGen`, `reportToolAuditError`, `pluginActivationRepo` |

No slice here is `async` and none contains `await`; the root keeps the four prelude awaits verbatim between the stage call and the tail call. The awaited callee `warnCompositionChatOrphans` (a module function since S4, single user = the root) moves in commit 4 to `site-deps/chat-orphans.ts` — it is the original async function that holds the original inner `await warnOnOrphanedChatRows(…)`, not a new wrapper; the root's `await warnCompositionChatOrphans(…)` line is unchanged. `chat-orphan-check.integration.test.ts:38-40,265-266` (reads the warning call's text) is repointed to that file in the same commit.

## Carries
| behaviour (base lines) | pin |
|---|---|
| buffered lifecycle: events before provider boot are captured and flushed in order after the swap (962-963, 978-985) | S0 pin 3c; `deps-observability-wiring.integration.test.ts` |
| lifecycle owner built once, in one file (978-985) | `wiring-identity.test.ts:213` `BASELINE_OWNER_FILES`: `server/runtime/composition/deps.ts` → `…/site-deps/slices/agent-plugin-bootstrap.ts` (commit 1; set size stays 11) |
| lazy media credentials: the promise is created at the same position, resolved only by the after-assembly call; store ports read `observability`/`workspaceId`/`settingsRepo` at call time (1004-1018) | new `media-storage.unit.test.ts` (fakes): ports built with getters that throw until set → building does not call them; `resolveSharedCredential` stays pending until `provideMediaCredentials` is called; S0 pin 3e |
| `storeBound` is built from `{ store, dbPath }` once (1022) | `composition-boot-order` assertion `/const storeBound = storeBoundServicesFor\(\{ store, dbPath \}\);/` now reads `deps.ts` + `site-deps/**` (COMMON §9 rule 7) and still matches exactly once |
| prelude awaits order and "no boot promise before the prelude awaits finish" (1032-1064, `preparePostSearchIndex(` 1076) | `composition-boot-order` prelude test: the four awaits stay in `composeSiteRouteDeps` (unchanged anchors); `firstBootPromise` = the `composePreludeTail(` call in the root, and a new assertion pins `preparePostSearchIndex(` inside `store-prelude-tail.ts` |
| search backfill failure is logged with the same text, not thrown (1076-1078) | `chat-orphan-check.integration.test.ts` + a tail unit case with a rejecting fake |
| "no `db` identifier", "no `sqliteDb`" in the composition body | the boot-order assertions read `deps.ts` + every `site-deps/` file from this sheet on |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"; D=apps/website/src/server/runtime/composition
$G expect-count S5-LIFECYCLE-OWNER 1 'createTovuAgentPluginLifecycle\(' $D/deps.ts $D/site-deps
$G forbid S5-ASYNC-SLICE '^(export )?async function|^  (const [^=]+= )?await ' $D/site-deps/slices/agent-plugin-bootstrap.ts $D/site-deps/slices/media-storage.ts $D/site-deps/slices/store-prelude-tail.ts $D/site-deps/stages/foundation.ts
$G expect-count S5-PRELUDE-AWAITS 4 '^  (const [^=]+= )?await (resolveWorkspaceIdOverride|publishTrustRevocationStoreFor|warnCompositionChatOrphans|loadMediaProviderRegistry)\(' $D/deps.ts
```
Gates: COMMON §5 (S0 pins run in `tests sr` every commit).
