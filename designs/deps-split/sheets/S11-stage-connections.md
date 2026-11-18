# S11 — stage `connections` (H1-H3) and the shared guarded outbound client

Responsibility: statements 168-182 (`f0613d9e` 2079-2133) + `composition/guarded-outbound-http.ts` used by both roots (design 02 §2.5, size-02 step 6 prerequisite). Budget ≤130k. Commits: 5.
Prerequisites: S10. COMMON §2, §3, §9.
```bash
git ls-files apps/website/src/server/runtime/composition/memory-deps/slices/outbound-http.ts | grep -q . || echo "NOTE: memory root copy absent — commit 1 creates the shared file for deps.ts only"
```

| commit | change |
|---|---|
| 1 | Share check, red-first: a test `guarded-outbound-http.policy.pin.test.ts` asserts with `toEqual`-style `assert.deepEqual` the policy object of today's `deps.ts:2079-2087` (`allowedSchemes ["https","http"]`, `denyPrivateAddresses true`, `devHostAllowlist []`, `maxRedirects 0`, `connectTimeoutMs 600000`, `maxResponseBytes`/`maxDecompressedBytes` 96 MiB, `userAgent "Tovu/0.1.0"`) **and** of `memory-deps/slices/outbound-http.ts`. If the two differ, STOP: different contracts are not shared (report the diff). If equal: create `composition/guarded-outbound-http.ts` `createTovuGuardedOutboundHttpClient(required, optional = {})`; both roots call it; the memory copy is deleted, its importers repointed (no forwarder) |
| 2 | `slices/outbound-origin.ts` (+ `resolveCompositionPublicOrigin` from S4): 168-171 → `guardedOutboundHttpClient`, `externalMcpOAuthHttpPorts`, `derivedPublicOrigin` |
| 3 | `slices/agent-connections.ts`: `composeAgentConnections` (172) and `refreshAdminSurfaces` (174). Closure: call 172, **write 173 in the closure**, call 174 (DESIGN §2.3) |
| 4 | `slices/readiness.ts`: 175-182 except the root cell lines 178-179 (`let resolveRouteDeps` + `routeDepsBuilt`): move those two to the top of the closure in this commit (nothing awaits `routeDepsBuilt` before 180); the slice receives `routeDepsBuilt` and `routeDeps` getter |
| 5 | `stages/connections.ts` for 168-171 and 175-182 around the closure-held 172-174 — or, if the stage cannot be contiguous, two stage functions `composeOutboundStage` (H1) and `composeReadinessStage` (H3); record which |

## STOP
```bash
D=apps/website/src/server/runtime/composition
grep -rn 'denyPrivateAddresses' $D --include=*.ts | grep -v __tests__ | wc -l | grep -qx 1 || echo "STOP: the egress policy literal exists in more than one place"
grep -n 'bindSharedApiOAuth = ' $D/deps.ts | wc -l | grep -qx 1 || echo "STOP: the bindSharedApiOAuth write left the closure"
```
Gates: COMMON §5; `site-root.late-contracts.pin.test.ts` (a) every commit; `external-mcp-oauth-loopback-wiring.unit.test.ts`, `memory-route-deps.test.ts` at sheet end.
