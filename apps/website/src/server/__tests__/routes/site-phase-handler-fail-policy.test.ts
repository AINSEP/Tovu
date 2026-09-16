import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerSiteRoutes } from "../../inbound/public-http/routes/site/pages.js";
import { registerResolvePhase } from "../../../platform/routing/routing.js";
import type { RouteDeps } from "../../routes/types.js";
import { startTestServer } from "../helpers/http-test-server.js";

/**
 * @file The route-level half of t91 F4.3: `runPhase`'s error policy is per-registration
 * (`onError: "skip" | "fail"`, default `"fail"`), not universal skip. This proves what the
 * DEFAULT actually does through a real HTTP request, not just at `routing.ts`'s own unit level —
 * `routing.phase-lifecycle.test.ts` pins the phase-runner contract directly; this file pins that
 * `routes/site/pages.ts`'s own catch is what a default-policy throw reaches.
 */

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerSiteRoutes(app, deps);
  return { app, deps };
}

test("a default-policy pre_content handler that throws turns GET / into a 500, not served content", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const baseline = await fetch(`${baseUrl}/`);
  const baselineBody = await baseline.text();
  assert.notEqual(baseline.status, 500, `expected the baseline to render, got 500 with body ${baselineBody}`);
  assert.notEqual(
    baselineBody,
    "<h1>Site error</h1>",
    "the baseline composition must actually render a page — otherwise this case would pass for the wrong reason"
  );

  const dispose = registerResolvePhase("pre_content", async () => {
    throw new Error("guard down");
  });
  t.after(dispose);

  // The route's own catch logs this fault (`reportSiteRenderFault`); silence only that expected
  // line so a passing run reads clean, restoring immediately after so an unexpected error from
  // elsewhere in this request is not swallowed too.
  const originalConsoleError = console.error;
  let response: Response;
  try {
    console.error = () => undefined;
    response = await fetch(`${baseUrl}/`);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.status, 500, "a default (fail) policy throw must reach the route's own 500, not be swallowed");
  assert.equal(await response.text(), "<h1>Site error</h1>");
});
