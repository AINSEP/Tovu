import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { ExternalMcpOAuthService, ExternalMcpServerRecord } from "../../assistant/index.js";
import { saveExternalMcpServer } from "../../assistant/index.js";
import type { McpHttpLaunchSpec, McpSessionPort, RemoteToolDescriptor } from "../../assistant/mcp-federation/ports.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { createExternalMcpModule } from "../runtime/composition/modules/external-mcp.js";
import type { ExternalMcpProbeRouteDeps, ExternalMcpProbeSessionFactory } from "../routes/admin/external-mcp/probe.js";
import type { RouteDeps } from "../routes/types.js";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";

/**
 * @file Route-level tests for `POST .../mcp-servers/:serverId/probe` (C-007) — real Express app,
 * real session auth, real store/sealer, a SCRIPTED session (never a real socket).
 *
 * Covers: the guard runs, D-7's stdio refusal, a disabled row, the `needs_reauth` fast path (409,
 * no connection attempted — proven by asserting the scripted `connect` was never called), an
 * unknown server (400), a connect/list failure (502) with the outbound session still closed, a
 * successful probe's shape, and INV-006 — no header, token, or client secret anywhere in the
 * response body, including one obtained through a real OAuth token resolver.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers`;

function req(baseUrl: string, path: string, cookie: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });
}

/** A scripted `McpSessionPort` double — never opens a socket. Records whether `close()` ran, so a
 *  test can prove the `finally`-close safety story rather than merely observing the response. */
function scriptedSession(options: {
  tools?: readonly RemoteToolDescriptor[];
  listToolsThrows?: Error;
  onClose?: () => void;
}): McpSessionPort {
  return {
    async listTools() {
      if (options.listToolsThrows) throw options.listToolsThrows;
      return [...(options.tools ?? [])];
    },
    async callTool() {
      throw new Error("not used by the probe route");
    },
    async close() {
      options.onClose?.();
    },
  };
}

interface BuildOptions {
  connect?: ExternalMcpProbeSessionFactory;
  externalMcpOAuth?: ExternalMcpOAuthService;
}

function buildTestApp(options: BuildOptions = {}): { app: express.Express; deps: RouteDeps } {
  const base = createRouteDeps();
  const probeDeps: ExternalMcpProbeRouteDeps = { ...base, ...(options.externalMcpOAuth ? { externalMcpOAuth: options.externalMcpOAuth } : {}), ...(options.connect ? { connect: options.connect } : {}) };
  // `createExternalMcpModule` only reads the fields it knows about off whatever shape it is handed
  // — passing the widened `probeDeps` through as `RouteDeps` mirrors how `server/deps.ts` composes
  // one real deps object for every module, including this one.
  const deps = probeDeps as unknown as RouteDeps;
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createExternalMcpModule(deps).registerRoutes?.(app);
  return { app, deps };
}

async function saveStdio(deps: RouteDeps, serverId: string, overrides: Partial<Parameters<typeof saveExternalMcpServer>[1]> = {}) {
  await saveExternalMcpServer(
    { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
    {
      workspaceId: deps.workspaceId,
      serverId,
      label: serverId,
      transport: "stdio",
      authMode: "none",
      enabled: true,
      command: "npx",
      args: "-y some-mcp",
      allowedToolNames: "read_thing",
      writeAllowedToolNames: "",
      principalId: "owner",
      ...overrides,
    },
  );
}

async function saveHttp(deps: RouteDeps, serverId: string, overrides: Partial<Parameters<typeof saveExternalMcpServer>[1]> = {}) {
  await saveExternalMcpServer(
    { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
    {
      workspaceId: deps.workspaceId,
      serverId,
      label: serverId,
      transport: "streamable_http",
      authMode: "none",
      enabled: true,
      command: "",
      url: "https://mcp.example.com/mcp",
      args: "",
      allowedToolNames: "generate_image,read_thing",
      writeAllowedToolNames: "generate_image",
      principalId: "owner",
      ...overrides,
    },
  );
}

/** Forces one stored row's `oauthStatus`, bypassing the save-time OAuth machinery — the shortest
 *  path to a fixture in a specific runtime lifecycle state (`needs_reauth`, `connected`, ...) rather
 *  than driving a full OAuth handshake per test. */
async function forceOAuthStatus(deps: RouteDeps, serverId: string, oauthStatus: ExternalMcpServerRecord["oauthStatus"]): Promise<void> {
  const record = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId });
  if (!record) throw new Error(`fixture '${serverId}' was not saved`);
  await deps.externalMcpServerRepo.upsert({ ...record, oauthStatus });
}

test("the probe route requires a session", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const response = await req(baseUrl, `${BASE}/anything/probe`, "", { method: "POST" });
  assert.equal(response.status, 401);
});

test("a workspace id that is not this site's is 404", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, "/api/admin/v1/workspaces/not-this-site/mcp-servers/x/probe", cookie, { method: "POST" });
  assert.equal(response.status, 404);
});

test("an unknown server id is a 400 naming the field, not a 500", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/ghost/probe`, cookie, { method: "POST" });
  const body = (await response.json()) as { code: string; details: { field: string } };

  assert.equal(response.status, 400);
  assert.equal(body.code, "INVALID_MCP_SERVER");
  assert.equal(body.details.field, "id");
});

test("D-7: a stdio row is refused before anything is attempted — the scripted connect is never called", async (t) => {
  let connected = false;
  const connect: ExternalMcpProbeSessionFactory = async () => {
    connected = true;
    throw new Error("must not be reached — stdio must be refused before any connect attempt");
  };
  const { app, deps } = buildTestApp({ connect });
  await saveStdio(deps, "local-tool");
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/local-tool/probe`, cookie, { method: "POST" });
  const body = (await response.json()) as { code: string };

  assert.equal(response.status, 400);
  assert.equal(body.code, "PROBE_UNSUPPORTED_TRANSPORT");
  assert.equal(connected, false, "a stdio row must never reach the session factory — this route must never spawn a child process");
});

test("a disabled row is refused with a clear reason, not treated as unknown", async (t) => {
  const { app, deps } = buildTestApp();
  await saveHttp(deps, "off", { enabled: false });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/off/probe`, cookie, { method: "POST" });
  const body = (await response.json()) as { code: string };

  assert.equal(response.status, 400);
  assert.equal(body.code, "MCP_SERVER_DISABLED");
});

test("needs_reauth is a 409 and never reaches the session factory — must not hang", async (t) => {
  let connected = false;
  const connect: ExternalMcpProbeSessionFactory = async () => {
    connected = true;
    throw new Error("must not be reached");
  };
  const { app, deps } = buildTestApp({ connect });
  await saveHttp(deps, "stale", { authMode: "oauth", oauth: { grant: "authorization_code", clientId: "client-1", scopes: "images:generate" } });
  await forceOAuthStatus(deps, "stale", "needs_reauth");
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/stale/probe`, cookie, { method: "POST" });
  const body = (await response.json()) as { code: string; details: { retryable: boolean; settingsLink: string } };

  assert.equal(response.status, 409);
  assert.equal(body.code, "EXTERNAL_MCP_REAUTH_REQUIRED");
  assert.equal(body.details.retryable, false);
  assert.match(body.details.settingsLink, /stale/);
  assert.equal(connected, false, "a needs_reauth row must never reach the session factory");
});

test("an oauth row that was never connected resolves to a generic 502, distinct from needs_reauth", async (t) => {
  const { app, deps } = buildTestApp();
  await saveHttp(deps, "never-connected", { authMode: "oauth", oauth: { grant: "authorization_code", clientId: "client-1", scopes: "images:generate" } });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/never-connected/probe`, cookie, { method: "POST" });
  const body = (await response.json()) as { code: string };

  assert.equal(response.status, 502);
  assert.equal(body.code, "MCP_SERVER_UNREACHABLE");
});

test("a connect/list failure is a 502, and the session is still closed", async (t) => {
  let closed = false;
  const connect: ExternalMcpProbeSessionFactory = async () => scriptedSession({ listToolsThrows: new Error("boom"), onClose: () => { closed = true; } });
  const { app, deps } = buildTestApp({ connect });
  await saveHttp(deps, "flaky");
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/flaky/probe`, cookie, { method: "POST" });
  const body = (await response.json()) as { code: string };

  assert.equal(response.status, 502);
  assert.equal(body.code, "MCP_SERVER_UNREACHABLE");
  assert.equal(closed, true, "the finally-close must run even when listTools throws after a successful connect");
});

test("a successful probe describes every advertised tool, admitted or not, with the WRITES/DESTRUCTIVE/silent badges", async (t) => {
  let closed = false;
  let seenSpec: McpHttpLaunchSpec | null = null;
  const connect: ExternalMcpProbeSessionFactory = async (spec) => {
    seenSpec = spec;
    return scriptedSession({
      tools: [
        { name: "generate_image", description: "Makes an image.", inputSchema: {}, annotations: { readOnlyHint: false } },
        { name: "drop_everything", description: "Deletes.", inputSchema: {}, annotations: { destructiveHint: true } },
        { name: "silent_tool", description: "Says nothing about itself.", inputSchema: {} },
        { name: "not_allowlisted", description: "Never requested.", inputSchema: {} },
      ],
      onClose: () => { closed = true; },
    });
  };
  const { app, deps } = buildTestApp({ connect });
  // `drop_everything` is deliberately ALSO allowlisted — R3's destructive refusal must hold even for
  // a tool the operator otherwise requested, which is the case worth proving (a name that never
  // cleared the allowlist would be refused for that reason first, per INV-002's check order, and
  // never reach the destructive check at all).
  await saveHttp(deps, "higgs", { allowedToolNames: "generate_image,read_thing,drop_everything" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/higgs/probe`, cookie, { method: "POST" });
  const body = (await response.json()) as {
    probedAt: string;
    tools: { remoteName: string; writeDeclared: boolean; destructiveDeclared: boolean; hintsAbsent: boolean; allowlisted: boolean; admitted: boolean; refusalReason: string | null }[];
  };

  assert.equal(response.status, 200);
  assert.equal(typeof body.probedAt, "string");
  assert.equal(closed, true, "the session must be closed after a successful probe too");
  assert.equal(seenSpec?.url, "https://mcp.example.com/mcp");

  const byName = Object.fromEntries(body.tools.map((entry) => [entry.remoteName, entry]));
  assert.equal(byName.generate_image?.writeDeclared, true);
  assert.equal(byName.generate_image?.admitted, true, "on both lists — allowedToolNames AND writeAllowedToolNames");
  assert.equal(byName.drop_everything?.destructiveDeclared, true);
  assert.equal(byName.drop_everything?.admitted, false);
  assert.equal(byName.drop_everything?.refusalReason, "remote-declares-destructive");
  assert.equal(byName.silent_tool?.hintsAbsent, true, "no annotations at all — must read as 'the server does not say', never as read-only");
  assert.equal(byName.not_allowlisted?.admitted, false);
  assert.equal(byName.not_allowlisted?.refusalReason, "not-in-operator-allowlist");
});

test("INV-006: the response carries no secret — not the OAuth bearer token, not the client secret, not any header", async (t) => {
  const FAKE_TOKEN = "sk-unit-dummy-bearer-should-never-leak-4242";
  const FAKE_SECRET = "UNIT_DUMMY_CLIENT_SECRET_9999";
  const oauth: ExternalMcpOAuthService = {
    async beginConnect() {
      throw new Error("not used");
    },
    async completeAuthorizationCallback() {
      throw new Error("not used");
    },
    async pollDeviceAuthorization() {
      throw new Error("not used");
    },
    async disconnect() {},
    tokenResolver: {
      async resolveAccessToken() {
        return FAKE_TOKEN;
      },
    },
  };
  let seenAuthHeader: string | undefined;
  const connect: ExternalMcpProbeSessionFactory = async (spec) => {
    seenAuthHeader = spec.headers.authorization;
    return scriptedSession({ tools: [{ name: "generate_image", description: "d", inputSchema: {}, annotations: { readOnlyHint: false } }] });
  };
  const { app, deps } = buildTestApp({ connect, externalMcpOAuth: oauth });
  await saveHttp(deps, "secure", {
    authMode: "oauth",
    oauth: { grant: "authorization_code", clientId: "client-1", clientSecret: FAKE_SECRET, scopes: "images:generate" },
  });
  await forceOAuthStatus(deps, "secure", "connected");
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/secure/probe`, cookie, { method: "POST" });
  const raw = await response.text();

  assert.equal(response.status, 200);
  // Proves the token really was resolved and attached to the OUTBOUND request (so this is a
  // meaningful negative assertion, not a vacuous one against a header nothing ever set).
  assert.equal(seenAuthHeader, `Bearer ${FAKE_TOKEN}`);
  assert.equal(raw.includes(FAKE_TOKEN), false, "the OAuth access token must never appear in the probe response");
  assert.equal(raw.includes(FAKE_SECRET), false, "the OAuth client secret must never appear in the probe response");
  assert.equal(raw.includes("authorization"), false, "no header name/value pair may appear in the probe response");
});

test("the probe rate limiter sits in front of the guard", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  // No session at all — an unauthenticated caller still consumes the limiter's budget, matching
  // `oauth.ts`'s own "rate limiting sits in front of the guard" ordering. Not exhausting the limiter
  // here (that would make this test slow/flaky against the real profile's window); this only proves
  // a request without a session still gets the ordinary 401 rather than a 500 from the limiter
  // running before `req.params`/`res.locals` are ready.
  const response = await req(baseUrl, `${BASE}/anything/probe`, "", { method: "POST" });
  assert.equal(response.status, 401);
});
