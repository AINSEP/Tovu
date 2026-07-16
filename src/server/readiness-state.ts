import type { BootResult } from "./boot-lifecycle";

/**
 * @file ADR-046 Phase 2 (SPEC-030) — process-local holder for the latest `BootResult` snapshot.
 *
 * `/readyz` and the module-status admin route both read this. Defaults to `{ ok: true, modules: [] }`
 * so hermetic test app construction (`createApp(createRouteDeps())`, which never calls
 * `runBootLifecycle`) never sees a stale or undefined readiness state — REQ-07/AC-06.
 */

let snapshot: BootResult = { ok: true, modules: [] };

export function setReadinessSnapshot(next: BootResult): void {
  snapshot = next;
}

export function getReadinessSnapshot(): BootResult {
  return snapshot;
}
