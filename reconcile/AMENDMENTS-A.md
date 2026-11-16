# Amendments A — size 02/06/09/10, daemon R7/R8, import cycles, and the four cross-design conflicts

Run: design reconcile, docs only, 2026-11-16. Input: `reconcile/CROSSCHECK-A-2026-11-16.md`.
Code read at Tovu `refactor/terra` `80b00f5b` and Jini `refactor/terra` `02edbb68`. Running build branches read:
Tovu `refactor/size-02-app` `4a2bed26`, Jini `refactor/daemon-prereqs` `79b19ffd`, Jini `refactor/daemon-r8a` `6801f14f`.
No test was run. Counts marked "measured" come from a TypeScript-AST script or `rg` on those SHAs.

**How to read this file.** Each section overrides the named section or step of its design. The design branches are not
edited. Where an amendment and a design differ, the amendment wins. "Rebutted" means the cross-check finding was checked
and not accepted, with evidence.

Owner decisions applied here (already made): 02-a (no default argument, `createInMemoryApp()`), O-4 (Express only behind
`Server`), xai/model-proxy after R7, lane K after R8, size 07 dropped, A50 full-origin compare, run-finalizer engine moves to Jini.

---

## A1. Size 02 — `composition/app.ts`

**Verdict on the finding: accepted.** §2.4 is stale. Two facts in the design are also wrong and are corrected here.

### A1.1 Corrected facts (override §1 fact 1 and §2.4)

| Design says | Measured at `80b00f5b` (AST count of calls to the imported `createApp`) |
|---|---|
| "68 files call it with no argument" | **26 calls in 7 files**, all tests. 68 is the number of files whose text contains `createApp()`; 79 of those 123 lines are comments or strings. |
| (not listed) | **1 call `createApp(undefined, { onBootWork })`** — `composition/__tests__/create-app-comments-rate-limit.test.ts:137`. It also relies on the default. |
| "a ts-morph codemod rewrites the 68 calls" | 27 sites in 8 files. Edit by hand; no codemod. |

The 7 files: `server/__tests__/packet-one-routes.test.ts` (13), `inbound/public-http/middleware/__tests__/integration/theme-static-assets.integration.test.ts` (6),
`server/__tests__/unit/route-class-precedence.unit.test.ts` (2), `server/__tests__/admin-post-page-delete-routes.test.ts` (2),
`server/__tests__/routes/pages-update-expected-version.test.ts` (1), `inbound/admin-http/routes/posts/__tests__/update.test.ts` (1),
`runtime/composition/modules/__tests__/route-modules.unit.test.ts` (1). No production file calls `createApp` without a root.
The step-0 pins added by the running build (`3f58d1c9`) were not counted; the executor recounts with `tsc` (below).

### A1.2 The contract (replaces §2.4 "Phase 2")

```ts
// apps/website/src/server/runtime/composition/memory-route-deps.ts   (NEW; the in-memory root's final file)
/** A fresh in-memory root and the app over it. For tests and tools. Never memoized: each call builds a new root. */
export function createInMemoryApp(
  _required: Record<string, never> = {},
  optional: { app?: CreateAppOptions } = {},
): ReturnType<typeof createApp> {
  return createApp(createRouteDeps(), optional.app ?? {});
}
```

- `createApp(routeDeps, options = {})`: the default on `routeDeps` is **removed**. Nothing else in its signature changes (02-b stays as decided in the design).
- Zero-argument callers become `createInMemoryApp()`. The one `createApp(undefined, { onBootWork })` becomes `createInMemoryApp({}, { app: { onBootWork } })`.
- Callers are **not** rewritten to `createApp(createRouteDeps())`. The 16 files that already write that form keep it (they hold the root in a variable or pass options to it).
- No `routeDeps` option on the helper: no caller needs one today (implementation-guardrails "Before You Write" 3.1).
- Why a new file and not `app.ts`: `app.ts` is under the shrink-only size ratchet, and the helper would have to move again when the root moves. `memory-route-deps.ts` is where the design already sends `createRouteDeps`.

### A1.3 Migration graph (replaces the `P2` row of §3; inserts steps 3a–3c; step 5 gains one line)

| # | commit | needs |
|---|---|---|
| 3a | `memory-route-deps.ts` with `createInMemoryApp` (imports `createApp` and `createRouteDeps` from `./app.js`; no back edge). Unit test: two calls return apps over two different roots (a post created through the first is not served by the second); `optional.app.onBootWork` reaches `createApp`. | step 3 of the design merged |
| 3b | the 27 call sites of A1.1 move to the helper. No assertion edited; test count before = after. | 3a |
| 3c | remove `= createRouteDeps()` from `createApp`. Gate: `npm run typecheck` **and** `npm run typecheck:tests` — a missed caller is a compile error. `serving-app.ts:70` (`NonNullable<Parameters<typeof createApp>[0]>`) is left as is. | 3b |
| 5 (end) | when the thin root leaves `app.ts`, `createRouteDeps` moves **into** `memory-route-deps.ts` beside the helper. Importers of `createRouteDeps` are repointed by symbol in that commit (measured: 488 files mention it; the codemod of the design applies here, not in 3b). After it `app.ts` imports nothing from the memory root. | 3c, steps 4–5 |

Graph after 3c: `memory-route-deps.ts → app.ts`, no back edge, so `check:boundaries` `no-circular` passes at every commit.
§2.4 "Phase 1 … a known, flagged conflict with practice 4" ends at step 5 instead of waiting for an approval.
§5 row 4 and row 10 lose their "until 02-a is approved" text. §7: phase 2 is 3 commits, not a 68-file codemod; estimate −40k.

### A1.4 Ratified deviation of the running build

`aad263bd` moved `CreateAppOptions` to `composition/create-app-options.ts` ("step 1 prerequisite": the helpers that take
`Pick<CreateAppOptions, …>` must not import `app.ts`). §2's tree said `app.ts` keeps the type. **The build is right; §2 is
amended to match.** `cdf80b13` pulled `module-handles.ts` (step 2) ahead of step 1; accepted, same reason.

### A1.5 Practices and lessons

DI: unchanged. Args: the helper uses the recorded no-required shape (A2.1). Size: helper 3 lines. No forwarder: the helper
composes two calls; it re-exports nothing. No silent change: default parameters are evaluated per call today, so the helper
must build a new root per call (pinned in 3a). Lessons 2, 5: every consumer form is listed and each commit compiles alone.

**Running build `refactor/size-02-app`: no change to steps 1–3.** 3a–3c are dispatched after step 3 lands.

---

## A2. Size 06 — `apps/admin/src/lib/api.ts`

**Verdict: accepted.** R2 leaves 62 methods out and R3 contradicts R2. Decision 06-c is not needed: the rule is already recorded.

### A2.1 The recorded rule (closes 06-c)

- `desktop-args/PLAN.md:21-24` on `plan/terra-2026-11-15` (A-46 "Target shape", applied as-is): *"Required object first, `optional = {}` second. No-required shape: `(_required: Record<string, never> = {}, { … } = {})`. Never `_optional?: Record<string, never>`."*
- `development/refactor-patterns/dedupe/PLAN.md:30` on `refactor/terra`: every new **or re-homed** function takes `(required, optional = {})`, with `_optional` / `_required: Record<string, never> = {}` when empty.
- The file already follows it: `api.ts:27`, `:2412`, `:2448`, `:2464`, `:2479`, and the method `detectExecutionAgents(_input: Record<string, never> = {}, { force = false } = {})`.

"Never `?: Record<string, never>`" bans the `?:` form. It does not ban the defaulted placeholder. There is no conflict inside practice 2.

### A2.2 Phase 2 scope (replaces R2's last bullet; measured on the 219 methods of `api`)

| Class | Count | Becomes | Call sites that change |
|---|---|---|---|
| already `(required-object, optional = {})` or placeholder-only | 115 | no edit | 0 |
| zero parameters | 62 | `(_required: Record<string, never> = {}, _optional: Record<string, never> = {})` | 0 (both default) |
| one required object (7 named types, 24 inline) | 31 | append `_optional: Record<string, never> = {}` | 0 |
| one optional object, e.g. `listEntries(options: { type?: string } = {})` | 11 | `(_required: Record<string, never> = {}, options: {…} = {})` | every call that passes options becomes `x({}, { … })`; calls with no argument do not change |

No method takes a scalar or two positional values, so nothing else converts. Step 0b's member sheet gains a `signature class`
column with these four values and the call-site count for the 11.
By-reference uses (`queryFn: api.x`): `rg` found none in `apps/admin/src` production code. Step 0b re-checks with the AST
scan; a by-reference use of a zero-parameter method is wrapped at the call site (`() => fooApi.x()`) in that feature's commit, because a typed placeholder parameter would otherwise receive the caller's argument.

### A2.3 Migration graph (replaces the `P2` row of R3)

| # | commit | needs |
|---|---|---|
| P2 | one commit per feature client, all four classes; the request-shape table stays byte-identical; the feature's tests and every touched caller green | **3** only |

R2's sentence "Until that is answered phase 2 covers the 42 one-parameter and the multi-positional methods only" is deleted.
R5: phase 2 ≈25 commits, ≈450k is now **in** the total. Owner decision 06-c is removed from the open list; 06-b (red baseline) stays.

### A2.4 Practices

One refactor type per change is kept (move in phase 1, signatures in phase 2). No behaviour change: defaults keep every
existing zero-argument call valid. Tests: `vi.spyOn(fooApi, 'x')` assertions on call arguments change only for the 11.

---

## A3. Size 09 — `ChatPane.tsx`

**Verdict: accepted.** `ChatPane.tsx:837-855` is an inline arrow rebuilt on every render. The file has no `useCallback`
around it and no dependency array. `buildChatPaneSlots` calls it at once, and only when `embed` is falsy (`:685`:
`footerAccessories: embed ? undefined : renderRuntimePicker()`).

### A3.1 R1.1 (replaces the last clause)

"…the root builds the callback from it with the same dependency array" becomes:

> `ChatPane` keeps an **inline arrow, rebuilt each render**, exactly as today: `renderRuntimePicker: () => <ChatPaneRuntimePicker … />`.
> No `useCallback`, no `useMemo`. `ChatPaneRuntimePicker` is a **module-level** component in `components/ChatPaneRuntimePicker.tsx`
> that renders `<AgentRuntimePicker>` with the same props, including both `definedProps` spreads (a prop that is `undefined`
> today stays **absent**, not `undefined`). It reads nothing from closure.

### A3.2 R2 (replaces "Runtime picker callback identity is stable across a no-op rerender")

That assertion cannot hold on the baseline and is deleted. In its place, each able to fail on a real risk of the move:

| Test | Fails when |
|---|---|
| `embed` set → no runtime picker in the DOM; `embed` unset → the picker is inside the footer-accessories slot | the lazy call is turned into an eager element, or the slot moves |
| rerender with a new `pane.selection` / `runtimeView.agents` → the picker shows the new value | someone memoizes the callback with stale dependencies |
| open the picker's menu, rerender the parent with unchanged props → the menu is still open | `ChatPaneRuntimePicker` is declared inside `ChatPane` (new component type per render → remount → state lost) |
| `onRescan` undefined → no rescan control; defined → present and calls through | a `definedProps` spread is replaced by a plain prop |
| `agentHandle`: `${base}-runtime` when a base exists, `false` otherwise | the handle expression is changed in the move |

The other R2 tests stand. One tree difference is accepted and listed (practice "no silent change"): one extra component
node (`ChatPaneRuntimePicker`) above `AgentRuntimePicker`. It has no state and no effect.

---

## A4. Size 10 — `daemon/agent-executor/launch.ts`

**Verdict: accepted.** R4 contradicts R1. Source order at `02edbb68` (`launch.ts:1659-1706`):

1. `await prepareRunCommand(...)` (`:1659`)
2. `spawnAgentChildProcess(...)` — **synchronous** (`:1666`); on `kind: 'error'`: `await releaseStagedResources()` → `await failBeforeSpawn(...)` → return
3. `child.once('exit', releaseRuntimeLock)` (`:1682`) — same turn
4. `wireRunInput({ …, cleanupStagedFiles, writtenMcpJsonPath, … })` (`:1684`) — same turn; this is where the cleanup callbacks are handed over
5. `await confirmChildSpawned(...)` (`:1687`); on throw: drop the run from `liveRunInputs` and `liveRunRelays`, rethrow
6. `armHandoffWatcher(...)`, not awaited (`:1700`)
7. `await dispatchPrompt(...)` (`:1703`)

### A4.1 R4 (replaces "`runAgent` ≤50 (stage → prepare command → spawn + confirm → transfer cleanup)")

> `runAgent`: stage → prepare command → **`spawnAndWire`** → await confirmation → arm handoff watcher → dispatch.
>
> `spawnAndWire(required, optional = {})` is a plain function, **not `async`**, with return type
> `{ kind: 'error'; error: unknown } | { kind: 'spawned'; child: ChildProcess; stdinHandle: RunStdinHandle }`.
> In one synchronous body it does steps 2–4: spawn, `child.once('exit', releaseRuntimeLock)`, `wireRunInput(...)`
> (the transfer of R1). Because the return type is not a promise, an `await` between spawn and listener
> registration does not compile. The comments at `:1663-1665` and `:1676-1681` move with it.
> R1's `transferRunCleanup(required)` is the body of step 4 **inside** `spawnAndWire`; it is not a later stage.

R4's file list changes in one place: "command preparation and spawn confirmation (893-921) → `spawn-confirm.ts`" becomes
`prepare-command.ts` (already in R4) for preparation, `spawn-and-wire.ts` for `spawnAgentChildProcess` + `spawnAndWire`,
and `confirm-spawn.ts` for `confirmChildSpawned`. One file per effect class; preparation and confirmation are both awaited,
the middle one never is. R6 step 4 reads "`spawnAndWire` (with the transfer) in place".

### A4.2 R5 tests (adds; nothing removed)

R8a already landed two of the pins and proved each red by mutation (`cloud-results/daemon-r8a.md`, test
`agent-executor/__tests__/r8a-characterization.test.ts`): **R1** (an `await Promise.resolve()` after `const child = …` loses
the spawn error) and **R2** (lock before staged files). Size 10 keeps them and adds: a fake child that emits `'exit'` in the
microtask after spawn → the lock is released once and `run` rejects through `confirmChildSpawned`; a confirmation failure →
the run is absent from live inputs and relays afterwards; R7 of the R8 plan (two executors, overlapping runs), which R8a
reports as **not written** — it is a prerequisite of size-10 step 3, whoever writes it first.

### A4.3 Filesystem port: owner and step (conflict 2; replaces "fake process/fs ports" in R5 and "process, fs and clock stay ports" in R7)

There is no filesystem port today. `launch.ts` calls `node:fs` directly at `:820` (`writeFile`, mode `0o600`), `:824` and
`:1049` (`rm` recursive), `:837` (`mkdtemp` under `os.tmpdir()`), `:1157` (`mkdir`, mode `0o700`), `:1160`
(`realpath(mkdtemp(...))`). The only seam is `deps.mkdtemp` on the overlay helper (`:803`).

**Size 10 owns the boundary.** New step **0c**, after 0a/0b and before step 1:

```ts
// packages/daemon/src/ports/staging.ts   (subpath ./ports/staging — one file per subpath, as R8a shipped ./ports/process and ./ports/runtime)
/** The launcher's own private files for one run. Per-CLI staging is not here (lane K). */
export interface RunStagingPort {
  ensurePrivateDir(required: { path: string }): Promise<void>;                    // mkdir -p, owner-only (0o700)   :1157
  createTempDir(required: { parent: string; prefix: string }): Promise<string>;   // mkdtemp; path as created       :1160 inner, :837
  resolveRealPath(required: { path: string }): Promise<string>;                   // realpath                        :1160 outer
  writePrivateFile(required: { path: string; content: string }): Promise<void>;   // utf8, owner-only (0o600)        :820
  removeTree(required: { path: string }): Promise<void>;                          // rm recursive+force; rejects with the cause  :824, :1049
  tempRoot(): string;                                                             // os.tmpdir()                     :837
}
```

- It becomes a required member `staging` of `AgentExecutorRuntimePorts` (`ports/runtime.ts`, R8a step 1), so hosts bind it where they already bind `spawn`, `fileLock`, `writer`.
- Binding: `nodeRunStaging` in `@jini-ai/platform/runtime-ports/fs` (the entry R8a created for `nodeFileLock` / `nodeAtomicWriter`), with `satisfies RunStagingPort` and a binding test on a real temp directory: directory mode `0o700`, file mode `0o600`, `removeTree` of a missing path resolves, `createTempDir` returns the unresolved path.
- Fake: `fakeRunStaging` beside `fakeRuntimePorts` (`ports/__tests__/fakes/runtime.ts`), recording calls in order.
- Commits in 0c: (1) type + binding + fake, nothing uses it; (2) `runtime.staging` required and the five hosts add one line (paired Tovu commit); (3) the five call sites in `launch.ts` switch, `deps.mkdtemp` is deleted and its test moves to the fake — no assertion dropped; `resolveRealPath` stays a separate call so the second symlink check (`:1162`) still reads the resolved path and the overlay path stays unresolved, as today.
- Security order that must not change (pinned in 0a before 0c): `ensurePrivateDir` → `validateFilesystemLaunch` → `createTempDir` + `resolveRealPath` → `validateFilesystemLaunch` again (`:1157-1162`).
- Flagged, not changed here: `:1050` swallows the removal error into a fixed `console.warn` text. That breaks "errors never swallowed or generic". It is a behaviour change, so it is a follow-up with its own test, not part of the move.

R8 §12.9 second row, "open, O-7", becomes "**size-10 step 0c**". R8's exit statement keeps naming the gap until 0c lands.
Rejected: adding the port in R8a step 5. Step 5 is already the largest R8a step, and the cleanup code the port touches is
what size 10's 0a tests pin; the cost of doing it later is one extra line in five hosts.

### A4.4 Prerequisites (replaces R6's last sentence)

"Prerequisite: R8a → C6 → R8b → import-cycle J2 → **lane K** → size 10; then revalidate every line number."
Lane K moves the per-CLI folders that `launch.ts` imports (`:2-3`, `:107-111`), so by lesson 10 it is a prerequisite: the
0b sheet is made once, on the file K leaves. If the owner wants size 10 before K, see owner decision D-2 in `INDEX-A.md`.

---

## A5. Daemon R7 — body limits (§11.6) and O-4

**Verdict: accepted.** Reproduced with Node: an array of 20,000 `1e20` is 100,001 bytes on the wire and 440,001 after
`JSON.parse` + `JSON.stringify`; 1,200,000 of them is 6,000,001 → 26,400,001. Both pass the host parser and fail the
route limit of §11.6 (128 KiB, 8 MiB). The cause is in core, `request-body.ts`: `readBodyBytes` counts the **rebuilt** stream.

### A5.1 §11.6 (replaces the table's third column and the "headroom" paragraph)

The byte limit is applied **once, to the bytes on the wire, by the layer that reads the socket**. A route limit behind a
host parser only has to be large enough never to refuse a body the parser accepted.

- Bound: `JSON.stringify(JSON.parse(text))` is at most **5.25×** `text`. The only JSON production that grows is a number in
  exponent form; the worst case is `1e20` (4 bytes) → `100000000000000000000` (21 bytes). Checked by sweep over mantissa ×
  exponent forms; strings, escapes and duplicate keys never grow.
- One owner of that fact, beside the code that re-serializes: `packages/http-kit/src/node-bridge.ts` exports
  ```ts
  /** Largest size a body of `parserLimitBytes` can have after the bridge re-serializes it. See JSON_RESERIALIZE_MAX_EXPANSION. */
  export function maxReserializedJsonBytes(required: { parserLimitBytes: number }, _optional: Record<string, never> = {}): number
  ```
  with `JSON_RESERIALIZE_MAX_EXPANSION = 5.25` and the derivation as its why-comment.

| Host | Parser today | `host.jsonBodyMaxBytes` | Effective limit |
|---|---|---|---|
| `server` preset | `express.json()` = 102,400 bytes | `maxReserializedJsonBytes({ parserLimitBytes: 102_400 })` = 537,600 | the parser's 102,400 |
| Tovu daemon scope | 6,291,456 bytes | `maxReserializedJsonBytes({ parserLimitBytes: 6_291_456 })` = 33,030,144 | the parser's 6,291,456 |
| a host with no parser (after R13) | — | its own number, used as is | that number |

Fixed per-route limits that sit behind a parser (attachment-lookup 64 KB, claim 1 KB) keep their own numbers only where the
parser in front has the same or a smaller limit; otherwise they are also passed through `maxReserializedJsonBytes`. P0 lists each.

### A5.2 Headers of a rebuilt request (new rule for P-NODE-BRIDGE)

When the bridge builds a body from `parsedBody`, the `Request` it hands on must describe **that** body: `content-length` =
the rebuilt byte length; `content-encoding` and `transfer-encoding` removed. Reason: `readBodyBytes` refuses any
`content-encoding` other than `identity` and compares `content-length` to the limit. Express inflates gzip by default, so
without this rule a gzip JSON call that Tovu accepts today would get 415 after conversion. **Not verified:** d2's
`node-bridge.ts` is not on a fetched branch; if it already does this, only the test is added.

### A5.3 T4 additions (real socket, per host)

Expansion fixtures: `[1e20, …]` at parser limit − 1 and at the limit → accepted and the handler sees the same numbers;
limit + 1 → refused **by the parser** with today's status and body. One gzip JSON body under the limit → same outcome as
before conversion (record today's first). Unit test on `maxReserializedJsonBytes`: for every number token up to 8
characters the ratio is ≤ 5.25. Each must fail when the helper is replaced by the old constants.

### A5.4 Cost and follow-up

A hostile 6 MB numeric body now costs one transient 26 MB string on top of the parsed array. It is bounded by the parser
and measured in G1 with the other double-parse cases. Removing the double parse (O-13) removes the rule; until then the
alternative "carry provenance through `Request`" would need a new core contract member and is not taken.

### A5.5 Where this lands

**Running build `refactor/daemon-prereqs`, step P-NODE-BRIDGE:** add `maxReserializedJsonBytes`, the header rule A5.2 and
their tests in the P-NODE-BRIDGE commit. If that commit is already pushed, add them as **P-NODE-BRIDGE-b** before R7 P0.
R7 §11.17's chain gains that name after `P-NODE-BRIDGE`. No other running step changes.

### A5.6 O-4, xai/model-proxy

O-4 is closed as decided: hosts keep Express; Jini route packs see only `Server`. §11.2 (Tovu's parsers stay) is
consistent with it. xai and model-proxy leave daemon **after** R7's Z step, as route descriptors (C6 sheet 4a "better
option"); R7 converts them in place and does not move them.

---

## A6. Daemon R8 — capability receiver (conflict 1) and filesystem effects (conflict 2)

**Verdict: accepted, both.**

### A6.1 §12.8 (replaces the second and third table rows' "After" cell)

`agentRuntime.launch.capabilities({ defId })` → **`agentRuntime.defs.capabilities({ defId })`** (C6 `sheets/C6.md:181`;
`launch` owns `hostEnvNames`, `:188`). C6 is not extended and gets no alias. `resolveSystemPromptOverlayDelivery` takes
`{ capabilities }` from the same member. The "must stay true" cells stand: gate is `!== false`; the map is read when the run
launches. Test wording in the fourth row: "a capability fake **on `defs`**". §12.8's last line and STOP (`:499`) and INDEX
risk 10 read: "C6 lands without `launch.hostEnvNames` or `defs.capabilities`".

### A6.2 §12.9 second row

Owner column: **size-10 step 0c** (A4.3). O-7 is closed by its own recommendation unless the owner objects (INDEX-A D-1).

### A6.3 §12.5 step 4 (running build R8a)

R8a stopped step 4 correctly: `ensureAntigravityMcpPermission` is not an injected dep in production (`launch.ts:1568`
never passes it). **Fold step 4's port-taking change into step 5**, as the run recommends: apply
`cloud-results/daemon-r8a-step4-attempt/step4-attempt.patch` without the `nodeFileLock` / `nodeAtomicWriter` defaults, and
source both from the required `runtime` object. §12.5's row 4 "Start now? yes" becomes "shell deletion done (`724c643b`);
the rest with step 5". Ratified deviations: `./ports/process` + `./ports/runtime` instead of one `./ports`; platform
bindings as two entries (`runtime-ports/process`, `runtime-ports/fs`). C6 adds `./ports/agent-runtime` the same way.
Open step-0 cases R7, R8 goldens, R4a, R12 must exist before step 5 edits `launch.ts` (the run says so; kept).

---

## A7. Import cycles — §4.1 (major 7) and J2 (conflict 3)

### A7.1 §4.1: `server/routes/types.ts` — **accepted, with a corrected fact**

The design says the file is "one interface" and needs an exception. It is not. At `80b00f5b` it holds 22 named domain
interfaces (`CredentialsDeps` `:326-548`, `MediaDeps`, …) and `RouteDeps` is their intersection (`:1352`). So there is a
decomposition that is a pure move:

- New step **S3a-types** (before S3b): move the domain interface that receives the new members (expected `CredentialsDeps`;
  the executor confirms per step which interface owns each new property) to `server/routes/route-deps/credentials-deps.ts`.
  `types.ts` imports it for the intersection line; importers of the named interface are repointed by symbol; no re-export.
  The `size-debt.json` row for `types.ts` (`max-lines` 519) is lowered or removed in the same commit.
- S3b, S4, S5b then add their one property in a file with room. `types.ts` does not grow. If S5b's property belongs to
  another domain interface, that interface moves the same way in its own commit first.
- Decision 9's `types.ts` part is **closed**: no raise, no exception.

### A7.2 §4.1: `deps.ts` / `app.ts` growth — **accepted as written**, order made exact

S3b, S4, S5b run after size 01 and after size 02 step 5 (A1.3), so each new property lands in a slice file. The
alternative "raise two baselines by 7 lines" is dropped.

### A7.3 §4.1: the three feature functions over 80 lines — **rebutted as a blocker, recorded as debt**

`buildSourceControlRegistrations`, `bindTovuCredentialToolOperations`, `buildExternalMcpRegistrations`: no step lengthens
them and S4 shortens one. The repo gate is a shrink-only ratchet and the first two have rows in `size-debt.json`
(`:978`, `:1279`). A cycle step that does not worsen a recorded row breaks no gate, and splitting them in a cycle commit
would mix two refactor kinds. They are **not** claimed compliant: `INDEX-A.md` lists the follow-up size lane
"tool-registrations ×3". **Not verified:** no `size-debt.json` row was found for `features/external-mcp/tool-registrations.ts`;
B1's executor runs `npm run check:size` on the base first and stops if it is red there.

### A7.4 J2: owner of `mcp-json-file.ts` (conflict 3) — **accepted**

Checked: `mergeMcpJsonContent` (`mcp-bridge.ts:103`) takes `McpJsonServerEntry`, declared in daemon
`agent-executor/contracts.ts:480` — J2's "not verified" item. No Tovu file and no other Jini package imports the five names.

- **Final owner: `@jini-ai/agent-runtime`** (the package that receives the consumers in lane K). Not core: three of the five
  names do `node:fs` I/O. Not two owners: five names, one file.
- **J2 still creates the leaf in daemon**, as an interim owner, because the cycle is in daemon today and a direct
  daemon → agent-runtime import is forbidden after R8b. J2 commit 1 gains one constraint: the leaf follows R8 §12.14
  rules 1–3 — it imports only `node:` built-ins and core/protocol types. `McpJsonServerEntry` therefore **moves into the
  leaf** (its other users in `contracts.ts` import the type from the leaf; a type-only edge, no cycle).
- **Order (replaces J2 "Prerequisites"):** R8b → **J2** → lane K → size 10. J2 no longer waits for size 10: its only edit in
  `launch.ts` is the import at `:99`, and the lanes are serialized anyway.
- **Lane K handoff (binding on K's design):** K0 moves the shared port types that per-CLI code and the launcher both name
  (`McpBridgeDelivery`, and `McpJsonServerEntry` out of the leaf) to core contracts, type-only. Then K moves
  `mcp-json-file.ts` with its tests by `git mv` into `agent-runtime/src/` beside the defs — one owner, never a copy. In the
  same commit: `mcp-bridge.ts`'s delivery builders go behind `AgentRuntimePort` (R8 §12.14 rule 6), `launch.ts`'s
  `defaultRemoveMcpJsonFile` becomes a cleanup callback the staging member returns, and daemon `index.ts:152` stops
  exporting `mergeMcpJsonContent` (changeset: public name moves to agent-runtime).

---

## A8. AG-UI S2 and R7 P1 (conflict 4) — **accepted**

`designs/ag-ui/DESIGN.md` S2, "Prerequisites" line, becomes:

> C4 (landed), **C4-e** (landed on `refactor/daemon-prereqs` `79b19ffd`; 2.1 edits the same `sse.ts`), **P-NODE-BRIDGE**,
> C-ORIGIN-PORT for test hosts. **Commit 2.5 also needs R7 P1**: Tovu `composition/jini-routes.ts` (`mountJiniRoutes`) is
> created there and only there. If P1 has not landed, 2.1–2.4 (Jini only) may land and 2.5 waits. AG-UI does not create
> the helper.

- 2.1 (`drained()` in core `sse.ts`) is based on the C4-e result and keeps both test sets: C4-e's replay/backlog tests and the new backpressure test.
- 2.5 mounts with the SSE commit rules of R7 §11.3. It does not pass `rawBody`.
- `agent-daemon-scope.ts` order is in `SEQUENCE.md` H3.
