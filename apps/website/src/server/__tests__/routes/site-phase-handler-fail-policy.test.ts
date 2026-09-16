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

test("a default-policy post_content handler that throws turns GET /:slug for a missing post into a logged 500, not a hung request", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const url = `${baseUrl}/no-such-post-fail-policy`;

  // Baseline: a slug with no post must 404 today, or this case would pass for the wrong reason.
  const baseline = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
  await baseline.text();
  assert.equal(baseline.status, 404, "baseline: a slug with no post must 404, or this case passes for the wrong reason");

  const dispose = registerResolvePhase("post_content", async () => {
    throw new Error("post guard down");
  });
  t.after(dispose);

  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  t.after(() => process.off("unhandledRejection", onUnhandled));

  const logged: unknown[][] = [];
  const originalConsoleError = console.error;
  let response: Response;
  try {
    console.error = (...args: unknown[]): void => {
      logged.push(args);
    };
    // The 5s timeout is what turns the pre-fix hang into a visible failure instead of a stuck run.
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.status, 500, "a default-policy post_content throw must reach the route's own 500, not hang with no response");
  assert.equal(await response.text(), "<h1>Site error</h1>");
  assert.deepEqual(
    logged.filter(([first]) => typeof first === "string" && first.startsWith("[site/pages]")).map(([first]) => first),
    ["[site/pages] GET /:slug failed (slug=no-such-post-fail-policy)"]
  );
  const [, loggedError] = logged.find(([first]) => typeof first === "string" && first.startsWith("[site/pages]")) ?? [];
  assert.ok(loggedError instanceof Error);
  assert.equal(loggedError.message, "post guard down");
  assert.deepEqual(unhandled, []);
});
