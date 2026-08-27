import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { startTestServer } from "../../__tests__/helpers/http-test-server.js";
import { AGENT_DAEMON_TOKEN_ENV_VAR, requireAgentDaemonToken } from "../../../assistant/daemon-auth.js";
import type { FederatedAdmissionReport } from "../../../assistant/mcp-federation/trust.js";
import { FEDERATION_ADMISSIONS_PATH, registerFederationAdmissionsRoute } from "../federation-admissions-route.js";

/**
 * @file Route-level tests for `GET /api/federation/admissions` (C-009).
 *
 * Deliberately does NOT boot `agent-daemon-server.ts` — that file is a top-level side-effecting
 * script that opens a real port and a real DB connection on import, so nothing in it can be
 * imported by a test (its own module doc). Instead this builds the exact same TWO-PIECE
 * composition that file assembles — `requireAgentDaemonToken()` mounted first, this route mounted
 * after, both on a plain `express()` app on an ephemeral port — which is enough to prove both the
 * auth wiring and the route's own behaviour without a live daemon process anywhere in the loop.
 *
 * The gate's own internal 401/503/match logic already has a dedicated suite
 * (`assistant/__tests__/daemon-auth.test.ts`); this file does not re-derive that. What it proves is
 * narrower and specific to this route: that the path is NOT exempt from the gate (nothing here
 * lists it in `exemptPaths`, matching the real mount site), and that a request which clears the
 * gate gets back exactly the report snapshot this route was handed at registration time — the
 * "boot capture" contract `AttachFederatedToolsResult.reports` -> `registerFederationAdmissionsRoute`
 * -> HTTP response, end to end, with no live daemon required to observe it.
 */

const TOKEN = "test-daemon-token";

function buildApp(reports: readonly { readonly connectionId: string; readonly report: FederatedAdmissionReport }[]): express.Express {
  const app = express();
  // Same ordering as `agent-daemon-server.ts`: the gate mounts first, before any route — including
  // this one, which is deliberately never added to `exemptPaths`.
  app.use(requireAgentDaemonToken({ env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN } }));
  registerFederationAdmissionsRoute(app, { reports });
  return app;
}

async function getAdmissions(baseUrl: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${FEDERATION_ADMISSIONS_PATH}`, { headers });
}

const SAMPLE_REPORT: FederatedAdmissionReport = {
  admitted: [
    {
      toolId: "mcp__higgsfield__generate_image",
      remoteName: "generate_image",
      description: "Generates an image.",
      inputSchema: {},
      declaredAnnotations: { readOnlyHint: false },
      writeAuthorized: true,
    },
  ],
  refused: [{ remoteName: "delete_everything", reason: "remote-declares-destructive" }],
  allowlistedButAbsent: ["typo_tool_name"],
  writeAllowedButNotAllowlisted: ["forgot_to_allowlist"],
};

test("rejects a request with no bearer token — 401, guarded by the same daemon-wide gate as every other route", async (t) => {
  const baseUrl = await startTestServer(buildApp([]), t);

  const res = await getAdmissions(baseUrl);

  assert.equal(res.status, 401);
});

test("rejects a request with the wrong bearer token — 401", async (t) => {
  const baseUrl = await startTestServer(buildApp([]), t);

  const res = await getAdmissions(baseUrl, { authorization: "Bearer the-wrong-token" });

  assert.equal(res.status, 401);
});

test("with the correct bearer token, serves exactly the report snapshot handed to it at registration — no live daemon needed to observe the boot capture", async (t) => {
  const reports = [{ connectionId: "higgsfield", report: SAMPLE_REPORT }];
  const baseUrl = await startTestServer(buildApp(reports), t);

  const res = await getAdmissions(baseUrl, { authorization: `Bearer ${TOKEN}` });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { connections: reports });
});

test("an empty snapshot (no connections reached admission) is served as an empty list, not an error", async (t) => {
  const baseUrl = await startTestServer(buildApp([]), t);

  const res = await getAdmissions(baseUrl, { authorization: `Bearer ${TOKEN}` });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { connections: [] });
});
