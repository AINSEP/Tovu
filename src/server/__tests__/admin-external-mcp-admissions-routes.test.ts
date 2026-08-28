import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR, requireAgentDaemonToken } from "../../assistant/daemon-auth.js";
import type { FederatedAdmissionReport } from "../../assistant/mcp-federation/trust.js";
import { registerFederationAdmissionsRoute } from "../agent-daemon/federation-admissions-route.js";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";

/**
 * @file Route-level tests for `GET .../mcp-servers/admissions` (C-008) — real Express app, real
 * session auth, and a REAL stand-in daemon process bound to the exact origin
 * `admin/external-mcp/admissions.ts` resolves at module load.
 *
 * `AGENT_DAEMON_URL`-equivalent resolution happens ONCE, at module import (`admissions.ts`'s own
 * doc explains why it is not imported from `assistant-daemon-client.ts`), so this file reserves one
 * fixed port before importing anything under test — the same ordering constraint
 * `assistant-proxy-routes.test.ts`'s own `harness()` documents for `server/modules/assistant.ts`.
 * Nothing listens at that port by default, which is exactly the "connection refused" baseline most
 * of these tests want; the two tests that need a live daemon answer bind a real server to that same
 * port for their own duration and tear it down afterward.
 *
 * The headline property, proven directly rather than only by status code: a daemon that cannot
 * report is NEVER `{ connections: [] }` — an empty list reads as "everything was refused", the
 * opposite of "nobody can currently say what was admitted."
 */

const TOKEN = "test-daemon-token-admissions";
const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers/admissions`;

let harnessPromise: Promise<{ buildApp: () => express.Express; daemonPort: number }> | null = null;

function harness() {
  harnessPromise ??= (async () => {
    // Reserve a port, then release it immediately — see this file's own header for why nothing
    // listens here by default.
    const reservation = createServer();
    reservation.listen(0);
    await once(reservation, "listening");
    const daemonPort = (reservation.address() as AddressInfo).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));

    process.env.JINI_AGENT_DAEMON_URL = `http://127.0.0.1:${daemonPort}`;
    process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;

    const { createRouteDeps } = await import("../runtime/composition/app.js");
    const { registerAuthRoutes, requireAdminSession } = await import("../inbound/admin-http/dev-auth.js");
    const { createExternalMcpModule } = await import("../runtime/composition/modules/external-mcp.js");

    function buildApp(): express.Express {
      const deps = createRouteDeps();
      const app = express();
      app.use(express.json());
      registerAuthRoutes(app, deps);
      app.use("/api/admin", requireAdminSession(deps));
      createExternalMcpModule(deps).registerRoutes?.(app);
      return app;
    }

    return { buildApp, daemonPort };
  })();
  return harnessPromise;
}

/** Binds a REAL stand-in daemon — `requireAgentDaemonToken` + the real
 *  `registerFederationAdmissionsRoute`, the exact two-piece composition
 *  `federation-admissions-route.unit.test.ts` already proves — to the harness's fixed port, for the
 *  calling test's own duration. */
async function withStandInDaemon(
  t: import("node:test").TestContext,
  daemonPort: number,
  reports: readonly { readonly connectionId: string; readonly report: FederatedAdmissionReport }[],
): Promise<void> {
  const app = express();
  app.use(requireAgentDaemonToken({ env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN } }));
  registerFederationAdmissionsRoute(app, { reports });
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(daemonPort, () => resolve());
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
}

function req(baseUrl: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}${PATH}`, { headers: { cookie } });
}

test("the admissions route requires a session", async (t) => {
  const { buildApp } = await harness();
  const baseUrl = await startTestServer(buildApp(), t);

  const response = await req(baseUrl, "");
  assert.equal(response.status, 401);
});

test("a workspace id that is not this site's is 404", async (t) => {
  const { buildApp } = await harness();
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);

  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-this-site/mcp-servers/admissions`, { headers: { cookie } });
  assert.equal(response.status, 404);
});

test("a live daemon's real report is relayed verbatim", async (t) => {
  const { buildApp, daemonPort } = await harness();
  const reports = [
    {
      connectionId: "higgsfield",
      report: {
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
        refused: [],
        allowlistedButAbsent: [],
        writeAllowedButNotAllowlisted: [],
      } satisfies FederatedAdmissionReport,
    },
  ];
  await withStandInDaemon(t, daemonPort, reports);
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);

  const response = await req(baseUrl, cookie);
  const body = (await response.json()) as { connections: unknown };

  assert.equal(response.status, 200);
  assert.deepEqual(body, { connections: reports });
});

test("no daemon listening at all — 503 with a distinguishable code, never an empty connections list", async (t) => {
  const { buildApp } = await harness();
  // Deliberately no `withStandInDaemon` call — the harness's reserved port has nothing listening on
  // it, which is the whole point of reserving it that way.
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);

  const response = await req(baseUrl, cookie);
  const body = (await response.json()) as { error: string; code: string; connections?: unknown };

  assert.equal(response.status, 503);
  assert.equal(body.code, "AGENT_DAEMON_UNAVAILABLE");
  assert.equal("connections" in body, false, "a down daemon must not answer with a connections list at all, empty or otherwise");
});

test("the daemon answers but rejects the token — still 503, never an empty connections list", async (t) => {
  const { buildApp, daemonPort } = await harness();
  await withStandInDaemon(t, daemonPort, []);
  const savedToken = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  // Simulates Tovu's own side losing track of the daemon's token — the daemon is up, but answers
  // 401 to a caller carrying the wrong one. This must read the same as "the daemon is down", not
  // leak an empty connections list just because SOMETHING answered.
  process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = "not-the-real-token";
  t.after(() => {
    if (savedToken === undefined) delete process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
    else process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = savedToken;
  });
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);

  const response = await req(baseUrl, cookie);
  const body = (await response.json()) as { code: string; connections?: unknown };

  assert.equal(response.status, 503);
  assert.equal(body.code, "AGENT_DAEMON_UNAVAILABLE");
  assert.equal("connections" in body, false);
});

test("no daemon token configured at all — 503 before any request is even attempted", async (t) => {
  const { buildApp, daemonPort } = await harness();
  // Daemon is up and would answer correctly — proves this branch is reached BEFORE any fetch, not
  // merely because nothing was listening.
  await withStandInDaemon(t, daemonPort, []);
  const savedToken = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  delete process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  t.after(() => {
    if (savedToken !== undefined) process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = savedToken;
  });
  const { baseUrl, cookie } = await bootAuthenticated(buildApp(), t);

  const response = await req(baseUrl, cookie);
  const body = (await response.json()) as { error: string; code: string };

  assert.equal(response.status, 503);
  assert.equal(body.code, "AGENT_DAEMON_UNAVAILABLE");
  assert.match(body.error, /token/i);
});
