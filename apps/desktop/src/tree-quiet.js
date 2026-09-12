/**
 * @file The PRIMARY half of the packaging safety gate: decides whether `apps/desktop` is quiet
 * enough to pack, before `electron-builder` ever runs. Pure decision logic only — the process and
 * filesystem probing that gathers `signals` lives in `scripts/check-tree-quiet.mjs`, wired into
 * `quality-gates.json` as the `tree-quiet` gate.
 *
 * ## Why refusing to pack beats detecting corruption after the fact
 *
 * `ADS-memory/reports/2026-09-12-packaging-asar-corruption.md` found that packing while
 * `apps/desktop/src` is being edited (or a `vite build --watch` is rewriting `dist/renderer`) shifts
 * app.asar's internal file offsets: length-correct, content-wrong, and invisible to electron-builder,
 * code signing, and `asar list`/`asar extract` alike. `electron-builder` still exits 0 and produces a
 * signed, mountable `.dmg`. Refusing to start the pack in the first place is strictly better than
 * building it and finding out later — it is free, and it is the one variable that separated that
 * corrupt build from two clean ones run the same day.
 *
 * This predicate can only see what changed DURING however long the caller chose to look, though —
 * it is a sample, not a proof of quiescence for the whole pack that follows. `scripts/verify-package.
 * mjs` (`src/asar-verify.js`) is the real backstop: it compares the FINISHED archive's content
 * against source, byte-for-byte, after the pack completes. A pass here does not make that check
 * optional.
 *
 * ## Why "moving" is a live snapshot diff, never an absolute mtime age
 *
 * `npm run gates` — where this precondition has to live, because `scripts/check-gates.mjs` runs
 * before `electron-builder` in the `package` script chain — also runs in CI on every push, straight
 * after a fresh `actions/checkout` (`.github/workflows/desktop.yml:79`). A checkout sets EVERY file's
 * mtime to "now", so "anything under src modified in the last N seconds" would read true on literally
 * every CI run, for reasons that have nothing to do with a moving tree. Comparing two live snapshots
 * taken a short interval apart has no dependency on when the checkout happened: a quiescent tree
 * (checked out and then left alone) produces two IDENTICAL snapshots regardless of how "new" its
 * mtimes are in absolute terms. See `scripts/check-tree-quiet.mjs` for how the snapshots are taken.
 */

/** Why a live `vite build --watch` blocks packaging — the named, known culprit from the incident. */
function viteWatchProblem(viteWatchRunning) {
  if (!viteWatchRunning) return null;
  return (
    "a `vite build --watch` process is running against apps/desktop. It rewrites dist/renderer " +
    "continuously, and packing while it runs is the exact precondition that shifted app.asar's file " +
    "offsets on 2026-09-12 (ADS-memory/reports/2026-09-12-packaging-asar-corruption.md). Stop it " +
    "before packaging."
  );
}

/** Why uncommitted edits under the packaged surface block packaging — the concrete shape "another
 *  agent or human is editing this" takes in a git-tracked repo, and unlike an mtime age, empty on a
 *  fresh CI checkout by construction (there is nothing to diff against). */
function gitDirtyProblem(gitDirtyPaths) {
  if (gitDirtyPaths.length === 0) return null;
  return (
    `apps/desktop has uncommitted changes under the packaged surface: ${gitDirtyPaths.join(", ")}. ` +
    "A tree with edits in flight is exactly the state that produced a corrupt, signed app.asar on " +
    "2026-09-12 — commit or stash the changes, or wait for whoever is editing, before packaging."
  );
}

/** Why files changing DURING the check blocks packaging — the live signal git cannot provide for
 *  build output that is gitignored (dist/renderer is never tracked, so git-dirty is blind to it). */
function movingProblem(movingPaths) {
  if (movingPaths.length === 0) return null;
  return (
    `apps/desktop is still being written to: ${movingPaths.join(", ")} changed during this check. ` +
    "Wait for whatever is producing that output to finish before packaging."
  );
}

/**
 * Every reason `apps/desktop` is not quiet enough to package. An empty array means quiet — not proof
 * that nothing will move during the pack a moment later, only that nothing was moving when asked.
 *
 * @param signals
 *   - `viteWatchRunning`: a `vite build --watch` process is currently alive.
 *   - `gitDirtyPaths`: paths under the packaged surface (`src/`, `bin/`, `main.js`) `git status`
 *     reports as modified or untracked, relative to the packaged surface roots.
 *   - `movingPaths`: paths whose live directory snapshot changed between two observations taken a
 *     short interval apart.
 * @returns human-readable problems, ready to print — empty when the tree is quiet.
 * @complexity O(1) plus the length of the path lists it echoes back.
 */
export function treeQuietProblems(signals) {
  return [
    viteWatchProblem(signals.viteWatchRunning),
    gitDirtyProblem(signals.gitDirtyPaths ?? []),
    movingProblem(signals.movingPaths ?? []),
  ].filter((problem) => problem !== null);
}
