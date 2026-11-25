import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import { buildZipFixture } from "#src/features/agent-plugins/__tests__/fixtures/build-zip";
import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { registerAgentPluginInstallRoute } from "#src/server/runtime/composition/modules/agent-plugin-install-route";

/**
 * @file Wire pin for `AGENT_PLUGIN_INSTALL_ZIP` / `AGENT_PLUGIN_UPDATE_ZIP` through the real registrar
 * (w4-routes batch L): the exact status and body of every gate and refusal, captured on the hand-written
 * route before its move to a Jini raw spec, so the move must keep them byte-identical. The two
 * "never reads the body" cases send a body over the 32 MiB cap: a route that read the body before its
 * gates would answer the 413 instead of the gate's refusal.
 */

const WORKSPACE = "workspace-local";
const PLUGIN_ID = "note-taker";
const CAP = 32 * 1024 * 1024;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const manifest = (version: string) => JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN_ID, version });

async function withTempPluginsDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-install-wire-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

function buildTestApp(deps: ReturnType<typeof createRouteDeps>): express.Express {
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps, errors: createRouteIncidentReporter().errors });
  app.use("/api/admin", requireAdminSession(deps));
  registerAgentPluginInstallRoute({ app, deps });
  return app;
}

/** One exchange's status, content type and parsed body. */
async function wire(response: Response): Promise<{ status: number; type: string | null; body: unknown }> {
  return { status: response.status, type: response.headers.get("content-type"), body: await response.json() };
}

function post(baseUrl: string, pathAndQuery: string, init: { cookie: string; body: Buffer; contentType?: string }) {
  return fetch(`${baseUrl}${pathAndQuery}`, {
    method: "POST",
    headers: { cookie: init.cookie, "content-type": init.contentType ?? "application/zip" },
    body: Uint8Array.from(init.body),
  });
}

const JSON_TYPE = "application/json; charset=utf-8";
const installPath = (query: string, workspace = WORKSPACE) => `/api/admin/v1/workspaces/${workspace}/agent-plugins/install/zip${query}`;
const updatePath = (pluginId: string, query: string) => `/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/${pluginId}/update/zip${query}`;

test("AGENT_PLUGIN_INSTALL_ZIP wire: gates answer before the body is read", async (t) => {
  await withTempPluginsDir(async () => {
    const deps = createRouteDeps();
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(deps), t);
    const oversized = Buffer.alloc(CAP + 1);
    const query = `?expectedSha256=${sha(oversized)}`;

    assert.deepEqual(await wire(await post(baseUrl, installPath(query), { cookie: "", body: oversized })),
      { status: 401, type: JSON_TYPE, body: { error: "unauthenticated", code: "UNAUTHENTICATED" } });
    assert.deepEqual(await wire(await post(baseUrl, installPath(query, "other"), { cookie, body: oversized })),
      { status: 404, type: JSON_TYPE, body: { error: "workspace was not found" } });

    const bare = await loginAsBarePrincipal(deps, baseUrl);
    const denied = await wire(await post(baseUrl, installPath(query), { cookie: bare, body: oversized }));
    const deniedBody = denied.body as { error: string };
    assert.match(deniedBody.error, /^principal '[^']+' is not authorized for 'admin\.plugins\.enable' \(.+\)$/);
    assert.deepEqual({ ...denied, body: { ...deniedBody, error: "<principal>" } },
      { status: 403, type: JSON_TYPE, body: { error: "<principal>", code: "FORBIDDEN", details: { permission: "admin.plugins.enable", reason: (deniedBody as unknown as { details: { reason: string } }).details.reason } } });
  });
});

test("AGENT_PLUGIN_INSTALL_ZIP wire: input refusals, oversize, malformed zip and success", async (t) => {
  await withTempPluginsDir(async () => {
    const deps = createRouteDeps();
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(deps), t);
    const archive = await buildZipFixture([{ path: "plugin.json", content: manifest("1.0.0") }]);
    const digest = sha(archive);
    const validation = (error: string) => ({ status: 400, type: JSON_TYPE, body: { code: "VALIDATION_ERROR", error } });

    assert.deepEqual(await wire(await post(baseUrl, installPath("?expectedSha256=nope"), { cookie, body: archive })),
      validation("expectedSha256 must be the file's lowercase hex SHA-256."));
    assert.deepEqual(await wire(await post(baseUrl, installPath(`?expectedSha256=${digest}`), { cookie, body: archive, contentType: "text/plain" })),
      validation("An application/zip upload is required."));
    assert.deepEqual(await wire(await post(baseUrl, installPath(`?expectedSha256=${digest}&replace=maybe`), { cookie, body: archive })),
      validation("replace must be true or false."));
    assert.deepEqual(await wire(await post(baseUrl, updatePath("Bad_Id", `?expectedSha256=${digest}&expectedOldDigest=${"a".repeat(64)}`), { cookie, body: archive })),
      validation("pluginId is not a valid Agent Plugin id."));
    assert.deepEqual(await wire(await post(baseUrl, updatePath(PLUGIN_ID, `?expectedSha256=${digest}&expectedOldDigest=short`), { cookie, body: archive })),
      validation("expectedOldDigest must be the installed revision's lowercase hex SHA-256."));

    const oversized = Buffer.alloc(CAP + 1);
    assert.deepEqual(await wire(await post(baseUrl, installPath(`?expectedSha256=${sha(oversized)}`), { cookie, body: oversized })),
      { status: 413, type: JSON_TYPE, body: { code: "AGENT_PLUGIN_ARCHIVE_TOO_LARGE", error: "The .zip is larger than the 32 MiB limit." } });
    const garbage = Buffer.from("this is not a zip");
    assert.deepEqual(await wire(await post(baseUrl, installPath(`?expectedSha256=${sha(garbage)}`), { cookie, body: garbage })),
      { status: 400, type: JSON_TYPE, body: { code: "AGENT_PLUGIN_ARCHIVE_UNREADABLE", error: "This file is not a readable .zip." } });

    const installed = await wire(await post(baseUrl, installPath(`?expectedSha256=${digest}`), { cookie, body: archive }));
    assert.equal(installed.status, 201);
    assert.equal(installed.type, JSON_TYPE);
    const row = (installed.body as { agentPlugin: Record<string, unknown> }).agentPlugin;
    assert.deepEqual(installed.body, { alreadyInstalled: false, warnings: [], agentPlugin: row });
    assert.deepEqual({ pluginId: row.pluginId, version: row.version, enabled: row.enabled }, { pluginId: PLUGIN_ID, version: "1.0.0", enabled: false });
    const again = await wire(await post(baseUrl, installPath(`?expectedSha256=${digest}`), { cookie, body: archive }));
    assert.deepEqual(again, { status: 200, type: JSON_TYPE, body: { alreadyInstalled: true, warnings: [], agentPlugin: row } });

    const next = await buildZipFixture([{ path: "plugin.json", content: manifest("1.1.0") }]);
    const updated = await wire(await post(baseUrl, updatePath(PLUGIN_ID, `?expectedSha256=${sha(next)}&expectedOldDigest=${String(row.archiveDigest)}`), { cookie, body: next }));
    assert.equal(updated.status, 200);
    assert.equal((updated.body as { agentPlugin: { version: string } }).agentPlugin.version, "1.1.0");
  });
});
