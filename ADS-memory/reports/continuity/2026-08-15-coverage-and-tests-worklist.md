# Carry-over worklist — apps/admin coverage + test authoring

- **Written:** 2026-08-15, end of session
- **Branch:** `general-work`
- **Scope of this list:** coverage gaps and test authoring in `apps/admin` only
- **Owner:** Leona Burime

---

## OUT OF SCOPE — do not touch

**`apps/admin/src/features/deployment/**` and all deployment work** (the panel, the static
exporter, `tovu export`, the Dockerfile, the server deploy routes). **Another session owns this and
is actively committing to it.** Do not measure it, do not test it, do not read it for context.
It was measured read-only once this session (93.9% stmts, 53/53 tests) — that number exists in the
coverage report and needs no follow-up. Nothing further.

Also out of scope: rewriting git history (the `c578a77` message discrepancy stays a note).

---

## Task list

### 1. Write the missing `features/workspace/hooks` tests — PRIMARY
The only real coverage gap surfaced this session. **5.12%** across all four metrics, hidden behind a
parent directory reading 95.45% because `Workspace.tsx` itself is well tested.

- Files with no direct test: `use-workspace.hooks.ts`, `workspace-dependencies.hooks.ts`,
  `workspace-port.hooks.ts` — a complete port trio.
- Existing tests are only `Workspace.unit.test.tsx` and `rules.unit.test.ts`.
- Follow the established pattern: port + dependencies + fake triple, and a
  `use-workspace.hooks.unit.test.ts` that injects the fake.
- Reference implementation: `apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts`.
- **Negative-verify whatever you write** — break the fake method the assertion depends on, run that
  single test by name, confirm RED, revert, confirm green. Two vacuous tests were found this way
  today; passing is not proof.

### 2. Decide on `coverage.reportOnFailure` — owner's call
`apps/admin/vitest.config.ts` never sets it, and Vitest defaults it to **`false`**, so **any
coverage run with even one failing test silently produces zero artifacts** — no error, no partial
data. Reads as broken tooling, not a failed test.

- Recommended fix: add `reportOnFailure: true` to the coverage block.
- **Not applied** — deliberately left to the owner.
- **Trap:** `vitest.config.ts` is currently dirty with another agent's uncommitted changes. Read the
  diff before editing and do not revert what's there.

### 3. Resolve the flaky measurement test
`src/__measurements__/request-volume.measurement.test.tsx > redirects > initial load` hit its
5000ms timeout in **4 of 6 attempts**, independent of tree state or HEAD.

- Working theory is resource contention (3 agents + 22 sequential vitest boots against a tight
  margin). **The formal 2x-isolation flaky-test protocol was NOT run** — do not read the existing
  note as a cleared verdict.
- Counter-evidence: a clean-tree run of those same paths gave 11 files / 100 tests passing.
- Decide: raise the timeout, or run the protocol and confirm the cause.

### 4. Mine the rest of the 22-set coverage table
`ADS-memory/reports/2026-08-15-admin-coverage.md` has per-set numbers with per-set SHAs. Only the
headline outliers were triaged this session. Read the full table and decide which other directories
deserve tests.

- **There is deliberately no aggregate total** — the 22 sets were measured at different SHAs while a
  peer session committed continuously, so a single repo-wide number is not defensible. Do not
  reconstruct one by merging the lcov files; if a single figure is wanted, do one clean run on a
  quiet branch.
- `features/commerce` reads as a stub (1 line measured, `Payments.tsx` + one test). Not a gap —
  there is nothing there yet. Don't "fix" it.

### 5. Decide the six pre-existing dirty files
Uncommitted in `apps/admin` since before this session, from earlier stopped agents. **Inspected and
found complete and internally consistent** — not partial, despite an older handoff calling two of
them partial. Still uncommitted, so still one `git clean` from gone.

- `src/__measurements__/request-volume.measurement.test.tsx`
- `src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx`
- `src/features/playground/__tests__/Playground.unit.test.tsx`
- `src/features/plugins/__tests__/AgentPluginBundle.unit.test.ts`
- `src/features/plugins/agent-plugin-source-catalog.ts`
- `vitest.config.ts`

Decide: commit or discard. Don't leave them dangling a third session running.

---

## Already done — do NOT redo

- **Section 6 of the DI-sweep handoff is closed.** 8 commits: `126aab1` `1d6db82` `1ab2d79`
  `444a3d0` `a717697` `857e066` `6ee3721` `3c5dbe1`.
- **91 injection points verified, zero decorative injection.** 28 by direct mutation, 63 by
  exhaustive static read. Reports: `2026-08-15-negative-verification-usewired-batch.md`,
  `2026-08-15-retroactive-seam-sweep.md`. The `useWiredX` convention demonstrably holds across
  `apps/admin`. **Do not re-buy this investigation.**
- **All 22 coverage sets measured cleanly** with an overlap-check rule for concurrent-tree churn.

---

## Traps that cost real time today

- **`--coverage.reportsDirectory` is a fixed path** (`./coverage`). Sequential scoped runs each
  overwrite the last. Override per run.
- **Never put a log file inside `--coverage.reportsDirectory`** — the v8 provider clears that
  directory at startup. This is what made output "vanish" and produced two wrong root-cause theories.
- **Passing test paths scopes which tests RUN, not which files are INSTRUMENTED.** With no `include`
  and `coverage.all` defaulting true, a scoped run still reports the whole tree, so the run-level
  percentage is mostly a measure of what you didn't run. Per-file data stays valid.
- **`git diff <hash> -- <path>` returns empty both when your content landed AND when the path is
  wrong.** Pair it with `git cat-file -e <hash>:<path>`. Relative pathspecs resolve against your
  current directory — a drifted `cd` makes committed files look missing.
- **Concurrent agents share one git index.** Use `git commit -m "..." -- <exact paths>`; verify
  against the hash `git commit` returns, not `HEAD`.
- **A claim in a brief is not evidence.** Section 6's item 5 named the wrong file, wrong count, and
  wrong contents; the agent read the source and refused it. Verify before acting.

---

## Opening prompt for the next session

> Read `AI-Dev-Shop/AGENTS.md`, then
> `ADS-memory/reports/continuity/2026-08-15-coverage-and-tests-worklist.md`.
>
> Start with task 1 — write the missing `features/workspace/hooks` tests, then negative-verify each
> one (break the fake, run the single test by name, confirm RED, revert, confirm green). Report the
> true hit rate including any test that stays green.
>
> Do not touch anything under `features/deployment/` or any deployment work — another session owns
> it. Do not rewrite git history. Use `git commit -m "..." -- <exact paths>` for every commit.
