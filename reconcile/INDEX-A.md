# Index A — reconcile run, 2026-11-16

Status: **complete** (not partial). Docs only; no source file edited; no test run.
Code read at Tovu `refactor/terra` `80b00f5b`, Jini `refactor/terra` `02edbb68`, plus the running build branches named below.
Files of this run: `AMENDMENTS-A.md` (`3742fe5a`), `SEQUENCE.md` (`e5930fba`), this file. Branch `plan/reconcile-2026-11-16`.

## 1. Partial items

| Item | Cross-check finding | Verdict | Checked in code | Amendment |
|---|---|---|---|---|
| Size 02 | default-argument decision stale; no `createInMemoryApp` | **Accepted**, and the design's count corrected: 26 zero-argument calls in 7 test files plus one `createApp(undefined, …)`, not "68 files" | AST count on `apps/website`; `app.ts:2040`, `:1634` | A1.1–A1.5 (overrides §1 fact 1, §2.4, §3 row P2, §5 rows 4 and 10) |
| Size 06 | 62 zero-parameter methods deferred; R2 and R3 disagree | **Accepted**. 06-c is not an open decision: the no-required shape is already a recorded rule and is used in the file | AST count: 219 methods = 115 done, 62 zero, 31 one required object, 11 one optional object; `desktop-args/PLAN.md:21-24`; `dedupe/PLAN.md:30`; `api.ts:27,2412` | A2.1–A2.4 (overrides R2 last bullet, R3 row P2, R5) |
| Size 09 | identity test cannot hold on the baseline | **Accepted** | `ChatPane.tsx:837-855` inline arrow, no dependency array; `:685` calls it at once and only when `embed` is falsy | A3.1 (R1.1), A3.2 (R2) |
| Size 10 | R1 and R4 give two listener orders | **Accepted** | `launch.ts:1659-1706`: spawn (sync) → `once('exit')` → `wireRunInput` → await confirm | A4.1 (R4, R6 step 4), A4.2 (R5), A4.4 (R6 prerequisites) |
| R7 | body-limit headroom refuses bodies the parser accepted | **Accepted**; numbers reproduced (100,001 → 440,001; 6,000,001 → 26,400,001); bound 5.25× derived | core `request-body.ts` counts the rebuilt stream; `compose-jini-kernel.ts:303` | A5.1–A5.5 (overrides §11.6 table and "headroom" text; adds to §11.17 and T4) |
| R8 major 8 | wrong capability receiver | **Accepted** | C6 `sheets/C6.md:181` (`defs.capabilities`), `:188` (`launch.hostEnvNames`) | A6.1 (§12.8, STOP `:499`, INDEX risk 10) |
| R8 major 9 | launcher filesystem effects have no owner | **Accepted**; assigned | `launch.ts:820,824,837,1049,1157,1160` call `node:fs` directly | A6.2 (§12.9), A4.3 (the port and its step) |
| Import cycles major 7 | size limits left to decision 9 | **Accepted** for `types.ts` (with a corrected fact: 22 domain interfaces, not one) and for the two roots; **rebutted as a blocker** for the three long feature functions (recorded debt, not worsened; follow-up lane named) | `routes/types.ts:167-1352`; `size-debt.json:978,1279,1643` | A7.1, A7.2, A7.3 (override §4.1's last three bullets and decision 9) |

Designs whose fixes hold (size 01, 03, 04, 05, 08, run finalizer): no amendment. Size 07: dropped by owner.

## 2. Cross-design conflicts

| # | Conflict | Resolution | Amendment |
|---|---|---|---|
| 1 | R8 `launch.capabilities` vs C6 `defs.capabilities` | R8 changes; C6 untouched, no alias | A6.1 |
| 2 | R8 leaves the filesystem port open; size 10 assumes it exists | **Size 10 owns it**: new step 0c, `RunStagingPort` (6 members, each mapped to a line), member `staging` of `AgentExecutorRuntimePorts`, binding in `@jini-ai/platform/runtime-ports/fs` | A4.3, A6.2 |
| 3 | J2's helper owner vs lane K | Final owner `agent-runtime`; J2 creates a K-movable leaf in daemon first; order R8b → J2 → lane K → size 10; K0 moves the shared types to core, then one `git mv` | A7.4; `SEQUENCE.md` H2 |
| 4 | AG-UI S2.5 uses `mountJiniRoutes` before R7 P1 exists | S2.5 depends on R7 P1; 2.1 follows C4-e in `sse.ts`; 2.1–2.4 may land earlier | A8; `SEQUENCE.md` H3, H5 |

Shared-hotspot order: `SEQUENCE.md` H1–H8. It differs from cross-check A's proposal in one place, with the reason given
there: lane K comes **before** size 10 (lesson 10), so J2 moves in front of K. Run B's X6 was aligned to the same chain (`c8065b58`).

## 3. Changes needed in the running build runs

| Run | Change |
|---|---|
| `refactor/size-02-app` (steps 1–3) | **None.** Its two deviations are ratified (A1.4). Steps 3a–3c are dispatched after step 3 lands. |
| `refactor/daemon-prereqs`, step **P-NODE-BRIDGE** | **One addition:** `maxReserializedJsonBytes`, the rebuilt-request header rule, and their tests (A5.1–A5.3). If the step is already pushed, a follow-up commit P-NODE-BRIDGE-b before R7 P0. C-ORIGIN-PORT, G-HTTP-AUTH, C4-a/b/e: no change. |
| `refactor/daemon-r8a` (done) | No rework. Step 4's port-taking change is folded into step 5 (A6.3). Step 5 uses `defs.capabilities` only in R8b, so nothing landed needs editing. |
| `refactor/size-03-render`, `refactor/size-05-posteditor` | None. |

## 4. Owner decisions

Applied as already made: 02-a, O-4, xai/model-proxy after R7, lane K after R8, size 07 dropped, A50 full origin, finalizer engine to Jini.

Closed by this run without a new decision (say no if you disagree):

| Id | What | Why no decision was needed |
|---|---|---|
| 06-c | zero-input method shape | recorded rule + in-file precedent (A2.1) |
| IC decision 9, `types.ts` and root baselines | no raise | a pure-move split exists (A7.1); roots wait for size 01/02 (A7.2) |

Still for the owner:

| Id | Question | Default taken here | Other option |
|---|---|---|---|
| D-1 (was O-7) | Who adds the launcher's filesystem port? | size-10 step 0c, 6 members | add it in R8a step 5 (hosts edited once instead of twice; step 5 grows by about 25k) |
| D-2 | Size 10 before or after lane K? | after K | before K if K is far off; then size 10's leaf map must leave every per-CLI call site in `launch.ts` untouched and K re-edits up to 15 small files |
| D-3 | Follow-up size lane for `buildSourceControlRegistrations`, `bindTovuCredentialToolOperations`, `buildExternalMcpRegistrations` (all over 80 lines) | new lane, not part of the cycle work | named exceptions in `size-exceptions.json` |
| D-4 | `launch.ts:1050` swallows the temp-cleanup error into a fixed warning | follow-up with its own test (behaviour change, so not in a move) | accept as is |
| 06-b | red admin baseline: fix first or named exception | unchanged from the design | — |

## 5. Owner practices, checked against the amendments

| Practice | Result |
|---|---|
| DI via typed ports | A4.3 adds one port, bound by the host; A5 adds no port (a pure helper beside the code that re-serializes) |
| args `(required, optional = {})` | every new function in A1, A4, A5 uses it; A2 applies it to all 219 client methods |
| functions ≤50, files ≤500, complexity ≤10 | `spawnAndWire` and `runAgent` ≤50 (A4.1); `types.ts` goes under 500 by a move (A7.1); three functions stay over and are named, not hidden (D-3) |
| feature slicing; no barrels, shells, forwarders | `createInMemoryApp` composes two calls and re-exports nothing; ports ship one file per subpath; K moves the leaf, never copies it |
| why-comments move | named in A1.3, A4.1, A5.1 |
| a Jini package imports only itself + core + protocol | the J2 leaf imports only `node:` and core types so K can move it; daemon never imports agent-runtime for it |
| tests use fakes of interfaces | `fakeRunStaging`; socket tests only where the transport is the subject (T4) |
| errors never swallowed or generic | one existing swallow found and flagged (D-4); `removeTree` rejects with the cause |
| no silent behaviour change | listed where one exists: the extra component node (A3.2), the gzip header rule (A5.2) |
| smallest change | 27 hand edits instead of a 68-file codemod (A1); no new core contract for body limits (A5.4) |

Lessons applied (`LESSONS-FOR-DESIGN-BRIEFS.md`): 2 and 5 (A1: every caller form, each commit compiles alone); 6 (A3.2, A5.3: each
test names what makes it fail); 8 and 15 (A2, A7: limits as acceptance criteria); 10 (A4.4, `SEQUENCE.md` H2); 12 (A6.1: which
object a member sits in); 13 (A5: body limit traced across the whole host chain); 25 (A8: every prerequisite exists or is scheduled).

## 6. Not verified

1. d2's `node-bridge.ts` is on no fetched branch. Whether it already rewrites `content-length` / `content-encoding` is unknown (A5.2).
2. Today's outcome of a gzip JSON call to a Tovu daemon route was not run; T4 records it first.
3. The 26-call count excludes the step-0 pins the size-02 build added; `typecheck:tests` at step 3c is the real check.
4. No `size-debt.json` row was found for `features/external-mcp/tool-registrations.ts` (A7.3).
5. Which domain interface receives S5b's new property (A7.1); the executor decides per step.
6. Lane K has no design document on the fetched branches. A7.4's handoff is a constraint on that design, not a review of it.
7. The designs for lost updates, error system, publish engine and env schema were read only for the files and steps `SEQUENCE.md` names; their content is run B's.
