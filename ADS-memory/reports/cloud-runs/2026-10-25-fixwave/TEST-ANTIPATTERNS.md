# Test anti-patterns from the 2026-10-25 StrykerJS runs

**Sources** (read from `origin/cloud/stryker-1025-tovu`): `ADS-memory/reports/cloud-runs/2026-10-25-stryker/L1–L14/REPORT.md`, `STRYKER-RUN-2.md` (**R2**), `2026-10-25-overnight/STRYKER-PILOT.md` (**P**), and the Codex methodology review `codex-cloudreview-1025/out/stryker-part0.md` (**CX**). L15 is still interim (desktop: 603 survivors, not triaged), so it is not counted here.
**Scope:** the lanes report about 16.4k survivors in total. Every run excluded `StringLiteral` mutants and ran with type checks off. All counts below are **lower bounds**: they only include what a report states or lists. "Lanes" counts how many of the 16 sources (P, R2, L1–L14) name the pattern. Line numbers point into the mutated source file: Jini for P, R2, L1–L6 and L8–L10; Tovu `apps/*` for L7 and L11–L14.
**Survivor kinds:** almost every survivor is a missing assertion. No lane found a source bug by mutation. The red pins in §3.0 are the exception.

## 1. Anti-patterns (each: definition · prevalence · 2 real examples · fix rule)

### AP1 Bare-failure assertion
- **Def:** the negative test only checks *that* the call failed (`toThrow()`, `ok:false`, a status code). It does not check *which* error, code or body came back.
- **Seen:** 8 lanes (P, R2, L1, L4, L6, L7, L8, L12). Exact counts: L7 has 50 survivors where `MemberLoginError({code})` becomes `{}` (oidc-login 23, providers 16, link-service 11). P has 14 (12 message strings and 2 error lists). In L8, error bodies are half of the dominant pattern behind ~60 % of 1,443 survivors (shared with AP3).
- **Ex:** P `agent-plugins/src/lifecycle/exports.ts:91:128` and `:94:65`: the `errors` list can become `[]` and no test fails, because no test reads `errors` for a bad `renamedFrom` or for non-object `exports`.
- **Ex:** L8 `daemon/src/http/message-relay.ts:23-28`: the 401 (unknown run credential) and the 404 (credential for another run) are status-only. Their error bodies and codes are never asserted.
- **Fix rule:** every negative test asserts the error class **and** `code`. For HTTP, assert the status **and** `body.error.code`. If the message is user-visible, add `toContain(<stable phrase>)`. A bare `toThrow()` or a bare `ok:false` is a review reject.

### AP2 Singleton collections
- **Def:** code that consumes a collection is only tested with 0–1 items or with input that is already sorted. So `every`↔`some` swaps, a dropped `.sort()` and tie-break flips all survive.
- **Seen:** 9 lanes (P, R2, L1, L2, L5, L6, L9, L10, L11). At least 20 sites are named: P has 3 (`exports.ts:39:89`, `56:53`, `91:68`). R2 has 7: projection 138/149, trusted-plugin-files 89, seed-bundled 313 `sort`, bundled-source-archive 82, and settings-value 22/24.
- **Ex:** L1 `oauth/src/authorization-code.ts:101`: `redirectUris.some(…)` can become `every` and nothing fails, because only clients with a single redirect URI are tested.
- **Ex:** L9 `devops/src/deploy/node.ts:25`: `every` can become `some` on the resolved addresses, so a DNS answer that mixes allowed and blocked IPs would pass (SSRF).
- **Fix rule:** give list inputs at least 3 items. Put the one bad item first, then in the middle, then last, each as its own case. For any output that depends on order, feed reverse-sorted input plus one equal-key tie with a stated expected order.

### AP3 Type-blind validators
- **Def:** guards such as `typeof x==='string'`, `isRecord`, `Number.isFinite` or `err.code==='ENOENT'` never receive the wrong type, so mutating them to `true` survives.
- **Seen:** 11 lanes (P, R2, L2, L3, L4, L5, L6, L8, L9, L10, L12). R2 has 12 `isENOENT` survivors (`lifecycle/node.ts:30` ×6, `installed-package-roots.ts:71` ×6). L8 says this pattern dominates its survivors. L9 agentic has 103 `ConditionalExpression` survivors, mostly `isRecord` triples.
- **Ex:** P `exports.ts:45:10`: `typeof value==='string'` can become `true`. With `template: 123` the code would then throw a `TypeError` on `.endsWith`, and no test checks that bad input is refused rather than thrown.
- **Ex:** L9 `protocol/src/delegated-result.ts:13,17`: both the `isRecord` check and the text-block guard can be removed entirely. No test passes an array, `null`, a non-text block or a non-string `text`.
- **Fix rule:** run a shared `HOSTILE` table through every validator and parser: `undefined, null, [], {}, 0, NaN, Infinity, "", "  ", true`, a string where an object is expected, and an object where a string is expected. Error helpers also get an `EACCES` error and a thrown string. Each value must produce the documented rejection, never a `TypeError`.

### AP4 Happy-string regex
- **Def:** a regex is tested with 1–2 valid strings and perhaps one obviously invalid one. Its anchors, quantifiers, character classes and alternations are never pinned.
- **Seen:** all 16 sources. At least ~730 `Regex` survivors are tallied: L5 chat 213, L14 176, L9 ~145, L3 75, R2 ~70 (about 10 % of R2), L7 ~29, L11 18, L10 11.
- **Ex:** L11 `assistant/daemon-access.ts`: the route allowlist (`/^\/api\/runs\/[^/]+$/`, `…\/cancel$/`, `/api/active`) has 12 survivors where the `^` or `$` is dropped. No test refuses `/x/api/active` or `/api/active/extra`.
- **Ex:** L9 `http-kit/src/api-security-middleware.ts:287`: dropping the `^` or the `$` from the loopback-origin regex survives. `http://127.0.0.1.evil.com` is never tested as rejected, which matters for CORS/CSRF. The same pattern appears at L14 `features/post/slug.ts:20`, where `SLUG_FORMAT_PATTERN /^[a-z0-9-]+$/` can lose its `^`.
- **Fix rule:** write one `it.each` table per regex. It covers:
  - shortest valid, longest valid, max+1, and empty;
  - leading junk, trailing junk (`"ok\n"`, `"ok!"`) and embedded junk;
  - wrong case;
  - each alternation branch;
  - each quantifier at 0, 1 and 2 repeats.

  Host, origin and path regexes also get `evil.<allowed>`, `<allowed>.evil.com`, and an extra prefix or suffix path segment.

### AP5 Unasserted declarative contracts
- **Def:** nothing compares the declared data to what is expected: tool `inputSchema`, `required`, `additionalProperties`, `authorization.permission`, annotations, module manifests, or zod shapes. Mutating them to `{}`, `[]` or `true` survives.
- **Seen:** 11 lanes (L1–L7, L9, L10, L11, L14), with at least 400 survivors. L4 has ~150 across the cms `*/agent-tools.ts` and `widgets/registry.ts`. L14 has 109 (forms 45, consent 30, pages 29, plugin-runtime 5). L9 `protocol/registry.ts` has 38. L7 has 33, L5 `chat-capabilities.ts` has 27, L3 has ~20 in the mcp tool files, L6 has 11, and L1 and L2 have 9 each.
- **Ex:** L14 `features/forms/agent-tools.ts:212`: `authorization:{permission:"admin.forms.manage"}` can become `{}`. At `:224`, `required:["name","slug","fields"]` can become `[]`. Both survive, and the file scores 13.5 %.
- **Ex:** L2 `db/src/tools/database-catalog.ts`: every tool's `authorization:{permission:"database.read"}` can become `{}`. The file scores 57 %, because no test asserts which permission a tool requires.
- **Fix rule:** write one contract test per tool registry. For each tool, `toEqual({name, authorization, inputSchema:{required, additionalProperties:false,…}, annotations})` against an **inline** expected value, not a regenerated snapshot. Then validate one good input and one input with an extra key against the schema.

### AP6 Unpinned security defaults
- **Def:** default-deny values can be flipped and nothing fails. Examples: policy constants (`denyPrivateAddresses:true`, `allowedSchemes:["https"]`), option defaults (`allowDataRequests=false`, `allowedOrigins ?? []`), capability grant sets, privacy defaults, and secret-file write flags.
- **Seen:** 7 lanes (L1, L3, L6, L9, L10, L11, L13), at least 60 survivors. Named sites:
  - L11 `egress-policies.ts`: 31;
  - L9 `server/feature.ts`: 14;
  - L3 `writeSecretText` flags in `core/config.ts:90` and `tokens.ts:105`;
  - L10 `request-guard.ts:104,263` and `render-service.ts:92`;
  - L6 `saved-requests/execute.ts:75,82`;
  - L13 `DEFAULT_PRIVACY`;
  - L1 hasher argon2 defaults.
- **Ex:** L11 `platform/http/egress-policies.ts` `SINGLE_HOP_HTTPS_EGRESS_POLICY`: `allowedSchemes:["https"]` can become `[]`, `denyPrivateAddresses:true` can become `false`, and all 10 size/time constants can change. All of it survives; the file scores 50 %.
- **Ex:** L9 `server/src/feature.ts:77-86`: the capability flags (`host:exec`, `net:egress`, `db:admin`, `daemon:control`, …) can flip to `false` and nothing notices (14 survivors).
- **Fix rule:** pin every exported policy or default object with `toEqual` against the full literal. Add one behavioural refusal per deny flag: a private IP is refused, `http:` is refused, `data:` is blocked, and an unknown origin is rejected.

### AP7 Security guard with no negative test
- **Def:** an authn, authz, ownership, containment or token check is only exercised on its allow path. Mutating the condition to `false`, or emptying its block, survives.
- **Seen:** all 16 sources, at least 55 named guard sites. The five worst are in §3.1.
- **Ex:** L8 `daemon/src/http/remote-run-events.ts:93`: `presented===null || !timingSafeTokenMatch(…)` can become `false` and nothing fails. No test sends a missing or wrong bearer token.
- **Ex:** L1 `user-management/src/server/admin-crud-service.ts:345,347`: the guard stopping a non-owner from resetting the seeded owner's password can become `false`, and its block can become `{}`. Both survive.
- **Fix rule:** write each guard's deny tests **first**: unauthenticated, wrong token, wrong owner/principal/workspace, and path escape. Each one asserts the specific denial, per AP1. Review check: for every `throw` or `401/403/404` return inside a guard, name the test that triggers it.

### AP8 Whole-guard negatives
- **Def:** a compound guard (`a || b || c`) is only tested with inputs that break several clauses at once. So setting each operand to `false`, or swapping `||`↔`&&`, survives.
- **Seen:** at least 10 lanes. Tallied `LogicalOperator` survivors are at least 266 (L14 156, L9 ~69, L5 41). Single files: L11 `external-mcp-vault.ts` has 19 and R2 `host-validator.ts` has 17.
- **Ex:** L2 `db/src/owner-store/service.ts:38`: the vault `authorize` guard (`workspaceId!==OWNER || principalId!==null || !isCopyable…`) survives being set to `false`, and survives every `||`→`&&` swap.
- **Ex:** R2 `admin-surfaces/host-validator.ts:42-49`: the postMessage envelope guard has 17 survivors. It needs a separate case for each of these: non-object, `null`, wrong protocol, wrong version, bad `mountId`, bad `requestId`.
- **Fix rule:** start from one fully valid input. Write one case per clause that breaks **only** that clause (`{...valid, field: bad}`), plus the all-valid allow case.

### AP9 Limit tested without limit±1
- **Def:** size, count, length and time limits are only tested far from the edge, so `>`↔`>=` and `+1`↔`-1` survive.
- **Seen:** at least 12 lanes. Tallied `EqualityOperator` survivors are at least 275 (L14 141, L9 ~72, L5 62). Pattern 6 in R2 names 7 sites.
- **Ex:** L6 `capability-providers/src/visitor-auth/lifecycle.ts:392`: the ID-token clock-skew bounds `skew<0` and `skew>300` can become `<=` and `>=`. Skew values of 0 and 300 are never tested.
- **Ex:** L12 `routes/members/oidc-callback.ts:18-19`: the `code.length>4096` and `state.length>16384` guards survive every operator mutant.
- **Fix rule:** use a `boundary(limit)` helper that generates `limit-1`, `limit` and `limit+1`, plus 0 and a negative value for numeric limits. Assert limit constants by value, e.g. `RECOVERY_WINDOW_MS === 300_000` (L5 `policies.ts:2`).

### AP10 Abort, cleanup and race paths never driven
- **Def:** these paths only ever run the happy case: `AbortSignal`, `{once:true}` listeners, `finally` cleanup, settle-once flags, and stale-response generation counters.
- **Seen:** 7 lanes (L1, L2, L3, L8, L10, L13, R2). L10 says this survives "in every controller", and L1 has 41 in the roles controller and 28 in the members controller.
- **Ex:** L2 `core/src/approval.ts:72,96`: the `signal.aborted` pre-checks can become `false`, and the `finally` listener cleanup at `:26` can be removed. Both survive, so the human-confirmation gate never sees a pre-aborted signal or an abort mid-prompt.
- **Ex:** L10 `admin/src/security/controllers/*` (other-credentials 10:17, access-tokens 21/24, root-key 19:19): the stale-response guard `ticket===generation` can become `true` in every one of them and nothing fails.
- **Fix rule:** every abortable or async API gets four tests: pre-aborted, aborted mid-flight, normal completion, and out-of-order resolution (the older request resolves after the newer one). Each asserts the result **and** that listeners and timers are released (listener count back to 0, `vi.getTimerCount()===0`).

### AP11 Failure ports never injected
- **Def:** `catch {}`, fallback and fail-closed branches never run, because no fake port ever throws. Emptying those blocks survives.
- **Seen:** 6 lanes (R2, L2, L4, L5, L6, L8). Named sites:
  - R2: capability-projection 43/50/55 and bundled-digests 118/125/234;
  - L5: note-store 346/353/379/513;
  - L6: the `operation-runtime.ts:155` no-coverage line;
  - L8: session-coordination 87;
  - L4: deliver-job.
- **Ex:** R2 `lifecycle/bundled-digests.ts:118,125,234`: emptying the `catch{}` bodies survives, because no test makes the ledger read or write throw.
- **Ex:** L8 `daemon/src/session-coordination.ts:87`: the catch is meant to fail closed when a listener fails, and nothing tests it.
- **Fix rule:** for each port in a DI signature, write one test with a throwing fake: an `Error`, a non-`Error` value, and a rejected promise. Assert the documented fallback or fail-closed result. An empty `catch` needs a test that proves the swallow is intended.

### AP12 Unproven test doubles and conformance suites
- **Def:** in-memory repos, fakes and shared conformance suites are never checked to make sure they *fail* on a wrong adapter.
- **Seen:** 7 lanes (L1, L4, L5, L6, L7, L10, L14), at least 350 survivors: L5 `testkit/*` 139, L10 conformance 98 plus memory adapter 30, L1 `admin/conformance` 84. L14 `post/repo.memory.ts` scores 28 % on top of that.
- **Ex:** L5 `search/src/testkit/conformance.ts:129`: every term of the highlight-range check (`integral && start>=0 && start<end && end<=len`) survives. A provider that returns bad ranges would still pass conformance.
- **Ex:** L10 `admin/src/agent-plugins/conformance/agent-plugins-api.conformance.ts` scores 67.5 % with 68 survivors: `check()` clauses survive `&&`→`||` and `.some`→`.every`.
- **Fix rule:** give each conformance suite a "broken adapter" self-test, with one deliberate defect per check, that is expected to fail. Run each memory repo through the same contract suite as its SQL repo.

### AP13 Memoisation and identity unpinned
- **Def:** nothing asserts the `create*Module(ports)` cache, the build-once behaviour, or the DI token ids.
- **Seen:** 4 sources, at least 26 survivors. R2 has 16 (4 each in capability-projection:82, trusted-plugin-files, set-enabled:112 and bundled-source-archive). Token ids add more: L6 `comments/tokens.ts` 5, L8 `tokens.ts` 4, L10 artifacts `tokens.ts` 1.
- **Ex:** R2 `lifecycle/set-enabled.ts:112` and `capability-projection.ts:82`: the memoisation block survives because no test calls the factory twice with the same ports.
- **Ex:** L8 `daemon/src/tokens.ts`: all 4 `token({id})` calls can become `{}` and nothing fails (0 %).
- **Fix rule:** assert `expect(createX(ports)).toBe(createX(ports))`, check that the build spy is called once, and check that different ports give a different instance. Assert DI token ids are distinct and stable.

### AP14 Source-coupled tests
- **Def:** tests that grep or hash source files, assert comments, spawn child processes, or depend on paths relative to the repo. Mutation testing cannot measure them, and they are often the only guard of an invariant.
- **Seen:** 8 lanes (L1, L2, L4, L6, L7, L10, L12, L13). Examples:
  - L1 `fqfix-disable.unit.test.ts` asserts comments;
  - L4 had to exclude 3 source-introspection tests;
  - L7 `identity/__tests__/wiring.test.ts` greps for `process.env`;
  - L10 cannot instrument stringified browser functions;
  - L1 `sandbox-env.test.ts:209-211` let a mutant write `/should-not-be-touched` onto the host filesystem.
- **Ex:** L6 `commerce/src/payments/ledger/migrations/0001_payments_ledger.ts` is unmeasured, because a checksum test hashes its source and any instrumentation fails the dry run.
- **Ex:** L12 `runtime/boot/process-error-guards.ts` shows 0 % with 11 no-coverage mutants, because its only test spawns a tsx child process that Stryker cannot see.
- **Fix rule:** keep source-scan and pin checks in a separate lint suite. Every invariant they guard also needs an in-process behavioural test. A child-process test is never a module's only test. Tests write only under `mkdtemp`.

### AP15 Dark files (no test executes them)
- **Def:** production files that no test runs.
- **Seen:** 7 lanes, at least 634 genuine no-coverage mutants across 12 files:
  - L14: plugin-credential-card 133, post/repo.memory 122, trash-item-tool 83;
  - L11: vault-meta-rules 91;
  - L6: commerce catalog `repo.ts` 85;
  - L2: plugins `host/sql/repo*.ts` 39;
  - L13: use-cms-sidebar-label-tooltips 29, use-credential-hint 4;
  - L7: permission-list-tool 20, ready-providers 11, chart-provider 5;
  - L3: claude-filesystem-policy 12.

  On top of that, L14 found 41 files that no test imports, and L11 has 5 unmeasured files.
  **These are NOT dark** (measurement artifacts): L5 chat store (1,578), L8 `event-log/sqlite.ts` (112), the L12 dev-auth and site-consent red baselines, L7 trash-member, and L13 admin-themes.
- **Ex:** L6 `commerce/src/catalog/repo.ts` has all 85 mutants with no coverage. I re-checked today: no test imports it on Jini `origin/main` 8322f717 or on `cloud/overnight-1024-jini` 3e2fbae8. Only `repo.rows.ts` is tested.
- **Ex:** L2 `plugins/src/host/sql/repo.ts` and `repo.rows.ts` score 0 %: no test executes the Kysely plugin-activation repo at all.
- **Fix rule:** every new `src` file lands with a test that imports it. Use per-file coverage floors; mcp, memory and search already enforce 100 % and had almost no no-coverage mutants. Before calling a 0 % file untested, run its test and check that the import resolves (see M7).

## 2. Methodology pitfalls (for whoever runs Stryker next)
- **M1 Dry-run test count:** check it against a plain `vitest run` before trusting any score. In R2, a relative `@jini-ai/plugins/host` alias resolved to nothing inside the sandbox. The dry run "passed" on 102 tests instead of ~1,240 and produced 666 fake no-coverage mutants. In L2 core, the dry run had 1,443 tests against a baseline of 1,488, and the gap was never explained.
- **M2 Relative paths break in the sandbox:**
  - **Problem:** relative aliases, `extends`, `../db` and `import.meta.url` all resolve wrongly in `.stryker-tmp` (P, R2, L2 registry, L4, L9 server, L13 `../website`).
  - **Fix:**
    - use absolute aliases;
    - set a relative `tempDirName: ".stryker-tmp"`;
    - symlink sibling packages into `.stryker-tmp` and set `cleanTempDir:false`;
    - run with cwd set to the package directory.
- **M3 Incremental cache after a config change:** CX found that R2's corrected scores still carry results from before the fix. The configs had `incremental:true` and `force:false`, and the final reports still contain 148, 79 and 1 static survivors in Parts 1, 2 and 3a. Stryker's incremental mode does not detect config changes or newly collected tests. **After any config or alias change, rerun with `--force`.**
- **M4 Collection errors counted as survivors:** CX found R2 mutants 23 and 363 (`activation.ts` with `buildModule` or `createActivationModule` emptied). They broke `test-support.ts:53` at import time and "survived" with only 27 tests completed. **Treat a collection or import error as a kill.** Flag any mutant whose tests-completed count is far below the dry run.
- **M5 What the exclusions hide:**
  - **`StringLiteral` excluded:** error messages, permission strings, tool ids and string-keyed allowlists go unmeasured. That is 14 of the 25 survivors in P, and L11 notes that many of its gates are string-keyed.
  - **Type checks off:** the direction of the bias is **unknown**. Do not call it "slightly pessimistic" (R2 does). CX found mutant 1406 counted as killed only because of an `undefined.ok` error.
- **M6 `ignoreStatic` hides the limits:** module-level constants (`MAX_*`, regex tables, defaults) are not scored. L2 core ignored 1,930 such mutants, and L13 ignored 737 of the 1,315 in `api.ts`. Report the ignored count next to every score.
- **M7 False no-coverage:** perTest coverage misattributes when tests load native drivers or aliases (L5 chat store 1,578; L8 sqlite 112, which stayed at 0 even with `coverageAnalysis: off`). Prove a test actually loads the instrumented file before calling the file untested.
- **M8 Scoped test sets understate scores:** the tap-runner is file-granular and test sets were scoped, so scores are lower bounds. With the wider suites, L12 site-key went from 56.8 % to 87 % and publish-credentials from 63 % to 88 %. L13 admin-themes and L7 trash-member are low only because of the test scope.
- **M9 Timeouts:** report them as their own category. Besides the 21 `Timeout` statuses, R2 has 66 `Killed` mutants whose reason is a vitest timeout (2 lifecycle, 64 admin-surfaces) (CX). L8 counted 214 timeouts as kills. The default 5 s vitest timeout fails the dry run (R2 used 30 s). `retry: 2` (L13) can hide flaky kills.
- **M10 Red baselines:** a red baseline forces tests to be excluded, which silently unmeasures their subjects. List every excluded test file next to the files it guards (L1, L2, L4, L7, L11, L12; L13 had 19 failing tests). A red **security pin** is a finding, not noise (§3.0).
- **M11 Process limits:**
  - child-process tests are invisible to Stryker (L12);
  - functions stringified into the browser break instrumentation (L10);
  - using the whole admin suite as the test set means a 28-minute dry run and 9–15 mutants a minute, while a scoped set takes 3 minutes and ~60 a minute (L13);
  - static mutants run last against every test, at about 2 minutes each.

## 3. First fixes (priority order)
**3.0 Red security pins: decide these before writing tests (they are failing on the branch now)**
- L7 `features/database-transfer/__tests__/exclusions.unit.test.ts` fails with `['members (password_hash)']`. The `members.password_hash` column is neither excluded nor stripped, so a database transfer copies member password hashes.
- L11 `assistant/__tests__/mcp-ui-tool-calls.test.ts` (marked "SECURITY-CRITICAL allowlist is exactly this set") fails: the live allowlist contains `members_delete`. The completeness scan also misses 3 `open()` sites: `site/visitor-confirmations.ts:42` and `member-login/oidc-login.ts:175,238`.
- L7 `identity/__tests__/wiring.test.ts`: the owner policy is `['*','visitor-tools.manage']`, but the pin expects `['*']`. L12 `site-consent.test.ts` has 3 red tests (a static export returns 200 instead of 409); this may be a Jini version mismatch, so rerun it against the matching Jini.

**3.1 The five untested security guards (write the deny test; each currently survives being set to `false`)**
| # | Site (Jini) | Test to write |
|---|---|---|
| 1 | `daemon/src/http/remote-run-events.ts:93` bearer gate | Missing, wrong and malformed `Authorization` each get the 401-class error with its code asserted. A valid token reaches `next`. |
| 2 | `daemon/src/run-credentials.ts:219` owner check | Run owned by another principal with `runExists` returning false gives 404. `runExists` throwing also gives 404 (fail closed, `:221`). |
| 3 | `capability-providers/src/adapters/jwt-auth/index.ts:97` length guard | A forged signature that is shorter or longer returns `{ok:false}` and does not throw a `RangeError` from `timingSafeEqual`. |
| 4 | `capability-providers/src/visitor-auth/lifecycle.ts:67` loopback exception | `https` is accepted. `http://localhost`, `127.0.0.1` and `[::1]` are accepted **only** with `allowLoopbackHttp:true`. `http://evil.example` is rejected either way. `ftp:` is rejected. |
| 5 | `commerce/src/payments/ops/common.ts:37` `NOT_ASSESSED_RISK.fallback` | Assert `fallback === false` on the not-assessed decision, plus the policy outcome it gates. Also check that a non-unique `LedgerConstraintError` is rethrown (`:197`). |

**3.2 No-coverage (0 %) files**
- **Genuine gaps (no test executes them):**
  - Jini `commerce/src/catalog/repo.ts` (85; the five `Sql*Repo` classes: run a sqlite in-memory round-trip);
  - Jini `plugins/src/host/sql/repo.ts` and `repo.rows.ts` (39; save, get, and upsert on `(workspace_id, plugin_id)`);
  - Tovu `features/custom-credentials/plugin-credential-card.ts` (133);
  - `platform/secrets/vault-meta-rules.ts` (91: `assertRecoveryMeta`, `legacyAad`);
  - `features/trash/trash-item-tool.ts` (83);
  - `identity/permission-list-tool.ts` (20: authz never invoked);
  - `member-login/ready-providers.ts` (11).
- **Jini `daemon/src/store/event-log/sqlite.ts`** (112, 0 %): this is a **measurement anomaly, not missing tests**. Five test files exist, including `sqlite.test.ts`, and the file still showed 0 even with `coverageAnalysis: off`. Fix the sandbox's native `better-sqlite3`/alias resolution (M7), then re-measure. Do not write duplicate tests for it.

**3.3 Each lane's "Top 10", condensed (top items only; the rest is in each lane's §8)**
- **P/R2:** `host-validator` + `surface-client` envelope table (AP8); `plugin-export` `__proto__`/`constructor` slots and `//evil.com`; `package-paths:113` containment; `skill-file-reader` bytes 0x01/0x7f + 256 KiB±1; `tools/capabilities.ts:111` JSON-escaped token leak; one table per id regex (~70 survivors).
- **L1:** seeded-owner password reset; scoped/constrained `*` grants must not grant everything (`authorize.ts:167,183`); ≥2 redirect URIs + empty `state`/`code`; guarded client username-only URL; SSRF corpus (`::ffff:7f00:1`, octet 256); `guarded-reader` path corpus.
- **L2:** vault `authorize:38` per clause; cert-chain rejection (cycle, too long, broken, empty); plugin install hardlink/symlink/size limits; settings user-scope cross-principal write; `approval.ts` aborts; browser-provider approval mismatch; malformed backup.
- **L3:** relay nonce `serve.ts:213` (no coverage); `__proto__` keys (`config.ts:115`, `tokens.ts:127`); `writeSecretText` 0600; Windows argv metacharacters (`prompt-budget`); `role-marker-guard` chunk split at buffer size.
- **L4:** `sanitize-svg` one payload per clause; content-type sniffer truncated buffers; `inputSchema` contract for every `agent-tools` + `widgets/registry`; consent gate conjuncts + cookie-id length 15/16/128/129.
- **L5:** `note-store` containment (`../x`, 97 chars, NUL in `subdir`, symlink); redaction at URL-span edges; re-measure `src/store/**`; `validate.ts`/`pointer.ts` reserved paths.
- **L6:** §3.1 items 3–5; webhook `signing.ts` (non-hex, NaN timestamp); `ssrf-guard` bracketed IPv6; `saved-requests` policy pin; `credentialed-request` `//host`.
- **L7:** §3.0 first; `destination-store` `authorize` L66–67 negatives; permission-list-tool authz; `user.manage` grant pin; malformed scrypt params; link-service subject/proof binding.
- **L8:** §3.1 items 1–2; `allowsRunScoped` with `/g`,`/y` regexes; message-relay claim bodies; session-coordination fail-closed.
- **L9:** `isLoopbackPeerAddress` look-alikes (`10.0.0.127`, `[::1]`); `deploy/node.ts` mixed address list; e2b path guard; `protocol/registry` empty/wrong-enum fields; `feature.ts` capability pin.
- **L10:** vibecoding symlink refusal (`store.ts:72,318`); corrupt-store fixtures; `secrets-only`/`redaction` tables; `request-guard` defaults; analytics IPv6 bucketing.
- **L11:** `daemon-access` path negatives; `egress-policies` pin; `requireChatDeleteGrant` args (`human-confirm.ts:83,105`); `external-mcp-vault` context fields one by one; `permanent-delete-settings` duplicates/unknown/over-long.
- **L12:** `publish-trust-auth.ts:423` backstop grant; dev-auth local-owner sign-in gates; `me.ts` suspended member; unlink-identity 900000 ms edge; 6-digit code regex.
- **L13:** `admin-boot-scope` `queryScope` (cross-user cache key); `DEFAULT_PRIVACY` telemetry off; `api.ts` AbortError rethrow; `queued-daemon-start` busy-retry/abort.
- **L14:** `secret-scan-guard.ts:154` allowlist per clause; `move-to-trash` unknown type/`expectedVersion` (`:116,141`); `content-hash` key order + excluded keys; deploy-ops module-path clauses; tool-definition contracts. `apps/website/src/cli/` was NOT RUN.

## OWNER DECISIONS — DO NOT "FIX" THESE IN SOURCE (added 2:45 PM PT)
Three red security pin tests reflect OWNER-APPROVED behaviour (2026-10-25). Update the TEST to the decision; never change source to satisfy the old pin:
1. database-transfer copies `members.password_hash` — owner: ALLOW in database transfer (never in public/static exports). Update exclusions.unit.test.ts accordingly (and assert it stays out of public/static exports).
2. mcp-ui allowlist containing `members_delete` (and the grown allow-lists/exemption map) — owner SIGNED OFF. Update the allowlist pin.
3. owner policy containing `visitor-tools.manage` — owner: admins AND owner get it. Update wiring.test.ts (owner policy is not `['*']`-only).
