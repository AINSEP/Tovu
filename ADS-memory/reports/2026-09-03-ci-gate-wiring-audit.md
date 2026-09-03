# CI Gate Wiring Audit — 2026-09-03

Persona: Programmer (primary) + DevOps (supporting, CI wiring). Loaded
`AI-Dev-Shop/agents/programmer/skills.md` and `AI-Dev-Shop/agents/devops/skills.md` only —
`CLAUDE.md`/`AGENTS.md` were not read per dispatch instruction.

Repo root: `/Users/la/Programming/Tovu`, branch `restructure/apps-website-phased`. All 19
`check:*` scripts were run fresh from repo root (fixtures use `process.cwd()`). Raw logs:
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/e31e09ea-7740-40d1-8c84-36f976ba44e1/scratchpad/gate-runs/*.log`.

## Headline finding, ahead of the assigned "9 unwired" framing

The dispatch's premise — 9 unwired gates, mostly security-shaped — is correct as far as it
goes, but the more urgent finding is upstream of it: **on this branch, `build-and-test` is
already red today, through gates that ARE wired**, for reasons that have nothing to do with
security posture:

- `check:inventory` (wired, blocking via the Gate-summary aggregator) **crashes** —
  `ERR_MODULE_NOT_FOUND` on `../../src/server/runtime/configuration/capability-inventory.js`.
- `check:boundaries` (wired, blocking) exits **rc=11** (11 real `no-deep-imports` errors) —
  which directly contradicts its own header comment in `ci.yml` line 291-293 ("deliberately
  severity:\"warn\" ... this always exits 0 on ordinary violations by design, so no
  continue-on-error needed"). That claim is false on this branch right now.
- `check:architecture` (wired, blocking) fails a hard-constraint ratchet: module API surface
  regressed 230 → 231.
- `check:admin-complexity-drift` and `check:src-complexity-drift` (both wired, blocking) each
  report new violations beyond their committed debt baselines.

None of this is in my touch list (`apps/admin/src`, `apps/website/src`) and none of it is
caused by my changes — it's the state of the tree as found. I am reporting it, not fixing it,
per the brief's "if a gate is red because of source code, report it" rule. It matters here
because it means the *already-wired* half of this repo's gates is not the reliable baseline
the "wire the other 9" framing assumes.

## The restructure broke five check scripts by stale path, not by real findings

This repo underwent a `src/` → `apps/website/src/` move (visible in `git status`: every
touched file already lives under `apps/website/src`). Five of the 19 `check:*` scripts still
hard-code or relative-import the pre-restructure `src/` root and **crash before they scan
anything**:

| script | stale reference |
|---|---|
| `check:inventory` (**wired**) | `development/scripts/check-capability-inventory.ts:17` imports `../../src/server/runtime/configuration/capability-inventory.js` |
| `check:outbox-bridge` (unwired) | `development/scripts/check-outbox-bridge.ts:64` — `SRC_DIR = path.join(REPO_ROOT, "src")` |
| `check:embed-marker-drift` (unwired) | `development/scripts/check-embed-marker-drift.ts:79` imports `../../src/contracts/core/embeds/marker.js` |
| `check:openapi-contract` (unwired) | via shared `development/scripts/lib/tovu-test-server.ts:12` → `../../../src/server/runtime/composition/app.js` |
| `check:openapi-secret-leaks` (unwired) | same `tovu-test-server.ts` dependency |

These are not "vacuous" (measuring nothing and passing) — they are **actively broken**
(`ERR_MODULE_NOT_FOUND` / `ENOENT`, exit 1), which is worse for a would-be CI gate: a vacuous
gate is silently useless, a crashing one is loud but for the wrong reason and would need
special-casing to distinguish "real finding" from "script rotted" in the Gate summary. None of
the four unwired ones are being wired (see Phase 2). `check:inventory`'s wired-but-crashing
state is flagged above as a live build-and-test defect, not touched (it's under
`development/scripts/`, and while that's not one of the three named off-limits files, it's
also not in my touch list — `.github/workflows/*`, `package.json`, and this report only — so I
report it rather than patch it).

## Phase 1 — full state of all 19 `check:*` gates

`wired?` = referenced by an actual `run:` step in `.github/workflows/ci.yml` (not merely
mentioned in a comment). `can-fail?` = does that step's outcome reach a `Gate summary` step
that `exit 1`s the job. Both jobs (`build-and-test`, `route-coverage`) use the identical
collect-all-then-aggregate pattern: every gate step is `continue-on-error: true` with an `id:`,
and a final `if: always()` summary step reads every `steps.<id>.outcome` and fails the job if
any isn't `success`.

| gate | wired? | can-fail? | scope size (evidence) | rc | verdict |
|---|---|---|---|---|---|
| `check:test-baseline` | **NO** — the 1 grep hit is a comment (`ci.yml:270`, "step 3" of a documented 3-step plan), not a `run:` step | — | no scope reached — no `repo-test-failure-baseline.json` exists yet (confirmed: `ls` → not found) | 1 (missing input file) | NOT READY. This is the repo's own documented next step, not a bug. Don't wire — no baseline to ratchet against. |
| `check:boundaries` | YES (`gate-boundaries`) | YES | 2102 modules / 10411 deps cruised | **11** | WIRED, **currently RED** — 11 real `no-deep-imports` errors; contradicts its own "always exits 0" comment |
| `check:architecture` | YES (`gate-architecture`) | YES | 6 ratcheted structural metrics | 1 | WIRED, **currently RED** — module API surface 230→231 (hard constraint) |
| `check:inventory` | YES (`gate-inventory`) | YES | crashes before scanning | 1 (crash) | WIRED but **BROKEN** — restructure casualty (see above), not a real inventory finding |
| `check:outbox-bridge` | NO (0 hits) | — | crashes before scanning `src/` | 1 (crash) | UNWIRED + BROKEN — restructure casualty. **Do not wire.** |
| `check:seal-aad` | NO (0 hits) | — | 13 files / 36 `.seal()` call sites under `apps/website/src` (independently grepped) | **0** | UNWIRED, GREEN, non-vacuous — **WIRED this session** |
| `check:secret-scan` | NO (0 hits) | — | full git history | 1 | UNWIRED, RED — the known historical finding at a path that no longer exists in the tree, being triaged separately by the owner. **Left exactly as-is, not wired, not touched**, per explicit instruction. |
| `check:admin-complexity-drift` | YES | YES | `apps/admin/src` (851 files) | 1 | WIRED, **currently RED** — new violations beyond `admin-complexity-debt.json` |
| `check:src-complexity-drift` | YES (`gate-src-complexity`) | YES | `apps/website/src/server/routes/**` | 1 | WIRED, **currently RED** — 2 new violations beyond `src-complexity-debt.json` |
| `check:coverage-integrity` | NO (0 hits) | — | 799 first-party test blocks evaluated (470 non-first-party skipped) | **0** | UNWIRED, GREEN, non-vacuous — **WIRED this session** |
| `check:embed-marker-drift` | NO (0 hits) | — | crashes before scanning | 1 (crash) | UNWIRED + BROKEN — restructure casualty. **Do not wire.** |
| `check:theme-replaced-elements` | NO (0 hits) | — | 5 themes under `content/themes/static` | 1 | UNWIRED, RED — 4/5 themes genuinely missing `max-width:100%` on video/iframe. Real, non-vacuous scope, but currently failing. **Do not wire** (would break the build on arrival; brief requires green+non-vacuous). |
| `check:seed-content-drift` | YES (`gate-seed-content-drift`) | YES | `seed-content.json` vs `seed.ts` | 0 | WIRED, GREEN |
| `check:route-coverage-floor` | YES (`gate-coverage-floor`) | YES | 239 measurable `src/server/routes/**` files | 1 | WIRED, **currently RED** — line 73.29%<88%, funcs 44.67%<93% |
| `check:route-coverage-diff` | YES (`gate-coverage-diff`) | YES | needs `lcov.unit.info`/`lcov.integration.info` from the prior step in the same job | 1 standalone | WIRED correctly — standalone rc=1 is the documented precondition message ("run test:cov:server first"), not a defect; in the real pipeline order it has real input |
| `check:route-test-baseline` | YES (`gate-test-baseline`) | YES | needs `test-results.tap` from the prior step in the same job | 1 standalone | WIRED correctly — same precondition pattern, not a defect |
| `check:openapi-contract` | NO (0 hits) | — | crashes before scanning (shared `tovu-test-server.ts`) | 1 (crash) | UNWIRED + BROKEN — restructure casualty. **Do not wire.** |
| `check:openapi-secret-leaks` | NO (0 hits) | — | crashes before scanning (same shared dependency) | 1 (crash) | UNWIRED + BROKEN — restructure casualty. **Do not wire.** |
| `check:default-credential` | NO (0 hits) | — | `apps/admin/src` (851 files) | **0** | UNWIRED, GREEN, non-vacuous — **WIRED this session** |

Of the 9 gates named in the dispatch as unwired: 3 wired this session
(`coverage-integrity`, `seal-aad`, `default-credential`), 1 left exactly alone as instructed
(`secret-scan`), 1 not wired because currently red on real findings (`theme-replaced-elements`),
4 not wired because they crash on restructure-stale paths and measure nothing
(`outbox-bridge`, `embed-marker-drift`, `openapi-contract`, `openapi-secret-leaks`).

## Phase 2 — what was wired

Added three steps to the `build-and-test` job in `.github/workflows/ci.yml`, immediately after
`Check seed-content drift` and before `Lint`, matching the existing `check:src-complexity-drift`
pattern exactly (`id:`, `continue-on-error: true`, `run: npm run check:<name>`), and added the
matching three lines to that job's `Gate summary` step so their outcomes can fail the build:

- `gate-coverage-integrity` → `npm run check:coverage-integrity`
- `gate-seal-aad` → `npm run check:seal-aad`
- `gate-default-credential` → `npm run check:default-credential`

No second mechanism was invented — same aggregator, same `if: always()` summary, same
`skipped`-vs-`FAIL` distinction already in the file.

### Proof each newly-wired gate can fail the build

Demonstrated locally by introducing a real violation, confirming non-zero exit, then reverting
the exact edit by hand (no `git checkout`/`stash` used, per shared-tree rules):

- **`check:seal-aad`**: temporarily changed one `.seal({...})` call under
  `apps/website/src/features/vendor-credentials/store.ts` to drop its `aad` field →
  `npm run check:seal-aad` exited 1, reporting that exact call site → reverted the same edit by
  hand → reran, exited 0 again.
- **`check:default-credential`**: temporarily inserted the seeded default password literal into
  a throwaway file under `apps/admin/src/features/recovery/` → `npm run check:default-credential`
  exited 1, reporting the seeded string in a shipped UI line → deleted the throwaway file →
  reran, exited 0 again.
- **`check:coverage-integrity`**: this one takes an lcov path as an optional CLI argument
  (`check-coverage-integrity.ts` line 121-122, defaults to `development/coverage/lcov.info`), so
  no tracked file needed touching at all — wrote a synthetic one-block lcov fixture to
  `<scratchpad>/probe-lcov.info` with a first-party `SF:apps/website/src/...` path whose
  `FNDA:` record names an esbuild CJS-wrapper helper (`__toCommonJS`), the exact contamination
  signature this script detects (see its own header, "presence alone is the whole signal").
  `npx tsx development/scripts/check-coverage-integrity.ts <scratchpad>/probe-lcov.info` exited
  1, correctly flagging the fixture block as CONTAMINATED/NEW → deleted the scratch fixture →
  reran against the real (default) `development/coverage/lcov.info`, exited 0 again (799 blocks,
  0 contamination, unchanged from the original measurement).

The `seal-aad` and `default-credential` probes were made and reverted directly in the working
files (`apps/website/src/features/vendor-credentials/store.ts`, and a throwaway file under
`apps/admin/src/features/recovery/` that was created then deleted) — both are structural/text
scans of real source, so a fixture outside the tree wouldn't exercise the same scan paths. Each
is confirmed back to its original state: `git status --porcelain` on both paths is empty after
the revert, and only `.github/workflows/ci.yml` shows as modified.

## Phase 3 — the 26 `continue-on-error` occurrences

Only 17 of the 26 grep hits are actual `continue-on-error: true` step declarations; the other 9
are comment lines that mention the term while explaining the pattern (the file is unusually
well-documented about this). Of the 17 real occurrences:

**12 are blocking, by design** — each has an `id:`, and that id is read by one of the two
`Gate summary` steps, which `exit 1`s if any outcome isn't `success`. This is the file's stated
"collect every failure, don't stop at the first one" strategy (see `ci.yml:198-210`), not a
defanged gate. `build-and-test`: `gate-typecheck`, `gate-boundaries`, `gate-architecture`,
`gate-inventory`, `gate-src-complexity`, `gate-seed-content-drift`, `gate-eslint-boundaries`,
`gate-admin-typecheck`, `gate-admin-build` (now +3: `gate-coverage-integrity`, `gate-seal-aad`,
`gate-default-credential`). `route-coverage`: `gate-coverage-floor`, `gate-coverage-diff`,
`gate-test-baseline`.

**5 are genuinely advisory, and documented as such** — no `id:` reaches either summary step, so
these can never fail the build regardless of outcome:
1. `Test` step (`id: test`, line 234) — repo-wide `npm run test:ci`. Comment explains why: 82
   pre-existing failures with no baseline to ratchet against yet (unlike the scoped
   `route-test-baseline`, which does ratchet). Deliberate, and the file names the exact plan to
   promote it (commit `repo-test-failure-baseline.json`, then wire `check:test-baseline` — see
   Phase 1 row above, still pending).
2. `Repo-wide test failure report (informational)` (line 276) — explicitly a visibility step,
   not a gate, feeding the plan above.
3. `Lint` (Biome, line 368) — no `id:` at all. Comment states ~130 pre-existing findings are
   untriaged and this is meant to flip to blocking once they are.
4. `route-tests` (line 543) — produces `lcov.info`/`test-results.tap` for the real gates after
   it; not itself a gate.
5. `route-tests-tiered` (line 564) — same, produces tiered lcov inputs for `gate-coverage-diff`.

**Verdict: none of the 17 look accidental.** This is the most defensively-commented CI file I've
seen in this repo — every `continue-on-error` either feeds the aggregator or is explicitly
labeled non-blocking with a stated reason and, in most cases, a stated promotion plan.

**Ranked recommendations** (none acted on — owner decision per brief):
1. **Highest value, lowest risk**: finish the `check:test-baseline` 3-step plan already written
   into the file's own comments — commit `development/coverage/test-results-all.tap`'s captured
   failure list as `development/scripts/repo-test-failure-baseline.json`, then add
   `check:test-baseline` as a real blocking step. The mechanism (`check-test-baseline.ts`) and
   the CI plumbing (`test:ci`'s TAP output) already exist; only the baseline commit and the one
   new step are missing. This closes the gap noted in Phase 1 where `check:test-baseline` looked
   "1 occurrence" wired by grep but is not actually invoked.
2. **Medium value, needs triage first**: promote `Lint` (Biome) to blocking once the ~130
   pre-existing findings are resolved or explicitly suppressed — don't flip it on top of active
   findings, or every branch touching a linted file goes red for pre-existing debt.
3. **Leave as-is**: `route-tests`/`route-tests-tiered` and the repo-wide `Test` step should stay
   non-blocking indefinitely — they exist to produce input files for other gates, not to assert
   anything themselves; making them blocking would just duplicate the real gates that already
   read their output.

## Explicitly not touched

- `check:secret-scan` — red left exactly as found, not wired, not fixed, not allowlisted.
- `apps/website/src/features/webhooks/secret-scan-guard.ts`,
  `apps/website/src/features/webhooks/seal-aad-invariant.ts`,
  `apps/website/src/features/identity/default-credential-exposure.ts` — not edited.
- Any file under `apps/website/src/` or `apps/admin/src/` other than the three probe-and-revert
  round-trips described above, none of which left a net diff.
- The five restructure-broken scripts — see **Task 2** below: repointed 2026-09-03 once
  `development/scripts/**` was added to this task's touch list. Superseded, not withdrawn: the
  paragraph above described the state as of Task 1's handoff.
- `check:boundaries`, `check:architecture`, `check:admin-complexity-drift`,
  `check:src-complexity-drift` current red findings — reported above, not fixed; all are
  findings in `apps/website/src`/`apps/admin/src`, owned by other agents this session.

---

# Task 2 — repoint the 5 stale-path scripts, and the dead-path-sweep investigation

Dispatched as a correction + follow-up to Task 1. Scope widened to
`.github/workflows/**`, `development/scripts/**`, `package.json`, and this report.
`apps/website/src/**`/`apps/admin/src/**` remain off-limits (six other agents' batches live
there this session).

## Correction to Task 1's headline — with pushback

Task 1 claimed `build-and-test` is red right now because `check:inventory` is wired AND
blocking. The correction received says that's wrong because the step carries
`continue-on-error: true`, so "the job stays green."

Re-examined `ci.yml` after the correction and I don't think the correction is right, for a
reason that's checkable in the file itself rather than a judgment call:

`ci.yml`'s own header comment on this exact pattern (lines 198-210, unchanged by either of us)
reads: *"GATES BELOW ARE `continue-on-error: true` + `id:` ON PURPOSE... They are NOT
non-blocking: the 'Gate summary' step at the end of this job reads every **outcome** and fails
the job if any of them failed. The change is WHEN you learn, not WHETHER it blocks."* The Gate
summary step (`ci.yml:406-445` before this task's edits) then literally does that: `check
"${{ steps.gate-inventory.outcome }}" "check:inventory"`, and `check()` treats anything other
than `success` as `FAIL`, setting `fail=1` and exiting the job 1.

The load-bearing fact is that GitHub Actions' `steps.<id>.outcome` is the step's result **before**
`continue-on-error` is applied (the raw pass/fail of the command), while `steps.<id>.conclusion`
is the result **after** (always `success` for a `continue-on-error` step, which is the field that
actually determines whether the JOB halts on its own). This file reads `.outcome`, not
`.conclusion`, specifically to defeat the swallowing effect — that's the entire documented reason
this aggregator pattern exists (12 gates now, after this task's +3 from Task 1), rather than
letting the job stop at the first red step. If `continue-on-error` alone made a step's result
invisible to the job regardless of which field is read, this pattern — and its 13-line
justification comment — would do nothing, for all 12 gates, not just `check:inventory`.

I can't run this on real GitHub Actions to settle it empirically — Actions is billing-blocked on
this repo (`ci.yml`'s own header + prior session notes). But the same belief ("continue-on-error
swallows the crash") is also written, independently, into
`development/scripts/__tests__/dead-path-sweep.test.ts`'s known-broken register rationale for
this exact file (quoted verbatim below) — so if I'm right, the same misreading exists twice in
this codebase, not once. I'm flagging this rather than silently adopting the correction because
it changes what "red" means for every one of these 12 gates, not just this one.

## What was done

1. **Repointed all five scripts**, verifying each target individually rather than blanket-prepending
   `apps/website/` (per instruction — and it would NOT have been safe to skip this: one of the
   five needed a directory ONE LEVEL DEEPER than the naive prepend, caught only by actually
   running the fixed script and reading the next error):
   - `development/scripts/check-capability-inventory.ts:17` — import repointed to
     `../../apps/website/src/server/runtime/configuration/capability-inventory.js` (confirmed the
     file exists there first).
   - `development/scripts/check-capability-inventory.ts:19` — a SECOND, separate stale reference
     in the same file, not part of the import: `SERVER_DIR = path.resolve(dirname, "..", "..",
     "src", "server")` used to locate `deps.ts`/`app.ts`. Naively becomes
     `apps/website/src/server` — that directory exists, but `deps.ts`/`app.ts` are NOT directly
     in it (the restructure nested them under `server/runtime/composition/`). First fix attempt
     ran and crashed with `ENOENT ... apps/website/src/server/deps.ts`; `find` located the real
     files at `apps/website/src/server/runtime/composition/{deps,app}.ts`; corrected `SERVER_DIR`
     to that path. Re-run: green.
   - `development/scripts/check-embed-marker-drift.ts:79` — import repointed to
     `../../apps/website/src/contracts/core/embeds/marker.js` (file confirmed to exist there,
     first try).
   - `development/scripts/check-outbox-bridge.ts:64` — `SRC_DIR` default repointed from
     `path.join(REPO_ROOT, "src")` to `path.join(REPO_ROOT, "apps", "website", "src")`.
   - `development/scripts/lib/tovu-test-server.ts:12` (shared by both openapi gates) — import
     repointed to `../../../apps/website/src/server/runtime/composition/app.js` (file confirmed
     to exist there, first try).

2. **Ran all five fresh and report exactly what they say — nothing in their findings was fixed:**

   | gate | rc after repoint | what it actually found |
   |---|---|---|
   | `check:inventory` | **0** | "all 25 capability-inventory entries correspond to real deps.ts/app.ts source" |
   | `check:embed-marker-drift` | **0** | "105 theme file(s) scanned, stored Page bodies SKIPPED (no database at infra/content.db); no retired attribute..." |
   | `check:outbox-bridge` | **0** | "every chokepoint call site wraps `outbox` with its required bridge" |
   | `check:openapi-contract` | **1** | Real HTTP probe against a real booted server: 404/431 operation-checks passed, **27 mismatches** (6 flagged as likely-confirmed contract bugs, 21 flagged by the script itself as probable probe limitations — e.g. a validation-before-auth handler short-circuiting an empty-body probe before it reaches the status code under test). Full output in `.../gate-runs/openapi-contract.repointed.log`. |
   | `check:openapi-secret-leaks` | **0** | Real probe: 79 of 132 operations produced a captured response body; 0 canary leaks, 0 credential-shaped patterns found |

   None of `check:openapi-contract`'s 27 mismatches were touched — that's real product-surface
   red, reported per instruction, not this task's to fix.

3. **A third, unplanned finding while running the two openapi gates**: both crashed with `owner
   login failed with 401` on first re-run after the import fix — a THIRD, independent bug, not
   the path issue. Traced it: `development/scripts/lib/tovu-test-server.ts`'s `loginOwner()`
   hardcodes `password: "tovu-dev"`, but this shell session has `TOVU_ADMIN_PASSWORD` set to a
   real, non-default value, which `apps/website/src/features/identity/wiring.ts:120` prefers over
   the seeded dev default (`process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD`) when
   seeding the owner account. Re-running with `env -u TOVU_ADMIN_PASSWORD` confirmed the
   hypothesis — both gates then ran to completion and produced the real findings in the table
   above. **This is a local-environment artifact of this session's shell, not a restructure
   defect** — a clean CI runner or a shell without that variable set would use the "tovu-dev"
   default and never see it. Flagging it anyway because it's a latent risk: if `TOVU_ADMIN_PASSWORD`
   is ever set as a CI secret (a plausible convention), both gates would crash in CI with the
   identical 401. **Also found and NOT fixed**: neither `check-openapi-contract.ts` nor
   `check-openapi-secret-leaks.ts` wraps its login/probe sequence in `try`/`finally` around
   `server.close()` — `main()` calls `startTovuServer()`, then `loginOwner()`, and only reaches
   `server.close()` on the line after a successful login. When login throws, the ephemeral
   `http.Server` is never closed and the Node process does not exit on its own; both runs had to
   be killed by this session's own command timeout (3 min) rather than exiting. Reported, not
   fixed — it's inside `development/scripts/`, but fixing script control flow beyond a path
   repoint felt like it was drifting past "repoint the five scripts," so I stopped at reporting
   it precisely rather than guessing at scope.

4. **Not wired**: none of these five were added to `ci.yml`. This task's brief was repoint +
   report, not wire — and `check:openapi-contract` is currently red on real findings regardless,
   so it wouldn't qualify under Task 1's wiring bar even if asked. `check:inventory`,
   `check:embed-marker-drift`, `check:outbox-bridge`, and `check:openapi-secret-leaks` are now
   green and non-vacuous; `check:inventory` is already wired (Task 1, unchanged). The other three
   are candidates for a future wiring pass if wanted — flagging rather than acting unilaterally,
   since it wasn't asked for in this dispatch.

## Why didn't `development/scripts/lib/dead-path-sweep.ts` catch this?

It did — for three of the five. The other two were a real, separate scope gap, now closed.

**The three relative-import cases were caught, named, and deliberately parked.**
`dead-path-sweep.test.ts` runs a REAL, live sweep of `development/scripts/**` (via
`collectSweepTargets`/`sweepFiles`, called directly in its own test body — this is not a
`check:*` script, it is a `node:test` file, which is why `npm run check:*` never surfaces it) as
part of `test:ci`'s glob. Its own header states the sweep found 35 dead references across 14
files, and a `KNOWN_BROKEN_PENDING_OWNER_DECISION` register exists specifically to record ones
"deliberately not fixed... each with the reason it is the owner's call rather than a mechanical
repair." Before this task, that register named exactly three of my five, verbatim:

```
"development/scripts/check-capability-inventory.ts:../../src/server/runtime/configuration/capability-inventory.js":
  "a one-shot operational script whose imports have been dead since the restructure... This one
  IS a check: script, so its failure mode is a crash rather than a silent pass — but ci.yml's
  continue-on-error swallows the crash."

"development/scripts/check-embed-marker-drift.ts:../../src/contracts/core/embeds/marker.js":
  "...Same crash-not-silence shape as check-capability-inventory.ts."

"development/scripts/lib/tovu-test-server.ts:../../../src/server/runtime/composition/app.js":
  "the shared harness behind check-openapi-contract.ts and check-openapi-secret-leaks.ts — both
  of those gates crash on import today. Fixing it means booting the real app from a check
  script, which needs verification this task is not scoped to do."
```

This is exactly the worst case named in this task's dispatch: *"a dead path was recorded and
then tolerated indefinitely while gates stayed dark."* Confirmed, not hypothesized. (It's also
where the same "continue-on-error swallows the crash" claim disputed above shows up a second
time, independently — see the Correction section.) Since fixing these three was authorized this
session, their register entries are removed (mirroring exactly how the prior 14-entry removal on
2026-09-02 was done — see the register's own header) and the register's pinned count updated
from 21 to 18 in `development/scripts/__tests__/dead-path-sweep.test.ts`. All 25 pre-existing
tests still pass after the removal.

**The other two were a genuine, structural blind spot — not tolerated debt, because the sweep
could never have produced a finding for them.** `check-outbox-bridge.ts`'s
`path.join(REPO_ROOT, "src")` and `check-capability-inventory.ts`'s
`path.resolve(dirname, "..", "..", "src", "server")` are neither relative imports (class 1) nor
single hardcoded path strings (class 2) — they're MULTIPLE separate string arguments to
`path.join`/`path.resolve`. Each individual argument (`"src"`, `"server"`) has no `/` of its own,
so class 2's `no-path-separator` skip rule — correct for a genuinely bare word, which is how most
of this codebase uses short strings — discarded every one of them without ever seeing they were
arguments to the same call, joined into one real path at runtime. Confirmed neither appears
anywhere in the register (grepped for both).

## The extension (class 3), and its proof

Added a third reference class to `development/scripts/lib/dead-path-sweep.ts`:
`extractPathJoinSegments()` finds `path.join(...)`/`path.resolve(...)` calls and extracts each
one's TRAILING run of pure string-literal arguments (the leading argument is almost always a
computed base like `import.meta.dirname`, which can't be resolved statically and isn't needed to
be — the literal segments layered on top of it are what encode the restructure-sensitive part);
`dropLeadingParentSegments()` strips a leading `".."` run. `sweepOneFile` now feeds the remaining
2+-segment run through the SAME `classifyRepoRelativeString`/`pathThatMustExist` pipeline class 2
already uses, rather than duplicating resolution logic. A single meaningful segment (e.g. bare
`"src"`) is deliberately still skipped — precision-over-recall, same reasoning as class 2's
`no-path-separator` rule (`path.join(x, "dist")`, `path.join(x, "node_modules")` etc. are common
and legitimate, and a single bare word carries no more path-shaped signal here than it does as a
standalone string literal).

**Disclosed limitation, not swept under the rug**: this means class 3, as built, would NOT have
caught `check-outbox-bridge.ts`'s actual pre-fix bug on its own — `path.join(REPO_ROOT, "src")`
has only ONE meaningful trailing segment. Only `check-capability-inventory.ts`'s `SERVER_DIR`
shape (`"src", "server"` — two segments) is within the new detection boundary. A unit test names
this limitation explicitly (`known limitation: a SINGLE meaningful segment...`) rather than
implying broader coverage than the code actually provides.

**8 new tests added** to `dead-path-sweep.test.ts` (33 total, all passing): unit coverage for
`extractPathJoinSegments`/`dropLeadingParentSegments` (trailing-run extraction, non-literal-arg
truncation, `..`-stripping, calls other than `path.join`/`path.resolve` ignored), a `historical:`
pair proving the pre-fix `check-capability-inventory.ts` `SERVER_DIR` shape is flagged dead and
the current one resolves, the disclosed single-segment limitation test, and a check that both
repointed files' current `path.join`/`path.resolve` calls all resolve today.

**End-to-end proof, without touching any tracked file**: wrote a probe fixture to
`ADS-memory/.local-artifacts/dead-path-sweep-class3-probe.ts` (gitignored) containing
`path.resolve(REPO_ROOT, "src", "server")` — "src" is a real directory NAME elsewhere in the
repo (passes the known-repo-segment gate) but `src/server` does not exist at the repo root
(mirrors the real bug shape). Ran the real public API end-to-end:
`sweepFiles({ repoRoot, files: ["ADS-memory/.local-artifacts/dead-path-sweep-class3-probe.ts"] })`
→ one finding, `kind: "path-join-call"`, `specifier: "src/server"`, `attempted: ["src"]`. Deleted
the probe file; re-ran; zero findings. `git status --porcelain` on that directory is empty
(gitignored, so this never touched tracked state either way).

## Touched this task

`development/scripts/check-capability-inventory.ts`, `check-embed-marker-drift.ts`,
`check-outbox-bridge.ts`, `lib/tovu-test-server.ts` (path repoints only — no findings-shaped
behavior changed in any of them), `lib/dead-path-sweep.ts` (class 3 addition),
`__tests__/dead-path-sweep.test.ts` (register update + 8 new tests), and this report. Nothing
under `apps/website/src/**`/`apps/admin/src/**` touched. `check:openapi-contract`'s 27 mismatches,
the login-credential env-sensitivity, and the missing `try`/`finally` around `server.close()` are
all reported above and none were fixed.
