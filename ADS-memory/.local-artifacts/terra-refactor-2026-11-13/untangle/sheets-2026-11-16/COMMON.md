# COMMON: rules every 2026-11-16 R/G sheet inherits (read first, then your sheet)

Planning only; nothing here was executed. Written 2026-11-16 against:
- Jini `refactor/terra` @ `02edbb68`, **plus** `refactor/c6` @ `9ab06410` and `refactor/daemon-prereqs` @ `d5a1e622`, merged locally for measurement only (both merge cleanly; `integ/merge-a-2026-11-16` did not exist in Jini when this run started).
- Tovu `refactor/terra` (read through a worktree).

`GUARDS.tsv` lists every file that still carries a rule-breaking import, with its line count and git blob at the merged state and at `refactor/terra`. 23 files differ between the two; use the `blob_merged` column once the merge branch has landed, and re-measure if neither matches.

## Base and branch
1. Start from the Jini branch that contains C6 **and** the daemon prerequisites (the merge branch, or `refactor/terra` after both are merged). Record both repo SHAs in your report.
2. First command, before reading source (Jini standing rule): `pnpm install --config.prefer-workspace-packages=true && pnpm -r build`. Then record a green baseline for every package you will touch: `pnpm --filter @jini-ai/<pkg> build && npm --prefix packages/<pkg> run test`. A red baseline is reported, not fixed.
3. Re-run the census and compare with your lane's site list:
   `node <U>/sheets-2026-11-16/scripts/census.mjs <jini> <U> /tmp/census && awk -F'\t' '$11=="<LANE>"' /tmp/census/CENSUS-sites.tsv | diff - <(tail -n +2 <U>/sheets-2026-11-16/sites/<LANE>.sites.tsv)`
   A new or missing row: handle it if it is the same edge kind in a file you already own; otherwise **STOP** and report.

## Rules that the earlier build runs broke (each is a STOP condition here)
- **Every commit is green alone.** Typecheck + the touched package's tests pass at each commit. Never push a red commit and "fix forward". If a step cannot be made green alone, stop and report the step.
- **Tests first.** The "Tests to write first" list is written and run RED (or, for characterization tests, GREEN on the old code *and* shown to fail under the named mutation) before the production edit.
- **No shells.** No re-export, forwarder, deprecated alias or `export * from` is left at an old path. Delete the old path and repoint every caller in the same commit. After each step: `rg -n "export .* from ['\"]@jini-ai/(?!core|protocol)" -P packages/<pkg>/src` prints nothing new.
- **No lazy imports of declared deps.** Do not replace a static import by `await import()` / `loadOptionalPeer` to hide it from the gate. The edge is removed by injection, not by deferral.
- **Hooks are injected.** Every custom hook a component uses (including `useT`, `useAdminLocale`, kit hooks) arrives as a prop defaulted to the real hook, or through the package kit. No new direct hook import from another package.
- **Tests use fakes of interfaces.** No `vi.mock` of another package's file. A fake implements the port type and is passed through the same `(required, optional)` args as production. Use `@jini-ai/core/contracts/*/testing` where it exists.
- **Why-comments move with the code.** Before deleting or rewriting a block, copy its comment to the new owner. Report the count of comment lines before and after (`rg -c "^\s*(//|/?\*)" <file>`).
- **Counts in this sheet may be stale.** Step 3 above is mandatory; report every difference.
- **Limits inside each file you create or grow:** functions ≤ 50 lines, cyclomatic and cognitive complexity ≤ 10, file ≤ 500 lines, exported functions take `(required, optional = {})`. Measure with the repo ratchets (`pnpm guard`, the complexity and size ratchets) before and after.
- **Errors:** a port call that can fail returns or throws a typed error; never swallow, never `catch {}`; no new `eslint-disable`, `@ts-ignore`, `as any`, or cast on a `satisfies` line.
- **Port bindings are checked for behaviour, not only type:** argument order, object versus positional, which object a field sits in. Each sheet names the binding lines and the test that fails when an argument is dropped.
- **Honest testing:** report the test count before and after per package. No assertion is weakened (`toBe` → `toBeDefined`), skipped or deleted. A real-implementation case that no longer belongs in the package moves to `packages/integration-tests` (G-TESTS), it is never dropped.
- **Security:** repos are public. Describe security changes by class and location only.

## What a lane may edit
- Its own package's files listed in the sheet, and the **one new Tovu wiring file** the sheet names.
- **Coordinator-only files** (the lane reports the exact lines, the coordinator applies them): `packages/core/package.json` and `README.md`, `scripts/injection-debt.json`, `scripts/injection-exceptions.json`, `pnpm-lock.yaml`, Tovu `apps/website/src/server/runtime/composition/{deps,app}.ts`, Tovu `apps/admin/src/main.tsx`, Tovu `apps/admin/src/integrations/jini-kits.ts`.
- A lane deletes a manifest dependency of **its own package** in the same commit as the last import of it, and updates manifest-assertion tests in that commit.

## Cross-repo pairs
A step that changes a signature a host calls is a **pair**: one Jini commit, then one Tovu commit whose message names the Jini SHA it was checked against. Tovu is typechecked linked to that Jini SHA (`npm ci`, build `@tovu/sdk`, then Tovu's link script). No forwarder is left in Jini to bridge the gap.

## Git
- Branch `xpkg/<lane>` in Jini (and in Tovu only when the sheet has a Tovu file). Commit by explicit paths (`git commit -F msg -- <paths>`). `git pull --rebase` before every push. Never force-push. Push after every step.
- Last commit: `cloud-results/xpkg/<lane>.md` with: DONE / PARTIAL / SKIPPED; SHAs; each step done or skipped with the reason; debt keys retired; coordinator lines; checks run with every error (file:line, message) classified LANE-CAUSED / PRE-EXISTING / ENV; test count before and after; why-comment count before and after; what the sheet got wrong.

## Owner rules in force (acceptance criteria, not advice)
DESIGN B1 (a Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`), §7 answers (Q1 yes: `server`/`cli` are host presets; Q2 yes: `sqlite`/`infra` frozen until the next major; Q4 no exception; Q5 yes; Q6 yes; Q8: Node adapters go to the host preset), D-CHAT, D-FAKES, ruling (d) (no barrels). Pure helpers may live in core (owner 11-10). No vendor code in core. No specific server framework in a Jini domain package. Plugins never import each other.
