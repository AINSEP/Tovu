# `--experimental-test-module-mocks` — evaluation and rollout

**Date:** 2026-08-21
**Node:** v24.2.0 (flag requires ≥22.3 — available)
**Verdict:** WIRED. No regression found on a bounded sample. One real end-to-end unlock proven with a new RED→GREEN test. One significant caveat found and documented below — the flag does not help every file that claimed it would, and the reason is architectural, not a flag limitation.

## 1. Was the flag actually missing?

Confirmed. Grepped root `package.json` and `development/scripts/ci-local.sh` — `--experimental-test-module-mocks` appeared nowhere before this change. `ci-local.sh` never calls `node --test` directly; every test gate it runs (`test:ci`, `test:cov:server`, `test:cov:server:tiered` → `:unit`/`:integration`) goes through an `npm run` script, so wiring the flag into `package.json` alone covers it — no separate edit to `ci-local.sh` was needed.

`development/scripts/rerun-failing-tests.sh` is a **separate, unaddressed gap**: it invokes `node --import tsx --test` directly (line 63), bypassing the npm scripts entirely. It was not in this task's named scope, so it was left alone — flagging it here since a test using `mock.module()` will behave differently (fail with `t.mock.module is not a function`) when rerun through that script versus through `npm test`.

## 2. Was the "no DI seam" claim in the four files real?

Yes, verified by reading the actual production code, not just the comments:

- `src/server/routes/admin/assistant/test-agent.ts:1` — `import { detectAgents } from "@jini-ai/agent-runtime";` is a direct static import. `RouteDeps`/`AssistantExecutionRouteDeps` carries no `detectAgents` field, so there is genuinely no injectable seam.
- The extraction of `resolveTestAgentOutcome` (pure function, `resolve-test-agent-outcome.ts`) is a real, working workaround already in place — it covers the installed/authenticated/model-mismatch/success branches without needing a CLI or a module mock. `resolve-test-agent-outcome.test.ts` exercises it directly.
- `database-migrate-forward-routes.test.ts`'s AUD-001 ordering test uses a different real workaround (holding the actual `operation-lock` itself rather than spying on the module) to prove authorize-before-lock-acquire ordering without `mock.module()`.

Both workarounds are legitimate engineering, not "test drift." The flag adds a capability these files didn't have; it doesn't reveal that they were wrong to work around its absence.

## 3. Regression check

Ran a 14-file bounded sample twice — once without the flag, once with — same files, same `TEST_CONCURRENCY=2`:

- `src/server/__tests__/admin-assistant-execution-routes.test.ts`, `admin-assistant-execution-credential-routes.test.ts`, `admin-assistant-settings-routes.test.ts`, `admin-assistant-site-credential-routes.test.ts`
- `src/server/__tests__/routes/database-migrate-forward-routes.test.ts`
- `src/server/routes/admin/assistant/__tests__/resolve-test-agent-outcome.test.ts`
- `src/assistant/persistence/**/*.test.ts` (3 files), `src/assistant/site/**/*.test.ts` (5 files)

| | tests | pass | fail |
|---|---|---|---|
| without flag | 162 | 162 | 0 |
| with flag | 162 | 162 | 0 |

Identical pass/fail counts, identical suite count (26). No behavioral change. (A first attempt at a much broader ~212-file sample across `src/server/__tests__` + `src/server/routes` + `src/assistant/**` was abandoned partway through — another session was concurrently running the full `npm run test:cov`, and stacking a second large run on top of that risked the documented memory-bomb failure mode. The 14-file sample above is smaller but directly covers the 4 files this task is about, plus a diverse-enough set outside them that a loader-level regression would still show up.)

Grepped the whole repo for pre-existing `mock.module(` calls: the only real (non-comment) call anywhere is the new test added below. So turning the flag on changes nothing about how any *existing* test runs — there was nothing else for it to interact with.

## 4. The unlock — proven, with a real caveat

Wrote one new test: `src/server/routes/admin/assistant/__tests__/test-agent-mock-module.test.ts`.

**RED (no flag):** `t.mock.module is not a function` (TypeError) — confirmed by running the file with plain `node --import tsx --test`.

**GREEN (with flag):** passes — the route returns `ok:true` for a CLI that exists only in the mock, driven entirely through the real Express route (`registerAdminAssistantTestAgentRoute`), asserting the mock was actually called (`callCount() === 1`) rather than a real PATH scan.

### The caveat this test surfaced

The first version of this test built its Express app the same way every other route test in this repo does — via `createRouteDeps()` from `../../../../app.js`. That version registered the mock correctly (no error) but the route still called the **real** `detectAgents` and returned "not found on PATH." Root cause, confirmed by tracing the import graph: `app.ts` statically imports `createAssistantExecutionModule`, which statically imports `test-agent.ts`, which statically imports `@jini-ai/agent-runtime`. So merely importing `createRouteDeps` from `app.js` — which every route test in this repo does — loads the real `detectAgents` and binds `test-agent.ts`'s copy to it **before the test body ever runs**. `mock.module()` cannot retroactively rewrite a binding a module already resolved at its first load; a subsequent dynamic `import("../test-agent.js")` just returns the same already-loaded module.

This means: **`admin-assistant-execution-routes.test.ts` and `database-migrate-forward-routes.test.ts` cannot use `mock.module()` through their existing `buildTestApp()` pattern**, because both build their app via `createRouteDeps()`/`app.js`. The flag genuinely unlocks the API — proven by the plain-ESM and bare-package-specifier repros below — but *this specific pattern* those two files' comments pointed at won't work without also restructuring how the test app is built (bypassing `app.js` entirely, hand-constructing only the narrow deps slice the target route needs, as the new test does).

Two smaller mechanics worth recording for whoever writes the next `mock.module()` test here:
- `namedExports` **replaces** the module's whole export set, not just the key(s) given. A bare `{ detectAgents }` broke a second, unrelated consumer in the same import chain (`byok-provider-turn.ts` needs `@jini-ai/agent-runtime`'s `runAnthropicToolTurn`). Fix: `const real = await import(specifier)` first, then spread it — `{ ...real, detectAgents }`.
- `mock.module()` must run before the **first** load of the target specifier in that test file's process. Node's test runner spawns one process per file, so this is per-file, not global — but any static top-level import in the same file (including a transitively-eager one like `app.js`) can burn that "first load" before the test body executes.

## 5. Files changed

- `package.json` — added `--experimental-test-module-mocks` to `test`, `test:ci`, `test:cov`, `test:cov:server`, `test:cov:server:unit`, `test:cov:server:integration`.
- `src/server/routes/admin/assistant/__tests__/test-agent-mock-module.test.ts` — new, proves the unlock.

## 6. Open items

- ~~`development/scripts/rerun-failing-tests.sh` still lacks the flag~~ — done, see §7.
- The two files whose comments originally motivated this (`admin-assistant-execution-routes.test.ts`, `database-migrate-forward-routes.test.ts`) were **not rewritten** to use `mock.module()` — see §8: reviewed in depth and neither one gains a new assertion from it.

## 7. Follow-up — `rerun-failing-tests.sh`

Added `--experimental-test-module-mocks` to its direct `node --import tsx --test` invocation (it doesn't go through the npm scripts, so §1's wiring didn't cover it). Verified end to end rather than just by inspection: ran `test-agent-mock-module.test.ts` *without* the flag to produce a real failing TAP entry (`t.mock.module is not a function`), pointed the script at that TAP file, and confirmed it re-ran the file with the flag now present and reported it passing.

## 8. Follow-up — restructuring the two originally-cited files (refuted)

Asked to restructure `admin-assistant-execution-routes.test.ts` and `database-migrate-forward-routes.test.ts` to bypass `app.js` the way `test-agent-mock-module.test.ts` does, so they could use `mock.module()` for real. Conclusion after reviewing both in depth: **no change made to either file** — restructuring would not let either one assert anything it genuinely cannot today.

**`admin-assistant-execution-routes.test.ts`.** `test-agent.ts`'s route (re-read at `test-agent.ts:38-89`) has exactly one call site that varies by branch: `res.json(resolveTestAgentOutcome(agent, model))`. Every branch below "not found" (installed/authenticated/model-mismatch/success) shares that identical route-level code path — the branching lives entirely inside `resolveTestAgentOutcome`, not in the route. That function already has exhaustive, branch-by-branch unit coverage in `resolve-test-agent-outcome.test.ts`, and §4's new test already proves the route-to-mocked-`detectAgents`-to-`resolveTestAgentOutcome` wiring end to end for one representative branch. Adding the other three branches at the HTTP level would re-prove the same wrapper code against different fixture data — the route can't behave differently between them, so there's nothing left to catch. The only way to make it happen through *this* file's own `buildTestApp()` would be to stop importing `createRouteDeps`/`app.js` at module scope (the eager-load trap from §4), which would cost this file's real session-cookie/RBAC integration for the auth-gating tests that don't touch `detectAgents()` at all — a real loss for zero new assertion power.

**`database-migrate-forward-routes.test.ts`.** The AUD-001 ordering test (`:234-271`) holds the real `operation-lock` before the request, then checks the bare principal gets 403 rather than the 409 a real lock attempt would produce — proving `authorize()` runs before lock acquisition without spying on anything. A `mock.module()` rewrite would replace that with a call-count assertion on `acquireOperationLock`, which is not actually a stronger proof: the current test additionally confirms the route's lock call resolves to the *same* lock resource (`siteId`+`operationKind`) as one acquired directly through the real module — i.e., it proves correct resource keying, not just "was some function called." A spy loses that unless resource-key assertions are added back on top, at which point it's a more complex test proving the same thing through a mocked module instead of the real one. The file's own comment ("doesn't require spying on the lock module") reads like a historical workaround for a missing flag, but on inspection it's a genuinely higher-fidelity integration test — the better test was already in place before this flag existed.

Per the standing instruction that a refuted hypothesis here is a fine result: no code changed in either file.
