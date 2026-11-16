# Daemon untangle (wave E): index for R7 + R8 (design, 2026-11-16)

Docs only; nothing executed. Files: `R7-ROUTES.md` (daemon `src/http` → `ServerRoute[]`), `R8-RUNTIME.md` (daemon runtime ports), this index.

Bases: Jini `integ/wave-b-r2` @ `02edbb68` (r2 was present in both repos; the `wave-b-fixed` fallback was not used), Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `design-d2` @ `f6e1401e`, plan `plan/terra-2026-11-15` @ `9152711d`. Status: **revision 2, complete** (not partial).

**Revision 2 (2026-11-16).** A Codex gpt-6.1-sol HIGH judge reviewed R7 and R8 against the code: both *needs rework* (R7: 2 blockers, 12 majors, 1 minor; R8: 1 blocker, 11 majors, 1 minor). All 28 findings were re-verified and accepted; none rebutted; **0 blockers left**. Each design has a `## Judge response` table and a revision section (R7 §11, R8 §12). **§9 below replaces §2–§6 wherever they differ**; superseded lines are marked.

## 1. What was verified against the code

| Claim in LANES.md | Found |
|---|---|
| R7: "83 `mountJsonRoute(app)` calls" | **83** in 19 files: correct. But the directory registers **100 routes**: 83 JSON + **17 hand-mounted** (10 SSE, 2 NDJSON streams, 1 raw upload, 4 plain) + **3 path gates**. 28 exported `register*` functions. 30 files import `express`. 0 WebSocket/upgrade/multer. |
| R7 examples (`routines.ts:401-409`, memory 15, connectors 14) | correct |
| R7 "30 files, 75 lines" | 26 files carry 41 http-kit import lines today; C4's pass already repointed the rest to core *(rev 2: recount: 25 files, 40 lines)* |
| R8: "26 files, 42 lines" | outside `src/http`: **27 import lines in 21 files** (34 agent-runtime values, 9 platform values, 1 db value). Inside `src/http`, 6 more files carry the same kind of edge (19 agent-runtime values, 2 platform values). C3 already removed the storage-type lines. |
| "`terminal.adapter.ts` leaves per Q8" | no importer outside daemon in Jini packages or Tovu; clean move to the `server` preset |
| Callers | `server` preset: 19 register calls + `createAgentExecutor`, `openSqliteEventLog`, `withAiTracing`. Tovu: 9 register sites in `agent-daemon-scope.ts`, plus `daemon-access.ts`, `desktop-agent.ts`, `assistant-tool-exec.ts`, `visitor-frontend-control.ts`, `run-lifecycle-tracing.ts`. Example hosts: `reference-web`, `minimal-host`. Tests: 54 Jini http test files, 15 executor test files, 13 Tovu test files. |

Three findings that change the plan:

1. **No host can mount a `ServerRoute` today.** C4 landed the vocabulary in core but not a Node bridge. The reviewed one is on `design-d2` (`http-kit/src/node-bridge.ts`). It is a prerequisite LANES does not list.
2. **Tovu's `authorizeRun` refuses a mismatched principal, then narrows it.** *(rev 2: the first wording, "replaces the caller-supplied principal", was wrong and was the judge's first blocker.)* It answers 403 unless the caller's principal equals the run's recorded one, and only then strips every other field the caller sent. It cannot become plain middleware; R7 §3.5 turns it into a typed port that runs before validation.
3. **The launcher already has the seam.** `resolveAgentRuntimeDeps` / `resolveProcessDeps` are override-with-default functions. R8 is mostly deleting defaults, not inventing structure.

## 2. Prerequisites and their status at `02edbb68`

| Item | Needed by | Status | Size (Sonnet) |
|---|---|---|---|
| C3 storage contracts | R8 step 2 | **landed** (`core/contracts/storage`; daemon already uses it) | — |
| C4 server vocabulary | R7 | **landed** (`jsonRoute`, `createSseStream`, `withServerMiddleware`, `createInMemoryServer`, conformance) | — |
| C5 runtime ports | R8 steps 3–5, R7 (`attachments`, `host-tools`) | **landed** (`ProcessControlPort`, `CommandInvocationPort`, `FileLockPort`, `AtomicFileWriterPort` incl. `backupOriginalOnce`, `TerminalService`, `PtyPort`) | — *(rev 2: port types landed; the host binding in C5's sheet is a worked example, not code: §9.3)* |
| **C6** agents contract + `AgentRuntimePort` + `createAgentRuntimeBindings` | R8 steps 6–9; R7 pairs for `model-proxy`, `xai`, `research`, `agents` | **not landed** (no `core/contracts/agents`, no `daemon/src/ports`). Sheet is written. | 100k (already in LANES) |
| Q1 (server/cli are host presets) | host mounting, Q8 target | **answered yes** (DESIGN §7) | — |
| Q8 (Node adapters → host preset) | R8 step 3 | **answered** (DESIGN §7) | — |
| **C-ORIGIN-PORT** (GAPS §2) | R7 Phase 0 and every R7 test | **not landed** (`origin.ts` still carries `resolvedPortRef` + env fields) | 70k |
| **G-HTTP-AUTH** (GAPS §4.4) | R7 (`message-relay`, `remote-run-events`, `tool-execution-routes`, `route-manifest`) | **not landed** | 20k *(rev 2: also lands the constant-time compare fake; 30k)* |
| **C4-a / C4-b** (`sameOriginRefusal`, `withRouteMiddleware`; R7 §2.3) | R7 G2, G3 | **new, small** | 15k *(rev 2: plus C4-e, `keepAliveMs: false` and `backlog` frames; 35k)* |
| **P-NODE-BRIDGE** (land d2 `node-bridge.ts` + tests on top of C4; repoint its `./server-port.js` import to core) | R7 from P1 on, both hosts | **on `design-d2` only** | 40k *(rev 2: plus exported `sendWebResponse`, body-provenance, client-address and HEAD/OPTIONS tests; 60k)* |
| G-HTTPKIT-ORIGIN-MW (GAPS §4.5) | nothing in R7/R8 | optional; not required | — |
| G-SERVER-LOGIC / R13 | after R7 + R8 (R13 receives the PTY adapter's package metadata change and removes Express from the preset) | not started | in R13 |
| server-port Q4 (daemon JSON body limit) | R7 §3.6 (`maxBodyBytes`, dropping Tovu's blanket parser) | **open** (owner decision O-2) | — *(rev 2: answered by design, R7 §11.6: each host keeps its number)* |

New prerequisite work not in LANES: **~195k Sonnet** *(rev 2; was ~145k)*.

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
2. **R8a can start now.** It is file-disjoint from R7 inside daemon (`agent-executor/`, `terminal*`, `store/`, `ai-trace-lifecycle.ts` vs `src/http/`). *(rev 2: true for steps 0–5 only, with three assignments: §9.3)*
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

Why higher than LANES: the 17 hand-mounted routes (LANES counted only JSON), the characterization phase the size-design review showed is not optional, and the test harness swap in 54 test files. Calibrate on R7-G1's first three files and R8a step 2; re-plan if either is off by more than 40%. *(rev 2: new numbers in §9.2)*

Not included: cloud verification runs, the Chrome look at admin chat/site chat after G2 and G3 (SSE and uploads are user-visible), moving `xai.ts`/model-proxy vendor code out of daemon (O-1, ~90k + F3), splitting the five oversized http files, R13.

## 5. Risks

| # | Risk | Where | Guard |
|---|---|---|---|
| 1 | **Principal rewrite lost.** `authorizeRun` replaces the caller's principal with the run's recorded one by mutating `req.body`. A naive conversion lets a caller choose its principal. | R7 §3.5, tool-exec | typed `AuthorizeToolRun` port; T9 case "body names A, run recorded under B → executes as B" *(rev 2: restated in §9.4 row 1)* |
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
| O-1 | `xai.ts` (802 lines) and model-proxy's vendor tool turns are vendor code in daemon (C6 F1/F3). Move them out before, during or after R7? | **After.** R7 converts them in place (they are 6 plain JSON routes + 6 SSE routes); the move to the xAI provider is its own lane. One refactor type per change. | moving first saves ~35k of throwaway `XaiOAuthPort` wiring but blocks R7-G1 on a new design *(rev 2: **RESOLVED by owner: after R7**)* |
| O-2 | Body limit for daemon JSON routes once they read their own bodies (server-port Q4; Tovu enforces 6 MB today, the preset 100 KB) | one daemon constant `DAEMON_JSON_BODY_MAX_BYTES = 6 MiB` on the routes that take documents (run start, delegated tool calls, connectors), core default elsewhere; hosts may pass a lower value | keep host parsers forever and accept the double parse *(rev 2: **RESOLVED by design**: no shared constant; R7 §11.6)* |
| O-3 | `createDaemonAuthMiddleware`, `createRunOwnershipMiddleware`, `createOwnedRunListHandler` are Express glue used only by Tovu, and one mutates request headers | **move to Tovu** beside their callers (move + delete) | convert to `ServerMiddleware` writing `locals`; then every Tovu handler that reads the principal **header** must read `locals` instead (unknown count; needs its own census) |
| O-4 | The `server` preset keeps its own `express()` app during R7 (routes mounted through the Node bridge) and loses it in R13 | accept; Q1 lets a preset import anything | pull "preset off Express" into R7 (+~120k, and it changes gate code in `compose-jini-kernel.ts`) *(rev 2: **RESOLVED by owner: accepted**, as long as daemon sees only `ServerRoute`)* |
| O-5 | Is `_optional: Record<string, never> = {}` (default-valued, the form used package-wide today) allowed under "never `?: Record<string, never>`"? | yes, as the wave-B brief says | each `*Routes` takes one object when it has no options |
| O-6 | `daemon/src/http/index.ts` (394 lines) is the `./http` entry and is a barrel | keep as the package's one public entry (B1) during R7; consider per-group subpaths (`./http/memory`) in a later lane | add ~25 `exports` entries now and repoint every host import (+~60k) |
| O-7 | Launcher staging helpers call `node:fs`/`node:os` directly (8 files) | **no fs port**: one implementation, per-agent staging, tests use temp dirs | a `StagingFilesPort` in daemon (+~90k, touches every `claude/*`, `codex/*` helper) *(rev 2: narrowed: §9.5)* |
| O-8 | `kysely` types in 5 daemon store files and in `dependencies` vs "no library types in Jini domain packages" | follow whatever C3's B1 ruling decided for `StorageKernel<Kysely<DB>, DB>`; R8 changes nothing here | a storage follow-up lane, not R8 |
| O-9 | May Tovu import the preset's ready-made runtime binding object? | no; each host writes its 12 lines | export `nodeDaemonRuntimePorts` from `@jini-ai/server` *(rev 2: revised: §9.5)* |
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
- Whether C6, when it lands, moves `createAiTraceRecorder` and `normalizeAiUsage` to core (R8 §2.1). *(rev 2: answered: C6 `sheets/C6.md:223` moves both to core)*
- Exact cyclomatic/cognitive numbers for `handleFrontendSessionStream`, `runProxyStream` and the functions R8 edits in `launch.ts`/`events.ts` (run the repo's complexity ratchet before and after each pair).
- Whether `better-sqlite3` is still named by any daemon `src` file after R8 step 2 (decides the peer dependency).
- The byte-level SSE keepalive and header parity between `createSseChannel` and `createSseStream` (Phase 0 T6 answers it).
- No test, build or typecheck was run for this design. Counts come from `rg` and a small import-extraction script on the bases above.

## 9. Revision 2 (after the judge)

### 9.1 Judge findings

| File | Findings | Accepted | Rebutted | Blockers left |
|---|---|---|---|---|
| `R7-ROUTES.md` | 2 blockers, 12 majors, 1 minor | 15 (finding 14 in part: two of its five gaps are covered by owner decisions O-1, O-4) | 0 | 0 |
| `R8-RUNTIME.md` | 1 blocker, 11 majors, 1 minor | 13 (finding 9 with a narrower fix: lane K takes per-CLI staging) | 0 | 0 |

What was wrong in kind, so the next brief can name it: I described a security rewrite without tracing the check in front of it; I counted route consumers of the body parser but not the gate and the host routes behind it; I trusted `satisfies` for port bindings (it passed a binding that drops every CLI argument); I called a worked example in a sheet "landed"; I wrote tests against seams that do not exist yet.

### 9.2 Estimates (Sonnet executor tokens)

| Lane | Was | Now | Why |
|---|---|---|---|
| R7-P0 + P1 | 145k | **200k** | gate-by-gate matrix with a proven break per test (R7 §11.15), Tovu parser-chain and `authorizeRun` suites, path-matching cases, socket tests kept, both mount helpers and the commit latch |
| R7-G1 | 155k | **175k** | ambient `process.*`/fs defaults become required deps in the same pairs; double-parse measurement |
| R7-G2 | 150k | **185k** | commit latch, backlog frames, heartbeat per stream, model-proxy producer hand-off |
| R7-G3 | 155k | **170k** | surface helpers + two Tovu callers, caller-gate decision + four Tovu sites, raw-body mount; parser deletion removed |
| R7 ports + Z | 65k | 65k | |
| **R7 total** | 670k | **795k** | |
| R8a (steps 0–5) | 240k | **275k** | bindings and their tests, desktop + two probe callers, command call sites, tests in the same commit; AI trace moved out |
| R8b (steps 6–9) | 140k | **190k** | AI trace, runtime-state helper contracts, desktop |
| **R8 total** | 380k | **465k** | |
| Prerequisites | 145k | **195k** | C-ORIGIN-PORT 70k, G-HTTP-AUTH 30k, C4-a/b/e 35k, P-NODE-BRIDGE 60k |
| **Total** | ~1.2M | **~1.45M** | LANES said 0.76M |

Still not included: cloud verification runs, the Chrome look after G2 and G3, lane K, the xAI/model-proxy move (O-1, after R7), the size lanes, R13. No sub-lane is over 300k. Calibrate on R7-G1's first three files and R8a step 2; re-plan if either is off by more than 40%.

### 9.3 Order, and what can start now

```
 now ─► C-ORIGIN-PORT ─┐
 now ─► G-HTTP-AUTH ───┤
 now ─► C4-a, b, e ────┼─► R7-P0 ─► R7-P1 ─► G1 ─► G2 ─► G3 ─► Z (after R9 cms) ─► xAI/model-proxy move (O-1)
 now ─► P-NODE-BRIDGE ─┘
 now ─► R8a steps 0–4 ─► step 5 ──┐  (step 5 and C6 both edit launch.ts/contracts.ts: one after the other)
 C6 ──────────────────────────────┴─► R8b (6–9) ─► lane K (per-CLI folders → agent-runtime) ─► size-design 10 ─► R13
```

**R8a, re-verified against each prerequisite (R8 §12.5):**

| Step | Start now? | Condition |
|---|---|---|
| 0 Phase 0 tests | yes | only seams that exist today (R8 §12.7) |
| 1 port files, fakes, bindings | yes | R8a creates `packages/daemon/src/ports/` and the `./ports` export itself (they do not exist; C6 adds files beside later). The coordinator applies the manifest line. Bindings are written here: nothing of C5's worked Tovu block is in the tree. |
| 2 event log | yes | C3 types landed; no new port |
| 3 terminal + adapter move | yes | C5 types and Q8 landed |
| 4 antigravity permissions | yes | C5 ports landed |
| 5 process ports | yes | serialized with C6 on `launch.ts`, `contracts.ts` |
| 7 AI trace | **no** | needs C6 (it moves the functions to core); now in R8b |

Shared files, additions: `packages/daemon/src/agent-executor/{launch,contracts}.ts` (R8a step 5, C6, R8b), `packages/platform` runtime-ports file if O-9 is yes, `packages/core/src/contracts/server/sse.ts` (C4-e), Tovu `apps/desktop/src/desktop-agent.ts` (R7 and R8).

### 9.4 Risks, revised

| # | Risk | Guard |
|---|---|---|
| 1 | **Tool-run authorization weakened.** The equality check (`assistant-tool-exec.ts:216`), the field-stripping rewrite, or the authorize-before-validate order is lost in the port conversion. | R7 §3.5: nine cases, each proven to fail on its one-line break |
| 2 | **A security gate loses the parsed body.** The delegated route's run-credential re-check (`agent-daemon-scope.ts:1433`) and the discovery re-resolve read `req.body`. | Tovu's parsers stay; R7 §11.2 suite |
| 3 | **Port bound to the wrong shape.** Arguments in the other object, positional vs object, array vs object. | R8 §12.2 member-by-member table; binding tests with non-empty arguments; no command port |
| 4 | Upload stores re-serialized JSON, or corrupts bytes ≥ 0x80 | raw-body mount with no `parsedBody`; R7 §11.5 |
| 5 | Long replay never arrives (pull stream clears its queue on overflow) | C4-e `backlog`; `runs.test.ts:994` kept |
| 6 | Spawn race, cleanup ownership | unchanged: R8 R1–R3; synchronous return type |
| 7 | Heartbeats appear on nine streams that have none | C4-e `keepAliveMs: false`; T6 idle case |
| 8 | Path matching gets stricter without anyone deciding | P0 T2b + O-12 |
| 9 | node-pty enabled for hosts that never opted in | R8 §12.10; default-inert test |
| 10 | C6 lands without `hostEnvNames`/`capabilities` or with other signatures | STOP on a cast or a missing member |
| 11 | Double parse of bodies up to 6 MiB on every delegated tool call | measured in G1; follow-up O-13 |
| 12 | `agent-daemon-scope.ts`, `launch.ts`, `desktop-agent.ts` edited by several lanes | coordinator serializes |

Riskiest three: **1, 2, 3.**

### 9.5 Owner decisions

**Resolved**

| # | Answer |
|---|---|
| O-1 | xAI and model-proxy vendor code leaves daemon **after R7** (owner). R7 converts them in place. |
| O-2 | No shared limit constant. Each host passes today's number as `jsonBodyMaxBytes`; effective limits do not change (design, R7 §11.6). |
| O-4 | The `server` preset keeps Express until R13, **as long as daemon code sees only `ServerRoute`** (owner). R7 §11.9 keeps `Pack.http`'s `app` an Express app for the whole lane. |
| — | Per-CLI executor folders move to `agent-runtime/defs/<cli>/` in **lane K, after R8** (owner). R8 §12.14 lists what stays port-shaped so K is a move. |

**Still open** (recommendation first)

| # | Decision | Recommendation | If no |
|---|---|---|---|
| O-3 | `run-credentials.ts` Express factories | move to Tovu with their test | convert to middleware writing `locals`; census of header readers first |
| O-5 | `_optional: Record<string, never> = {}` | allowed (default-valued form) | one-object signatures where there are no options |
| O-6 | `http/index.ts` is a barrel (practice 5; B1 does not cover it) | per-group subpaths in a later lane; **until then R7 is not compliant on practice 5** | +~60k inside R7 |
| O-7 | *(narrowed)* the launcher's own temp-dir create/cleanup uses `node:fs` directly | leave until size-design 10 reshapes `launch.ts`, then a 2-member `StagingDirPort` | add the port in R8a (+~25k) |
| O-8 | `kysely` types in daemon stores | follow C3's ruling | storage follow-up lane |
| O-9 | *(revised)* where the three process adapters live (5 hosts need them) | **once, in platform** (`@jini-ai/platform/runtime-ports`, tested there) | each host copies C5's block |
| O-10 | cross-repo pair rule | accept | a one-wave forwarder (forbidden by practice 5) |
| **O-11** | SSE replay frames are exempt from the 1000-frame cap (C4-e `backlog`). More memory per reconnect, bounded by the replay already in memory; no truncate-and-reconnect. | accept; it is what `runs.test.ts:994` already asserts | keep the cap for replay; then core must also stop clearing queued frames on overflow, and that test is rewritten as a two-connection test (owner sign-off on the changed assertion) |
| **O-12** | Path matching becomes strict: trailing slash, upper-case path and a bad `%` escape answer 404 (today: match, match, 400) | accept **if** the P0 census finds no caller sending them | make the bridge compatible (+~25k in P-NODE-BRIDGE) |
| **O-13** | Tovu's 6 MB parser stays, so converted JSON routes parse twice | accept for R7; measure in G1; removal is a follow-up that first moves every body reader (R7 §11.2) | block R7 on that follow-up |
| **O-14** | Five http files stay over 500 lines after R7 (`attachments` 1639, `xai` 802, `model-proxy` 659, `memory` 603, `connectors` 527) | explicit exception until their size lanes; `xai` and `model-proxy` shrink with O-1 | run the size lanes first (they must then be redone on the new contract) |
| **O-15** | Two options exist only so a test need not mock another package: the preset's `terminal.shutdownGraceMs`, the frontend-session `setTimer` dep | accept (practice 8 and 1 over practice 11) | keep the `vi.mock` / the ambient timer and record the exception |

### 9.6 Not verified in this revision (do at dispatch)

- Who reads the route-registration guard's inventory (`route-registration-guard.ts:105`); converted routes no longer pass through `app.get`.
- Whether today's code, on a real socket, delivers a 1,167-event replay on one connection (the unit test uses a sink that never pushes back). P0 pins it; the answer feeds O-11.
- `writeJsonFileAtomicAsync`'s field names against `AtomicFileWriterPort.writeJson`.
- The full list of terminal tuning options the manager forwards (`terminal-session.ts:217` onward).
- Which daemon tests inject `createCommandInvocation`, and whether a CORS layer answers `OPTIONS` above the routes in each host.
- Upward imports inside the per-CLI folders (lane K input).
- No test, build or typecheck was run. Line references are to Jini `02edbb68`, Tovu `65302ee5`, d2 `f6e1401e`.
