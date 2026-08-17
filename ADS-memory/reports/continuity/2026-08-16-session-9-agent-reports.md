# Session 9 — live agent reports (2026-08-16 evening)

Captured as each agent reports, so a restart does not re-buy the analysis. This file is written
by the Coordinator from the agents' own words; each agent also writes its own detailed report.

**Session opened with:** Tovu 86 commits + Jini 7 commits unpushed. **Both pushed** —
Tovu `985eb64e..b5492417`, Jini `222e9301..e792f76b`. That risk is now closed.

Also recovered and pushed: Jini `8a37db9b`, a complete `fetchWithTimeout` helper (106 lines + 9
passing tests + barrel export) found **uncommitted** in the Jini working tree. Verified before
saving — 9/9 vitest green, `tsc --noEmit` clean on the package. It addresses Finding 2 of the
failure-mode audit (67 raw `fetch()` sites, none with an `AbortSignal`). **Only the helper landed;
migrating call sites is still open, and the long-lived sites — SSE, streaming, long-poll — must be
identified first because a blanket timeout would break them.**

---

## RESOLVED: the cbm-mcp stale-index question (Coordinator, measured)

The prior handoff flagged that one of two cbm views was stale "and it is not known which."
**Answer: both were, and the reason they looked trustworthy is a trap worth remembering.**

`index_status` / `list_projects` return a `git` block whose `head_sha` is a **live git read of the
working tree, not a record of what was indexed.** It therefore always matches HEAD and can never
indicate staleness. There is no freshness field; `status: "ready"` does not mean current either.

Measured at Tovu `b5492417`:

| Project | Nodes | Reported head_sha | Actually contained |
|---|---:|---|---|
| `Tovu` (repo root) | 35,076 | `b5492417` (= HEAD) | 0 `exportSite`, 0 vendor-credentials, 0 files under `features/deployments` — does not cover `src/` at all |
| `Users-la-Programming-Tovu-src` | 12,524 | `b5492417` (= HEAD) | has `server.app.createApp`; **0 nodes under `export/`**, 0 vendor-credentials |

`src/export/site-exporter.ts` has exported `exportSite` for a long time, so its absence is not a
recency artifact — both graphs are structurally incomplete, not merely behind.

**This vindicates `gpt-5.6-sol`'s decision to discard the Leiden community-detection evidence and
rebuild from dependency-cruiser.** Do not cite the Leiden cohesion numbers.

**How to check freshness for real:** probe for a symbol you know landed recently, or a directory you
know exists. `total: 0` on something you can `grep` means the index is unusable. Note also that
`list_projects` carries dead entries (`Users-la-Desktop-Programming-Tovu-AI-CMS-tovu` has
`root_exists: false`), so name-matching alone can aim a query at a corpse.

---

## `arch-export-edge` — Sol's #1 fix. Edge CUT and measured.

**Result: propagation cost 28.94% -> 14.13%. Back-edges 29 -> 28. Largest SCC unchanged at 36.**

`site-exporter.ts:599`'s `require("../server/app")` is **gone entirely** — no lazy fallback, nothing
under `src/export/**` references `server/app.ts` any more. Replaced by dependency injection through
a new `RouteDeps.createSiteApp` field (`server/routes/types.ts`), bound as `createSiteApp: createApp`
in `server/app.ts`'s `createRouteDeps()`, and via a `createSiteAppLazily` mirror of the existing
`runExportSiteLazily` pattern in `server/deps.ts`'s `createSqliteRouteDeps()`.

**The RouteDeps-fixture trap did not materialize.** Every test builds via `{ ...createRouteDeps() }`
— confirmed by grep across `src/server/__tests__/`, `src/features/source-control/__tests__/`,
`src/features/deployments/static-publish/__tests__/`, `src/export/__tests__/`. So the field is
**required**, matching `runExportSite`'s own precedent, with no optional-with-fallback trap.

`tsc --noEmit` clean. eslint 0 errors; the only warnings are pre-existing (`createApp` at
complexity-37, two `sonarjs/cognitive-complexity` in site-exporter.ts) — confirmed pre-existing by
`git stash` diff, not introduced.

### ⭐ It found a SECOND `export -> server` edge the Coordinator's brief did not name

`src/export/route-manifest.ts:5-6` carries its own **static, non-lazy** runtime imports:
`resolveActiveTheme`/`resolveActiveThemeId` from `server/routes/site/pages.ts`, and
`resolveStorefrontProducts` from `server/routes/site/products.ts`. Grep confirms these are the only
other ones. `dependency-cruiser` therefore **still reports `export <-> server` as a live module
cycle** even with the mutual require gone.

**This is why the result is 14.13% and not the predicted 9.43%** — that prediction assumed removing
the whole `export -> server` edge set, and only the named file-pair was in scope. The Coordinator's
brief summarized only the mutual-require half. The agent flagged the gap rather than absorbing it.

### Coordinator's direction on edge 2

1. Commit the code fix, then **move the baseline at the honest 14.13% and commit that**, naming the
   remaining edge in the body so the number is self-explaining.
2. THEN take edge 2 as separate work and move the baseline a second time. Two baseline commits, each
   true when written, beats holding the first hostage to the second.
3. **Shape: move the shared route-selection logic DOWN into the feature that owns it**, so both the
   HTTP routes and `route-manifest.ts` import from the new home — do NOT add three more `RouteDeps`
   fields. Injection would satisfy the metric while leaving the logic stranded in the routing layer
   and growing a bag whose factory is already complexity-37. Agent may overrule if those functions
   turn out to be genuinely route-coupled (take `req`/`res`, depend on middleware state) — but it
   must measure that, not assume it.
4. Ownership of `src/server/routes/site/pages.ts` and `products.ts` transferred from
   `route-async-guards` to `arch-export-edge` for this work.

**SCC follow-ups, NOT done today:** the SCC is a different defect from the propagation spike and did
not move. Highest-yield cuts are `src/integrations/repo.sqlite.ts:3` (35->32) and
`src/features/database/adapter.sqlite.ts:4` (35->33) — both "move the concrete SQLite adapter to the
outer persistence layer."

---

## `jini-lifecycle` — the `runs` Map leak. FIXED (Jini `23f01c1e`).

This is the fix the owner explicitly asked for last session and that was never dispatched.

**Leak confirmed real**, and **worse than the handoff described**: `rehydrate()` calls
`eventLog.listRunIds()`, which returns every run id ever seen **with no bound**, so a daemon restart
re-populates the entire terminal history into memory immediately.

**Fix is bounded retention, NOT delete-on-completion** — and that choice was measured, not assumed.
The agent confirmed `get`/`list`/`stream`/`resume` all read terminal runs after completion via
http-kit's `runs.ts` handlers, so immediate deletion would have broken status polling and run-history
listing.

- `terminalRetentionMs` (default 24h) — per-run eviction timer armed when a run goes terminal.
- `maxTerminalRuns` (default 1000) — hard LRU cap, oldest terminal evicted first, **independent of
  the TTL**, so worst-case memory is bounded even when runs complete faster than they age out.
- `resume()` cancels the pending eviction so a reclaimed run survives.
- **Second latent bug found and fixed:** eviction now also clears the `idempotencyIndex` entry.
  Without it, evicting a run while leaving its idempotency mapping behind would make a re-post
  **throw instead of starting fresh**.
- `rehydrate()` accounts for elapsed terminal time, so a restart does not grant a fresh 24h window.

**RED proven correctly**: `git stash push` on **only** `run-lifecycle.ts` (keeping the new test
file), rerun — **4 of 6 new tests failed** against pre-fix code. Restored, rerun — 62/62 green.
Also green: agent-executor, characterization, delegated-tool-bridge, run-scoped-context-store,
http-kit (runs / run-stream / delegated-tools / remote-run-events), and server's
create-local-node-daemon. `tsc --noEmit` clean.

Defect 2 (`installGracefulShutdown` has no caller — SIGTERM still unhandled in practice) in flight.

---

## Still running at time of writing

- `arch-export-edge` — baseline move, then edge 2.
- `jini-lifecycle` — defect 2, SIGTERM wiring.
- `admin-vendor-ui` — Create User autofill (`new-password`, NOT `off`) + vendor-vs-destination
  revoke copy.
- `routes-coverage` — coverage floor + diff gate + the one genuinely missing route test
  (`test-agent.ts`; the `test-connection.ts` finding is disproven, do not act on it).
- `route-async-guards` — 21 unguarded async handlers; watch for the `sendStoreError` shape that
  `throw`s from inside its own catch block, which makes a handler look guarded when it is not.

## Live publish verification — IN FLIGHT

Owner asked to re-verify publishing to GitHub Pages after a theme edit.

- Theme change under test: `src/themes/static/basic/pages/index.html`, hero headline
  `"Beautiful websites from Leon,"` -> `"...from Noel,"` — **uncommitted, and it is the owner's
  file; no agent may touch it.**
- Before-state captured: `gh-pages` HEAD `819c09c5` @ `2026-08-17T01:38:21Z`; live site HTTP 200.
- Running `npx playwright test --config=development/playwright.live-publish-e2e.config.ts`.
- **It runs against the UNCOMMITTED working tree**, so it is simultaneously a live end-to-end test of
  `arch-export-edge`'s refactor on the real export path. Agents were told to hold writes to
  `src/export/**` and the publish-path routes for the duration.
- Reminder: GitHub Pages publishes to the **`gh-pages` branch, not `main`** — checking `main` cost a
  previous session an hour.
