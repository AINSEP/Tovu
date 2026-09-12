/**
 * @file The rules that keep `apps/desktop`'s quality gates from going quiet. Pure functions only —
 * no spawning, no filesystem — so the whole policy is testable under plain `node --test`. The CLI
 * that actually runs the gates is `scripts/check-gates.ts`.
 *
 * **The defect this exists for.** A 2026-09-12 survey of this repo's existing harness found 11 of
 * 22 `check:*` npm scripts invoked from nowhere at all, and one gate
 * (`development/scripts/check-area-coverage-floor.ts`) fully written, documented, and shipped with
 * its required config file never created — so it had never run once and nothing said so. The
 * `apps/admin` complexity ratchet was 11 violations behind for the same reason: it exists, it is
 * correct, and no CI step or local runner calls it.
 *
 * None of that was a decision anybody made. It is what happens when "this gate is off" is
 * representable as *absence* — a line nobody added, a file nobody created, a script nobody calls.
 * The whole design here is to make "off" a positive, loud, dated assertion instead:
 *
 * 1. {@link formatSummary} prints EVERY gate on every run, including the disabled ones. "Off"
 *    appears in the output of every run rather than in a diff nobody reads.
 * 2. {@link validateManifest} makes `enabled: false` without a reason and a date a hard failure OF
 *    THE RUNNER. Turning a gate off costs a sentence; turning it off invisibly is impossible.
 * 3. {@link detectGateDrift} fails when a gate script exists on disk that the manifest does not
 *    list. This is the one that `check-area-coverage-floor.ts` could not have survived.
 * 4. {@link validateManifest} also ages disablements out: a gate off longer than `maxDisabledDays`
 *    fails until someone re-confirms the date. Debt is allowed; INVISIBLE debt is not.
 *
 * Note the asymmetry in what counts as failure here: a *disabled* gate never fails the run (that is
 * the point of being able to turn one off), but a disabled gate that is undocumented, undated, or
 * stale DOES. The thing being enforced is not "all gates are on" — it is "no gate is off by
 * accident".
 */

/** One entry of `quality-gates.json`'s `gates`, as parsed and NOT yet validated: every field is
 *  optional because {@link validateManifest} is what reports a missing one. */
export interface GateEntry {
  id?: string;
  run?: string;
  enabled?: boolean;
  disabledReason?: string;
  disabledOn?: string;
}

/** The parsed `quality-gates.json`. `gates` is `unknown` until {@link validateManifest} has checked
 *  that it is an array at all. */
export interface GateManifest {
  gates?: unknown;
  maxDisabledDays?: number;
}

/** A gate command's exit status: `null` when it was killed by a signal or never spawned. */
export type GateExitCode = number | null;

/** How long a gate may stay disabled before the runner demands the date be re-confirmed. */
const DEFAULT_MAX_DISABLED_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Whole days between two ISO `YYYY-MM-DD` dates. Deliberately date-only arithmetic rather than
 * `Date.now()` deltas: a disablement recorded "today" must read as 0 days regardless of the clock
 * time either side, or a gate disabled at 23:00 would age a day at midnight.
 *
 * @param fromIso the `disabledOn` date.
 * @param toIso today, as `YYYY-MM-DD`.
 * @returns whole days elapsed, or `null` if either date is unparseable.
 * @complexity O(1).
 */
function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * Problems with ONE disabled gate's paperwork. Split out of {@link validateManifest} so that
 * function stays under this repo's own complexity ceiling of 9 — the same ceiling this harness
 * enforces on everything else, which it would be absurd to exempt itself from.
 *
 * @complexity O(1).
 */
function disabledGateProblems(gate: GateEntry, today: string, maxDisabledDays: number): string[] {
  const problems: string[] = [];
  const where = `gate "${gate.id}"`;
  if (!gate.disabledReason) {
    problems.push(`${where} is disabled with no "disabledReason". A gate may be turned off, but not silently.`);
  }
  if (!gate.disabledOn) {
    problems.push(`${where} is disabled with no "disabledOn" date, so nothing can tell how long it has been off.`);
    return problems;
  }
  const age = daysBetween(gate.disabledOn, today);
  if (age === null) {
    problems.push(`${where} has an unparseable "disabledOn" (${gate.disabledOn}); expected YYYY-MM-DD.`);
  } else if (age > maxDisabledDays) {
    problems.push(
      `${where} has been disabled ${age} days (since ${gate.disabledOn}, limit ${maxDisabledDays}). ` +
        `Re-enable it, or re-confirm the decision by updating "disabledOn" and "disabledReason".`
    );
  }
  return problems;
}

/** Problems with ONE gate entry: shape, uniqueness, and (when off) its paperwork. Split out so
 *  {@link validateManifest} stays under the 9/9 ceiling this harness enforces on everything else —
 *  which it would be absurd to exempt itself from.
 *  @complexity O(1). */
function gateProblems(gate: GateEntry, seen: Set<string>, today: string, maxDisabledDays: number): string[] {
  if (!gate.id || !gate.run) {
    return [`every gate needs an "id" and a "run"; found ${JSON.stringify(gate)}.`];
  }
  const problems = seen.has(gate.id) ? [`duplicate gate id "${gate.id}".`] : [];
  seen.add(gate.id);
  if (gate.enabled === false) problems.push(...disabledGateProblems(gate, today, maxDisabledDays));
  return problems;
}

/**
 * Every reason this manifest is not a legitimate description of the harness. An empty array means
 * the manifest itself is sound — it says nothing about whether the gates pass.
 *
 * @param manifest the parsed `quality-gates.json`.
 * @param today `YYYY-MM-DD`, injected rather than read from the clock so the ratchet is testable.
 * @returns human-readable problems, one per line, ready to print.
 * @complexity O(n) in gates.
 */
export function validateManifest(manifest: GateManifest | null | undefined, today: string): string[] {
  const gates = manifest?.gates;
  if (!Array.isArray(gates)) return ['quality-gates.json has no "gates" array.'];
  if (gates.length === 0) return ['quality-gates.json lists zero gates — the harness would pass by measuring nothing.'];

  // `!`: `gates` is an array, so `manifest` was not null or undefined.
  const maxDisabledDays = manifest!.maxDisabledDays ?? DEFAULT_MAX_DISABLED_DAYS;
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const gate of gates as GateEntry[]) problems.push(...gateProblems(gate, seen, today, maxDisabledDays));
  return problems;
}

/**
 * Gate scripts present on disk that no manifest entry runs — the check that makes a written-but-
 * unwired gate impossible to leave lying around. Matching is by substring of the `run` command
 * rather than by exact path, because a `run` legitimately carries flags and a wrapper
 * (`node scripts/check-coverage.ts --areas ...`).
 *
 * @param gates the manifest's gate list (disabled ones count as registered — being off is a
 *   decision, being absent is not).
 * @param scriptNames basenames of the gate scripts found on disk, e.g. `["check-coverage.ts"]`.
 * @returns the basenames nothing references.
 * @complexity O(gates x scripts); both are single digits here.
 */
export function detectGateDrift(gates: readonly GateEntry[] | null | undefined, scriptNames: readonly string[]): string[] {
  const commands = (gates ?? []).map((gate) => String(gate.run ?? ""));
  return scriptNames.filter((name) => !commands.some((command) => command.includes(name)));
}

/** One line per gate, in manifest order. `PASS`/`FAIL` for what ran, `DISABLED` for what did not —
 *  the disabled ones carry their reason and date so the summary is self-explaining.
 *  @complexity O(1). */
function summaryLine(gate: GateEntry, outcome: GateExitCode | undefined): string {
  if (gate.enabled === false) {
    return `  DISABLED  ${gate.id}  — ${gate.disabledReason ?? "(no reason given)"} [since ${gate.disabledOn ?? "?"}]`;
  }
  return `  ${outcome === 0 ? "PASS    " : "FAIL    "}  ${gate.id}`;
}

/**
 * The whole run, rendered. Every gate appears — that is property 1 and the reason this function
 * takes the full manifest rather than only the results.
 *
 * @param gates the manifest's gate list.
 * @param outcomes `Map<gateId, exitCode>` for the gates that actually ran. Keyed by `string |
 *   undefined` because `gates` is unvalidated: a gate with no `id` looks up `undefined`, finds no
 *   outcome, and counts as a failure.
 * @returns the printable summary block.
 * @complexity O(n) in gates.
 */
export function formatSummary(gates: readonly GateEntry[], outcomes: ReadonlyMap<string | undefined, GateExitCode>): string {
  const lines = ["", "=".repeat(66), "DESKTOP GATE SUMMARY", "=".repeat(66)];
  let passed = 0;
  let failed = 0;
  let disabled = 0;

  for (const gate of gates) {
    if (gate.enabled === false) {
      disabled += 1;
    } else if (outcomes.get(gate.id) === 0) {
      passed += 1;
    } else {
      failed += 1;
    }
    lines.push(summaryLine(gate, outcomes.get(gate.id)));
  }

  lines.push("-".repeat(66));
  lines.push(`  ${gates.length} gates: ${passed} pass, ${failed} fail, ${disabled} DISABLED`);
  return lines.join("\n");
}

/**
 * True when a gate's result should fail the run. A gate that never produced a numeric exit code —
 * killed by a signal, or a command that could not be spawned at all — is a FAILURE, never a pass.
 * That asymmetry is deliberate: this repo has already shipped a packaged app off a step that
 * "succeeded" without doing anything, and an absent exit code is the same shape of evidence.
 *
 * @complexity O(1).
 */
export function isFailure(exitCode: GateExitCode | undefined): boolean {
  return exitCode !== 0;
}

export { DEFAULT_MAX_DISABLED_DAYS, daysBetween };
