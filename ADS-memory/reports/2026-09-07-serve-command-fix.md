# serve-command integration suite hang — fix (2026-09-07)

Programmer(Execution): `AI-Dev-Shop/agents/programmer/skills.md` loaded first, per dispatch.
Investigation read first: `ADS-memory/reports/2026-09-07-serve-command-hang.md`.

Commit: **`e54ebe5e`** on `restructure/apps-website-phased` — "fix(cli/serve-tests): bound every
wait so a hung server can't wedge the suite".

**Nothing was executed.** No `serve-command*.integration.test.ts` file was run, no `tovu serve` or
any server was started, no process was killed. Verification was reading plus a scoped `tsc --noEmit`
(see below) — never execution, per the dispatch's absolute constraint.

## What changed, per file

### `apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts`
- `runCliSync`'s `timeoutMs` parameter now defaults to `30_000` instead of `undefined` (`spawnSync`
  treats `undefined` as "no timeout" — a hard, synchronous `waitpid` on the whole process). The one
  call site that already passed `60_000` explicitly is untouched.
- Added `FETCH_POLL_TIMEOUT_MS = 2000` (flat) and a `fetchTimeoutSignal(baseMs = 10000)` helper
  (`AbortSignal.timeout(baseMs * loadFactor())`), placed next to `loadFactor()`.
- `waitForHttpReady`'s internal fetch now passes `{ signal: AbortSignal.timeout(FETCH_POLL_TIMEOUT_MS) }`
  — the existing `catch` already retries on any failure, including an abort, so the outer deadline
  loop actually gets to re-check on schedule now.
- Every other bare fetch in the file (`--port` precedence checks, `/welcome` assertions ×6 via one
  `replace_all` since they're byte-identical, and the daemon-readiness poll loop's `/api/runs` fetch)
  now carries a bound signal — `fetchTimeoutSignal()` for the single-shot ones, the same flat
  `FETCH_POLL_TIMEOUT_MS` for the one other manual poll loop (daemon-token test).
- Every `finally`-block `stopGracefully(child)` call that was unconditional is now guarded:
  `if (child.exitCode === null && !child.killed) { await stopGracefully(child); }` — 9 call sites
  (BR-02 flag test, config.json.port test, B1 test, B1 workspace test, CR-R04, AC-08, the OTLP test,
  the daemon-token test, and the first-boot half of the 2026-08-28 dispatch test). Two call sites were
  already safe and left untouched: the BR-07 test's `finally` already checks `!child.killed` before
  its `SIGKILL` fallback, and the identity-reseed test's second boot already checks `!exited`.
- This guard is the exact fix ported from the stale `zzz-debug-cr-r04-2.test.ts` scratch file's own
  experiment, applied to every site the investigation flagged, not just CR-R04.

### `apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts`
- Same `runCliSync` default-timeout fix (`30_000`), now also passing `timeout: timeoutMs` into
  `spawnSync`'s options (this file's `runCliSync` never forwarded a timeout option at all before).
- Same `FETCH_POLL_TIMEOUT_MS`/`fetchTimeoutSignal` helpers added next to this file's own
  `loadFactor()`.
- `waitForHttpReady`'s fetch bounded the same way; the login POST and module-status GET fetches each
  gained `signal: fetchTimeoutSignal()`.
- The one unconditional `stopGracefully(child)` in a `finally` (the healthy-boot test) is now guarded
  the same way. The second test's `finally` already guarded via
  `child.exitCode === null && child.signalCode === null` — left as-is (semantically equivalent,
  already safe).

### `apps/website/src/cli/__tests__/integration/serve-command-plugin-sdk-resolver.integration.test.ts`
- Same `runCliSync` default-timeout fix, same `FETCH_POLL_TIMEOUT_MS`/`fetchTimeoutSignal` helpers,
  same `waitForHttpReady` fetch bound.
- The login POST and the plugin-enable PATCH fetch each gained `signal: fetchTimeoutSignal()`.
- The one `finally`-block `stopGracefully(child)` is now guarded the same way.

### Consolidation (recommendation #5 from the investigation) — deliberately NOT done
The investigation suggested consolidating the now-triplicated `waitForHttpReady`/`stopGracefully`
(and now `fetchTimeoutSignal`/`FETCH_POLL_TIMEOUT_MS`) into a shared helper alongside
`helpers/remove-fixture-tree.ts`, but framed it as "do it only if it stays a clean mechanical
extraction." Given the absolute constraint against running any of these files, I judged that a
cross-file extraction (new shared module, updated imports in three files, exported symbols) carries
meaningfully higher risk of an unverified mistake than three parallel, mechanically-identical edits —
and there would be no way to catch a mistake before the owner's own verification run. Left the
triplication in place; flagging as a good follow-up once a supervised test run is authorized.

### Also committed (pre-existing, uncommitted WIP — not authored by me)
- `apps/website/src/cli/__tests__/helpers/remove-fixture-tree.ts` (new file) and the mechanical
  `fs.rmSync(parent, {...})` → `removeFixtureTree(parent)` swap in all three test files. The
  investigation verified every hunk was that swap and nothing else, and judged the helper correct.
  Committed together with the fix above, per dispatch instruction, using explicit paths only.

### Left alone, per dispatch instruction
- `apps/website/src/cli/__tests__/integration/zzz-debug-cr-r04-2.test.ts` — not deleted, not
  committed. Still untracked. The owner's call.
- `apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts` — an untracked file that
  appeared in `git status` but was never mentioned in the investigation or the dispatch. Not touched,
  not committed, not investigated — out of scope and presumably another agent's work-in-progress in
  this shared tree.

## Verification performed (no execution)

- Read every changed line back via `grep -n "stopGracefully("` and `grep -n "fetch(\`http"` on
  `serve-command.integration.test.ts` after editing, confirming all 9 `stopGracefully` call sites are
  guarded and all 10 fetch calls carry a bound signal.
- **Scoped `tsc --noEmit`**, run directly against the four changed/added files (the three integration
  test files plus `helpers/remove-fixture-tree.ts`), with compiler options matching the project's own
  `tsconfig.json` (`target ES2022`, `module`/`moduleResolution nodenext`, `strict`, etc.) but without
  the root config's test-excluding `exclude` list — **zero errors**. This is a real compile check of
  the actual edits (including the `#src/*` subpath import and `AbortSignal.timeout` typing), unlike
  the root `tsconfig.json` which excludes `**/__tests__/**` and `**/*.test.ts` entirely and so gives
  no signal on this change.
- Root `npx tsc -p tsconfig.json --noEmit` still exits `0` (unaffected, as expected — these files sit
  outside its `include`).
- No lint run was requested or found necessary beyond the above; no ESLint config was invoked.

## What a verification run would need to look like (owner-authorized only)

1. Run each of the three files as its **own** `node --test <file>` invocation (not concurrently, per
   the investigation's mitigation #4), e.g.:
   `node --import tsx --experimental-test-module-mocks apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts`
   — repeated for the other two files.
2. Add Node's own `--test-timeout=<ms>` flag (the investigation's safety net #3) as a backstop even
   after this fix, e.g. `--test-timeout=120000`, so a still-hanging edge case fails loud instead of
   wedging the invocation.
3. Watch for orphaned `tovu serve`/agent-daemon processes afterward (`pgrep -f 'cli/main.ts serve'`,
   pids only — never `pgrep -fl`) and report, don't kill, anything unexpected still running.
4. Confirm no new flakiness was introduced by the tightened fetch timeouts — in particular the
   `fetchTimeoutSignal()` default of `10000 * loadFactor()` ms for single-shot post-readiness
   assertions, and the flat `2000` ms per-attempt cap inside polling loops. If a genuinely healthy
   but slow-under-load server ever needs more headroom than `10000 * loadFactor()` for a single
   assertion fetch, that base constant is the one knob to raise.
5. This is a decision for the owner, not something I should run myself, per the dispatch's absolute
   constraint.

## Architecture Audit
- Status: **PASS**.
- Rules checked: test-only scope (no production `src` changes outside `__tests__`), no changes to
  `apps/website/src/features/widgets/resolver-service.ts` or `apps/admin/src` (untouched, confirmed
  by `git status` scope above), no certified test deleted/weakened, no new dependency added.
- Files audited: the three integration test files, `helpers/remove-fixture-tree.ts` (pre-existing,
  unmodified by me beyond the git-add), `zzz-debug-cr-r04-2.test.ts` and
  `unit/serve-command-wiring.unit.test.ts` (read-only, confirmed out of scope, left alone).
- No violations found.

## Pre-Completion Checklist
- Requirements re-verified against the dispatch: bounded fetch ✓, bounded `runCliSync` ✓, ported
  `stopGracefully` guard to every unconditional call site in all three files ✓, committed the
  pre-existing `removeFixtureTree` swap together with the fix ✓, `zzz-debug-cr-r04-2.test.ts` left
  alone ✓, no server started/killed ✓, no unscoped test run ✓.
- Fresh evidence: scoped `tsc --noEmit` (zero errors) and root `tsc -p tsconfig.json --noEmit` (exit
  0, unaffected) — both re-run after the final edit, both above.
- Test-integrity: no certified test was deleted, weakened, or had its assertions changed — every
  edit is either a timeout/guard addition or a `spawnSync` timeout default; test bodies and
  assertions are byte-for-byte unchanged.
- Scope: all changes confined to the three named integration test files plus the pre-existing
  helper/swap explicitly authorized for co-commit. Nothing under `apps/admin/src` or
  `resolver-service.ts` touched.
- Open items: the shared-helper consolidation (recommendation #5) was deliberately deferred, and the
  actual execution/verification run is entirely the owner's call, not taken here.

## Style Notes
- `fetchTimeoutSignal`/`FETCH_POLL_TIMEOUT_MS` are small, pure, and triplicated by necessity (matches
  this file family's existing pattern of independent `loadFactor()`/`waitForHttpReady`/
  `stopGracefully` copies per file) — no new cross-file coupling introduced.
- No findings beyond the deliberate consolidation deferral noted above; every change is a mechanical,
  narrowly-scoped safety-net addition with no behavior change to a test that currently passes.

## Risks and tech debt introduced
- None new. The pre-existing triplication across the three files grew slightly (two more shared
  constants/helpers each), unchanged in kind from what was already there.

## Suggested next routing
- Owner decides when to authorize a supervised, single-file-at-a-time verification run per the
  procedure above.
- Separately: `zzz-debug-cr-r04-2.test.ts` deletion, and the shared-helper consolidation, are both
  low-risk follow-ups once a verification run is possible.
