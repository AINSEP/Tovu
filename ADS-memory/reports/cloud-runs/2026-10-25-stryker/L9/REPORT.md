# L9 — Stryker measure-only: Jini runtime + infra (report only, no source/test edits)

## 1. Headline
7 packages (sandbox, http-kit, server, protocol, sidecar, agentic, devops), 192 source files mutated. 16,093 mutants instrumented; 2,631 StringLiteral ignored by config; **13,462 run, 12,300 killed/timeout, 1,162 survived, 26 no-coverage → 91.4 % overall**. All 7 packages ran completely (nothing partial). Jini @ cloud/overnight-1024-jini, Node 22.22, Stryker 9, vitest runner, concurrency 3, perTest, type checks off, StringLiteral excluded, timeoutMS 10000.
Wall ~1 h (16:03→~17:00 UTC; mutation time: sandbox 1m41, http-kit 2m06, protocol 0m45, sidecar 2m58, agentic 11m10, devops 16m45, server ~10m). Rough tokens ~0.15M.

| Package | instrumented | run | killed+timeout | surv | no-cov | score |
|---|---|---|---|---|---|---|
| protocol | 308 | 267 | 204 | 63 | 0 | **76.4** |
| sidecar | 1113 | 950 | 776 | 172 | 2 | **81.7** |
| server | 1457 | 1238 | 1077 | 139 | 22 | **87.0** |
| sandbox | 550 | 439 | 404 | 34 | 1 | 92.0 |
| http-kit | 1161 | 989 | 912 | 77 | 0 | 92.2 |
| devops | 7075 | 5987 | 5568 | 418 | 1 | 93.0 |
| agentic | 4429 | 3592 | 3359 | 232 | 1 | 93.5 |

Harness note (server): `vitest.config.ts` resolves `../db/package.json` via `import.meta.url`, which breaks inside Stryker's sandbox (`Cannot find module 'kysely'`). Worked around WITHOUT editing source: symlink every `packages/*` into `packages/server/.stryker-tmp/` and `cleanTempDir:false`. Nothing from `.stryker-tmp` committed. Full per-file tables: `per-file-<pkg>.txt`; every survivor (file:line:col mutator | line => mutant): `survivors-<pkg>.txt` (1,175 lines).

## 2. Suspected source bugs
None found. Survivors are test gaps or equivalent mutants; no case where behaviour looked wrong. (Not exhaustively verified — triage covered the worst files only.)

## 3. Per-file (worst first, files < 80 % or ≥ 10 survivors; complete lists in per-file-*.txt)
| file | mut | surv | nocov | score |
|---|---|---|---|---|
| server/create-local-node-daemon.typecheck.ts | 22 | 0 | 22 | 0.0 (compile-time proof file; vitest never runs it — expected, exclude from mutate) |
| protocol/registry.ts | 79 | 38 | 0 | 51.9 |
| server/feature.ts | 21 | 14 | 0 | 33.3 |
| sidecar/json-ipc.ts | 224 | 89 | 2 | 59.4 |
| protocol/delegated-result.ts | 87 | 22 | 0 | 74.7 |
| devops/deploy/node.ts | 57 | 14 | 0 | 75.4 |
| devops/checks/coverage/lcov.ts | 99 | 23 | 1 | 75.8 |
| devops/deploy/naming.ts | 13 | 3 | 0 | 76.9 |
| sidecar/port.ts | 73 | 16 | 0 | 78.1 |
| devops/checks/coverage/floors.ts | 48 | 10 | 0 | 79.2 |
| sidecar/supervisor.ts | 202 | 36 | 0 | 82.2 |
| server/builtin-features.ts | 414 | 69 | 0 | 83.3 |
| server/host-bootstrap.ts | 62 | 10 | 0 | 83.9 |
| sidecar/daemon-registry.ts | 120 | 17 | 0 | 85.8 |
| devops/checks/hardwiring-node.ts | 214 | 30 | 0 | 86.0 |
| sandbox/node-worker.ts | 141 | 19 | 1 | 85.8 |
| http-kit/verified-origin/configured-origin.ts | 81 | 10 | 0 | 87.7 |
| http-kit/local-daemon-request.ts | 148 | 18 | 0 | 87.8 |
| devops/dns/node/wire.ts | 98 | 12 | 0 | 87.8 (+10 timeouts) |
| devops/checks/coverage/integrity.ts | 217 | 26 | 0 | 88.0 |
| agentic/skills/install/install-service.ts | 173 | 20 | 0 | 88.4 |
| agentic/core/site-guide/topic-schema.ts | 175 | 20 | 0 | 88.6 |
| http-kit/verified-origin/origin.ts | 118 | 12 | 0 | 89.8 |
| http-kit/api-security-middleware.ts | 134 | 12 | 0 | 91.0 |
| (remaining files of devops/agentic with 11–33 survivors, scores 89–95 %) | | | | see tables |

## 4. Triaged survivors (a=real gap, b=equivalent, c=noise; ≤10 per worst file, rest by mutator)
- **protocol/registry.ts (38)**: (a) `z.string().min(1)` → `.max(1)` survives on `archive/integrity/manifestDigest/id/name/github` and the `type` enum → `[]`, and both `z.object({` → `{}` (lines 17–30, 180): no test asserts an *empty-string* or *wrong-enum* source/identity is rejected, nor that a verification-meta issue is reported (180 `path:[field]`→`[]`). Add reject-tests per field + issue-path assertion. Integrity/digest fields unchecked for emptiness = supply-chain relevant.
- **protocol/delegated-result.ts (22)**: (a) `isRecord` (line 13) and the text-block guard (line 17) can be wholly neutralised: no test passes an array / null / non-text block / non-string text. Add malformed-delegated-result cases.
- **sidecar/json-ipc.ts (89)**: mostly trace/diagnostic helpers (lines 42–64: env flag `1/true/yes`, trace seq, duration math, summarize) → (c)/(a) low risk; **151:41/60 NO-COVERAGE** stale-socket check: `connect` handler (socket is live → not stale) never executed; the live-daemon vs stale-socket decision is untested (a, high risk: could clobber a live daemon's socket).
- **sidecar/port.ts (16)**: (a) `port > 65535` boundary (`>=`), `errorCode` guard (31) each branch → no test with non-object/null/code-less errors.
- **sidecar/supervisor.ts (36)**: (a) `cooldown < 0` boundary (cooldown 0 valid); failure event with/without `decision` (90); respawn condition 99 `exited && replaceAfterExit && !terminating` — each conjunct unproven (restart-loop control, high risk).
- **sidecar/daemon-registry.ts (17)**: (a) pid-match guards 112/120 (`record?.pid !== pid`: wrong pid must not delete/restore), `isPid` (147) `Number.isInteger`/`>0`.
- **server/feature.ts (14)**: (a) all `'run:transport'…'daemon:control': true` capability flags (lines 77–86; includes `host:exec`, `net:egress`, `db:admin`) can flip to false unnoticed — no test pins the granted capability set. Highest-value cheap test.
- **server/builtin-features.ts (69)**: (a) `reclaimedBytes Math.max(0,…)` vs min, elapsedMs arithmetic (157–158), optional agent fields version/authStatus/… spread (205+) not asserted; rest ObjectLiteral/ConditionalExpression on optional-field spreads.
- **server/host-bootstrap.ts (10)**: (a) `resolved` once-only latch (63–71), `closeIdleConnections?.()` / `closeAllConnections?.()` optional-call (old Node without these methods would throw).
- **http-kit/api-security-middleware.ts (12)**: (a) loopback-origin regex anchors (287: `^` and `$` dropped each survive → `http://127.0.0.1.evil.com` / `evil.http://localhost` origins not tested as rejected — CORS/CSRF relevant); `req.socket?.remoteAddress`; 401 body shape (261–262); `exemptPaths` default; (b?) 171/260 `presented===null ||` →false likely equivalent if `timingSafeTokenMatch` handles null (not verified).
- **http-kit/local-daemon-request.ts (18)**: (a) `isLoopbackPeerAddress` (60–64): `trim`, bracket-strip regex anchors, `::1`/`0:0:0:0:0:0:0:1`, `startsWith('127.')` vs `endsWith` — no test with spoofed non-loopback look-alikes (`10.0.0.127`, ` ::1`, `[::1]`). Auth bypass class.
- **http-kit/verified-origin/origin.ts (12)**: (a) empty/non-string url (30), http→scheme (41), scheme mismatch (98) and `!target` (154) each untested individually; error message object (125).
- **sandbox/node-worker.ts (19+1 nocov)**: (a) reply validation (108–111: `ok`/`html`/`error` type guards, `||` vs `&&`) — malformed worker replies untested; timeout env regex anchors (52), `<=`/`>` upper bound 2147483647 (71); worker `error` event listener (168 **NOCOV**) and `terminate()` forwarding (171); `env` copy (136), `execArgv: []` (138 — executing worker with inherited flags). sandbox e2b/wrap-e2b-sandbox.ts (10): path-escape guard 149 `relative==='..'||startsWith('../')` clause can be false → traversal-edge case untested (high), mounting-path event filter 198.
- **devops/deploy/node.ts (14)**: (a) `isLookupAddress` guard (9–10) and `every`→`some` on resolved addresses (25): a DNS answer mixing allowed + blocked IPs is accepted by `some` — SSRF/reachability guard, high risk.
- **devops/checks/coverage/lcov.ts (23+1)**: (a) path normalisation (`trim`, backslash, trailing-slash regex), `suffixes.some`→`every`, `directories.some`→`every`, exclusion filters; NOCOV 42:91 sourceExtensions miss branch.
- **devops/checks/coverage/floors.ts (10)**: (a) floor validation `!isFinite || <0 || >100`: each clause + the `>`/`>=` boundary unproven (coverage gate can accept NaN/negative/ >100).
- **devops/dns/node/wire.ts (12 + 10 timeouts)**: (a) label length boundary (34 `>` vs `>=` 63), truncation arithmetic (42), pointer-jump bound (56), compression-pointer guard 63 (`||`→`&&`) — DNS parser hardening, malformed/loop-pointer messages under-tested. Timeouts here are likely infinite-loop mutants (effectively killed).
- **agentic/install-service.ts, topic-schema.ts, validation.ts, github.ts, page-executor, dom-page-driver, interpreter**: dominated by (a) `isRecord` triple-clause neutralisation (`typeof=== 'object' && !== null && !Array.isArray`) and zod/regex-anchored validators: Regex 26, ConditionalExpression 103. Same fix pattern as protocol: one negative-input table per validator (array / null / wrong type). install-service 42 and `finally { queues.delete }` (76 – leak of in-flight queue key).
- By mutator across all 7 packages: ConditionalExpression ~375, Regex ~145 (103 in devops, 26 agentic — anchor/quantifier drops, mostly (a) validator inputs; some in lcov/hardwiring checks are path-grammar gaps), MethodExpression ~97, ObjectLiteral ~139 (mostly optional-field spreads `{}`), LogicalOperator ~69, BlockStatement ~41, EqualityOperator ~72 (boundary comparisons), OptionalChaining ~37 (b for most: `?.`→`.` on defined values), ArrayDeclaration ~76, BooleanLiteral ~61. Estimate: ≥ 70 % of survivors are (a) missing negative/boundary inputs; ~10–15 % (b) equivalent (optional-chaining, redundant null checks, `Stryker was here` array defaults never read); ~15 % (c) diagnostics/trace helpers.

## 5. No-coverage ranges (26 mutants)
- server/create-local-node-daemon.typecheck.ts (22, whole file; type-level proof run by tsc only — expected).
- sidecar/json-ipc.ts 151 `socket.once("connect", …)` ×2 (live-socket stale check).
- sandbox/node-worker.ts 168 (`worker.once("error")` listener).
- devops/checks/coverage/lcov.ts 42:91; agentic/core/page-executor.ts (1), see survivors-*.txt (`NOCOV` tag).

## 6. NOT RUN
Nothing excluded by time. Not mutated by design: agent-runtime (lane L3), `*.tsx`/UI, `__tests__`, `*.d.ts`, and the packages' non-`src` code. StringLiteral mutants (2,631) ignored. Per-package `index.ts` barrels were included but have ~0 mutants.

## 7. What these numbers do NOT catch
Type checks disabled (type-invalid mutants counted as ordinary; no checker plugin); StringLiteral excluded (error-message/contract text untested here); "killed" may be an indirect kill by an unrelated test; perTest coverage trusts vitest coverage mapping; equivalent mutants not exhaustively triaged (triage covered only the worst ~25 files); inputs never imagined by the source (missing validators, missing branches) are invisible; integration/e2e/real-network behaviour (e2b, DNS, git, supervisor processes) only as far as unit tests mock it; timeouts (42 devops, 11 agentic, 7 http-kit) counted as killed; UI excluded; server score depends on the symlink workaround.

## 8. Top 10 tests to write first (by risk)
1. http-kit `isLoopbackPeerAddress` + loopback-origin regex: reject `10.0.0.127`, `127.0.0.1.evil.com`, `evil.http://localhost`, padded/bracketed variants (auth/CSRF bypass).
2. devops `deploy/node.ts` reachability lookup: a mixed allowed+blocked address list must be refused (`every` vs `some`) — SSRF guard.
3. sandbox e2b path guard: `..`, `../x`, absolute, NUL, and `a/../..` paths rejected (wrap-e2b-sandbox 149).
4. protocol `registry.ts`: empty/ wrong-enum `archive|integrity|manifestDigest|id|name|github|type` rejected; verification-meta issue path asserted.
5. server `feature.ts`: pin the exact capability grant set (`host:exec`, `net:egress`, `db:admin`, `daemon:control`, …).
6. sidecar `json-ipc.ts` stale-socket detection: live (connectable) socket → not stale; ECONNREFUSED → stale (covers the NOCOV lines).
7. sidecar `supervisor.ts`: respawn only when exited && replaceAfterExit && !terminating (each conjunct), cooldown 0 allowed / −1 rejected.
8. devops `dns/node/wire.ts`: 63- vs 64-byte labels, truncated message, compression-pointer loops/overruns.
9. sandbox `node-worker.ts`: malformed worker replies (non-object, ok without html, error not string), worker `error` event, env/timeout parsing boundaries (`"12a"`, `"0"`, `"2147483648"`).
10. devops `coverage/floors.ts` + `lcov.ts`: NaN/negative/>100 floors rejected; backslash/trailing-slash/extension filtering; shared `isRecord`-style negative tables (array/null/primitive) for protocol delegated-result and agentic validators.

L9 DONE 2026-10-25T17:00Z — wall ~1 h, ~0.15M tokens (rough).
