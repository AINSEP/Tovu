# S5 — stage `foundation` (DESIGN §1.3 rows A2-A4; A1 stays in the root)

Responsibility: statements 3-31 of `composeSiteRouteDeps` (`f0613d9e` lines 964-1087). Budget ≤150k. Commits: 4.
Prerequisites: S4. COMMON §2, §3, §9.
```bash
awk -F'\t' '$1==3 || $1==31 {print $1, $2}' designs/deps-split/work/closure-census.tsv   # take today's lines from here
```

| commit | slice file | statements | inputs (values) | getters (late) | returns (used later) |
|---|---|---|---|---|---|
| 1 | `slices/agent-plugin-bootstrap.ts` (+ `agentPluginIdentityAdmission`, its type) | 3-11 | `onStoreClose`, `overrides` | `lifecycleTracker: () => lifecycleTracker`, `routeDeps: () => routeDeps` | `assistantAgentInventory`, `resolvedSiteBinding`, `agentPluginLayout`, `agentPluginLifecycle`, `federatedMcpPresetRegistry`, `skillLayout`, `resolvedThemesDir` |
| 2 | `slices/media-storage.ts` | 12-17 (stmt 12 `const kernel = store.content` stays in the closure **above** the call; the slice starts at 13) | `resolvedSiteBinding`, `agentPluginLifecycle`, `overrides` | `observability`, `workspaceId`, `settingsRepo` | `resolvedUploadsDir`, `provideMediaCredentials` (function value, returned — the `let` becomes a local of the slice), `mediaCredentials`, `mediaStorePorts`, `blobStore`, `mediaIsRemoteByEnv`, `isMediaRemote` |
| 3 | `slices/store-prelude.ts` (+ `warnCompositionChatOrphans` module fn from S4, + `logMediaProviderRefusals`) | 18-31, **async** (awaits at 19, 20, 23, 25 stay in order) | `store`, `kernel`, `dbPath`, `overrides`, `agentPluginLifecycle`, `agentPluginLayout`, `logger` | — | `storeBound`, `workspaceId`, `publishTrustRevocations`, `chatDbPath`, `chat`, `mediaProviders`, `postSearchBackfillReady`, `clock`, `idGen`, `reportToolAuditError`, `pluginActivationRepo` |
| 4 | `stages/foundation.ts` `composeFoundationStage(required, optional)` calling 1-3 | 3-31 | | | union of the above |

Note on commit 2: `provideMediaCredentials` is written once by the Promise executor (1004-1005) and called once in I5 (2831). Returning it from the slice keeps one writer and one caller (DESIGN §1.5). Order: the Promise is created at the same position.

Anchors to repoint in the same commits: `wiring-identity.test.ts:213` (commit 1: replace `server/runtime/composition/deps.ts` by `server/runtime/composition/site-deps/slices/agent-plugin-bootstrap.ts`; set size stays 11; one line); `chat-orphan-check.integration.test.ts:265-266` (commit 3: read the slice file); `composition-boot-order.unit.test.ts` anchors `const kernel = store.content`, `await resolveWorkspaceIdOverride(kernel, overrides)`, `await publishTrustRevocationStoreFor(kernel)`, `await warnOnOrphanedChatRows(`, `preparePostSearchIndex(` (commit 3: the four after `kernel` are asserted in order inside `store-prelude.ts`; `kernel` < the `composeStorePrelude(` call in `deps.ts`).

## STOP
```bash
D=apps/website/src/server/runtime/composition
test "$(grep -rln 'createTovuAgentPluginLifecycle(' $D/deps.ts $D/site-deps | wc -l)" = 1 || echo "STOP: lifecycle owner built in more than one file"
grep -nE '^  (const [^=]+= )?await ' $D/site-deps/slices/agent-plugin-bootstrap.ts $D/site-deps/slices/media-storage.ts && echo "STOP: a synchronous block became async"
```
Gates: COMMON §5 + S0 pins (`site-root.*.pin.test.ts`) every commit.
