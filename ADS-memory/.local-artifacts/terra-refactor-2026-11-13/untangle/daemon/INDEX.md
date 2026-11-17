# Daemon untangle (wave E): index for R7 + R8 (design, 2026-11-16)

Docs only; nothing executed. Files: `R7-ROUTES.md` (daemon `src/http` → `ServerRoute[]`), `R8-RUNTIME.md` (daemon runtime ports), this index.

Bases: Jini `integ/wave-b-r2` @ `02edbb68` (r2 was present in both repos; the `wave-b-fixed` fallback was not used), Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `design-d2` @ `f6e1401e`, plan `plan/terra-2026-11-15` @ `9152711d`. Status: **complete**, not partial.

## 1. What was verified against the code

| Claim in LANES.md | Found |
|---|---|
| R7: "83 `mountJsonRoute(app)` calls" | **83** in 19 files: correct. But the directory registers **100 routes**: 83 JSON + **17 hand-mounted** (10 SSE, 2 NDJSON streams, 1 raw upload, 4 plain) + **3 path gates**. 28 exported `register*` functions. 30 files import `express`. 0 WebSocket/upgrade/multer. |
| R7 examples (`routines.ts:401-409`, memory 15, connectors 14) | correct |
| R7 "30 files, 75 lines" | 26 files carry 41 http-kit import lines today; C4's pass already repointed the rest to core |
| R8: "26 files, 42 lines" | outside `src/http`: **27 import lines in 21 files** (34 agent-runtime values, 9 platform values, 1 db value). Inside `src/http`, 6 more files carry the same kind of edge (19 agent-runtime values, 2 platform values). C3 already removed the storage-type lines. |
| "`terminal.adapter.ts` leaves per Q8" | no importer outside daemon in Jini packages or Tovu; clean move to the `server` preset |
| Callers | `server` preset: 19 register calls + `createAgentExecutor`, `openSqliteEventLog`, `withAiTracing`. Tovu: 9 register sites in `agent-daemon-scope.ts`, plus `daemon-access.ts`, `desktop-agent.ts`, `assistant-tool-exec.ts`, `visitor-frontend-control.ts`, `run-lifecycle-tracing.ts`. Example hosts: `reference-web`, `minimal-host`. Tests: 54 Jini http test files, 15 executor test files, 13 Tovu test files. |

Three findings that change the plan:

1. **No host can mount a `ServerRoute` today.** C4 landed the vocabulary in core but not a Node bridge. The reviewed one is on `design-d2` (`http-kit/src/node-bridge.ts`). It is a prerequisite LANES does not list.
2. **Tovu's `authorizeRun` rewrites the request body** (replaces the caller-supplied principal with the run's recorded one). It cannot become plain middleware; R7 turns it into a typed port (`R7-ROUTES.md` §3.5).
3. **The launcher already has the seam.** `resolveAgentRuntimeDeps` / `resolveProcessDeps` are override-with-default functions. R8 is mostly deleting defaults, not inventing structure.

## 2. Prerequisites and their status at `02edbb68`

| Item | Needed by | Status | Size (Sonnet) |
|---|---|---|---|
| C3 storage contracts | R8 step 2 | **landed** (`core/contracts/storage`; daemon already uses it) | — |
| C4 server vocabulary | R7 | **landed** (`jsonRoute`, `createSseStream`, `withServerMiddleware`, `createInMemoryServer`, conformance) | — |
| C5 runtime ports | R8 steps 3–5, R7 (`attachments`, `host-tools`) | **landed** (`ProcessControlPort`, `CommandInvocationPort`, `FileLockPort`, `AtomicFileWriterPort` incl. `backupOriginalOnce`, `TerminalService`, `PtyPort`) | — |
| **C6** agents contract + `AgentRuntimePort` + `createAgentRuntimeBindings` | R8 steps 6–9; R7 pairs for `model-proxy`, `xai`, `research`, `agents` | **not landed** (no `core/contracts/agents`, no `daemon/src/ports`). Sheet is written. | 100k (already in LANES) |
| Q1 (server/cli are host presets) | host mounting, Q8 target | **answered yes** (DESIGN §7) | — |
| Q8 (Node adapters → host preset) | R8 step 3 | **answered** (DESIGN §7) | — |
| **C-ORIGIN-PORT** (GAPS §2) | R7 Phase 0 and every R7 test | **not landed** (`origin.ts` still carries `resolvedPortRef` + env fields) | 70k |
| **G-HTTP-AUTH** (GAPS §4.4) | R7 (`message-relay`, `remote-run-events`, `tool-execution-routes`, `route-manifest`) | **not landed** | 20k |
| **C4-a / C4-b** (`sameOriginRefusal`, `withRouteMiddleware`; R7 §2.3) | R7 G2, G3 | **new, small** | 15k |
| **P-NODE-BRIDGE** (land d2 `node-bridge.ts` + tests on top of C4; repoint its `./server-port.js` import to core) | R7 from P1 on, both hosts | **on `design-d2` only** | 40k |
| G-HTTPKIT-ORIGIN-MW (GAPS §4.5) | nothing in R7/R8 | optional; not required | — |
| G-SERVER-LOGIC / R13 | after R7 + R8 (R13 receives the PTY adapter's package metadata change and removes Express from the preset) | not started | in R13 |
| server-port Q4 (daemon JSON body limit) | R7 §3.6 (`maxBodyBytes`, dropping Tovu's blanket parser) | **open** (owner decision O-2) | — |

New prerequisite work not in LANES: **~145k Sonnet**.

## 3. Order

```
            ┌─ C-ORIGIN-PORT ─┐
 now ───────┼─ G-HTTP-AUTH ───┼─► R7-P0 ─► R7-P1 ─► R7-G1 ─► R7-G2 ─► R7-G3 ─► R7-Z (after R9 cms)
            ├─ C4-a, C4-b ────┤                         ▲
            └─ P-NODE-BRIDGE ─┘                         │ ports for model-proxy/xai/research/agents
 now ─────────► R8a (steps 0–5, 7) ──────────┐          │
 C6 lands ─────────────────────────────────► R8b (steps 6, 8, 9) ─► size-design 10 (reworked) ─► R13
```

1. Four small prerequisites in parallel. C-ORIGIN-PORT must land before R7-P0 (both rewrite the same 19 daemon test files).
2. **R8a can start now.** It is file-disjoint from R7 inside daemon (`agent-executor/`, `terminal*`, `store/`, `ai-trace-lifecycle.ts` vs `src/http/`).
3. R7 runs P0 → P1 → G1 → G2 → G3. G1's `xai`, `research`, `agents` pairs and G2's `model-proxy` pair take their C6 ports in a second commit once C6 lands; the route conversion itself does not wait for C6.
4. R8b after C6.
5. size-design 10 (launcher split) is re-designed on the post-R8 file (`R8-RUNTIME.md` §7).
6. R7-Z deletes http-kit's Express pieces only when cms (R9) has converted too.

**Shared files (coordinator serializes, lanes do not edit in parallel):** `packages/daemon/package.json`, `packages/daemon/src/index.ts`, `packages/server/src/create-local-node-daemon.ts`, Tovu `agent-daemon-scope.ts` (R7 mount lines and R8's one `createAgentExecutor` statement; also a size-design target), `scripts/injection-debt.json`.

**Cross-repo rule.** A step is a pair: one Jini commit, one Tovu commit. Tovu is checked only against the Jini SHA named in its commit message. This is the only way to delete the old function (no shells) and keep both repos green; see O-10.

## 4. Estimates (Sonnet executor tokens)

| Lane | Content | Tokens | LANES said |
|---|---|---|---|
| R7-P0 + P1 | 12 characterization files (100-row matrix, SSE/NDJSON/upload/gates), 3 shared files, Tovu `jini-routes.ts` | 145k | |
| R7-G1 | 14 JSON-only files, 54 routes, ~11k each incl. callers and test harness swap | 155k | |
| R7-G2 | 6 files, 39 routes, 10 SSE | 150k | |
| R7-G3 | 6 files, 7 routes (upload, NDJSON, cookies), drop Tovu parsers, D3 move | 155k | |
| R7 ports + Z | 6 http files take C5/C6 ports; delete http-kit Express pieces; manifests | 65k | |
| **R7 total** | 5 sub-lanes, each under 300k | **670k** | 450k |
| R8a | Phase 0 (80k), port files + fakes (25k), event log (15k), terminal + Q8 move (30k), antigravity (20k), process ports (55k), ai-trace (15k) | 240k | |
| R8b | agent runtime port in `launch.ts`/`events.ts` + 15 test files to fakes (120k), type repoints (10k), manifest (10k) | 140k | |
| **R8 total** | | **380k** | 310k |
| New prerequisites | C-ORIGIN-PORT 70k, G-HTTP-AUTH 20k, C4-a/b 15k, P-NODE-BRIDGE 40k | 145k | not listed |
| **Total** | | **~1.2M Sonnet** | 0.76M |

Opus: one batched wave-E review (already in LANES, ~40k). No further Opus design is needed for R7/R8; C6's own design is done.

Why higher than LANES: the 17 hand-mounted routes (LANES counted only JSON), the characterization phase the size-design review showed is not optional, and the test harness swap in 54 test files. Calibrate on R7-G1's first three files and R8a step 2; re-plan if either is off by more than 40%.

Not included: cloud verification runs, the Chrome look at admin chat/site chat after G2 and G3 (SSE and uploads are user-visible), moving `xai.ts`/model-proxy vendor code out of daemon (O-1, ~90k + F3), splitting the five oversized http files, R13.

## 5. Risks

| # | Risk | Where | Guard |
|---|---|---|---|
| 1 | **Principal rewrite lost.** `authorizeRun` replaces the caller's principal with the run's recorded one by mutating `req.body`. A naive conversion lets a caller choose its principal. | R7 §3.5, tool-exec | typed `AuthorizeToolRun` port; T9 case "body names A, run recorded under B → executes as B" |
| 2 | **Upload corruption or silent re-serialization.** Web body chunks are `Uint8Array`, not `Buffer` (`String(chunk)` becomes a number list); behind a JSON parser the bridge would hand the route re-serialized JSON. | R7 §3.2 | T8 binary round-trip with bytes ≥ 0x80; consumed-body case; mount above parsers |
| 3 | **Spawn race and cleanup ownership.** Spawn + listener registration must stay in one synchronous turn; the runtime lock and staged files are released by lifecycle callbacks, not a `finally`. A port that adds an `await`, or a binding that wraps `spawn`, breaks it without failing a happy-path test. | R8 §4 | synchronous `ProcessSpawnPort`; R1–R3 written first and proven able to fail |
| 4 | Gate order under dispatcher-per-line mounting (health above parser and auth; token gate before body parse) | R7 §4 | T11 at host level in the preset and Tovu |
| 5 | SSE behaviour drift (frame bytes, keepalive, replay cursor on repeated query keys, exited-terminal replay, listener leaks) | R7 §3.1 | T6; `createDeferredEndGate` deleted only after its scenario passes on the new stream |
| 6 | Double JSON parse of multi-megabyte bodies while Tovu keeps its blanket parser | R7 §3.6 | bounded by host limit during R7; removed at G3-6 |
| 7 | Core's 100 KiB default rejects bodies the hosts accept today | R7 §3.6 | every large route sets `maxBodyBytes`; T4 limit±1 |
| 8 | `agent-daemon-scope.ts` is edited by R7, R8 and a size design | both | coordinator serializes; lanes guard by statement, not line |
| 9 | 35 daemon test files import the real agent-runtime; converting them could tempt assertion removal | R8 §5.2 | classify (a)/(b)/(c); (b) left for Q5's lane; test count reported per pair |
| 10 | C6 lands with signatures that differ from its sheet §4b | R8b | STOP on any `satisfies` cast |

Riskiest three calls: **1, 2, 3.**

## 6. Owner decisions

| # | Decision | Recommendation | If no |
|---|---|---|---|
| O-1 | `xai.ts` (802 lines) and model-proxy's vendor tool turns are vendor code in daemon (C6 F1/F3). Move them out before, during or after R7? | **After.** R7 converts them in place (they are 6 plain JSON routes + 6 SSE routes); the move to the xAI provider is its own lane. One refactor type per change. | moving first saves ~35k of throwaway `XaiOAuthPort` wiring but blocks R7-G1 on a new design |
| O-2 | Body limit for daemon JSON routes once they read their own bodies (server-port Q4; Tovu enforces 6 MB today, the preset 100 KB) | one daemon constant `DAEMON_JSON_BODY_MAX_BYTES = 6 MiB` on the routes that take documents (run start, delegated tool calls, connectors), core default elsewhere; hosts may pass a lower value | keep host parsers forever and accept the double parse |
| O-3 | `createDaemonAuthMiddleware`, `createRunOwnershipMiddleware`, `createOwnedRunListHandler` are Express glue used only by Tovu, and one mutates request headers | **move to Tovu** beside their callers (move + delete) | convert to `ServerMiddleware` writing `locals`; then every Tovu handler that reads the principal **header** must read `locals` instead (unknown count; needs its own census) |
| O-4 | The `server` preset keeps its own `express()` app during R7 (routes mounted through the Node bridge) and loses it in R13 | accept; Q1 lets a preset import anything | pull "preset off Express" into R7 (+~120k, and it changes gate code in `compose-jini-kernel.ts`) |
| O-5 | Is `_optional: Record<string, never> = {}` (default-valued, the form used package-wide today) allowed under "never `?: Record<string, never>`"? | yes, as the wave-B brief says | each `*Routes` takes one object when it has no options |
| O-6 | `daemon/src/http/index.ts` (394 lines) is the `./http` entry and is a barrel | keep as the package's one public entry (B1) during R7; consider per-group subpaths (`./http/memory`) in a later lane | add ~25 `exports` entries now and repoint every host import (+~60k) |
| O-7 | Launcher staging helpers call `node:fs`/`node:os` directly (8 files) | **no fs port**: one implementation, per-agent staging, tests use temp dirs | a `StagingFilesPort` in daemon (+~90k, touches every `claude/*`, `codex/*` helper) |
| O-8 | `kysely` types in 5 daemon store files and in `dependencies` vs "no library types in Jini domain packages" | follow whatever C3's B1 ruling decided for `StorageKernel<Kysely<DB>, DB>`; R8 changes nothing here | a storage follow-up lane, not R8 |
| O-9 | May Tovu import the preset's ready-made runtime binding object? | no; each host writes its 12 lines | export `nodeDaemonRuntimePorts` from `@jini-ai/server` |
| O-10 | "Every commit compiles" across two repos with no shells | accept the **pair** rule (§3) | allow a one-wave forwarder, which the no-shells rule forbids |

## 7. Lessons checklist (size-designs `LESSONS-FOR-DESIGN-BRIEFS.md`, all 11)

| # | Lesson | Where applied |
|---|---|---|
| 1 | Partition by the real dependency graph | R7 groups by transport kind (JSON / SSE / raw), not by file order; R8 steps by port family and by who calls whom |
| 2 | Inventory every declaration, export, state cell, consumer | R7 §1 (100 routes, 28 registers, 12 Express-typed exports, callers, tests); R8 §1 (every import with file:line, callers, mocks) |
| 3 | Late-bound reads | `resolvedPortRef` read per call stays a closure (C-ORIGIN-PORT `port: () => …`); `hostEnv` resolved once at executor creation, as today; `spawn` stays synchronous |
| 4 | Inputs, outputs, init point, owner of mutable state | R7 §3.4 state cells; R8 §4 ownership table |
| 5 | Migration graph, each commit alone | R7 §5 pairs; R8 §6 steps; shared files named |
| 6 | Tests that can fail on the named risk | R7 §6 (T1–T12), R8 §5.1 (R1–R12), each with the mutation that must break it |
| 7 | Keep optional values, fallbacks, errors distinct | `authorizeRun` verdict as data; `Result` from `readJsonBody`; ports required instead of defaulted |
| 8 | Limits inside each proposed file | new files ≤ 120 lines, new functions ≤ 30; oversized files only shrink; pre-existing breaches named, not hidden |
| 9 | Generic mechanism vs host binding | D3 (middleware factories to Tovu); Express adapter in Tovu; bindings in host files |
| 10 | Untangle lanes are prerequisites; follow the latest destination | C4/C5/C6/C-ORIGIN-PORT/G-HTTP-AUTH status table; R8 before size-design 10; debt keys retired by the coordinator |
| 11 | Verify seams and commands exist | `createInMemoryServer` exists in core; `node-bridge` exists only on `design-d2`; C6 fakes do not exist yet; per-package tests run as `npm --prefix packages/daemon run test` |

## 8. What the designs did not verify (do at dispatch)

- Which Tovu handlers read the run-principal **header** downstream of `createDaemonAuthMiddleware` (matters only if O-3 = no).
- Whether C6, when it lands, moves `createAiTraceRecorder` and `normalizeAiUsage` to core (R8 §2.1).
- Exact cyclomatic/cognitive numbers for `handleFrontendSessionStream`, `runProxyStream` and the functions R8 edits in `launch.ts`/`events.ts` (run the repo's complexity ratchet before and after each pair).
- Whether `better-sqlite3` is still named by any daemon `src` file after R8 step 2 (decides the peer dependency).
- The byte-level SSE keepalive and header parity between `createSseChannel` and `createSseStream` (Phase 0 T6 answers it).
- No test, build or typecheck was run for this design. Counts come from `rg` and a small import-extraction script on the bases above.
