import assert from "node:assert/strict";
import test from "node:test";
import { hkdfSync } from "node:crypto";

import { deriveDailySalt } from "@jini-ai/analytics/site/salt";
import { createAnalyticsIngestBinding, createLocalAnalyticsSink } from "@jini-ai/analytics/site/jini-adapters";

import { analyticsSaltContext } from "../salt-context.js";
import { reportAnalyticsForwardFailure } from "../warn.js";

/**
 * @file The host's injected HKDF wire context keeps the daily salt byte-identical to the
 * pre-extraction host derivation, and the binding hands the package exactly that context.
 */

const ANALYTICS_SEED = "test-site-key-seed-do-not-use-in-prod";

test("the injected host salt context derives the pre-extraction daily salt byte-for-byte", () => {
  const salt = deriveDailySalt({ analyticsSeed: ANALYTICS_SEED, workspaceId: "workspace-1", utcDate: "2026-07-10", saltContext: analyticsSaltContext });
  // PARITY: migration must keep the original host HKDF context byte-for-byte.
  const expected = Buffer.from(hkdfSync("sha256", ANALYTICS_SEED,
    "tovu-analytics-daily-salt-hkdf-v1", "analytics-salt:workspace-1:2026-07-10", 32));
  assert.deepEqual(salt, expected);
  // Value captured from the host's own salt.ts before the move.
  assert.equal(salt.toString("hex"), "deaa2695c592b8e6ba195ba8af1f38cd41b9a2dfb5201759ff2c61103c6229f3");
});

test("the ingest binding passes the host salt context through unchanged", () => {
  const { deps } = createAnalyticsIngestBinding({ deps: {
    clock: {} as never, ids: {} as never, sink: createLocalAnalyticsSink({}), config: {} as never,
    resolveWorkspaceForHost: () => "ws-1", analyticsSeed: "seed",
    saltContext: analyticsSaltContext, reportForwardFailure: reportAnalyticsForwardFailure,
  } });
  assert.equal(deps.saltContext, analyticsSaltContext);
});
