/**
 * @file P11 ST-1a.T — the isolated packaged-probe VERDICT. Pure: it turns one probe run's readings
 * into a GO/NO-GO record shaped like `desktop-cache-policy.ts`'s `PackagedEvidence`.
 *
 * Nothing here is imported by the app, and nothing enables anything: `PACKAGED_CACHE_EVIDENCE`
 * stays empty until a REAL packaged Mac run's artifact is reviewed. Every doubt is NO-GO:
 *  - wrong Electron version, platform or an unverified disposable profile → all NO-GO;
 *  - a negative control that did not detect deliberate storage loss → all NO-GO (the probe is blind);
 *  - cap GO needs ≥2 partitions, every reading present, each partition ≤ tolerance × cap, an
 *    uncapped control ABOVE it (the cap is real), and a combined occupancy above it (one shared
 *    undersized pool is not a per-partition cap);
 *  - `clearCache` GO needs BOTH the Electron API case and the unheld disk `Cache` removal case to
 *    keep cookie, Local Storage and IndexedDB; the same conjunction for Code Cache.
 */

export type Go = "go" | "no-go";
export interface PartitionObservation {
  readonly name: string;
  readonly cacheBytes: number | null;
  readonly codeCacheBytes: number | null;
}
export interface SurvivalObservation { readonly cookie: boolean | null; readonly localStorage: boolean | null; readonly indexedDb: boolean | null }
export interface ProbeReadings {
  readonly electronVersion: string;
  readonly platform: string;
  readonly profileVerified: boolean;
  readonly capBytes: number;
  readonly partitions: readonly PartitionObservation[];
  readonly uncappedControlBytes: number | null;
  readonly survival: {
    readonly clearCache: SurvivalObservation | null;
    readonly clearCodeCaches: SurvivalObservation | null;
    readonly diskCache: SurvivalObservation | null;
    readonly diskCodeCache: SurvivalObservation | null;
  };
  readonly negativeControlDetectedLoss: boolean | null;
}
export interface ProbeVerdict {
  readonly cap: Go;
  readonly clearOps: { readonly clearCache: Go; readonly clearCodeCaches: Go };
  readonly reasons: readonly string[];
}

const survived = (observation: SurvivalObservation | null) =>
  observation !== null && observation.cookie === true && observation.localStorage === true && observation.indexedDb === true;

function capReasons(readings: ProbeReadings, limit: number): string[] {
  const reasons: string[] = [];
  const sizes = readings.partitions.map((p) => p.cacheBytes);
  if (readings.partitions.length < 2) reasons.push("fewer than two partitions measured");
  if (sizes.some((bytes) => bytes === null)) reasons.push("a partition cache reading is missing");
  if (sizes.some((bytes) => bytes !== null && bytes > limit)) reasons.push("a partition cache grew above tolerance x cap");
  if (readings.uncappedControlBytes === null || readings.uncappedControlBytes <= limit) reasons.push("the uncapped control did not exceed the cap");
  const combined = sizes.reduce<number>((sum, bytes) => sum + (bytes ?? 0), 0);
  if (combined <= limit) reasons.push("combined occupancy fits one pool: no per-partition evidence");
  return reasons;
}

/**
 * @param required.expected the exact Electron version and platform this evidence may describe.
 * @param optional.tolerance allowed overshoot of the configured cap (default 1.25).
 * @complexity O(partitions).
 */
/** Preconditions that void the whole run: wrong build, wrong platform, unproven profile or control. */
function blockingReasons(
  { readings, expected }: { readings: ProbeReadings; expected: { electronVersion: string; platform: string } },
): string[] {
  const checks: readonly [boolean, string][] = [
    [readings.electronVersion !== expected.electronVersion, "unexpected Electron version"],
    [readings.platform !== expected.platform, "unexpected platform"],
    [!readings.profileVerified, "disposable profile identity not verified"],
    [readings.negativeControlDetectedLoss !== true, "negative control did not detect storage loss"],
  ];
  return checks.filter(([failed]) => failed).map(([, reason]) => reason);
}

/** Each clear op is GO only on a clean run where both its API case and its disk case survived. */
function survivalVerdict({ survival, clean }: { survival: ProbeReadings["survival"]; clean: boolean }) {
  const cacheGo = clean && survived(survival.clearCache) && survived(survival.diskCache);
  const codeGo = clean && survived(survival.clearCodeCaches) && survived(survival.diskCodeCache);
  const survivalReasons = [
    ...(cacheGo ? [] : ["Cache survival not proven by both API and disk cases"]),
    ...(codeGo ? [] : ["Code Cache survival not proven by both API and disk cases"]),
  ];
  return { cacheGo, codeGo, survivalReasons };
}

const goOrNoGo = (ok: boolean): "go" | "no-go" => (ok ? "go" : "no-go");

export function probeVerdict(
  { readings, expected }: { readings: ProbeReadings; expected: { electronVersion: string; platform: string } },
  { tolerance = 1.25 }: { tolerance?: number } = {},
): ProbeVerdict {
  const blocking = blockingReasons({ readings, expected });
  const capProblems = capReasons(readings, readings.capBytes * tolerance);
  const clean = blocking.length === 0;
  const { cacheGo, codeGo, survivalReasons } = survivalVerdict({ survival: readings.survival, clean });
  return {
    cap: goOrNoGo(clean && capProblems.length === 0),
    clearOps: { clearCache: goOrNoGo(cacheGo), clearCodeCaches: goOrNoGo(codeGo) },
    reasons: [...blocking, ...capProblems, ...survivalReasons],
  };
}
