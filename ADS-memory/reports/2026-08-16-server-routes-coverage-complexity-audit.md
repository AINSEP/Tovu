# Server Routes Coverage & Complexity Audit — 2026-08-16

**Status: IN PROGRESS — coverage section still running, this is a partial commit per hard rule #2.**

Scope: `src/server/routes/**` (234 route `.ts` files, excludes `__tests__` dirs).
Audit only — no fixes applied, no tests added, no lint rules changed.

Trigger: `src/server/routes/admin/system/publish-credentials.ts` shipped with 97.82%
line coverage but 71.93% branch coverage; the bug (unhandled async rejection killing
the process) lived in the missing branch coverage, not the missing lines. Line % alone
is not a safe signal for this codebase — every number below is reported with its
branch-% partner wherever one exists.

## Headline numbers

| Metric | Value | Measured / Estimated |
|---|---|---|
| Route files in scope | 234 (`.ts`, excl. `__tests__`) | Measured (`find` count) |
| Route-relevant test files | 65 (59 mirrored under `src/server/__tests__/routes/` + 6 co-located under `src/server/routes/**/__tests__/`) | Measured |
| Complexity violations at ≤9 (cyclomatic + cognitive) | 70 files / 113 functions | Measured (own eslint run) |
| Complexity violations at ≤15 (repo's current `warn` bar) | 18 files / 30 functions | Measured (own eslint run) |
| Unguarded async Express handlers (`app.<verb>`, async, no try/catch, no `.catch`) | 21 occurrences across 15 files | Measured (own AST scan) |
| Coverage baseline (line / branch / funcs) | **pending** | Run in progress at time of this commit |
| Zero-coverage route modules | **pending** | Run in progress at time of this commit |

This file will be updated in place once the coverage run completes; see the git log
for this path for the incremental history if that matters.

## 1. Complexity — measured directly

Command run (per dispatch brief), against every file under `src/server/routes`:

```
npx eslint --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}' src/server/routes
npx eslint --rule '{"complexity":["error",15],"sonarjs/cognitive-complexity":["error",15]}' src/server/routes
```

- **≤9 (the `apps/admin` hard-gate bar):** 70 of 234 files (29.9%) contain at least
  one function over the line; 113 individual function-level violations total.
- **≤15 (the repo's current default `warn` bar):** 18 of 234 files (7.7%) still
  violate even the looser bar; 30 individual violations. These 18 files are the
  floor of any complexity debt list — they fail today's own configured rule, just
  at `warn` severity so CI does not currently block on them.

Top offenders by violation count at ≤9:

| File | Violations (≤9) | Violations (≤15) |
|---|---|---|
| `src/server/routes/admin/themes/explore.ts` | 6 | 2 |
| `src/server/routes/admin/system/publish-site.ts` | 4 | 3 |
| `src/server/routes/admin/widgets/agent-tools.ts` | 3 | 0 |
| `src/server/routes/admin/assistant/put-execution-credential.ts` | 2 | 2 |
| `src/server/routes/admin/connectors/put-config.ts` | 2 | 2 |
| `src/server/routes/admin/media/update.ts` | 2 | 2 |
| `src/server/routes/admin/newsletter/update-campaign.ts` | 2 | 2 |
| `src/server/routes/admin/redirects/create.ts` | 2 | 2 |
| `src/server/routes/admin/settings/clear.ts` | 2 | 2 |
| `src/server/routes/admin/settings/register-definitions.ts` | 2 | 2 |
| `src/server/routes/admin/settings/set.ts` | 2 | 2 |
| `src/server/routes/site/pages.ts` | 2 | 2 |

Full per-file, per-function violation lists (rule id + line + eslint message) are
preserved at the scratch paths used to produce these counts (not committed — the
brief asked for a report, not a raw-tool-output dump; the parsing script is at
`.ads-scratch-audit/scan-async-handlers.mjs` inside this checkout if a re-run is
wanted, and will be removed before the audit is closed out).

**`src/` (including `src/server/routes`) has no hard complexity gate today** —
repo-wide `eslint.config.mjs` sets `complexity: ['warn', 15]` and
`sonarjs/cognitive-complexity: ['warn', 15]`, `warn` only, so none of the 30
violations above currently fail CI.

## 2. Unguarded async Express handlers — measured directly (TypeScript AST scan)

Scanned all 209 route files containing an `app.get/post/put/delete/patch(...)`
call (234 route files total; 25 register no HTTP verb directly — routers/helpers/
types, consistent with the brief's expectation that not every file needs a direct
test). Scanner: `ts.createSourceFile` per file, walks every `app.<verb>()` call,
checks each function-typed argument for the `async` modifier, and for async
handlers checks whether the function body contains a `TryStatement` anywhere or a
`.catch(` call anywhere in its text. This is a structural check (presence of
try/catch), not a proof the catch is well-formed — a `try {} catch { /* silent */ }`
still counts as "guarded" here even though it may swallow errors badly; that is a
different finding class than "kills the process," which is what this scan targets.

- 242 total `app.<verb>()` registrations found across 209 files.
- 5 are synchronous (non-`async`) handlers — out of scope for this bug class.
- 212 async handlers have a `try` or `.catch` somewhere in their body.
- **21 async handlers across 15 files have neither** — same bug shape as the one
  that shipped in `publish-credentials.ts`.

| File | Line | Verb |
|---|---|---|
| `admin/analytics/recent-hits.ts` | 72 | GET |
| `admin/comments/moderate.ts` | 46 | POST |
| `admin/comments/moderate.ts` | 96 | POST |
| `admin/comments/moderation-queue.ts` | 28 | GET |
| `admin/commerce/status.ts` | 29 | GET |
| `admin/deployments/list.ts` | 43 | GET |
| `admin/system/deployment-overview.ts` | 145 | GET |
| `admin/system/dockerfile-source.ts` | 78 | GET |
| `admin/system/dockerfile-source.ts` | 105 | PUT |
| `admin/system/export-site.ts` | 83 | POST |
| `admin/system/export-site.ts` | 126 | GET |
| `admin/system/module-status.ts` | 20 | GET |
| `admin/system/publish-credentials.ts` | 163 | GET |
| `admin/system/publish-credentials.ts` | 231 | DELETE |
| `admin/system/publish-site.ts` | 171 | POST |
| `admin/system/publish-site.ts` | 235 | GET |
| `admin/system/publish-site.ts` | 260 | GET |
| `admin/system/source-control-credentials.ts` | 109 | GET |
| `admin/system/source-control-credentials.ts` | 148 | DELETE |
| `site/comments-submit.ts` | 28 | POST |
| `site/payments-webhook.ts` | 73 | POST |

**Point-in-time note (per dispatch brief):** `decrypt-crash-fix` is actively
sweeping this same bug class concurrently in this tree. This list was produced
against the working tree as it stood during this scan; some of these may already
be fixed by the time this report is read — re-run the scan to confirm current
state before treating any single row as still-open. Two of `publish-credentials.ts`'s
five verbs (`GET` list, `DELETE`) are still unguarded here even though `POST`/`PUT`
in the same file already carry `try { ... } catch (err) { sendStoreError(res, err); }`
per an in-file comment — consistent with a partial, in-progress fix rather than an
untouched file.

Also observed, not yet verified as committed: an untracked
`src/server/boot/process-error-guards.ts` in the working tree registers a
process-wide `unhandledRejection` listener (log-and-continue, not fatal) — a
process-level safety net for exactly this bug class. This is someone else's
in-flight work; it is noted here as relevant context, not claimed as a fix. If it
lands, it would make the missing-`unhandledRejection`-handler premise of the
triggering bug (`Express 4.22.2` async errors becoming unhandled rejections with
no process-level catch) no longer true repo-wide — the per-route findings above
would remain a code-quality/error-shape issue (wrong-shaped error responses to the
client) but would stop being crash risks. Flagging for the owner to confirm once
that file is committed and reviewed on its own merits — this audit does not review
or endorse its implementation.

## 3. Coverage — IN PROGRESS

`node --import tsx --test --experimental-test-coverage` scoped to
`"src/server/**/*.test.ts"` (121 test files: the 65 route-relevant ones above plus
unit/integration/helper tests elsewhere in `src/server/__tests__/`) is running in
the background as of this commit. Will update this section with:
- Confirmed behavior of node:test's coverage table on a failing run (a specific
  ask in the brief) — **preliminary answer, confirmed by direct observation**:
  running only the known-failing `src/server/http/site/__tests__/render.test.ts`
  file (3 assertion failures, process exit code 1) still printed the full
  `start of coverage report` / `end of coverage report` table with real line/
  branch/funcs numbers. **Node's coverage table is not gated on test outcome.**
  This differs from vitest, which was reported to emit nothing on failure.
- Aggregate line/branch/funcs % for `src/server/routes/**`.
- Per-file ratios and the zero-coverage list.
- The ranked risk table and the "where can a gate realistically start" answer.

---
*(this report will be replaced in place with the completed version; this partial
commit exists so no work is lost if this session is interrupted mid-run)*
