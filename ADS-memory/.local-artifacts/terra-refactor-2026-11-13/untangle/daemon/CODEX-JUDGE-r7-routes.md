Software Architect(Review) / Security(Review): **Verdict: needs rework.**

References below use **Jini** at `02edbb68`, **Tovu** at `65302ee5`, and **d2** at `f6e1401e`. `R7` and `INDEX` refer to the supplied design files. No files were edited; no build or repository test suite was run.

1. **Blocker — The proposed authorization characterization accepts a request that currently fails closed.**

   **Evidence:** R7:288 requires “principal A, run recorded under B → executes as B.” Tovu `apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts:216` requires the supplied principal to equal the stored principal. Its middleware passes that supplied principal into the lookup at :233 and returns 403 when the lookup refuses at :234. The rewrite at :235 happens **after that equality check**; it strips caller-supplied authority while preserving read-only attenuation.

   R7 also moves authorization after `parseExecutionRequest`, although today authorization precedes that validation: Jini `packages/daemon/src/http/tool-execution-routes.ts:234` versus :183. This changes refusal precedence.

   **Fix:** Characterize mismatched principals as 403 with zero execution. Preserve equality, workspace/liveness checks, attenuation, and authorization-versus-validation ordering in the typed contract.

2. **Blocker — Removing Tovu’s blanket parser breaks a security gate and several host-owned routes.**

   **Evidence:** R7:297 and G3-6 delete the parser while R7:274 keeps the host gates in Express. Tovu `agent-daemon-scope.ts:1433` installs a second credential check that requires parsed `body.runId`. Jini `packages/daemon/src/http/run-credentials.ts:30` supplies `req.body`; `packages/daemon/src/run-credentials.ts:154` rejects unless its run ID matches the credential. Without the parser, legitimate delegated calls fail.

   The parser also serves Tovu-owned routes outside the 100-route inventory. For example, Tovu `apps/website/src/server/inbound/assistant/tool-access-lowering-route.ts:20` reads `req.body`; other consumers are registered at `agent-daemon-scope.ts:1448`, :1449, :1531 and :1538.

   **Fix:** Inventory every parser consumer before deletion. Retain scoped parsers for Express consumers, and explicitly preserve the credential recheck after parsing and before execution.

3. **Major — The SSE design does not resolve response commitment versus replay production.**

   **Evidence:** R7:214 says to complete lookup/setup before returning the response. Today Jini `packages/daemon/src/http/runs.ts:316` opens the channel inside the replay callback, allowing replay to drain before `lifecycle.stream()` resolves. `packages/daemon/src/run-lifecycle.ts:1140` delivers replay before returning the subscription.

   With core’s bounded stream, awaiting that subscription before returning its `Response` queues replay before the bridge can consume it. Core `packages/core/src/contracts/server/sse.ts:84` closes on overflow. An existing regression explicitly requires 1,167 replay events to arrive: `packages/daemon/src/http/__tests__/runs.test.ts:994`.

   Model proxy has the corresponding scheduling problem: `packages/daemon/src/http/model-proxy.ts:431` opens before awaiting the provider at :433.

   **Fix:** Specify the validation, response-commit, producer-start and subscription handoff protocol. Preserve the existing large-replay test, delayed-subscription cancellation, and pre-/post-commit error distinctions. A stalled-consumer overflow test alone does not cover this.

4. **Major — Converting every SSE route introduces heartbeats that cannot be disabled through the proposed options.**

   **Evidence:** R7:216 says wire differences can be handled through `formatEvent` and headers. The old `packages/http-kit/src/sse.ts:120` channel creates no heartbeat timer. Core `packages/core/src/contracts/server/sse.ts:88` unconditionally schedules `: ping\n\n`; its options at :37 provide no disabling switch. Only the old raw frontend-session primitive schedules these pings: `packages/http-kit/src/raw-sse.ts:92`.

   **Fix:** Preserve each stream’s existing heartbeat policy, including no heartbeat. Add the necessary core capability before conversion, or obtain approval for the behavior change. `formatEvent` cannot alter independently generated heartbeat frames.

5. **Major — The proposed consumed-upload check cannot detect the bridge’s reconstructed body.**

   **Evidence:** R7:225 promises that `request.body === null || request.bodyUsed` detects upstream consumption. d2 `packages/http-kit/src/node-bridge.ts:107` reconstructs a consumed body from `parsedBody`; :69 serializes objects into JSON. The resulting fresh `Request` has a non-null, unused body, so the proposed check accepts reconstructed bytes.

   The mounting instructions also conflict: R7:225 requires uploads above parsers, while :316 requires mounting at the former registration line. Tovu’s former line is :1602, below its parser at :1407.

   **Fix:** Define how raw-body provenance reaches the upload handler and give an explicit secure mounting sequence. Preserve authentication before upload processing and the consumed-body refusal during intermediate commits.

6. **Major — Body ceilings remain an unresolved dispatch prerequisite, with no host-specific contract.**

   **Evidence:** R7:296 proposes a daemon constant derived from O-2. INDEX’s O-2 recommends 6 MiB for selected routes, but the preset currently applies 100 KiB through `packages/server/src/compose-jini-kernel.ts:303`. Tovu applies 6 MiB at `agent-daemon-scope.ts:1407`. The proposed `DaemonRouteHost` has no body-limit field.

   This also affects frontend responses: Tovu’s comment at :1399 explicitly documents screenshot responses exceeding 100 KiB. They cannot retain core’s default after conversion.

   **Fix:** Resolve O-2 before dispatch and specify per-host limits with per-route exceptions. Cover frontend responses, claim requests, lookup requests and tool execution. A shared constant cannot encode both deployed host policies.

7. **Major — The caller inventory omits consumers of changed Express-facing helpers.**

   **Evidence:** R7 §1.3 claims “every” caller but omits:

   - Tovu `apps/website/src/server/runtime/composition/modules/assistant.ts:513`, which directly calls `tryRestoreSurface`.
   - Tovu `apps/website/src/assistant/mcp-ui-tool-calls-route.ts:227`, which calls `deliverSurfaceCallback`.

   These helpers currently accept Express responses. Jini `packages/daemon/src/http/surface-restoration.ts:29` can return `false` **without committing a response**, enabling Tovu’s remote fallback at `assistant.ts:521`. Its heartbeat also starts only after the first emitted frame (:23). The proposed eager 200 line-stream contract does not explain how either property survives.

   **Fix:** Add both consumers and their tests to the same migration commit. Define an unhandled/response result contract and preserve lazy commitment, fallback, cancellation and restoration-specific error responses.

8. **Major — The exported caller gate has no migration contract for its Express consumers.**

   **Evidence:** R7:271 converts `requireToolExecutionCaller` into middleware usable by `withRouteMiddleware`, while retaining its export. Its existing consumers require an Express `RequestHandler`: Tovu `assistant-tool-exec.ts:95`, :97; `agent-daemon-core-rpc.ts:29`; and `desktop-mcp-handoff.ts:26`.

   Returning `ServerMiddleware` cannot satisfy those call sites. The design identifies the consumers but does not specify their replacement mounting sequence.

   **Fix:** Define the shared authorization decision and host adapter, or convert these host routes together. Include token-before-parser ordering and caller/test updates in that commit.

9. **Major — The preset migration cannot use the proposed `app` contract one file at a time.**

   **Evidence:** R7:342 changes built-in packs to receive a `Server`, while G1 converts one file per pair. Today `packages/server/src/compose-jini-kernel.ts:186` passes one `app` through `mountPackHttp`; `packages/http-kit/src/pack-http.ts:34` forwards it unchanged. Unconverted packs require Express methods; converted examples call `.route()`.

   The design does not identify the commit that introduces coexistence. Switching the shared argument early breaks remaining registrars; switching it late breaks converted ones.

   **Fix:** Specify and land a working mixed-state host mounting mechanism first. Preserve Express contracts for unconverted and caller-owned packs until their own conversion commits.

10. **Major — Path matching changes beyond the named precedence rule are unaccounted for.**

    **Evidence:** The preset creates a default Express app at `packages/server/src/create-local-node-daemon.ts:374`. Core `packages/core/src/contracts/server/route-table.ts:35` requires equal segment counts and :41 compares literals exactly. Thus default Express behavior for trailing slashes and case differs—for example `/api/runs/` and `/API/runs`.

    R7:440 identifies abort logging as the sole known difference; T2 tests only literal-versus-parameter precedence.

    **Fix:** Characterize trailing slashes, case, HEAD, OPTIONS and malformed parameter encoding. Resolve compatibility at the shared matching boundary or record approved behavior changes.

11. **Major — The constant route manifest is being replaced with dependency-bound runtime construction without an initialization design.**

    **Evidence:** R7:192 derives `JINI_ROUTE_MANIFEST` from instantiated route lists. Today `packages/daemon/src/http/route-manifest.ts:4` promises inert inventory available without mounting. Its constant at :75 derives paths from existing specs; it does not hand-copy path strings.

    New list factories require host and service dependencies, and some allocate per-registration state—for example `active-context.ts:143`. No producer, initialization point or consumer handoff is specified for the exported constant.

    **Fix:** Preserve inert metadata derived from the owning descriptors, or explicitly migrate the manifest API and its consumers. Do not instantiate live route families at import time or introduce a mutable startup registry implicitly.

12. **Major — The constant-time comparison port is missing from the target dependency contract.**

    **Evidence:** C4-c moves bearer parsing and loopback classification, but neither supplies token comparison. Current tool-exec uses it at `tool-execution-routes.ts:75`, and remote-event authorization uses it at `remote-run-events.ts:88`.

    The existing http-kit implementation binds native crypto at `packages/http-kit/src/api-security-middleware.ts:83`. Core’s reusable implementation requires an injected `TimingSafeByteComparison`: `packages/core/src/token.ts:46`.

    **Fix:** Add the required host-bound comparison capability and its fake before removing http-kit imports. Reuse the core matcher; do not replace it with ordinary equality or a new hidden native default.

13. **Major — Phase 0 contains incorrect baseline expectations and loses necessary transport coverage.**

    **Evidence:** Beyond finding 1:

    - T6 broadly requires cross-origin SSE refusal, but `packages/daemon/src/http/runs.ts:362` intentionally mounts its stream without an origin guard.
    - T11 assumes token rejection before parsing across the preset. `compose-jini-kernel.ts:294` provides that ordering only for `sidecar-strict`; `jini-local` installs its parser at :303 before bearer middleware at :314.
    - R7:378 replaces socket tests with an in-memory server. That server directly invokes handlers at `packages/core/src/contracts/server/testing.ts:26`; it cannot verify Node flushing, socket backpressure or dispatcher fallthrough.

    **Fix:** Make expectations route- and security-profile-specific. Keep socket-level contract tests in the appropriate host/integration suite, including streamed/chunked body-limit cases. Do not skip tests merely because the new unit harness cannot express their assertions.

14. **Major — Mandatory target constraints are deferred without approved exceptions, so the completion and estimate claims are premature.**

    **Evidence:** R7:383 explicitly leaves five oversized files; :431 leaves ambient runtime dependencies; :435 retains the HTTP barrel. Concrete examples include `frontend-sessions.ts:336` calling `setTimeout`, `host-tools.ts:103` constructing filesystem/environment defaults, and `http/index.ts:2` re-exporting implementation modules.

    INDEX O-6 cites B1 as permitting the barrel, but B1 governs allowed **imports**; it does not override the supplied prohibition on re-export shells. Shrinking an oversized file also does not satisfy the stated final size limit.

    **Fix:** Obtain explicit exceptions or include the required prerequisite work. Update order and estimates around the compliant final state. Token estimates themselves were not independently measurable in this review.

15. **Minor — The http-kit import census is incorrect, and duplicate-registration equivalence is false.**

    **Evidence:** R7:23 and INDEX:13 report 41 imports in 26 files. The pinned source contains **40 `from '@jini-ai/http-kit'` statements in 25 non-test HTTP files**. `http/index.ts:1` mentions http-kit in a comment.

    R7:263 also claims Express already raises the equivalent duplicate-registration error. The installed guard defaults to inventory-only behavior: `packages/http-kit/src/route-registration-guard.ts:69`; the preset supplies no guarded keys at `create-local-node-daemon.ts:376`. Moreover, separate dispatchers created by separate `mountJiniRoutes` calls cannot detect duplicates across those calls.

    **Fix:** Correct the census and specify the intended duplicate-registration policy explicitly.

The aggregate 83 JSON routes, 17 hand-mounted routes, 28 exported registrars, 30 Express-importing files and 54 HTTP test files were verified. C3–C5 are present; C6 contracts, C-ORIGIN-PORT, the proposed auth-helper moves and node-bridge are absent from the integration ref; node-bridge exists on d2. The referenced standalone GAPS document was not available locally, so its additional contracts were not verified.

## Recurring mistake classes

- Trace authorization predicates before describing identity rewriting.
- Inventory parser consumers across the entire host middleware chain.
- Specify response commitment, production, backpressure and cleanup as separate lifecycle events.
- Design every intermediate API state before promising independently green commits.
- Preserve inert metadata without constructing live services.
- Write characterization expectations from deployed behavior, including security-profile differences.
- Treat owner constraints as acceptance criteria; record exceptions before excluding their cost.
