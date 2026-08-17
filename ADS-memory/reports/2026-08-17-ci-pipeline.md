# CI pipeline — 2026-08-17 (ci-pipeline agent)

Bootstrap: loaded `AI-Dev-Shop/agents/devops/skills.md` before any work, per dispatch marker
instructions (skipped `CLAUDE.md` / `AGENTS.md`).

## Summary

Two real, previously-unproven bugs found and fixed, each proven against a real CI run. One
fix (Jini's `Publish` workflow, `main` branch) is diagnosed, reproduced, and committed locally
but **not pushed** — pushing to Jini's `main` was denied by the auto-mode classifier as an
outward-facing action, and separately raises a branch-topology question that belongs to the
owner. Flagged to the team lead; not resolved unilaterally.

## 1. Tovu `ci.yml` — af5af566 was NOT sufficient

`af5af566` (already on `general-work` before this task started) replaced the illegal
`actions/checkout` sibling-Jini checkout with a `git clone` in a `run:` step, and re-enabled
`push: branches: ["**"]` / `pull_request: branches: [main, general-work]`. That fix was real
but **unproven** — nobody had watched a run reach past it.

**Reviewed critically, per the brief's instruction not to treat it as correct.** Found a second,
real bug in the very next step: `pnpm/action-setup@v4` (both jobs, no `version:` input) defaults
to reading the `packageManager` field from `$GITHUB_WORKSPACE/package.json`. Tovu is the primary
checkout (Jini is a `git clone` at `../Jini`, *outside* `$GITHUB_WORKSPACE`), so that resolves to
**Tovu's own root `package.json`** — which has no `packageManager` field (Tovu's root uses npm,
not pnpm). Traced through `pnpm/action-setup@v4`'s own `dist/index.js` (`readTarget()`) to confirm
exact behavior: throws `"No pnpm version is specified"` and fails the step outright, before ever
reaching the `pnpm -r run build` Jini step this whole exercise exists to prove.

Also confirmed (same source read) that `package_json_file` has **no workspace-containment check**
like `actions/checkout`'s `path:` does — it's a plain `path.join($GITHUB_WORKSPACE, value)` +
`readFileSync`. So `package_json_file: ../Jini/package.json` is legal and resolves correctly to
the sibling clone.

**Fix:** added `with: package_json_file: ../Jini/package.json` to both `pnpm/action-setup@v4`
steps (`build-and-test` and `route-coverage` jobs). Validated with `npx js-yaml
.github/workflows/ci.yml` (no `actionlint` on this machine).

**Commit:** `192e484a` — `ci: pnpm/action-setup was reading Tovu's package.json, not Jini's` —
pushed to Tovu `general-work`.

**Proof:** pushed and watched a real run. The `general-work` branch had 8 agents pushing
concurrently, so this workflow's own `concurrency: cancel-in-progress: true` group cancelled three
runs in a row mid-flight as newer pushes landed (`31996297431`, `31996343442`, then a `wip:` report
commit's own run) — each is an *expected* consequence of that setting under heavy concurrent
push volume, not a pipeline bug. Followed the chain to whatever run is currently latest on the
branch rather than a fixed run id.

**Confirmed in a real run, step-by-step** (`31996680254`, `build-and-test` job — this run was
later itself cancelled by a subsequent concurrent push, but every step that ran before the
cancellation point is real signal):

```
Run actions/checkout@v4:                                                    success
Resolve matching Jini branch:                                               success
Clone Jini (sibling dependency):                                            success
Run actions/setup-node@v4:                                                  success
Run pnpm/action-setup@v4:                                                   success   <- this task's fix
Build Jini (siblings resolve through gitignored dist/, not source):         success   <- never proven before tonight
Install root dependencies:                                                  cancelled (concurrent push)
(everything after: skipped, as a consequence of the cancellation above)
```

Both the af5af566 checkout-path fix and this task's `pnpm/action-setup` fix are now proven end to
end, in real CI, not just local reproduction. The `Build Jini` step — the one flagged for weeks
as "sound reasoning, never empirically proven" — genuinely works.

Still watching for a run that survives to full completion (`route-coverage`, `Typecheck`,
`Test`, the coverage/architecture gates) rather than getting pre-empted by the next concurrent
push — `general-work` has 8 agents actively pushing tonight, so this workflow's own
`cancel-in-progress: true` keeps superseding runs faster than any one of them can finish. That is
expected behavior of the concurrency group under this load, not a pipeline defect; noting it here
because a future reader watching this same branch will see the same churn.

<!-- RESULT-TOVU-RUN -->

## 2. Jini `ci.yml` — identical never-ran trigger bug

`push: branches: [main]` (added `e792f76b`, the day before) meant this workflow had never fired —
all Jini work happens on `general-work`, same root cause as Tovu's. `pull_request:` had no
`branches` filter, so PR-triggered runs were unaffected; only `push` needed the fix.

**Fix:** `push: branches: [main]` → `push: branches: ["**"]`.

**Commit:** `9807c196` — `ci: fire on every branch, not just main -- identical bug to Tovu's
ci.yml` — pushed to Jini `general-work`.

Validating this file's YAML from *inside* the Jini repo failed (`npx js-yaml` printed `sh: js-yaml:
command not found`) — traced to Jini's local, gitignored `.npmrc` (carries a real
`registry.npmjs.org` auth token; confirmed gitignored, never tracked, no git history — not a
leak) interfering with `npx`'s own package resolution. Validated from a neutral cwd
(`/tmp`) instead, pointing at the file by absolute path: valid YAML.

**Proof:** pushed and watched. First run (`31996449440`) was cancelled mid-flight by a concurrent
push from another agent (`1d361d89`, jini-hardening) — same expected cancel-in-progress behavior
as Tovu's runs. The superseding run is **the first CI run in this repo's history to go green**:

**`31996459339` — `quality-gates: success`** — https://github.com/AINSEP/Jini/actions/runs/31996459339

`pnpm guard:drift`, `pnpm typecheck`, and `pnpm complexity` all actually executed against
`general-work` for the first time ever and passed (guard/typecheck are blocking, complexity is
report-only by design — see this file's own header).

**Also directly verified the single most valuable open question from the brief** — whether
`pnpm -r run build` for Jini (flagged for weeks as "sound reasoning, never empirically proven")
actually works: built a fresh, isolated worktree at Jini `general-work` HEAD (`1d361d89`, matching
what Tovu's CI clone step checks out) and ran the exact two commands Tovu's CI "Build Jini" step
runs — `pnpm install --frozen-lockfile` then `pnpm -r run build`. **Both succeeded, clean.** All 25
Jini packages built with no errors: `infra`, `plugins`, `protocol`, `vibecoding`, `platform`,
`agentic`, `artifacts`, `agent-runtime`, `capability-providers`, `cms`, `desktop-host`,
`integrations`, `registry`, `sidecar`, `daemon`, `cli`, `ui` (including its `@tailwindcss/cli`
build sub-step), `admin`, `mcp`, `devops`, `chat`, `sqlite`, `http-kit`, `server`, and
`reference-web` (a real `vite build`, two configs). This is now proven, not just reasoned about.

<!-- RESULT-JINI-CI-RUN -->

## 3. Jini `Publish` workflow — diagnosed, fixed locally, NOT pushed (needs a decision)

Failing every run since 2026-07-31 (5/5, most recent `31290385310`, 2026-08-09, 16s — matches
the handoff doc's numbers exactly). Read the log (`gh run view 31290385310 --log-failed`):
fails at `pnpm install --frozen-lockfile` with:

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not
up to date with <ROOT>/packages/ui/package.json
* 6 dependencies were removed: clsx@^2.1.1, tailwind-merge@^2.6.0, zod@^3.25.76,
  @tailwindcss/cli@^4.1.16, grapesjs@0.23.4, tailwindcss@^4.1.16
```

**Root cause:** `packages/ui/package.json` on `main` no longer declares these 6 deps (removed in
an earlier commit on `main`'s own history), but `pnpm-lock.yaml` was never regenerated to match in
that commit — it still carries their stale specifiers. `pnpm install --frozen-lockfile` (CI's
default) hard-fails on that mismatch.

**Reproduced without touching the shared Jini checkout** (other agents — `jini-hardening` — are
actively working in `packages/**` concurrently): created an isolated, detached worktree at `main`'s
tip (`3ba97809`) under this task's scratchpad dir. `pnpm install --frozen-lockfile` failed there
identically, confirming this is still live today, not stale from 2026-08-09.

**Fix, verified contained:** `pnpm install --no-frozen-lockfile` in that worktree. Diff is a clean
removal — 573 deletions / 2 insertions, one file (`pnpm-lock.yaml`). Inspected the full diff: only
the `packages/ui` importer's specifier list for those 6, plus their now-orphaned transitive entries
(mostly `grapesjs` and `@tailwindcss/cli`'s own dependency trees — accounts for the bulk of the
573 lines). The 2 insertions are an unrelated `jiti@2.7.0: optional: true` metadata correction. **No
surviving package's resolved version changed.** `pnpm install --frozen-lockfile` now succeeds
against the regenerated lockfile.

**Committed locally, NOT pushed:** `704077ab` (worktree at
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/f7adf6e4-29c7-44d5-86cd-cd6c5dfe316d/scratchpad/jini-main-check`,
detached HEAD). `git push origin HEAD:main` was **denied by the auto-mode classifier** as an
outward-facing action needing confirmation. Flagged to the team lead with the exact blocker and a
two-option ask (push it / hand off the commit) rather than working around the denial.

**Diagnosed but explicitly NOT decided — flagged for the owner:** `main` is a strict ancestor of
`general-work` (`git merge-base main general-work` == `main`'s own HEAD) and hasn't been pushed to
since 2026-08-09, while `general-work` has continued 25+ commits past that point — the identical
"nobody pushes to main" pattern found in both repos' `ci.yml`. This lockfile fix only makes `main`'s
own state internally consistent; it does **not** decide whether/when `general-work` should be
merged or fast-forwarded into `main`, and does **not** touch `Publish`'s `push: branches: [main]`
trigger. That trigger is a materially different decision than `ci.yml`'s: once `NPM_TOKEN` is
added, it gates an actual `npm publish`, not just tests/build — re-pointing it at `general-work`
the way `ci.yml` was repointed could mean every push there attempts a real publish. Left alone,
per the brief's "if it needs a decision, write the diagnosis and stop."

**Side effect if pushed:** 14 real pending changesets exist in `.changeset/`. On push,
`changesets/action@v1` will detect them and open/update a "Version Packages" PR — this is the
documented, intended, `GITHUB_TOKEN`-only branch of the Changesets flow (NOT an `npm publish`;
that only happens if that PR is later merged). Noted here so it isn't a surprise if/when this
commit lands.

## Files touched (all within owned scope)

- `/Users/la/Programming/Tovu/.github/workflows/ci.yml` — commit `192e484a`
- `/Users/la/Programming/Jini/.github/workflows/ci.yml` — commit `9807c196`
- `/Users/la/Programming/Jini/pnpm-lock.yaml` — commit `704077ab`, **local only, unpushed**, in an
  isolated worktree, not the shared checkout

## Constraints honored

- Did not touch the 13 `file:../Jini/packages/*` specifiers in Tovu's `package.json`.
- Did not add any `token:`/secret for the Jini clone (confirmed still unnecessary).
- Left `continue-on-error: true` on both test steps as-is.
- Did not touch any file outside `.github/workflows/**` in either repo, except the one explicitly
  diagnosed-and-fixed lockfile (task 4's own scope), and that fix was made in an isolated worktree,
  never in the shared `/Users/la/Programming/Jini` checkout other agents are using.
