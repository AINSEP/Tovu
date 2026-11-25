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
export function probeVerdict(
  { readings, expected }: { readings: ProbeReadings; expected: { electronVersion: string; platform: string } },
  { tolerance = 1.25 }: { tolerance?: number } = {},
): ProbeVerdict {
  const blocking: string[] = [];
  if (readings.electronVersion !== expected.electronVersion) blocking.push("unexpected Electron version");
  if (readings.platform !== expected.platform) blocking.push("unexpected platform");
  if (!readings.profileVerified) blocking.push("disposable profile identity not verified");
  if (readings.negativeControlDetectedLoss !== true) blocking.push("negative control did not detect storage loss");
  const capProblems = capReasons(readings, readings.capBytes * tolerance);
  const { clearCache, clearCodeCaches, diskCache, diskCodeCache } = readings.survival;
  const cacheGo = blocking.length === 0 && survived(clearCache) && survived(diskCache);
  const codeGo = blocking.length === 0 && survived(clearCodeCaches) && survived(diskCodeCache);
  return {
    cap: blocking.length === 0 && capProblems.length === 0 ? "go" : "no-go",
    clearOps: { clearCache: cacheGo ? "go" : "no-go", clearCodeCaches: codeGo ? "go" : "no-go" },
    reasons: [...blocking, ...capProblems, ...(cacheGo ? [] : ["Cache survival not proven by both API and disk cases"]),
      ...(codeGo ? [] : ["Code Cache survival not proven by both API and disk cases"])],
  };
}
