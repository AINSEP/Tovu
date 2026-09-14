import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { setAgentPluginActivation } from "#src/features/agent-plugins/activation";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { installAgentPlugin, type AgentPluginArchiveEntry } from "#src/features/agent-plugins/install";
import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { registerAgentPluginFilesRoute } from "../../files.js";

/**
 * @file `AGENT_PLUGIN_FILES` — `GET /api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId/files`
 * (2026-09-13). The Agent Plugins screen's eye button reads a plugin's real installed files through
 * this route, so every installed plugin — switched off or not — can be inspected, not only the ones
 * a compile-time catalog happened to list. Real install through `installAgentPlugin`, isolated under
 * a temp `TOVU_AGENT_PLUGINS_DIR`, same idiom as `agent-plugins-http.integration.test.ts`.
 */

const WORKSPACE = "workspace-local";
const PLUGIN_ID = "supabase";

function fileEntry(entryPath: string, content: string): AgentPluginArchiveEntry {
  const bytes = Buffer.from(content, "utf8");
  return {
    kind: "file",
    entryPath,
    declaredSize: bytes.byteLength,
    executable: false,
    async *openReadStream() {
      yield bytes;
    },
  };
}

/** Installs one switched-off plugin into a temp agent-plugins dir for the duration of `fn`. */
async function withSwitchedOffPlugin<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-files-test-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const entries = [
      fileEntry("plugin.json", JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN_ID, version: "1.0.0" })),
      fileEntry(`skills/${PLUGIN_ID}/SKILL.md`, `---\nname: ${PLUGIN_ID}\n---\n# Supabase\nReal skill body.`),
    ];
    const archive = new Uint8Array(Buffer.from("seed-supabase-files"));
    await installAgentPlugin({
      archive,
      expectedSha256: createHash("sha256").update(archive).digest("hex"),
      archiveReader: {
        async *entries() {
          yield* entries;
        },
      },
      layout: resolveAgentPluginLayout(),
      workspaceId: WORKSPACE,
    });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace(WORKSPACE).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: false, actor: "test" });
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

function buildTestApp(): express.Express {
  // One `createRouteDeps()` for both the auth stack and the route — see
  // `agent-plugins-http.integration.test.ts`'s `buildTestApp` for why a second call 403s.
  const baseDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerAgentPluginFilesRoute(app, baseDeps);
  return app;
}

test("AGENT_PLUGIN_FILES: a switched-off plugin's installed files are listed with their content", async (t) => {
  await withSwitchedOffPlugin(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/${PLUGIN_ID}/files`, { headers: { cookie } });
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      pluginId: string;
      files: Array<{ relativePath: string; content: string | null; omitted: string | null }>;
      truncated: boolean;
      limits: { maxFiles: number };
    };
    const byPath = new Map(body.files.map((file) => [file.relativePath, file]));
    assert.equal(body.pluginId, PLUGIN_ID);
    assert.equal(body.truncated, false);
    assert.equal(body.limits.maxFiles, 200);
    assert.match(byPath.get("plugin.json")?.content ?? "", /"name":"supabase"/);
    assert.match(byPath.get(`skills/${PLUGIN_ID}/SKILL.md`)?.content ?? "", /# Supabase/);
    assert.ok(
      body.files.every((file) => !path.isAbsolute(file.relativePath)),
      "no absolute server path reaches the response",
    );
  });
});

test("AGENT_PLUGIN_FILES: an id that is not installed, or an encoded traversal id, is 404 and reads nothing", async (t) => {
  await withSwitchedOffPlugin(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

    // Express decodes `%2F` inside the one `:pluginId` segment, so the route sees `../../../etc` —
    // it must match no installed id.
    for (const id of ["not-installed", "..%2F..%2F..%2Fetc"]) {
      const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/${id}/files`, { headers: { cookie } });
      assert.equal(response.status, 404, id);
      const body = (await response.json()) as { code?: string; files?: unknown };
      assert.equal(body.code, "AGENT_PLUGIN_NOT_FOUND", id);
      assert.equal(body.files, undefined, id);
    }

    // `%2E%2E` is a dot segment the URL parser collapses before sending, so it never reaches this
    // route at all — still a 404, just not this route's JSON one.
    const dotSegment = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/%2E%2E/files`, { headers: { cookie } });
    assert.equal(dotSegment.status, 404);
  });
});

test("AGENT_PLUGIN_FILES: no session is 401, and an unknown workspace id is 404", async (t) => {
  await withSwitchedOffPlugin(async () => {
    const { baseUrl, cookie } = await bootAuthenticated(buildTestApp(), t);

    const anonymous = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/${PLUGIN_ID}/files`);
    assert.equal(anonymous.status, 401);

    const otherWorkspace = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/agent-plugins/${PLUGIN_ID}/files`, { headers: { cookie } });
    assert.equal(otherWorkspace.status, 404);
  });
});
