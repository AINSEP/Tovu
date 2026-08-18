# Handoff: the two architecture gates are green — but a THIRD gate (`route-coverage`) is red

> **CORRECTION, added after CI run `32103524932` finished its first job.** This document was written
> while that run was still in flight and its original title claimed "CI is green". That is wrong at
> the whole-CI level. Read "CI result" immediately below before anything else in this file.

Generated: 2026-08-18 (end of session 16)
Source: Claude Code (Opus 5), same repo as sessions 12-15
Target: Claude Code, next session, same repo
Save note: written to `reports/continuity/` (committed), NOT `.local-artifacts/` — that path is
gitignored and one `git clean` from gone. Sessions 14 and 15 used this same location.

---

## CI result (run `32103524932`, HEAD `50dd8e40`) — READ FIRST

| Job | Result |
|---|---|
| `route-coverage` | **FAILURE** — step "Check route coverage diff" (`npm run check:route-coverage-diff`) |
| `build-and-test` | still `in_progress` at the time this correction was written |

The two gates this session actually fixed (`check:architecture`, `check:route-test-baseline`) are
**not** the failing ones. `check:route-test-baseline` never ran — it is the step *after* the failing
one in the same job, so it was skipped, and it therefore remains **unverified in CI**.

### Why it failed — no behavior regressed

`check:route-coverage-diff` requires every route file that is NEW or MODIFIED vs the push's base SHA
to individually hit >= 80% branch coverage. The deep-import redirect commits (`3903af18`, `af8ed1ce`,
`d97a8530`) edited **import statements only** in 16 route files. That flipped all 16 into the
"changed file" set, where 10 of them were already under 80% and still are. Nothing regressed; a
pure import-path refactor re-armed a gate against pre-existing coverage debt.

Reproduced locally (base `193aa3ca`, the previous run's HEAD), using the existing
`development/coverage/lcov.info`:

```
npx tsx development/scripts/check-route-coverage-diff.ts 193aa3ca9d25dc34164dc18149a108ce7c4fd70e
```

The 10 failures, with their current branch coverage:

| File | Branch |
|---|---|
| `src/server/routes/admin/seo/put-entry.ts` | 55.56% |
| `src/server/routes/admin/themes/explore.ts` | 66.88% |
| `src/server/routes/admin/integrations/create.ts` | 69.23% |
| `src/server/routes/admin/media/put-providers.ts` | 72.73% |
| `src/server/routes/admin/integrations/pause.ts` | 72.73% |
| `src/server/routes/site/products.ts` | 72.41% |
| `src/server/routes/admin/integrations/delete.ts` | 73.68% |
| `src/server/routes/admin/system/export-site.ts` | 75.00% |
| `src/server/routes/site/analytics-ingest.ts` | 76.47% |
| `src/server/routes/admin/media/get-providers.ts` | 77.78% |

Passing, for contrast: `recent-hits.ts` 86.36%, `integrations/list.ts` 82.61%,
`dockerfile-source.ts` 85.71%, `publish-credentials.ts` 81.33% (the 2026-08-16 audit file — it was
raised this session and now clears the bar), `site/newsletter-deps.ts` 86.67%, `site/pages.ts` 83.96%.

### Two ways forward — pick one

**A. Write the tests.** Lift all 10 files to >= 80% branch. Genuinely reduces coverage debt on the
route surface. Real work: 10 files, several with error-path branches that need fixture setup.

**B. Ratchet-baseline the 10 files** (recommended). Record each file's current branch percentage in a
baseline JSON; the gate then fails only when a file drops *below its recorded number*, or when a file
with no baseline entry lands under 80%. This is not a new idea in this repo — it mirrors two gates
that already exist and are documented as precedent in
`development/scripts/check-test-baseline.ts`'s own header: `check:admin-complexity-drift` and
`development/scripts/route-test-failure-baseline.json`. It keeps the gate's real purpose (catch
*regressions*) while not demanding new tests as the price of an import-path rename.

Do **not** reach for "make the gate ignore import-only diffs". Detecting an import-only change from a
git diff is fragile (a re-export edit, a moved symbol, and a real logic change can all look alike),
and it would silently disarm the gate for a class of change that *can* alter behavior.

Note also that this session explicitly rejected "raise the baseline to force green" for a *different*
gate (see Decisions, item about the test-failure baseline). That rejection is not in tension with
option B: there, the baseline would have papered over tests that were genuinely failing; here, the
files are not failing anything — they are at a coverage level that predates this push and that this
push did not touch.

---

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then
> `ADS-memory/reports/continuity/2026-08-18-session-16-boundary-triage-ci-green-handoff.md`.
> **Start with the "CI result" section — `route-coverage` is RED on `50dd8e40`** and needs a decision
> (option A or B) before `main` moves. The two gates this session fixed (`check:architecture`,
> `check:route-test-baseline`) are green/unverified respectively, not the cause. 22 commits were
> pushed to `general-work` (HEAD `50dd8e40`). Boundary warnings went 235 -> 85 and **8 modules are
> now enforced at `error`**, so they cannot silently regress. Do NOT re-run the deep-import triage on
> `features/post`, `features/deployments`, `origin`, `features/theme`, `features/commerce`, `seo`,
> `routing`, or `members` — they are at 0 and gated. The remaining 85 warnings are NOT a uniform
> backlog: 44 of them are a documented non-issue and most of the rest are deliberate design
> decisions, all itemised under "The Remaining 85" below. Read that section before treating any
> number as work. The genuinely open workstreams are the four architecture dials in "Next Steps".

---

## Current State

- Branch `general-work`, HEAD `50dd8e40`, **0 unpushed commits**.
- `general-work` is **990 commits ahead of `main`**; `main` last moved 2026-08-08 (`78ae1574`).
- No agent worktrees, no background agents (all 7 worktrees removed and pruned).
- `npx tsc -p tsconfig.json --noEmit`: **0 errors**.
- `npm run check:boundaries`: **85 warnings, 0 errors** (was 235 at session start).
- `npm run check:architecture`: **OK, and ahead of baseline** — all four metrics improved.

      module cycles          0        (HARD)
      largest SCC            0        (HARD)
      propagation all-import 11.47 -> 11.41
      propagation runtime    1.76  -> 1.72
      module API surface     211   -> 201
      core size              17.22 -> 16.61

- `npm run check:route-test-baseline`: **exit 0**, "46 failing test(s), all in the 48-entry baseline".

### CI status — verify this FIRST

At handoff time, CI run `32103524932` on `50dd8e40` was still `in_progress`. It has since reported
`route-coverage: failure` — see "CI result" at the top of this file. Re-check with
`gh run view 32103524932 --json status,conclusion,jobs`. The worker-OOM flake guess below was
**wrong**; the failure is deterministic and reproduces locally.

Both gates were verified locally in a **clean detached worktree** (`git worktree add --detach`, with
`ln -s <main>/node_modules`), which is the only faithful local reproduction of CI — see "Verification
Traps" below for why the main checkout lies. If CI is green, `main` fast-forwards cleanly (already
confirmed a clean fast-forward, zero divergence). If CI is red, compare its failing STEPS against the
two gates below before assuming the code is at fault; the most likely culprit is the worker-OOM flake
described under Risks, which is a re-run, not a fix.

## Completed Work (this session)

1. **`src/integrations/` renamed to `src/webhooks/`** (`12e394b4`) — owner-initiated via VSCode;
   the rename missed 34 files (28 test files plus 6 in import forms a naive grep did not match) and
   the `.dependency-cruiser.cjs` `GUARDED_MODULES` entry. See Decisions — both misses were
   *invisible to `tsc` and to CI*, which is the generalizable lesson of the session.
2. **Agent tool IDs renamed** `integrations_*` -> `webhooks_*` (`95e7ff1d`), plus ~10 eval suites in
   `development/evals/` that hardcode those IDs. Kept as its own commit so it can be reverted alone
   — it is a behavior change, not a refactor.
3. **Deep-import triage across 18 modules**, 235 -> 85 warnings:
   - `webhooks` 88 -> 44 (barrel redirect of `ports`/`types`, 38 files + 3 mechanical)
   - `assistant` 26 -> 8, `forms` 11 -> 6, `features/deployments` 19 -> **0**,
     `features/content-types` 13 -> **0**, `analytics` 10 -> 3, `media` 7 -> 2,
     `origin`/`features/theme`/`features/commerce`/`seo`/`routing`/`members` all -> **0**
4. **8 modules promoted `warn` -> `error`** in `PROMOTED_NO_DEEP_IMPORTS`: `features/post` (from a
   prior session), `features/deployments`, `origin`, `features/theme`, `features/commerce`, `seo`,
   `routing`, `members`. **This is the durable result.** Every rule in that file is `warn` and
   `check:boundaries` exits 0 by design, so promotion is the ONLY thing that makes a fix stick.
5. **The DI rule was corrected, not loosened** (`cbd4e2ce`, `93e1c82b`) —
   `only-composition-constructs-concrete-adapters` went 26 -> 0 via three principled changes:
   `dependencyTypesNot: ["type-only"]` (a type cannot construct an adapter),
   `resolvePublishHistoryListLimit` relocated out of `db/sqlite` into `src/core/` (it is a policy
   constant, not storage), and `html-document-store.ts` renamed to `.sqlite.ts` so the existing
   adapter-by-filename exemption covers it honestly rather than by a one-off literal.
6. **Both targeted CI gates fixed** (but note a third, untargeted gate is red — see "CI result").
   Gate 1 (`check:architecture`) went green as a side effect of the triage.
   Gate 2 (`check:route-test-baseline`) was diagnosed and fixed in `0731977b` — see Decisions.
7. **`tool-contribution-registry.test.ts` unstuck** (`b68e2b40`) — two stale assertions, both
   invalidated by *our own* completed 25/25 rollout, not another session's work.

## Decisions And Constraints

- **A folder rename silently retires its boundary rule.** `GUARDED_MODULES` in
  `.dependency-cruiser.cjs` is a hardcoded array of folder-name STRINGS, and the rule name plus both
  path patterns are derived from it. Renaming `integrations` -> `webhooks` without updating it made
  `check:boundaries` read 235 -> 207 and look like a 28-warning improvement. **Nothing had been
  fixed; the guard was dead.** Restoring the entry put the real number back. Recorded in memory as
  `reference_dependency_cruiser_guarded_modules_rename`.
- **The route-baseline gate was two bugs, neither of them 15 regressions.** (a) Under CI memory
  pressure a test file crashes (`ERR_WORKER_OUT_OF_MEMORY`) and Node's runner emits ONE top-level
  `not ok <file path>` instead of per-test entries — and a bare file path can never match a
  description-keyed baseline, so it always prints as "new". (b) The script printed its two
  diagnostic blocks to `console.log` and `console.error` respectively; Node writes to pipes
  asynchronously on POSIX, so under Actions the two streams interleaved by arrival order, producing
  the confusing mixed output. Fixed by unifying onto one stream and pruning 9 individually-verified
  stale entries. **9 entries were pruned; ZERO file-path "new failures" were added** — stuffing the
  baseline to force green was explicitly rejected.
- **`EXTRA_TO_EXEMPT` for `features/deployments` is a rule fix, not a silencing.**
  `static-publish/` and `publish-credentials/` are genuine nested modules with their own `index.ts`
  declaring "Public surface ... (ADR-009 §1)". Importers were ALREADY using a proper front door; the
  rule generator only recognizes a top-level `index.ts`. Verified directly before accepting it.
  Note the first attempt — re-exporting the sub-barrels through the parent — worked but regressed
  propagation cost 11.56% -> **15.36%**, and was reverted. Config-only exemption cost nothing.
- **Owner reversed the "do not rename tool IDs" instruction** mid-session. The IDs are NOT persisted
  in the DB, settings, or any permission allowlist (verified), so it was code-only.
- **Do not delete or stash `src/themes/static/mui-marketing/`.** It is another session's UNTRACKED
  work — deleting is unrecoverable, and this repo's stash stack is shared across concurrent
  sessions. It is invisible to CI (CI clones from git). It only breaks local runs.

## Verification Traps (read before trusting any local result)

- **`tsc --noEmit` passing proves nothing about tests.** `tsconfig.json` excludes
  `**/__tests__/**` and `**/*.test.ts`. It was clean all session while 28 test files crashed with
  `MODULE_NOT_FOUND`. Memory: `reference_tovu_tsc_excludes_tests`.
- **The test runner is Node's built-in, not vitest.** `vitest` is NOT installed —
  `npx vitest` and `./node_modules/.bin/vitest` both fail. Use `node --import tsx --test <path>`.
- **The main checkout produces false test failures.** Untracked files from concurrent sessions
  (`mui-marketing`) and their uncommitted schema edits cause local-only reds CI never sees. To
  reproduce CI honestly: `git worktree add --detach <path> HEAD` +
  `ln -s /Users/la/Programming/Tovu/node_modules <path>/node_modules`. This is how gate 2 was
  confirmed; in the main checkout the same gate showed 4 spurious failures.
- **`check:boundaries` exits 0 by design.** Read the count, never the exit code.

## The Remaining 85 — itemised, because most of it is NOT work

    44  no-deep-imports:webhooks                             <- 41 are a documented non-issue
     8  no-deep-imports:assistant
     7  feature-no-express-or-admin-imports                  <- the RouteDeps god-type
     6  no-deep-imports:forms
     3  no-deep-imports:widgets/resolvers
     3  no-deep-imports:analytics
     3  no-non-seam-deep-imports-from-tool-registration-caller   <- NEVER INVESTIGATED
     3  no-deep-value-imports-from-db-sqlite                     <- NEVER INVESTIGATED
     2  no-deep-imports:site-dir
     2  no-deep-imports:media
     2  no-deep-imports:comments
     1  no-deep-imports:features/settings
     1  site-dir-no-server-express-or-cli-imports               <- NEVER INVESTIGATED

- **webhooks 44 — 41 are NOT real.** All 41 are TEST files importing `secret-sealer.aesgcm.ts` (23)
  and `keyring.memory.ts` (18). Zero production importers; the only two production consumers
  (`server/deps.ts`, `server/app.ts`) are already `COMPOSITION_ROOTS`. `secret-sealer.aesgcm.ts`'s
  own header states the pattern deliberately: *"there is deliberately no separate
  plaintext-passthrough test double for `SecretSealerPort` — a fake that skips encryption would
  defeat the one thing worth testing."* Both files use `node:crypto` (`aes-256-gcm` + `hkdfSync`),
  no third-party crypto. **Barreling these would hide which concrete implementation each caller
  depends on — strictly worse than a counted warning.** Open decision: leave them counted, or add a
  narrow `__tests__`-scoped `EXTRA_TO_EXEMPT` carve-out so the number stops overstating the backlog.
- **assistant 8** — 4 are documented-deliberate in the barrel's own header (measured propagation-cost
  regression if routed through it). The other 4 all resolve if `agent-daemon-port.ts` — an already
  curated secondary door — is registered in `EXTRA_TO_EXEMPT`. That is a config judgment call
  nobody has made.
- **forms 6** — the barrel's header deliberately excludes composition-root wiring
  (`repo.memory.ts` x4, `rate-limit-profile.ts` x2). Needs a decision, not a redirect.
- **analytics 3** — the barrel is "TYPES/INTERFACES ONLY at this stage (ADR-035 draft)". Forcing
  `ingestHit`/`LocalBufferSink` in now would violate a staged design.
- **site-dir 2** — likely a genuine config gap: the importer `cli/commands/export.ts` is
  architecturally identical to `serve`/`init`/`introspect`, which ARE in `COMPOSITION_ROOTS`.
  Cheapest real win on this list.
- **widgets/resolvers 3, media 2, comments 2** — were blocked only by concurrent-agent file
  ownership this session. **These are ordinary and should be re-attempted first.**
- **The bottom three rules (7 violations) have never been looked at by anyone.**

## Risks And Open Questions

### Never-decided items from this session

1. **`domain: "integrations"`** still in `webhooks/tool-registrations.ts` (~lines 257, 289) and in
   `tool-contribution-registry.test.ts`'s expected array. Every other domain keys on its own folder
   name; this is now the one mismatch and the last "integrations" in live code.
2. **`development/evals/tool-search-distractors.ts:525`** — that distractor exists to test whether
   retrieval can separate `events_webhooks` from `integrations_list_subscriptions`. After the
   rename BOTH surfaces are named `webhooks*`, which either makes it a harder, better test or
   destroys the distinction it encodes. Deliberately left untouched pending an owner call.
3. **`development/evals/tool-search-caller2-compliance-captures-2026-08-05.ts`** — a frozen dated
   capture, correctly NOT rewritten (editing `expectedToolId` would falsify a historical record).
   Downstream risk: if its harness does a live catalog lookup, that case may now match nothing.
4. **`tool-search-caller2-compliance-harness.ts`** has a pre-existing broken import —
   `../../src/server/middleware/rate-limit` does not exist; the real path is
   `src/core/rate-limit/rate-limit.ts`. Predates this session, flagged not fixed.

### The CI worker-OOM risk class

The gate-2 fix removed the confusing OUTPUT, not the underlying cause: under full-suite concurrent
load, a CI runner can OOM a test worker, which surfaces as a file-level TAP crash. **This gate can
go red again on a busy CI night without any code change.** It is a runner-resource / test-concurrency
tuning question. If gate 2 fails in CI but passes in a clean local worktree, suspect this first.

### `check:architecture --update` has NOT been run

The check now reports "OK, and ahead of baseline. Run with --update to lock in the improvement."
**Deliberately not done.** Two reasons to weigh: locking in makes future regressions detectable,
but the baseline currently still carries the other session's `custom-credentials` +2 API-surface
regression, which our improvements have out-run (211 -> 201) rather than resolved. Updating erases
that signal permanently. Owner decision.

### Pre-existing test failures — still unowned across five sessions

`byok-provider-turn`, `assistant-byok-routes`, `tool-registrations.database-recovery`,
`tool-registrations.menus`, `admin-menus-routes`, `identity-crud-routes`, `publish-site-route`,
`site-assistant-routes`, `media-site-serving`, `post-template-site-serving`, `seo-site-serving`.
Several are local-only artifacts of untracked files and do NOT reproduce in a clean worktree —
**re-triage in a clean worktree before assuming any of these are real.** `packet-one-routes` is
definitively local-only: it hardcodes the built-in theme list and `mui-marketing` is untracked.
Whoever commits that theme must add one line to `packet-one-routes.test.ts:675`.

### Not ours — in the working tree, do not touch or attribute

`.gitignore`, `apps/admin/**` (package.json, vite.config.ts, the plugins feature — a concurrent
session is live in there), `src/themes/static/basic/pages/index.html`, and
`src/themes/static/mui-marketing/`.

## Next Steps — the four dials, in the order I would do them

**0. Confirm CI, then move `main`.** It is 990 commits behind and a clean fast-forward. This is the
first moment since 2026-07-21 it can move on evidence.

**1. Finish the cheap boundary tail (~10 warnings, hours not days).** `widgets/resolvers` 3,
`media` 2, `comments` 2 were blocked only by file-ownership collisions and are ordinary redirects.
`site-dir` 2 is probably one `COMPOSITION_ROOTS` line. Then look at the 7 violations in the three
never-investigated rules. **Promote every module that reaches 0** — that is the whole point.

**2. `RouteDeps` redesign (7 warnings, structurally the heaviest item).**
The blocker is proven, not assumed: `src/export/site-exporter.ts:186` declares
`ExportSiteOptions.routeDeps: RouteDeps`, and 7 of the 8 original violators forward `routeDeps`
wholesale into `exportSite`. A narrower local type CANNOT satisfy that call — a prior agent
correctly refused this work, and `features/deployments/tool-registrations.ts`'s own header already
documents it as contravariance. **Why it is genuinely hard:** exporting a static site boots the REAL
Express app and crawls it, so it legitimately needs everything the app needs. The fix is to change
what `exportSite` requires, not to shrink the type at the call site.
Do NOT "fix" this by adding `dependencyTypesNot: ["type-only"]` to
`feature-no-express-or-admin-imports`. It would work mechanically (all 7 are `import type`) and it
would be dishonest: unlike the DI rule — where a type literally cannot construct an adapter — here
the type coupling IS the thing being measured. `check-architecture.ts`'s own comment says why:
*"a type-only edit still forces `tsc` to re-check every importing file."* `RouteDeps` intersects all
25 domains.
Also note this god-type is what killed the `providers/` restructuring idea (investigated to a
negative result; see memory `reference_tovu_tool_contribution_registry_coupling` — do not
re-propose that specific move).

**3. Core size (16.61%) and propagation cost (11.41%).** Definitions, read from
`development/scripts/check-architecture.ts:356-382`, because they are not intuitive:
- **core size** = the % of files ABOVE the median on BOTH transitive fan-out and transitive fan-in
  — the tangled middle. It is a RELATIVE measure, so it can move when the median moves; do not read
  a drop as proof of untangling without checking the absolute counts.
- **propagation cost** = mean fraction of the codebase reachable from a random file. Absolute.
- Both use the **all-import** graph (type edges INCLUDED — it is the change-coupling graph).
  Cycles/SCC use the runtime-only graph.
The one measured lever that worked this session: **relocating a thing out of a hub.** Moving
`publish-history-list-limit.ts` from `db/sqlite` to `src/core/` cut a `features -> db` edge, and
`db` is one of the largest hubs. That is a repeatable search: find policy constants, pure helpers,
and types sitting inside `db/`, `server/`, or `assistant/` that have no business there.
**Counter-example worth remembering:** re-exporting sub-barrels through a parent barrel regressed
propagation cost 11.56% -> 15.36%. Barrels are not free — measure before and after, every time.
**Open question the owner raised and we never resolved:** would a central shared types module help?
Measured evidence so far says only partly — 82 of the original 194 deep imports were type-only
(~42%), it does nothing for the DI rule or for `RouteDeps`'s actual problem (the type's SIZE, not
its location), and a shared bag risks becoming the exact hub this metric punishes. Note the
counter-evidence: per-module barrels did NOT raise propagation cost the way I predicted, so the
"central bag is worse" intuition is unproven in both directions. It deserves a real measurement,
not another argument.

**4. Module API surface (201 files exposed).** This is the number of private files reachable from
outside their module. It moves for free as deep imports get redirected — it went 211 -> 201 this
session with no work aimed at it. **Do not open a dedicated workstream for it until the boundary
tail is done**; it is a lagging indicator of the same underlying problem, and it is a RATCHET
metric, so it only needs to not regress.

## Handoff Contract

- **Inputs used:** live `git log`/`status`/`worktree list`; `npx tsc --noEmit`,
  `npm run check:boundaries`, `npm run check:architecture`, `npm run test:cov:server` +
  `npm run check:route-test-baseline` run directly by the coordinator (both in the main checkout AND
  in a clean detached worktree, which disagreed — see Verification Traps); `gh run list` / `gh run
  view --log-failed` over CI history back to 2026-07-21; direct reads of
  `.dependency-cruiser.cjs`, `check-architecture.ts`, `site-exporter.ts`, `secret-sealer.aesgcm.ts`,
  `keyring.memory.ts`, `webhooks/index.ts`, `tool-contribution-registry.test.ts`, `tsconfig.json`,
  `.github/workflows/ci.yml`; `git show c3c030a9`; and five subagents' final reports.
- **Output summary:** CI green on both gates for the first time since 2026-07-21, 235 -> 85 boundary
  warnings, 8 modules enforced at `error`, and an itemised account of why most of the remaining 85
  is deliberate rather than pending.
- **Risks:** CI run `32103524932` was still in progress at handoff — verify before moving `main`;
  the worker-OOM flake can re-red gate 2 with no code change; four never-decided items are listed
  under Open Questions; three boundary rules (7 violations) have never been investigated by anyone.
- **Suggested next assignee:** Claude Code, same repo. Per-module Programmer dispatch, isolated
  worktree, Sonnet 5 — but **dispatch FRESH agents rather than re-tasking idle ones** (memory
  `feedback_fresh_agent_not_reused_context`; a 400k-context veteran re-sends its whole context every
  turn). Put the traps from "Verification Traps" in every spawn prompt: five agents this session
  each needed telling, and three were handed stale worktrees they had to detect themselves.
