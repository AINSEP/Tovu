# L8 — Stryker measure-only, Jini `packages/daemon` (non-UI src)
Jini @ cloud/overnight-1024-jini (clone at run start). Stryker 9.x, vitest runner, perTest coverage, concurrency 3, StringLiteral excluded, type checks off. Report only — no source/test edits.

## 1. Headline
- 107 files instrumented, 15,428 mutants (incl. ~2,500 not scored: excluded/ignored). Run in 3 batches (A lifecycle/auth/store/routines/core, B `http/`, C agent-executor + rest) — **everything ran, nothing skipped**.
- Scored: 12,928. Killed 11,119, timeout 214, **survived 1,443**, **no-coverage 152**. **Score 87.66 %** (A 87.18, B 87.81, C 87.99).
- Wall ≈ 2 h 05 m total (setup+dry 6 m, A 38 m, B 33 m, C 37 m, D probe 1 m); ~0.15M tokens. Per-file tables: `tableA.md`, `tableB.md`, `tableC.md` (worst first).

## 2. Suspected source bugs
None confirmed. Two **security-relevant test gaps** that would let a regression through silently (not bugs today):
1. `http/remote-run-events.ts:93` — bearer-token gate `presented === null || !timingSafeTokenMatch(...)` → `false` SURVIVES: no test sends a missing/wrong token and expects rejection. Auth bypass would go undetected.
2. `run-credentials.ts:219` — `if (owner !== undefined) return notFound(...)` → `false` survives: only observable when owner is known to the registry but `runExists` returns false (then another principal's run would be allowed). Needs a test: owned-by-other + runExists=false ⇒ 404.

## 3. Per-file table
See tableA/B/C.md. Worst (score, mutants): store/event-log/sqlite.ts 0 (112, all no-cov, see §5), tokens.ts 0 (4), scheduler.ts 22 (9), store/agent-sessions/sql.ts 60, tool-result-diagnostics.ts 63.3 (109), http/message-relay.ts 69.6, delegated-result-correlation.ts 72.7, live-session-state.ts 76.2 (206), remote-run-events.ts 77.3, routines/scheduler.ts 77.5 (173), frontend-sessions.ts 79.1, connectors.ts 80.2 (454). Biggest absolute survivor counts: connectors 90, attachments 84 (89.1%), events.ts 134 (83.6%), launch.ts 73, xai 69, run-lifecycle 52 (88.0%), routines/schedule 54.

## 4. Triaged survivors (≤10 per low-score file; remainder by mutator)
Dominant pattern everywhere (~60 % of survivors): **type-guard / `isRecord` / `typeof x==='string'` conditionals → true/false** and **`ObjectLiteral → {}`** on error-response bodies (`res.status(401).json({error:{...}})`, `validationError({...})`): (a) gap — tests assert status only, not error body/code, and never feed malformed shapes (array, null, non-string).
- **tokens.ts** 4× `token({id})`→`{}`: (a) gap, trivial — assert token ids (`jini.runLifecycle` etc.) distinct.
- **scheduler.ts:16** `keepAlive`/`unref` mutants: (a) assert timer unref'd when keepAlive=false and not when true; cancel fn really clears (17).
- **http/remote-run-events.ts:93** — see §2.1. Also 130 empty-runId check, 160 toolUseId validation, ObjectLiteral error payloads (27): (a).
- **http/message-relay.ts** 23-28: 401 for unknown run credential and 404 for runId≠credential run: error bodies unasserted; `runScopedCallers?.` optional chain (a); 36 `validClaim` non-object/array body (a).
- **run-credentials.ts** 102 regex-flag strip (`/[gy]/g`→`/[^gy]/g`): (a) call `allowsRunScoped` repeatedly with a /g route regex; 104 `isDelegatedCall` method check (a) — GET to the delegated path must be false; 204 401 body (a); 219 (§2.2); 221 lookup-failure fails closed (a) — runExists throws ⇒ 404.
- **http/run-credentials.ts:33,75,77** principal-header injection, 401 body, `contextRef` forwarding: (a).
- **delegated-result-correlation.ts** (27): image-source guards (`type!=='base64'`, media_type/data typeof) all →false survive: (a) malformed image blocks must be skipped/refused; same duplicated logic in **tool-result-diagnostics.ts** (40) — likely copy-paste, same test would kill both.
- **run-lifecycle.ts** (52): 231 `isRecord` (a), 263 `startedAt ?? firstEntry` fallback (a — journal without start entry), 277/278 start/end entry lookup (`find`→true, drop `.reverse()`): (a) journals with multiple/ordered end entries; 288 `resumable ?? false` (a). Remaining mostly BooleanLiteral/optional-chaining.
- **session-coordination.ts** (14): 27 empty-set cleanup (`runs.delete`) (a) — leak of conversation key; 32 re-register under a different conversation must unregister previous (a); 39 `concurrentLiveRunIds` must exclude self (a); 87 catch ⇒ fail-closed on listener failure (a).
- **delegated-tool-bridge.ts** (11): 139/178 slow-run suspend/resume notice, 217/224 `isContentEnvelope` guard: (a).
- **tool-executor.ts** (17+20 timeouts): 227 truncation boundary `<=`→`<` (a, exact-size output), 275 event `detail` presence, 326 authorize call args, 339/345 timeout handle/unref, 395 `{once:true}` abort listener (a/b).
- **routines/schedule.ts** (54): timezone/DST probe code 90-143 (offset sign, `tentative±dms`, sort comparator, `>`→`>=` tie-break, dedupe `seen`): (a) — DST gap/overlap and ordering cases untested; **routines/scheduler.ts** (39): 109/135 started guards, 131 existing-timer replacement, 150 `nextRunAt` args, 186 persistence-error branch: (a).
- **close-status.ts** (8): 75-79 env override parsing (`Number.isFinite`, `>0`, fallback chain) (a); 119 `unref` guard (b-ish).
- **event-log.ts** (9): 195 FIFO eviction `>`→`>=` (a, exact boundary), 213 `slice()` defensive copy (a), 178/192 dedupeKey (a).
- **tool-recovery/redaction.ts** 39 error-id regex `{3}` quantifier (a — ids with fewer groups), 107, 254 (a).
- **agent-executor/live-session-state.ts** (49): 18 frame-type allow-list, 26 status enum, 53/54 detail/local merge: (a). **events.ts** (134): 96 childPid only on status, 266 SIGKILL guard (`pid != null && !killed`) (a), 326 relay close on child close (a), 378/388 projection/journal gating, flush (a). **launch.ts** (73): 193-208 env allow-list `typeof env[key]==='string'` →true (a — non-string env leaking to child), 252/265/266 default-dependency wiring (b/a). **run-output.ts** (15): DIAGNOSTIC_LINE regex anchors/`\s*` (6), 8192-byte tail `.slice(-8192)` (a). **legacy-data-migration.ts** (22): `recursive/force` cpSync flags, `promoted` list, existing-dir short-circuit 113 (a — data-integrity path, test with real tmp dirs and conflicting files).
- Remaining files' survivors (≤ 9 each): unreviewed individually; mostly the guard/ObjectLiteral pattern above.
- Equivalent (b) candidates: `catch {}`→`{}` blocks that swallow, `unref?.()`→`unref()` on real timers, `{ recursive:true }` where dir already exists.

## 5. No-coverage
- **store/event-log/sqlite.ts — all 112 mutants (lines 59-end) NoCoverage**, even though `store/event-log/__tests__/sqlite.test.ts` exists and passes (84 tests in that dir). Probe re-run with `coverageAnalysis: off` still reported 0 killed / 112 nocov ⇒ **measurement anomaly** (tests apparently never load the instrumented copy — likely vitest alias/native better-sqlite3 resolution inside the Stryker sandbox), not proven missing tests. Treat the durable event-log adapter as **UNMEASURED**, not untested. Needs a follow-up with the sandbox/alias investigated.
- store/agent-sessions/sql.ts: 6 no-cov (postgres-only paths; `*.postgres.test.ts` excluded from default vitest config).
- Real no-coverage: events.ts 708, 848, 1003 (×3); launch.ts 1010, 1204-1205+ (18 mutants in one block); mcp-bridge.ts 617, 714-715; legacy-data-migration.ts 198 (×3); message-relay.ts (http) 30, 36, 42 (route registration + claim validation); run-lifecycle 1 mutant. Exact list: node one-liner over `/root/stryker/reports/{A,B,C}.json` (not committed, 1M+ each).

## 6. NOT RUN
Nothing excluded by time. By design not mutated: `*.tsx`, tests, `.d.ts`; StringLiteral mutants (~2,500 not scored); `http/index.ts`, `index.ts`, `routes manifests/types`-only files yielded 0/trivial mutants. Postgres suites (`vitest.postgres.config.ts`) not run.

## 7. What these numbers do NOT catch
Type checks off (type-invalid mutants counted as survivors/kills arbitrarily); StringLiteral excluded (error-message/contract text, route paths as strings, header names, env var names unchecked); indirect kills (a mutant counts killed if ANY of the 3,493 package tests fails — not necessarily a test of that file); untested inputs/behaviours the code lacks; sqlite event-log adapter unmeasured (§5); Postgres store paths; the UI and other packages; integration/e2e; timeouts (214) counted as killed; perTest coverage may misattribute.

## 8. Top 10 tests to write first
1. remote-run-events bearer gate: missing / wrong / malformed `Authorization` ⇒ 401-class error, valid ⇒ next (line 93).
2. `authorizeRunOwnership`: run owned by other principal with `runExists`→false ⇒ 404; `runExists` throws ⇒ 404 (fail closed).
3. `allowsRunScoped` with /g and /y route regexes called repeatedly + GET to delegated-call path not `isDelegatedCall`.
4. message-relay claim: unknown credential 401 (assert code/body), credential for other run 404, array/null/extra-key body 400.
5. http/run-credentials middleware: principal header injection set/unset, 401 body, owner-filtered run list.
6. session-coordination: re-register moves run between conversations, empty set removed, `concurrentLiveRunIds` excludes self, listener-throw fails closed.
7. run-lifecycle journal summarisation: multiple end entries, no start entry, `resumable` default, non-object payloads.
8. Event-log FIFO eviction exact boundary (`maxEntriesPerRun`), dedupeKey replay, returned entries are copies; and fix/verify the sqlite adapter instrumentation so its 112 mutants are measured.
9. routines/schedule DST gap/overlap + sort-order + tie-break cases; routines/scheduler started/idempotent-start/replace-timer/persistence-error branches.
10. launch.ts env allow-list rejects non-string values; agent-executor events SIGKILL guard (already-killed / pid null) and delegated-image malformed-block skipping (delegated-result-correlation + tool-result-diagnostics, shared fixture).

L8 DONE 2026-10-25T18:05Z — wall ≈ 2 h 05 m, ~0.15M tokens (rough).
