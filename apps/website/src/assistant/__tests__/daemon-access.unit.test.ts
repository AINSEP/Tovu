import assert from "node:assert/strict";
import test from "node:test";

import { DELEGATED_TOOL_CALLS_PATH, isRunScopedRoute } from "../daemon-access.js";

/**
 * @file `isRunScopedRoute` — which daemon routes a run-scoped credential (as opposed to the host's
 * full daemon token) may reach. The allow-list is method + exact path shape, so a matching path
 * under the wrong method, a deeper path, or an unlisted route must all be refused.
 */

test("each allow-listed run-scoped route is accepted for its own method", () => {
  for (const [method, path] of [
    ["GET", "/api/runs/run-1"],
    ["POST", "/api/runs/run-1/cancel"],
    ["GET", "/api/tools/some_tool"],
    ["GET", "/api/components/recharts.bar-chart"],
    ["GET", "/api/active"],
    ["GET", "/api/agents"],
    ["POST", DELEGATED_TOOL_CALLS_PATH],
  ] as const) {
    assert.equal(isRunScopedRoute({ method, path }), true, `${method} ${path}`);
  }
});

test("a listed path under another method, a deeper path, and an unlisted route are refused", () => {
  for (const [method, path] of [
    ["DELETE", "/api/runs/run-1"],
    ["GET", "/api/runs/run-1/cancel"],
    ["GET", "/api/tools/a/b"],
    ["POST", "/api/runs"],
    ["GET", "/api/settings"],
  ] as const) {
    assert.equal(isRunScopedRoute({ method, path }), false, `${method} ${path}`);
  }
});
