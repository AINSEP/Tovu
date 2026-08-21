import assert from "node:assert/strict";
import test from "node:test";

import {
  AnalyticsDisabledError,
  AnalyticsPiiRejectedError,
  AnalyticsValidationError,
  AnalyticsWorkspaceUnresolvedError,
} from "../index.js";
import {
  AnalyticsDisabledError as DirectAnalyticsDisabledError,
  AnalyticsPiiRejectedError as DirectAnalyticsPiiRejectedError,
  AnalyticsValidationError as DirectAnalyticsValidationError,
  AnalyticsWorkspaceUnresolvedError as DirectAnalyticsWorkspaceUnresolvedError,
} from "../ports.js";

/**
 * @file `index.ts` is this module's ADR-009 typed-call boundary ("other modules import from here,
 * never via deep paths" — the barrel's own file header) — but nothing inside this repo actually
 * imports through it: every real caller reaches `ports.js`/`ingest.js`/etc. directly, and the
 * barrel's own re-exports were consequently never once imported by any test either. That is a real
 * gap in this file specifically (a barrel is trivial, but a broken re-export — wrong name, stale
 * path, an accidentally-omitted export — would only ever be caught by an external package actually
 * trying to import it), not a reason to delete it: `ANALYTICS_NAMESPACE`-style external consumption
 * is exactly what this boundary exists for. Verifies the re-exports are the SAME class references
 * as importing the concrete module directly (a live binding, not a duplicate/shadow declaration).
 */

test("index.ts re-exports the same AnalyticsConfigPort error classes as ports.ts, not copies", () => {
  assert.equal(AnalyticsDisabledError, DirectAnalyticsDisabledError);
  assert.equal(AnalyticsPiiRejectedError, DirectAnalyticsPiiRejectedError);
  assert.equal(AnalyticsValidationError, DirectAnalyticsValidationError);
  assert.equal(AnalyticsWorkspaceUnresolvedError, DirectAnalyticsWorkspaceUnresolvedError);
});

test("index.ts's re-exported error classes are real, throwable Error subclasses", () => {
  const err = new AnalyticsPiiRejectedError("boundary check");
  assert.ok(err instanceof Error);
  assert.ok(err instanceof AnalyticsPiiRejectedError);
  assert.equal(err.message, "boundary check");
});
