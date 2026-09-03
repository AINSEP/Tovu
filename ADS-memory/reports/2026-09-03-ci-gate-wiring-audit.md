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
- The five restructure-broken scripts (`check-outbox-bridge.ts`, `check-embed-marker-drift.ts`,
  `check-openapi-contract.ts`, `check-openapi-secret-leaks.ts`,
  `check-capability-inventory.ts`) — reported, not patched; they're under
  `development/scripts/`, outside this task's touch list (`.github/workflows/*`,
  `package.json`, this report).
- `check:boundaries`, `check:architecture`, `check:admin-complexity-drift`,
  `check:src-complexity-drift` current red findings — reported above, not fixed; all are
  findings in `apps/website/src`/`apps/admin/src`, owned by other agents this session.
