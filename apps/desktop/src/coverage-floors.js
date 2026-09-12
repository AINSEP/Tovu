/**
 * @file Per-area coverage floors for `apps/desktop`, as pure functions. The CLI that produces the
 * lcov and calls these is `scripts/check-coverage.mjs`.
 *
 * ## The trap this is shaped around: a coverage percentage cannot see its own scope shrinking
 *
 * Node's `--test-coverage-include` FILTERS WHAT WAS LOADED. It does not force files in. A source
 * file that no test ever imports simply does not appear in the lcov at all — so it leaves the
 * denominator, and **the percentage goes UP**. A floor that reads only percentages is structurally
 * blind to the one regression that matters most: code arriving with no test at all.
 *
 * This is not hypothetical. The 2026-09-12 survey that produced this harness reported the desktop
 * `.ts` area at "80.78% line over 9 files". There are 18 non-test `.ts` files. Ten had no lcov
 * record, the reported number described eight of them, and the missing half had pushed the
 * percentage UP rather than down. The survey's own author wrote that trap down as item 2 of a trap
 * list and was caught by it in the same session. That is how quiet this failure is.
 *
 * The same shape had already eaten a real gate elsewhere in this repo:
 * `check-src-complexity-drift.ts` scans nine directories, four of which no longer exist after a
 * restructure, and `--no-error-on-unmatched-pattern` turns that into silence.
 *
 * ## So the denominator is DISK, never lcov
 *
 * {@link evaluateArea} takes the files found on disk and the coverage records separately. Anything
 * on disk with no coverage record is UNMEASURED, and an unmeasured file that is not on the area's
 * declared `knownUnmeasured` list fails the gate by name. Percentages are computed over what was
 * actually measured; the unmeasured set is reported alongside, every run, so a gap is a listed,
 * bounded, dated fact rather than an absence.
 *
 * ## Why `knownUnmeasured` is a ratchet and not a red gate
 *
 * Nine desktop `.ts` files genuinely have no test today. A gate that is red from birth gets
 * `enabled: false` within a week, which is the noise-then-ignore cycle this whole harness exists to
 * avoid. So existing gaps are grandfathered BY NAME, printed on every run, and cannot grow: a tenth
 * unmeasured file fails. Same mechanic as this repo's complexity debt lists — debt is allowed,
 * invisible debt is not.
 *
 * ## Node's line% is not comparable to anyone else's
 *
 * Node's lcov sets `LF` to EVERY line in the file, comments and blanks included (verified:
 * `keyed-serializer.js` LF:51 / `wc -l` 51; `App.hooks.ts` 1272/1272). This codebase is unusually
 * comment-dense, so these line percentages read HIGHER than a statement-based tool's and must never
 * be compared with a c8, vitest or istanbul number — including `apps/admin`'s vitest coverage.
 */

/** `pct(0, 0)` is 100: a file with no branches is fully branch-covered. Correct per file, and
 *  dangerous per area — which is why {@link evaluateArea} never relies on it to decide whether an
 *  area was measured at all.
 *  @complexity O(1). */
export function pct(hit, found) {
  return found === 0 ? 100 : (hit / found) * 100;
}

/** Test files and type-declaration files are not production source and never count toward a floor.
 *  @complexity O(1). */
export function isMeasurableSource(relPath) {
  if (/\.(test|spec)\.(js|cjs|mjs|ts|tsx|mts)$/.test(relPath)) return false;
  if (relPath.endsWith(".d.ts")) return false;
  return true;
}

/** Sums the six lcov counters across a set of file records.
 *  @complexity O(n). */
function total(records) {
  const sum = { lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 };
  for (const r of records) {
    sum.lf += r.lf;
    sum.lh += r.lh;
    sum.brf += r.brf;
    sum.brh += r.brh;
    sum.fnf += r.fnf;
    sum.fnh += r.fnh;
  }
  return sum;
}

/**
 * Which declared floors this area misses. Only the axes the area actually configures are checked —
 * the `.ts` area deliberately sets no `funcs` floor, because its measured 22.54% would lock in the
 * badness and make it invisible, which is the disease rather than the cure.
 *
 * @complexity O(1).
 */
function floorFailures(area, measured) {
  const actual = {
    line: pct(measured.lh, measured.lf),
    branch: pct(measured.brh, measured.brf),
    funcs: pct(measured.fnh, measured.fnf),
  };
  const failures = [];
  for (const axis of ["line", "branch", "funcs"]) {
    const floor = area.floors?.[axis];
    if (typeof floor === "number" && actual[axis] < floor) {
      failures.push(`${axis} ${actual[axis].toFixed(2)}% < floor ${floor}%`);
    }
  }
  return { actual, failures };
}

/**
 * Evaluate one configured area.
 *
 * @param area `{ id, floors?, knownUnmeasured?, minFilesOnDisk? }`.
 * @param onDisk repo-relative paths of this area's production files, as found on the filesystem.
 * @param coverage `Map<relPath, {lf,lh,brf,brh,fnf,fnh}>` from the lcov.
 * @returns `{ id, actual, measuredCount, unmeasured, newlyUnmeasured, recovered, failures }`.
 *   `failures` empty means the area passes.
 * @complexity O(n) in the area's files.
 */
export function evaluateArea(area, onDisk, coverage) {
  const known = new Set(area.knownUnmeasured ?? []);
  const measuredPaths = onDisk.filter((p) => coverage.has(p));
  const unmeasured = onDisk.filter((p) => !coverage.has(p));

  const measured = total(measuredPaths.map((p) => coverage.get(p)));
  const { actual, failures } = floorFailures(area, measured);

  // A file with no coverage record that nobody declared. This is the check the percentages cannot
  // make, and the reason this function takes `onDisk` at all.
  const newlyUnmeasured = unmeasured.filter((p) => !known.has(p));
  if (newlyUnmeasured.length > 0) {
    failures.push(
      `${newlyUnmeasured.length} file(s) have NO coverage record and are not in knownUnmeasured: ` +
        `${newlyUnmeasured.join(", ")}. Add a test, or grandfather them explicitly with a reason.`
    );
  }

  // Zero files on disk is never a legitimate pass — it means a directory was renamed or a glob went
  // stale, which is precisely how four scopes in `check-src-complexity-drift.ts` went quiet.
  const minOnDisk = area.minFilesOnDisk ?? 1;
  if (onDisk.length < minOnDisk) {
    failures.push(
      `only ${onDisk.length} file(s) found on disk, expected at least ${minOnDisk}. ` +
        `The glob is stale (directory renamed?) or the scan is broken — this is NOT a pass.`
    );
  }

  // A declared gap that now HAS coverage: good news, but the list must shrink or it rots into a
  // permanent exemption nobody revisits.
  const recovered = [...known].filter((p) => coverage.has(p));

  return {
    id: area.id,
    actual,
    measuredCount: measuredPaths.length,
    onDiskCount: onDisk.length,
    unmeasured,
    newlyUnmeasured,
    recovered,
    failures,
  };
}

/** One area's result, rendered. The unmeasured files are named on EVERY run — a gap nobody is told
 *  about is the trap; a gap printed every run is a decision.
 *  @complexity O(n). */
export function formatArea(result, area) {
  const lines = [`  ${result.failures.length === 0 ? "OK  " : "FAIL"}  ${result.id}`];
  const floors = area.floors ?? {};
  for (const axis of ["line", "branch", "funcs"]) {
    const floor = floors[axis];
    const shown = `${result.actual[axis].toFixed(2)}%`;
    lines.push(`          ${axis.padEnd(6)} ${shown.padStart(7)}  ${typeof floor === "number" ? `(floor ${floor}%)` : "(no floor — see coverage-floors.json)"}`);
  }
  lines.push(`          files:  ${result.measuredCount} measured of ${result.onDiskCount} on disk`);
  if (result.unmeasured.length > 0) {
    lines.push(`          UNMEASURED (${result.unmeasured.length}, known gap — no test loads these):`);
    for (const p of result.unmeasured) lines.push(`            - ${p}`);
  }
  if (result.recovered.length > 0) {
    lines.push(`          NOW COVERED, remove from knownUnmeasured: ${result.recovered.join(", ")}`);
  }
  for (const f of result.failures) lines.push(`          ! ${f}`);
  return lines.join("\n");
}
