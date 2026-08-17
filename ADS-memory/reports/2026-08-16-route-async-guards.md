# Route Async-Handler Guards — 2026-08-16

**Status: all 21 handlers fixed.** Dispatched to close the "unguarded async Express handler" bug
class the routes coverage/complexity audit found (`2026-08-16-server-routes-coverage-complexity-
audit.md`, §2). Four commits, in severity order.

## How the list was derived

The dispatch brief handed me the audit's 21-handler table and said not to trust it without
re-deriving. I wrote my own TypeScript-AST scanner (`ts.createSourceFile` per file under
`src/server/routes/**`, walking every `app.<verb>()`/`router.<verb>()` call, checking each
function-typed argument for `async`, then checking the body for a `TryStatement` node or a
`.catch(` call in its source text) and ran it against current HEAD before touching anything.

Result: **21 unguarded async handlers across 15 files, byte-for-byte the same list** the audit
report gave me (same files, same line numbers, same verbs). The audit was accurate at the moment I
started — re-derivation confirmed rather than corrected it. My scanner found 238 verb registrations
total vs. the audit's 242 (a minor heuristic difference in how each script matches the receiver
identifier — irrelevant here since the unguarded set matched exactly).

## Severity ranking used

Per the brief: decrypt/credentials first, then "spawns a process" (background runs), then
everything else, with the one public/unauthenticated route pulled forward regardless of its list
position (any visitor can hit it, no auth gate to fail through first).

## What was fixed — all 21, four commits

### Commit `62ca21c7` — credential CRUD (4 handlers + 1 shared-helper hardening)
- `publish-credentials.ts`: `GET` (list, line 163), `DELETE` (line 231)
- `source-control-credentials.ts`: `GET` (list, line 109), `DELETE` (line 148)
- **Bonus, same commit:** `sendStoreError` (shared by both files) used to `throw err` for any error
  outside its 4 typed classes — that re-throw happens *inside* the caller's own
  `catch (err) { sendStoreError(res, err); }`, so it escapes that catch too. `POST`/`PUT`/
  `POST .../:id/verify` in both files structurally had a `try`/`catch` (my AST scan's "guarded"
  bucket) but leaked the exact same way for any untyped error. Fixed once, in the helper, instead
  of patching every call site — now responds `500 INTERNAL_ERROR` for the untyped case.

### Commit `7cd9c200` — publish/export trigger+status (5 handlers)
- `publish-site.ts`: `POST` trigger (171), `GET` status (235), `GET` preview (260)
- `export-site.ts`: `POST` trigger (83), `GET` status (126)

Audit's #1 and #2 ranked-by-severity files (highest complexity + unguarded-handler count of any
file in scope). `startPublishRun`/`startExportRun` are deliberately not awaited (each file's own
header explains why — the response returns before the background run finishes), so the try/catch
wraps everything from the auth check through the call site, not the run itself; a failure *inside*
the run it starts can't reach these catches by construction.

### Commit `fba9246f` — dockerfile-source, comments/moderate, payments-webhook (5 handlers)
- `dockerfile-source.ts`: `GET` (78), `PUT` (105)
- `comments/moderate.ts`: the shared loop registrar backing `approve`/`spam`/`trash`/`restore` (one
  source line, 4 routes registered at runtime — line 46), plus the standalone `purge` route (96)
- `payments-webhook.ts`: the one handler (73) — public, unauthenticated, highest severity of this
  batch: an unguarded failure here means an inbound payment-provider webhook hangs instead of
  getting a fast `500` that tells the provider to retry.

### Commit (this session, uncommitted at time of writing — see below) — remaining 7 plain reads + 1 public route
- `analytics/recent-hits.ts`: `GET` (72)
- `comments/moderation-queue.ts`: `GET` (28)
- `commerce/status.ts`: `GET` (29)
- `deployments/list.ts`: `GET` (43)
- `system/deployment-overview.ts`: `GET` (145)
- `system/module-status.ts`: `GET` (20)
- `site/comments-submit.ts`: `POST` (28) — **the one PUBLIC, unauthenticated route in the whole
  21-handler list.** Any site visitor can reach it; per the audit's own ranked table it also has the
  lowest branch coverage (50.0%) of any file on the unguarded list. Fixed with the rest of this
  batch, not deprioritized just because it sorted last in the source table.

All 21 now follow the same shape: wrap the handler body (from the auth check, or from the first
line for the public route) in `try { ... } catch (err) { console.error(...); res.status(500).json({
error: "internal error", code: "INTERNAL_ERROR" }); }` — matching the `INTERNAL_ERROR` shape already
used by ~30 other route files in this codebase (grepped before choosing it, not invented fresh).

## Handlers that looked guarded but weren't

Exactly the trap the brief warned about, found in `publish-credentials.ts`/
`source-control-credentials.ts`'s shared `sendStoreError` helper (see Commit `62ca21c7` above). No
other file in scope had this shape — every other fix in this pass was a genuinely-missing
`try`/`catch`, not a leaky one.

## Regression tests — `src/server/__tests__/route-async-guards.test.ts` (new file, 22 tests)

One test per handler (plus the `sendStoreError` bonus), each asserting the fixed behavior — a real
`500`/`INTERNAL_ERROR`, never a hang — via a `fetch` bounded by `AbortSignal.timeout(3000)`.

**RED proven before every fix, not just GREEN after.** For each of the three fix commits, the
corresponding `try`/`catch` was reverted with `git apply -R` against a saved patch (working tree
only — never staged, never touched the shared git index other agents were using concurrently), the
test file re-run, then the patch reapplied and the suite reran green before committing:

| Batch | Tests | RED result |
|---|---|---|
| Credentials (9 tests: 4 handlers + 1 bonus, minus dup — see below) | 10 | all 10 failed, hanging ~3.1-3.4s against the 3s abort |
| dockerfile-source/moderate/payments-webhook | 5 | all 5 failed, hanging ~3.0-3.3s |
| Final 7 | 7 | all 7 failed, hanging ~3.0-3.7s |

(Credentials batch is 10 tests because it covers 4 handlers + the `sendStoreError` bonus test +
2 files × 2 handlers = the arithmetic is in the test file's own section comments.) Every hang
matched the bug's documented shape exactly — "hangs, does not crash," not a fast error — which is
the load-bearing reason `AbortSignal.timeout` bounds every request in this file rather than a bare
`fetch`.

Regression suites for files that had prior test coverage were re-run for every batch (no
regressions found): `publish-credentials-route.test.ts`, `source-control-credentials-route.test.ts`,
`publish-site-route.test.ts`, `export-site-route.test.ts`, `dockerfile-source-route.test.ts`,
`payments-webhook.test.ts`, `analytics-recent-hits.test.ts`,
`commerce-status-route.integration.test.ts`, `deployments-list-route.test.ts`,
`deployment-overview-route.test.ts`, `module-status-route.test.ts`. `comments/moderate.ts` and
`comments/moderation-queue.ts` have no prior dedicated test file — nothing to regress there, no gap
introduced either.

Three pre-existing failures in `publish-site-route.test.ts` (`GITHUB_TOKEN`-dependent assertions
reading a different `credentialsConfigured` value than expected) were confirmed present **both with
and without** this session's fix applied — not caused by this work, not investigated further here
(out of scope; flagged for whoever owns that file next).

## Verification

`npx tsc --noEmit` and `npx eslint` were run against every changed file after each batch — clean
(only pre-existing `warn`-level complexity violations remain, in functions this pass never touched:
`parsePublishRequestBody`/`parsePreviewQuery` in `publish-site.ts`, `parseTriggerRequestBody` in
`export-site.ts`). A later full-tree `tsc --noEmit` run in this same session showed unrelated
errors in `src/index.ts`, `src/assistant/daemon-supervisor.ts`, and a new field added to
`publish-credentials.ts` — all confirmed via `git diff`/isolation (temporarily stashing just that
one file's uncommitted changes, checking it in isolation, then immediately restoring the stash) to
be **other agents' concurrent, uncommitted work landing in the same shared working tree**, not
regressions from this dispatch. Four other agents were active in this repo during this session
(`main`, `admin-vendor-ui`, `arch-export-edge`, `jini-lifecycle`, `routes-coverage` per the team
roster) — a repo-wide check measures the tree, not any one agent's HEAD.

## What's left

Nothing from the original 21-handler list. If a future pass wants to go further:
- The `sendStoreError`-shaped trap (typed-error mapper re-throwing on the untyped case) is worth a
  quick grep across other route files with a similar typed-error-mapper pattern — this pass only
  checked the two files it happened to touch.
- The 3 pre-existing `publish-site-route.test.ts` failures noted above.
- Complexity debt (`parsePublishRequestBody`/`parsePreviewQuery`/`parseTriggerRequestBody`) is
  tracked by the coverage/complexity audit already, not duplicated here.

## Git discipline notes for whoever reads this next

Every commit in this pass staged an explicit file list and was verified with
`git diff --cached --stat` before committing and `git show --stat HEAD` after — per file, never a
blanket `git add`. Mid-session, another agent's uncommitted work (an "account label heal
scheduler" feature) landed on top of my already-committed `publish-credentials.ts` fix in the
shared working tree; it was left untouched (not reverted, not force-included) per this project's
own "ask before undoing agent work" policy — my own committed diff for that file was verified
clean in isolation before that WIP arrived.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
