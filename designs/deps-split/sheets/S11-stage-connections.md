# S11 — connections (H1-H3); one outbound HTTP owner for both roots

Responsibility: bindings `guardedOutboundHttpClient` … `agentPluginMcp` (`b5fbf2a5` 2076-2130) and moving the existing `composeMemoryOutboundHttp` to a shared owner. **No new client factory** (REVISION-2: over-engineering item): `memory-deps/slices/outbound-http.ts` already builds the same guarded client and OAuth ports, byte for byte as `deps.ts` 2076-2086. Budget ≤120k. Commits: 4. Prerequisites: S10; COMMON §1-§4, §9 (`DS_SHEET=S11`). `app.ts` is a **shared** file (not frozen; `refactor/size-02-app` is still open and edits it — INDEX "Freeze"; `wave2/size02-step5` is already merged); this sheet edits only its import line (`app.ts:8` on `b5fbf2a5`) and the one call line (`app.ts:282`).

| commit | change |
|---|---|
| 1 | `git mv composition/memory-deps/slices/outbound-http.ts composition/outbound-http.ts`; rename `composeMemoryOutboundHttp` → `composeOutboundHttp` and change its unused `_required: Record<string, never> = {}` to `_required = {}` (COMMON §7, retained factory); add the optional port `optional.createHttpClient` (default: the guarded factory it imports today) so its test needs no module mock. Callers: `app.ts` import (line 8) and call (line 282); `deps.ts` replaces its own two statements with `const { externalMcpOAuthHttpPorts, guardedOutboundHttpClient } = composeOutboundHttp();` **keeping both why-comment blocks above the call** (they stay true there). Test: `memory-deps/__tests__/outbound-http.test.ts` → `composition/__tests__/outbound-http.test.ts`, `mock.module` replaced by an interface fake passed as `optional.createHttpClient` that records the config and delegates to the real factory; every assertion kept (one client per call, `userAgent`, the policy `deepEqual`, both ports present, a second call builds a second client). `external-mcp-oauth-loopback-wiring.unit.test.ts:64`: the file list becomes `["../outbound-http.ts"]` and a new test asserts each root calls `composeOutboundHttp(` exactly once (`app.ts`, and `deps.ts` + `site-deps/**`) — test count unchanged |
| 2 | `slices/public-origin.ts` (+ `resolveCompositionPublicOrigin` from S4): `derivedPublicOrigin` |
| 3 | `slices/agent-connections.ts`: `composeAgentConnections` (`agentPluginConnections`) and `refreshAdminSurfaces` (`adminSurfaceHandlersReady`). Root: call 1, **write `bindSharedApiOAuth = agentPluginConnections.apiConnections.host.sharedOAuth?.bind;` in the root**, call 2 (DESIGN §2.3) |
| 4 | `slices/readiness.ts`: `siteAppBootWork` … `agentPluginMcp` minus the cells `resolveRouteDeps`/`routeDepsBuilt` (moved to the top of the closure in this commit; nothing awaits `routeDepsBuilt` before `siteConsentReady`); receives `routeDepsBuilt` (value) and `routeDeps` (getter) |

## Carries
| behaviour (base lines) | pin |
|---|---|
| one egress policy literal for both roots: https/http, private addresses denied, no redirects, 10 min, 96 MiB, `Tovu/0.1.0` (2076-2084) | moved `outbound-http.test.ts` (deep-equal policy, fresh client per call); the STOP block counts the policy line in **production composition files only** (the DNS policy in `domain-dns-adapters.ts:15` has different values and is not counted) |
| OAuth loopback exception only on desktop (2086) | `external-mcp-oauth-loopback-wiring.unit.test.ts` (both roots via the shared owner + the call-once test) |
| shared OAuth binding written after connections exist, before the admin-surface refresh (2110) | S0 pin 3a; STOP block |
| admin-surface boot failure only warns, exact text (2112-2114) | `agent-connections.unit.test.ts` with a rejecting fake host → the exact `console.warn` text |
| consent readiness awaits the route-deps promise (2122-2127) | `readiness.unit.test.ts`: `siteConsentReady` pending until `resolveRouteDeps` is called |
| memory root unchanged in behaviour | `memory-route-deps.test.ts` and `memory-deps/__tests__/*` (in `SR_TESTS`) |

```bash
SHEET_TESTS=(
  apps/website/src/server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts
  apps/website/src/server/runtime/composition/__tests__/memory-route-deps.test.ts
)   # plus SR_TESTS and CHANGED_TESTS (COMMON §5)
```

## STOP (before the report commit; COMMON §9 rule 8 form)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
grep -rnE 'maxRedirects: 0, connectTimeoutMs: 10 \* 60 \* 1000' "$D/outbound-http.ts" "$D/deps.ts" "$D/app.ts" "$D/site-deps" "$D/memory-deps/slices" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S11-ONE-EGRESS-POLICY"; exit 1; }
test ! -e "$D/memory-deps/slices/outbound-http.ts" || { echo "STOP-S11-OLD-OWNER"; exit 1; }
grep -rnE '^  bindSharedApiOAuth = ' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S11-ROOT-WRITE"; exit 1; }
grep -rnE 'composeOutboundHttp\(' "$D/app.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S11-APP-CALL"; exit 1; }
grep -rnE 'mock\.module\(' "$D/__tests__/outbound-http.test.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S11-MODULE-MOCK"; exit 1; }
grep -rnE '^(export )?async function|^  (const [^=]+= )?await ' "$D/site-deps/slices/public-origin.ts" "$D/site-deps/slices/agent-connections.ts" "$D/site-deps/slices/readiness.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S11-ASYNC-SLICE"; exit 1; }
```
Gates: COMMON §5.
