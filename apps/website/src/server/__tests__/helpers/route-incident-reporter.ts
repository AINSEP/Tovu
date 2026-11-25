/**
 * @file The one route-incident fixture for tests that call a Jini route's `handle` directly (P4-T3b).
 * A route's in-route incident goes through `reportInternalError`; in production that is the owning
 * site's reporter (`createReporterRouteInternalError`), so a test binds the same factory over a
 * recording reporter instead of the retired legacy sink. Each call builds a fresh reporter: no two
 * tests share incident memory, and a test that needs one ID across several boundaries passes the
 * same instance to each of them.
 */
import assert from "node:assert/strict";
import type { ReportRouteInternalError, RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { NOOP_OPERATION_TRACKER } from "@jini-ai/core/errors/reporter";
import { createRecordingReporter } from "@jini-ai/core/errors/testing";
import { createReporterRouteInternalError } from "@jini-ai/http-kit";

/** Fixed time of every fixture record. */
const FIXTURE_ISO = "2026-01-01T00:00:00.000Z";

/** Enough IDs for any single test. The `7E57` group keeps every ID non-numeric, so no PII pattern (card numbers) can rewrite it in a message. */
const FIXTURE_ERROR_IDS = Array.from({ length: 256 }, (_, index) => `ERR-7E57-0000-0000-${index.toString(16).toUpperCase().padStart(4, "0")}`);

/** What one fixture hands a test: the route port to bind, and the recorder behind it. */
export type RouteIncidentFixture = ReturnType<typeof createRecordingReporter> & {
  /** Bind as a route's `reportInternalError`; every call is one record through `reporter`. */
  readonly reportInternalError: ReportRouteInternalError;
  /** Bind as a route host's or mount's `errors`: the same reporter, with operation tracking off. */
  readonly errors: RouteErrorPorts;
};

/**
 * A fresh reporter-backed `reportInternalError` and the recording reporter it writes through.
 * @returns `reportInternalError` and `errors` plus `reporter`, `entries` (host records) and `reports` (tracker reports) of the same instance.
 */
export function createRouteIncidentReporter(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): RouteIncidentFixture {
  const recorded = createRecordingReporter({ ids: FIXTURE_ERROR_IDS, iso: FIXTURE_ISO });
  return {
    ...recorded,
    reportInternalError: createReporterRouteInternalError({ reporter: recorded.reporter }),
    errors: { reporter: recorded.reporter, observability: { trackOperation: () => NOOP_OPERATION_TRACKER } },
  };
}

/**
 * The reporter-backed twin of the retired console-line assertion: exactly one host record per expected
 * diagnostic, each under `step`, with a well-formed error ID and a (redacted) diagnostic matching the regex.
 * @returns the recorded error IDs, in order, so a test can compare them with the reply's `errorId` / `requestId`.
 */
export function assertIncidentDiagnostics(
  { incidents, step, diagnostics }: { incidents: Pick<RouteIncidentFixture, "entries">; step: string; diagnostics: readonly RegExp[] },
  _optional: Record<string, never> = {},
): string[] {
  assert.equal(incidents.entries.length, diagnostics.length);
  return incidents.entries.map((entry, index) => {
    const meta = entry.meta as { errorId: string; step: string; diagnostic: string };
    assert.match(meta.errorId, /^ERR-(?:[0-9A-F]{4}-){3}[0-9A-F]{4}$/);
    assert.equal(meta.step, step);
    assert.match(meta.diagnostic, diagnostics[index]!);
    return meta.errorId;
  });
}
