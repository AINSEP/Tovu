import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { AssistantExecutionRouteDeps } from "../execution-deps.js";

/**
 * @file Proves `--experimental-test-module-mocks` actually unlocks `mock.module()` in this repo,
 * end to end through the real route -- not just that the API exists.
 *
 * `test-agent.ts` calls `detectAgents()` from `@jini-ai/agent-runtime` as a direct static import
 * (no injectable dep), which is why `admin-assistant-execution-routes.test.ts` and
 * `resolve-test-agent-outcome.ts` both document the installed/authenticated/model-mismatch/success
 * branches as reachable only via a real, host-dependent CLI probe, or via `mock.module()`.
 *
 * This file deliberately does NOT build its Express app through `createRouteDeps()`
 * (`../../../../app.js`), unlike every other route test in this repo. `app.ts` statically imports
 * `createAssistantExecutionModule`, which statically imports `test-agent.ts`, which statically
 * imports `@jini-ai/agent-runtime` -- so importing anything from `app.js` (even just for its
 * `createRouteDeps` export) loads the REAL `detectAgents` and binds `test-agent.ts`'s copy to it
 * before a test body ever runs. `mock.module()` cannot retroactively change a binding a module
 * already resolved at its first load, so registering the mock inside the test and then re-importing
 * `test-agent.js` still returns the same already-loaded module with the real dependency baked in --
 * this was confirmed by hand while building this test (a mock through the `app.js`/`createRouteDeps`
 * path silently no-ops: no error, but the route still calls the real `detectAgents`).
 *
 * So this test builds the two dependencies `test-agent.ts` actually needs by hand -- a
 * `res.locals.principal` and a two-field `AssistantExecutionRouteDeps` -- instead of the full
 * `RouteDeps` bag, so `@jini-ai/agent-runtime` is not imported by anything until the mock is already
 * registered.
 */

const WORKSPACE_ID = "workspace-local";
const TEST_AGENT_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/execution/test-agent`;

function post(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("test-agent: an authenticated CLI offering the requested model reports ok:true, via a mocked detectAgents() -- no real CLI on PATH required", async (t) => {
  const detectAgents = t.mock.fn(async () => [
    {
      id: "mocked-cli",
      name: "Mocked CLI",
      bin: "mocked-cli",
      versionArgs: ["--version"],
      streamFormat: "text",
      models: [{ id: "model-a", label: "Model A" }],
      modelsSource: "fallback",
      available: true,
      authStatus: "ok",
      version: "3.1.4",
    },
  ]);
  // `namedExports` REPLACES the module's whole export set, not just the key(s) given -- so a bare
  // `{ detectAgents }` here breaks every OTHER consumer this process still needs
  // `@jini-ai/agent-runtime` for (`test-agent.ts`'s own import chain, through `#src/assistant/index`,
  // reaches `byok-provider-turn.ts`, which needs the package's real `runAnthropicToolTurn`). Loading
  // the real module first and spreading it keeps everything else real and overrides only the one
  // function this test cares about. This import is also what makes the mock registration below the
  // module's first-ever load in this process -- see this file's header on why that ordering matters.
  const real = await import("@jini-ai/agent-runtime");
  t.mock.module("@jini-ai/agent-runtime", {
    namedExports: { ...real, detectAgents },
  });

  const { registerAdminAssistantTestAgentRoute } = await import("../test-agent.js");

  const app = express();
  app.use(express.json());
  // Stands in for `requireAdminSession` -- every real caller of this route already passed that
  // middleware first; skipping it here keeps this test isolated to the one thing under test.
  app.use((_req, res, next) => {
    res.locals.principal = { id: "principal-1" };
    next();
  });
  // `test-agent.ts` never reads `siteAssistantCredentialRepo`/`siteAssistantSecretSealer` (confirmed
  // by reading the route -- only `workspaceId`/`authorize` are touched), but `AssistantExecutionRouteDeps`
  // requires all four. Throwing stubs keep this test type-correct without depending on the tsc
  // exclusion for `__tests__`, and turn "the route's contract changed" into a loud test failure
  // instead of a silent gap.
  const unusedByThisRoute = (member: string) => (): never => {
    throw new Error(`test-agent.ts is not expected to call ${member}`);
  };
  const deps: AssistantExecutionRouteDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test-only: always allowed" }),
    siteAssistantCredentialRepo: {
      findByWorkspaceId: unusedByThisRoute("siteAssistantCredentialRepo.findByWorkspaceId"),
      upsert: unusedByThisRoute("siteAssistantCredentialRepo.upsert"),
      clearKey: unusedByThisRoute("siteAssistantCredentialRepo.clearKey"),
    },
    siteAssistantSecretSealer: {
      seal: unusedByThisRoute("siteAssistantSecretSealer.seal"),
      open: unusedByThisRoute("siteAssistantSecretSealer.open"),
    },
  };
  registerAdminAssistantTestAgentRoute(app, deps);
  const server = app.listen(0);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("test setup: expected a bound TCP address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const res = await post(baseUrl, TEST_AGENT_PATH, { agentId: "mocked-cli", model: "model-a" });

  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { ok: boolean; message: string };
  assert.equal(body.ok, true);
  assert.equal(body.message, "Mocked CLI 3.1.4 is installed and authenticated, and offers 'model-a'.");
  // Proves the route reached the mock rather than a real PATH scan: exactly one call, with no args.
  assert.equal(detectAgents.mock.callCount(), 1);
  assert.deepEqual(detectAgents.mock.calls[0]?.arguments, []);
});
