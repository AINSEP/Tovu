# Remaining work — Tovu, next session

Generated 2026-08-21T02:40Z · Branch `general-work` · Companion to
`2026-08-20-session-handoff-coverage-measurement-integrity.md` (that one covers what was *done*;
this one covers what is *left*).

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this file, then §Traps in the companion handoff.
>
> **Do not re-open the architecture / hub / barrel work.** It is decided, measured and committed.
>
> Start with §1 (red gate) — it is small and it is currently broken. Then §2 (`src/features`), the
> largest untouched area in the repo.

## Gate status right now

```
check:architecture           OK: at baseline          ✅
check:src-complexity-drift   0 new (5 in baseline)    ✅
apps/admin typecheck         6 errors                 ❌ RED
```

CI is **deliberately off** (owner turned it off to push; nobody is using the product yet) and
**comes back later**. Do not escalate it — but everything below must be true before it returns.

---

## 1. FIRST: 6 type errors in `apps/admin` — red, small, and a process lesson

```
src/features/settings/__tests__/connectors-port.unit.test.ts        2   TS2722 possibly-undefined invocation
src/features/settings/hooks/__tests__/use-external-mcp.unit.test.ts 3   TS2722 / TS18048, same shape
src/features/settings/hooks/__tests__/use-settings-ui.unit.test.ts  1   TS2345 — "chats" is not a MemoryTopTab
```

All from one coverage batch tonight (`f0eaee93`, `8f8a7536`, `4e5d0952`).

**Why they got through, and it will recur:** `apps/admin`'s tsconfig **includes** `__tests__`
(the repo root's does **not**), and **vitest does not typecheck**. So an agent can land a green
scoped vitest run and a red typecheck simultaneously and never know.
**Put `npx tsc --noEmit -p .` in every `apps/admin` dispatch brief.**

The `use-settings-ui` one is not a mechanical fix: the test asserts `setMemoryTopTab("chats")` and
`"chats"` is not in the `MemoryTopTab` union, which is declared in an **external package**, not this
repo. Either the union is stale or the test is fiction — resolve it against the real type, do not
silently widen the test.

## 2. `src/features` — the largest untouched area

```
188 source files, 148 test files — never properly measured
```

The only number we have is a **scoped** run: line 92.65% / branch 89.71% / func 73.02%. Treat that
as a **floor, not the truth** — a scoped run understates coverage for files other suites exercise
(proven twice: `seo/tool-registrations.ts` reads 0% scoped vs 99.62% combined).

**Measure first, by function name (`FN`/`FNDA`), before writing anything.**

## 3. `src/server` — biggest by file count, structurally mapped only

```
327 source files, 161 test files
```

Complexity here is **already done** — 0 new violations; the only 2 remaining are in
`routes/admin/plugins/uninstall.ts`, which another session owns. Do not touch it.

Agreed order of attack from the prior agent (still valid):
1. `http/site/render.ts` (2360 lines) — the single biggest func-coverage hole. **Get its *combined*
   number first**; it is the file that proved the scoped-run trap (59.6% vs 20.1% depending on which
   suite you run).
2. `middleware/theme-page-preview.ts` templated `.liquid` route + `agent-daemon-server.ts`
   attachment-claim branch — both confirmed zero-coverage, both small.
3. `modules/` (34 files, ungated).
4. `routes/admin` (222 files) last — it already has a coverage gate and floor.

Known, **not fixed**: `liquid-sandbox` — templates violating the for-range limit or using a
disallowed tag **time out at the 5000 ms render budget instead of being rejected up front**.
Writeup: `ADS-memory/reports/2026-08-20-liquid-sandbox-preexisting-failures.md`.

Also: `error-mapping/` and `request-context/` contain **no `.ts` files** — just `INFO.md` stubs.
Don't go looking for tests there.

## 4. Never touched at all

```
src/core      25 source / 28 test
src/db        37 source / 26 test
src/routing    4 source /  2 test
```

No measurement exists for these. Scope them before assuming they're fine.

## 5. `src/assistant` + `apps/site-chat` — partially done

~12 of 53 assistant files closed. Remaining are small-gap files (1-5 branches each):
`tool-executor-audit`, `render-ui-tool`, `site-credential-store` (`onDecryptFailure` never invoked),
`demo-a2ui-tool`, `execution-credential-store`, `mcp-ui-tool-calls-route`, `component-catalog-query`,
`run-ownership`, `byok-credential`, `agents`, `demo-choices-tool`, `live-model-cache`,
`a2ui-actions-route`.

**Deliberately excluded, with reasons:**
- `SiteAssistantWidget.tsx` — needs real `ChatPane`/`JiniChatProvider`; that's a test-infrastructure
  decision, not coverage work.
- `main.tsx` — exempt. Self-executing bootstrap, zero exports; testing it tests React. Same treatment
  the repo already gives `server/app.ts`/`deps.ts`.
- `agent-daemon-port.ts` — re-export barrel already covered by `src/server`'s suite.

## 6. OPEN DECISION — the `TSX_TSCONFIG_PATH` override

`b328c406` prefixed the three root test scripts with
`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json`.

**Why it exists:** `tsx` resolves **one tsconfig per process** from cwd — unlike `tsc`, which does
per-file scoped lookup. The root tsconfig has no `jsx` option and excludes `apps`, so any `.tsx` test
reached via the root scripts fell back to the classic JSX transform and died with
`ReferenceError: React is not defined`.

**Why it's questionable:** it now transforms **every** test in `src/**` and `packages/*` under
site-chat's tsconfig. `target` matches (ES2022 both) but `module` differs (`nodenext` vs `ESNext`).
Validated on a broad sample, **not** a full `npm run test:ci`.

**The zero-blast-radius alternative:** site-chat already has its own `test` script. Drop it from the
root globs entirely and add `npm --prefix apps/site-chat test` as its own step in `ci-local.sh` —
exactly how `apps/admin` already works. An agent was asked to evaluate this; the answer may not have
landed before session end. **Resolve it before CI goes back on.**

## 7. Still unwired: the coverage floor gate

`development/scripts/check-area-coverage-floor.ts` is committed, is **not** in `ci-local.sh`, and
needs `development/scripts/area-coverage-floors.json`, which does not exist. It **deliberately exits 1
when unconfigured** so nobody wires it blind.

**⚠️ Capture floors from a FULL run, never a scoped one** — otherwise the gate fails on genuinely
well-tested code.

## 8. Cloud dispatch is broken, and the leading theory is now refuted

Smoke test 4 (2026-08-20 ~19:07 PT, the first ever fired outside US business hours) failed like the
22 before it. But `origin/cloud/adr-052-reconcile` (`3ba78875`, **2026-08-03 14:07 PT**) is a real
substantive ADR commit on a `cloud/`-prefixed fallback branch — the exact convention our briefs tell
cloud agents to use.

**Success during business hours, failure at 7pm** is the inverse of what capacity throttling predicts.
**Stop re-testing the hour. Ask what changed after 2026-08-03.**

Caveat: every commit here is authored by the owner, so the branch prefix plus a substantive commit is
strong evidence, not proof, that a cloud agent produced it.

## 9. Known-and-parked

- **`lib/api.ts`'s `request<T>()` validates shape only on the failure path.** A 2xx body is returned
  as `body as T` with no runtime check. **~99 `.data` reads in admin sit downstream of it.** Four were
  guarded (`ad411490`) after 3 of them were found to **silently resolve to `undefined`** rather than
  throw. The cheap fix is one level up, in `request<T>()` — a design decision, not a patch.
- **Casts at the HTTP/storage boundary make types narrower than reality**:
  `create.ts:21` (`body.widgetType as WidgetTypeKey`) and `entry-payload.ts:97`
  (`JSON.parse(...) as WidgetInstancePayload`). A falsely-narrow type is worse than a wide one — the
  compiler tells you a check is unnecessary right up until production disagrees.
- `src/assistant/__tests__/_tmp-full-sweep.test.ts` — a *check*, not a test, but genuinely
  non-redundant (asserts over the real ~130-tool catalog). A reshape was specified (collect into an
  array, `assert.deepEqual(issues, [])`, drop the `console.log`s, rename off `_tmp`) — **not done**.

## Do NOT re-open

1. **Hub count / barrels — verdict is DO NOTHING.** 10 of the 12-hub rise was the median moving.
   Mini-barrel rejected by two independent peers. A/B measured. Don't `--update` the architecture
   baseline without asking.
2. **`RouteDeps` is 100% type-only, zero runtime cost.** The 8 decomposition slices DID happen — they
   split the *type*, not the *file*.
3. **Propagation cost is a RATCHET, not a hard constraint.** Only `module API surface`, `back-edges`
   and `module cycles/SCC` block.
4. **The `| undefined` sweep is complete.** Every such return in `src/` was checked; exactly one was
   dishonest and it is fixed. Report: `ADS-memory/reports/refactor/REFACTOR-widget-type-registry-total-lookup-2026-08-20.md`.
5. **Unreachable ≠ dead.** 4 candidates this session: 1 genuinely deletable, 3 load-bearing for the
   type system. **Only an actual `tsc` run can tell them apart** — reasoning got it wrong in both
   directions.

---

## ADDENDUM — final agent findings (added at session end)

`cov-assistant-2` closed 4 more files to 100% (`tool-search-keywords`, `tool-catalog-query`,
`daemon-auth`, `mcp-ui-tool-calls`) and nearly closed 3 more (`site-credential-store` 48/50,
`live-model-cache` 22/24, `a2ui-actions-route` 23/24) before being stopped. All committed.

**Still unstarted in that scope:** `execution-credential-store`, `demo-choices-tool`,
`render-ui-tool`, `byok-credential`, `demo-a2ui-tool`, `tool-executor-audit`,
`mcp-ui-tool-calls-route`.

### A repo-wide unlock nobody has taken

**`--experimental-test-module-mocks` is not passed anywhere** — not in `package.json`, not in
`ci-local.sh`. Verified. So `mock.module()` is unavailable, and **at least four files have already
hit this wall and documented it**:

```
src/server/__tests__/admin-assistant-execution-routes.test.ts
src/server/__tests__/routes/database-migrate-forward-routes.test.ts
src/server/routes/admin/assistant/resolve-test-agent-outcome.ts
src/server/routes/admin/assistant/__tests__/resolve-test-agent-outcome.test.ts
```

Node here is **v24.2.0**, well past the ≥22.3 the flag needs. Adding it to the test scripts would
make a class of currently-untestable code testable — anything reached only through a module with no
DI seam. **This is probably the single highest-leverage change available for the 100% goal**, and it
is one flag. Evaluate it early next session: it may retire several "untestable, good reason" entries
at once rather than requiring per-file injection seams.

### Three findings, three different categories — none deleted

1. **`run-ownership.ts`** — `typeof runId !== "string" || runId.length === 0` in
   `requireRunOwnershipMiddleware`. Verified empirically unreachable: the middleware only ever mounts
   on `/api/runs/:runId`, and a request that would produce an empty param (`/api/runs//events`) 404s
   before it runs. **KEEP ANYWAY.** It is a guard on a *security* middleware, and "unreachable" here
   is a property of the current mount, not of the function — a future route mounting it differently
   changes reachability silently. Deleting an ownership check because today's routing happens to
   preclude it is the wrong trade.
2. **`component-catalog-query.ts`** — 3 branches over `manifest.description === undefined`. The type
   is *legitimately* optional (defensive against a future manifest omitting it) and every real
   manifest in `@jini-ai/ui` defines it. `buildComponentCatalogQuery()` takes no arguments, so there
   is no seam to inject a fake. **Not dead code — untestable.** Do NOT add an injection seam purely
   for coverage; that is production surface added to move a number.
3. **`agents.ts`** — the `.catch()` in `refreshAssistantAgentsCache` (cache eviction on a rejected
   probe). Real error handling, unreachable only because `probeAssistantAgents` has no DI seam and
   `mock.module()` is unavailable. **This one is squarely a testability gap, and the flag above would
   likely close it.**

**The category distinction matters more than any individual verdict.** Four candidates earlier were
"unreachable"; only one was deletable. Now three more, and none are: one is a security guard whose
reachability is mount-dependent, one is untestable-but-correct, one is blocked by a missing test flag.
**"Cannot be covered" has at least four distinct causes — dead, type-required, no-seam, and
tooling-gated — and only the first is a deletion.**
