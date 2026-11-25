/**
 * @file The deterministic reporter fixture for tests that build a tool executor, BYOK surface or
 * daemon scope but do not assert on incidents. `reporter` is required on every such seam (P4-T3), and
 * a test must never fall back to the production `createTovuErrorReporter` (console + live tracker),
 * so this hands each caller its own recording reporter with a fixed clock and sequential ERR- ids.
 */
import { createRecordingReporter } from "@jini-ai/core/errors/testing";

/** Enough ids for any single test; the sequence throws past its end, which would surface as a missing id. */
const FIXTURE_ERROR_IDS = Array.from({ length: 512 }, (_, index) => `ERR-0000-0000-0000-${index.toString(16).toUpperCase().padStart(4, "0")}`);

/** A fresh recording reporter per call, so no two fixtures share incident memory. */
export function testToolReporter(_required: Record<string, never> = {}, _optional: Record<string, never> = {}) {
  return createRecordingReporter({ ids: FIXTURE_ERROR_IDS, iso: "2026-01-01T00:00:00.000Z" }).reporter;
}
