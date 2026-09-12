/**
 * @file The staleness predicate `scripts/stage-payload.mjs` uses to refuse a shell whose build
 * output is older than its own source. Pure, so it can be tested without a filesystem or a
 * packaging run.
 *
 * **The defect this exists for.** Until 2026-09-12 `stage-payload.mjs` checked only that each
 * shell's marker file EXISTED. A packaged app therefore shipped an `apps/admin` bundle dated
 * Aug 31 — twelve days stale, missing two committed bug fixes — and the package step reported
 * SUCCESS. The user-visible failure rendered as silence for hours.
 *
 * The migration-count check that already lived in that script had the right idea and the wrong
 * severity: it wrote a WARNING to stderr and let the script exit 0, so it was invisible in practice
 * too. A check that runs, finds the problem, and reports success is the failure class this whole
 * harness exists to end; both are `fail()` now.
 */

const MS_PER_DAY = 86_400_000;

/** The fields of a `stage-payload.mjs` shell entry the staleness message names. */
export interface StalenessShell {
  relative: string;
  marker: string;
  buildWith: string;
}

/**
 * Whether a file is a real INPUT to a shell's bundle, for freshness purposes.
 *
 * Test files are not. This is not a theoretical nicety: the first end-to-end run of the staleness
 * guard (2026-09-12) refused `apps/admin/dist` because the newest thing under `apps/admin/src` was
 * `__tests__/unit/app-sites-section-visibility.unit.test.tsx`, edited 77 minutes after the bundle
 * was built. Nothing about that file reaches the bundle, so the refusal was noise — and a gate that
 * refuses for reasons the reader knows are irrelevant is a gate people learn to bypass, which is
 * the failure mode this harness exists to avoid.
 *
 * Deliberately conservative: only the two shapes this repo uses to mean "not shipped" are excluded
 * (`__tests__/` directories and `.test.`/`.spec.` basenames). Anything else counts as an input, so
 * the error is on the side of refusing to package.
 *
 * @complexity O(1).
 */
export function isBundleInput(relPath: string): boolean {
  const normalized = relPath.split("\\").join("/");
  if (normalized.includes("/__tests__/") || normalized.startsWith("__tests__/")) return false;
  if (normalized.includes("/__measurements__/")) return false;
  return !/\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized);
}

/**
 * Why this shell must not be staged, or `null` if it is fine.
 *
 * Returns `null` when either timestamp is 0 — an absent build is the EXISTENCE check's job (it
 * runs first and produces a better message), and an absent source tree means the caller pointed at
 * something this predicate cannot reason about. Silently passing in that second case is a real
 * risk, which is why `stage-payload.mjs` derives `sourceAt` from the shell's own declared
 * `sourceDirs`, and why a missing declaration is a config bug rather than a soft pass.
 *
 * @param builtAt mtime (ms) of the shell's marker file.
 * @param sourceAt newest mtime (ms) anywhere in that shell's own source tree.
 * @param shell `{ relative, marker, buildWith }`.
 * @returns the failure message, or `null`.
 * @complexity O(1).
 */
export function shellStalenessFailure(builtAt: number, sourceAt: number, shell: StalenessShell): string | null {
  if (builtAt === 0 || sourceAt === 0) return null;
  if (builtAt >= sourceAt) return null;

  const ageDays = ((sourceAt - builtAt) / MS_PER_DAY).toFixed(1);
  return (
    `the built shell at ${shell.relative} is STALE — its ${shell.marker} is ${ageDays} day(s) older ` +
    `than its own source. Packaging this ships a bundle that does not contain committed changes, ` +
    `which is exactly the failure that shipped a twelve-day-old admin bundle on 2026-09-12 while ` +
    `this step reported success. Rebuild it with: ${shell.buildWith}`
  );
}

export { MS_PER_DAY };
