import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import type { KeyringPort } from "../../features/webhooks/index.js";
import { openExternalMcpOAuthPayload, readEnabledExternalMcpConfigs } from "../../assistant/external-mcp-store.js";
import { onExternalMcpRosterChanged, resetExternalMcpRosterChangeListenersForTests } from "../../assistant/external-mcp-roster-change.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { createExternalMcpModule } from "../runtime/composition/modules/external-mcp.js";
import type { RouteDeps } from "../routes/types.js";
import { bootAuthenticated, loginAsBarePrincipal, startTestServer } from "./helpers/http-test-server.js";

/**
 * @file Route-level tests for the three external-MCP routes — real Express app, real session auth,
 * real HTTP, real sealing.
 *
 * What matters most, and why each is here rather than left to the store's own unit tests: the
 * routes are the only place an env VALUE could escape over the wire, the only place the
 * `absent`/`empty` env distinction can be flattened by JSON handling, and the only place the
 * site-owner permission actually stands between an operator and spawning a process.
 *
 * No real credentials anywhere; every value is an obvious dummy.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers`;
const DUMMY_TOKEN = "ghp_UNIT_DUMMY_NOT_A_REAL_TOKEN_4242";

/** Always fails — simulates a missing `TOVU_SITE_KEY` without touching real env state. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no site key: TOVU_SITE_KEY is not set");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
}

function buildTestApp(overrides: Partial<RouteDeps> = {}): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps(), ...overrides };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createExternalMcpModule(deps).registerRoutes?.(app);
  return { app, deps };
}

function req(baseUrl: string, path: string, cookie: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) },
  });
}

const validBody = {
  label: "GitHub",
  transport: "stdio",
  enabled: true,
  command: "npx",
  args: "-y @modelcontextprotocol/server-github",
  allowedToolNames: "search_repositories",
  env: `GITHUB_TOKEN=${DUMMY_TOKEN}`,
};

test("every route requires a session", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  assert.equal((await req(baseUrl, BASE, "")).status, 401);
  assert.equal((await req(baseUrl, `${BASE}/github`, "", { method: "PUT", body: "{}" })).status, 401);
  assert.equal((await req(baseUrl, `${BASE}/github`, "", { method: "DELETE" })).status, 401);
});

test("a workspace id that is not this site's is 404", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const otherBase = "/api/admin/v1/workspaces/not-this-site/mcp-servers";

  assert.equal((await req(baseUrl, otherBase, cookie)).status, 404);
  assert.equal((await req(baseUrl, `${otherBase}/github`, cookie, { method: "DELETE" })).status, 404);
  assert.equal((await req(baseUrl, `${otherBase}/github`, cookie, { method: "PUT", body: JSON.stringify(validBody) })).status, 404);
  assert.deepEqual(await deps.externalMcpServerRepo.listByWorkspaceId(deps.workspaceId), []);
});

test("a signed-in principal with no integrations grant is refused on every admin MCP route", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  assert.equal((await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify(validBody) })).status, 200);
  const before = structuredClone(await deps.externalMcpServerRepo.listByWorkspaceId(deps.workspaceId));
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  for (const { path, method, body } of [
    { path: BASE, method: "GET" },
    { path: `${BASE}/ungranted`, method: "PUT", body: JSON.stringify(validBody) },
    { path: `${BASE}/github`, method: "PUT", body: JSON.stringify({ ...validBody, command: "untrusted-command" }) },
    { path: `${BASE}/github`, method: "DELETE" },
    { path: `${BASE}/github/probe`, method: "POST", body: "{}" },
    { path: `${BASE}/github/oauth/connect`, method: "POST", body: "{}" },
    { path: `${BASE}/github/oauth/device/poll`, method: "POST", body: "{}" },
    { path: `${BASE}/github/oauth`, method: "DELETE" },
    { path: `${BASE}/admissions`, method: "GET" },
  ]) {
    const response = await req(baseUrl, path, bareCookie, { method, ...(body ? { body } : {}) });
    assert.equal(response.status, 403, `${method} ${path}: ${await response.clone().text()}`);
    const denied = await response.json() as { code: string; details: { permission: string } };
    assert.equal(denied.code, "FORBIDDEN");
    assert.equal(denied.details.permission, "admin.integrations.manage");
    assert.deepEqual(await deps.externalMcpServerRepo.listByWorkspaceId(deps.workspaceId), before, `${method} ${path} must not mutate the roster`);
  }
});

test("a server survives a PUT then GET round trip, and the token never appears in a response", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const put = await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify(validBody) });
  assert.equal(put.status, 200);
  const putText = await put.text();
  assert.equal(putText.includes(DUMMY_TOKEN), false, "the write response must not echo the token back");
  assert.match(putText, /"restartRequired":true/);

  const list = await req(baseUrl, BASE, cookie);
  assert.equal(list.status, 200);
  const listText = await list.text();
  assert.equal(listText.includes(DUMMY_TOKEN), false, "the read response must not carry the token");

  const body = JSON.parse(listText) as { servers: { serverId: string; envNames: string[]; allowedToolNames: string[] }[] };
  assert.deepEqual(body.servers.map((s) => s.serverId), ["github"]);
  // The NAME is what the tab needs to show which variables are set.
  assert.deepEqual(body.servers[0]?.envNames, ["GITHUB_TOKEN"]);
  assert.deepEqual(body.servers[0]?.allowedToolNames, ["search_repositories"]);
});

test("a saved server reaches the daemon's read path with its env decrypted", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify(validBody) });

  // The same call `agent-daemon-server.ts` makes at boot — proving the route and the daemon agree
  // about the stored shape, rather than each being tested against its own idea of it.
  const { configs } = await readEnabledExternalMcpConfigs(
    { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer },
    deps.workspaceId,
  );
  assert.equal(configs.length, 1);
  const target = configs[0]?.target;
  assert.equal(target?.kind, "stdio");
  assert.deepEqual(target?.kind === "stdio" ? target.env : null, { GITHUB_TOKEN: DUMMY_TOKEN });
});

test("omitting env preserves the stored token across an enable/disable toggle", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify(validBody) });

  // Exactly what the summary-row toggle sends: no env, because the UI never received one.
  const toggled = await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...validBody, env: undefined, enabled: false }),
  });
  assert.equal(toggled.status, 200);

  const record = await deps.externalMcpServerRepo.findByServerId({
    workspaceId: deps.workspaceId,
    serverId: "github",
  });
  assert.equal(record?.enabled, false);
  assert.notEqual(record?.sealedEnv, null, "a toggle must not wipe the stored credentials");
});

test("blank env keeps sealed bytes; an explicit empty JSON env object clears the stored token", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify(validBody) });
  const before = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "github" });
  assert.ok(before?.sealedEnv);
  const blank = await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify({ ...validBody, env: "" }) });
  assert.equal(blank.status, 200);
  const kept = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "github" });
  assert.equal(JSON.stringify(kept?.sealedEnv) === JSON.stringify(before.sealedEnv), true, "blank updates preserve the sealed bytes");
  await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify({ ...validBody, env: "{}" }) });

  const record = await deps.externalMcpServerRepo.findByServerId({
    workspaceId: deps.workspaceId,
    serverId: "github",
  });
  assert.equal(record?.sealedEnv, null);
});

test("invalid operator input is a 400 naming the offending field", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const badId = await req(baseUrl, `${BASE}/bad_id`, cookie, { method: "PUT", body: JSON.stringify(validBody) });
  assert.equal(badId.status, 400);
  assert.equal(((await badId.json()) as { details: { field: string } }).details.field, "id");

  const badTransport = await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...validBody, transport: "http" }),
  });
  assert.equal(badTransport.status, 400);
  assert.equal(((await badTransport.json()) as { details: { field: string } }).details.field, "transport");

  const badEnv = await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...validBody, env: "NOT_A_PAIR" }),
  });
  assert.equal(badEnv.status, 400);
  assert.equal(((await badEnv.json()) as { details: { field: string } }).details.field, "env");
});

test("an unconfigured secret store fails closed with 503 rather than storing a plaintext token", async (t) => {
  const keyring = new BrokenKeyring();
  const { app, deps } = buildTestApp({
    siteAssistantSecretKeyring: keyring,
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify(validBody) });
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { code: string }).code, "SECRET_STORE_UNCONFIGURED");
  // Nothing may be persisted when the token could not be sealed.
  assert.equal(
    await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "github" }),
    null,
  );
});

test("deleting a server removes it, and deleting an unknown id is 404", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify(validBody) });

  const removed = await req(baseUrl, `${BASE}/github`, cookie, { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.match(await removed.text(), /"restartRequired":true/);

  assert.equal((await req(baseUrl, `${BASE}/github`, cookie, { method: "DELETE" })).status, 404);
  const list = (await (await req(baseUrl, BASE, cookie)).json()) as { servers: unknown[] };
  assert.equal(list.servers.length, 0);
});

// ---------------------------------------------------------------------------
// Hosted + OAuth connections over the wire
//
// Until these passed, the OAuth subsystem was unreachable through the API: the store, the flow
// service and the connect/callback routes all existed, but the only WRITE route dropped `url`,
// `authMode` and the whole `oauth` block, so no row could ever be put into `authMode: "oauth"` for
// them to act on.
// ---------------------------------------------------------------------------

/** Reads one server out of the list response BY ID. Selecting by index would make these tests
 *  depend on the roster's ordering, which no route promises. */
async function fetchServer(baseUrl: string, cookie: string, serverId: string): Promise<Record<string, unknown>> {
  const body = JSON.parse(await (await req(baseUrl, BASE, cookie)).text()) as { servers: Record<string, unknown>[] };
  const found = body.servers.find((server) => server.serverId === serverId);
  assert.ok(found, `expected a server '${serverId}' in ${JSON.stringify(body.servers.map((s) => s.serverId))}`);
  return found;
}

const DUMMY_CLIENT_SECRET = "cs_UNIT_DUMMY_NOT_A_REAL_SECRET_9191";

const hostedOAuthBody = {
  label: "Higgsfield",
  transport: "streamable_http",
  authMode: "oauth",
  enabled: true,
  url: "https://mcp.higgsfield.example/mcp",
  allowedToolNames: "generate_image",
  oauth: {
    grant: "authorization_code",
    clientId: "client-abc",
    clientSecret: DUMMY_CLIENT_SECRET,
    scopes: "images:generate",
    authorizationEndpoint: "https://auth.higgsfield.example/authorize",
    tokenEndpoint: "https://auth.higgsfield.example/token",
  },
};

test("a hosted OAuth server can be created over the wire, and its client secret never comes back", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const put = await req(baseUrl, `${BASE}/higgsfield`, cookie, { method: "PUT", body: JSON.stringify(hostedOAuthBody) });
  const putText = await put.text();
  assert.equal(put.status, 200, putText);
  assert.equal(putText.includes(DUMMY_CLIENT_SECRET), false);

  const listText = await (await req(baseUrl, BASE, cookie)).text();
  assert.equal(listText.includes(DUMMY_CLIENT_SECRET), false, "the read response must not carry the client secret");

  const server = await fetchServer(baseUrl, cookie, "higgsfield");
  const oauth = server.oauth as { grant: string | null; clientId: string | null; status: string; scopes: string[] };
  assert.equal(server.transport, "streamable_http");
  assert.equal(server.url, "https://mcp.higgsfield.example/mcp");
  assert.equal(oauth.grant, "authorization_code");
  assert.equal(oauth.clientId, "client-abc");
  assert.deepEqual(oauth.scopes, ["images:generate"]);
  // Configured but not yet authorized — the state the connect route exists to move it out of.
  assert.equal(oauth.status, "disconnected");
  const record = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "higgsfield" });
  assert.ok(record?.sealedOAuth, "the client secret must be stored sealed");
  assert.equal(JSON.stringify(record).includes(DUMMY_CLIENT_SECRET), false);
  assert.equal((await openExternalMcpOAuthPayload(deps.siteAssistantSecretSealer, record)).clientSecret, DUMMY_CLIENT_SECRET);
});

test("a hosted server saved without a URL is a 400 naming the url field, not a 500", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const put = await req(baseUrl, `${BASE}/nourl`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...hostedOAuthBody, url: undefined }),
  });

  assert.equal(put.status, 400);
  const body = (await put.json()) as { code: string; details: { field: string } };
  assert.equal(body.code, "INVALID_MCP_SERVER");
  assert.equal(body.details.field, "url");
});

test("a plaintext non-loopback URL is refused — it would carry the bearer token in the clear", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const put = await req(baseUrl, `${BASE}/insecure`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...hostedOAuthBody, url: "http://mcp.higgsfield.example/mcp" }),
  });

  assert.equal(put.status, 400);
  assert.match((await put.text()), /must use https/);
});

test("a later PUT that omits the oauth block keeps the stored client id rather than clearing it", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await req(baseUrl, `${BASE}/higgsfield`, cookie, { method: "PUT", body: JSON.stringify(hostedOAuthBody) });

  // Exactly what the summary-row toggle sends: no oauth block, because the UI never received the
  // secret to send back. Collapsing that into "clear" is how a toggle silently breaks a working
  // connection — the same failure the `env` three-state rule exists to prevent.
  const toggled = await req(baseUrl, `${BASE}/higgsfield`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...hostedOAuthBody, oauth: undefined, enabled: false }),
  });
  assert.equal(toggled.status, 200, await toggled.text().catch(() => ""));

  const server = await fetchServer(baseUrl, cookie, "higgsfield");
  const oauth = server.oauth as { clientId: string | null; grant: string | null };
  assert.equal(server.enabled, false);
  assert.equal(oauth.clientId, "client-abc");
  assert.equal(oauth.grant, "authorization_code");
  const record = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "higgsfield" });
  assert.ok(record?.sealedOAuth);
  assert.equal((await openExternalMcpOAuthPayload(deps.siteAssistantSecretSealer, record)).clientSecret, DUMMY_CLIENT_SECRET);
});

// ---------------------------------------------------------------------------
// The write-authorization list (Phase 2A) and its attribution
// ---------------------------------------------------------------------------

test("a write-authorized tool round-trips over the wire and its attribution names the saving principal", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const me = await req(baseUrl, "/api/admin/v1/auth/me", cookie);
  assert.equal(me.status, 200);
  const owner = await me.json() as { user: { id: string } };

  const put = await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT",
    body: JSON.stringify({
      ...validBody,
      allowedToolNames: "search_repositories, delete_repository",
      writeAllowedToolNames: "delete_repository",
    }),
  });
  assert.equal(put.status, 200, await put.text().catch(() => ""));

  const server = await fetchServer(baseUrl, cookie, "github");
  assert.deepEqual(server.writeAllowedToolNames, ["delete_repository"]);
  assert.equal(typeof server.writeGrantsUpdatedByPrincipalId, "string");
  assert.ok((server.writeGrantsUpdatedByPrincipalId as string).length > 0);
  assert.equal(server.writeGrantsUpdatedByPrincipalId, owner.user.id);
  assert.equal(typeof server.writeGrantsUpdatedAt, "string");
  const timestamp = server.writeGrantsUpdatedAt as string;
  assert.equal(new Date(timestamp).toISOString(), timestamp);

  const secondCookie = await loginAsBarePrincipal(deps, baseUrl);
  const secondMe = await req(baseUrl, "/api/admin/v1/auth/me", secondCookie);
  assert.equal(secondMe.status, 200);
  const second = await secondMe.json() as { user: { id: string } };
  assert.notEqual(second.user.id, owner.user.id);
  const policyId = "second-mcp-integrations-policy";
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: policyId, isBuiltin: false, isFrozen: false });
  await deps.policyPermissionRepo.save({ id: "second-mcp-integrations-permission", workspaceId: deps.workspaceId, policyId,
    permission: "admin.integrations.manage", resourceType: null, constraintJson: null });
  await deps.principalPolicyRepo.save({ id: "second-mcp-integrations-link", workspaceId: deps.workspaceId, principalId: second.user.id, policyId });
  const secondPut = await req(baseUrl, `${BASE}/github`, secondCookie, {
    method: "PUT", body: JSON.stringify({ ...validBody, env: undefined, writeAllowedToolNames: "search_repositories" }),
  });
  assert.equal(secondPut.status, 200, await secondPut.clone().text());
  const updated = await fetchServer(baseUrl, cookie, "github");
  assert.deepEqual(updated.writeAllowedToolNames, ["search_repositories"]);
  assert.equal(updated.writeGrantsUpdatedByPrincipalId, second.user.id);
});

test("a write entry not in the allowlist is a 400 naming the writeAllowedToolNames field", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const put = await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...validBody, allowedToolNames: "search_repositories", writeAllowedToolNames: "delete_repository" }),
  });

  assert.equal(put.status, 400);
  const body = (await put.json()) as { details: { field: string } };
  assert.equal(body.details.field, "writeAllowedToolNames");
});

test("omitting writeAllowedToolNames on a later PUT clears it, exactly as allowedToolNames does — it is resent in full, not tri-state", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...validBody, allowedToolNames: "search_repositories, delete_repository", writeAllowedToolNames: "delete_repository" }),
  });

  const resaved = await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...validBody, allowedToolNames: "search_repositories, delete_repository" }),
  });
  assert.equal(resaved.status, 200);

  const server = await fetchServer(baseUrl, cookie, "github");
  assert.deepEqual(server.writeAllowedToolNames, []);
});

test("(task #30 / R-3, pinned not fixed) an array body value for writeAllowedToolNames collapses to '' via asStringField, clearing every write grant — fails CLOSED", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...validBody, allowedToolNames: "search_repositories, delete_repository", writeAllowedToolNames: "delete_repository" }),
  });

  // The same pre-existing `asStringField` behaviour `allowedToolNames` already has (task #30):
  // a non-string body value silently becomes `""` rather than a 400. Documented as a known,
  // NOT-fixed-here bug — the assertion below pins that it fails CLOSED (grants cleared), not open.
  const put = await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT",
    body: JSON.stringify({
      ...validBody,
      allowedToolNames: "search_repositories, delete_repository",
      writeAllowedToolNames: ["delete_repository"],
    }),
  });
  assert.equal(put.status, 200, await put.text().catch(() => ""));

  const server = await fetchServer(baseUrl, cookie, "github");
  assert.deepEqual(server.writeAllowedToolNames, [], "an array input must clear the write list, never silently pass it through");
});

test("authMode is not silently demoted to static_env by a PUT that omits it", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await req(baseUrl, `${BASE}/higgsfield`, cookie, { method: "PUT", body: JSON.stringify(hostedOAuthBody) });

  await req(baseUrl, `${BASE}/higgsfield`, cookie, {
    method: "PUT",
    body: JSON.stringify({ ...hostedOAuthBody, authMode: undefined, label: "Renamed" }),
  });

  const server = await fetchServer(baseUrl, cookie, "higgsfield");
  assert.equal(server.label, "Renamed");
  assert.equal(server.authMode, "oauth", "a rename must not demote an OAuth connection");
});

test("saving and toggling notify a roster consumer with the updated running configuration", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const snapshots: ReturnType<typeof readEnabledExternalMcpConfigs>[] = [];
  onExternalMcpRosterChanged("route-test-observer", () => {
    const snapshot = readEnabledExternalMcpConfigs({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer }, deps.workspaceId);
    snapshots.push(snapshot);
    return snapshot;
  });
  t.after(() => resetExternalMcpRosterChangeListenersForTests());
  assert.equal((await req(baseUrl, `${BASE}/github`, cookie, { method: "PUT", body: JSON.stringify(validBody) })).status, 200);
  assert.equal(snapshots.length, 1, "a successful save must notify the runtime");
  const saved = await snapshots[0]!;
  assert.deepEqual(saved.failures, []);
  assert.deepEqual(saved.configs.map((config) => config.serverId), ["github"]);
  const target = saved.configs[0]!.target;
  assert.equal(target.kind, "stdio");
  assert.deepEqual(target.kind === "stdio" ? target.env : null, { GITHUB_TOKEN: DUMMY_TOKEN });

  assert.equal((await req(baseUrl, `${BASE}/github`, cookie, {
    method: "PUT", body: JSON.stringify({ ...validBody, env: undefined, enabled: false }),
  })).status, 200);
  assert.equal(snapshots.length, 2, "a toggle must notify the runtime too");
  assert.deepEqual((await snapshots[1]!).configs, []);
});

test("host-declared built-in MCP connections are labelled and cannot be removed, independently of their name", async (t) => {
  const { app } = buildTestApp({ builtInExternalMcpServerIds: ["host-tools"] } as Partial<RouteDeps>);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await req(baseUrl, `${BASE}/host-tools`, cookie, { method: "PUT", body: JSON.stringify({ ...validBody, label: "Renamed host connection" }) });
  assert.equal(created.status, 200);
  const listed = await (await req(baseUrl, BASE, cookie)).json();
  assert.equal(listed.servers[0].builtIn, true);
  const removed = await req(baseUrl, `${BASE}/host-tools`, cookie, { method: "DELETE" });
  assert.equal(removed.status, 409);
  assert.equal((await removed.json()).code, "BUILT_IN_CONNECTION");
  assert.equal((await (await req(baseUrl, BASE, cookie)).json()).servers.length, 1);
});
