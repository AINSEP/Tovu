import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";
import express from "express";

import { createToolRegistry, type ToolRegistry } from "@jini-ai/core";
import { buildToolIndex, handleToolCall, type McpToolDef } from "@jini-ai/mcp";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute, delegatedToolRoutes } from "@jini-ai/daemon/http";
import { daemonRouteHost, mountJiniRoutes } from "../../server/runtime/composition/jini-routes.js";

import { discoverAllBuiltInThemes } from "../../features/theme/index.js";
import { buildThemesRegistrations } from "../../features/theme/tool-registrations.js";
import { type ThemeToolDeps } from "../../features/theme/asset-operations.js";
import { createLocalSameOriginPolicy } from "@jini-ai/core/contracts/server";

/**
 * @file Regression test for the bug report: `theme_list_files` called with a malformed/wrong
 * parameter name (e.g. `theme_id` instead of `themeId`) returned an HTTP 500 through
 * `/api/delegated-tool-calls` — the real transport a spawned agent CLI uses to call this site's
 * tools (`delegatedToolRoutes` in `src/server/agent-daemon/agent-daemon-server.ts`) — instead
 * of a 400. Root cause and fix both live upstream in `@jini-ai/core`/`@jini-ai/daemon`/
 * `@jini-ai/http-kit` (a shared `ToolInputError` marker threading a `ToolExecutionResult.errorKind`
 * through to the wire status), so this test drives the REAL chain end to end — real theme
 * registrations, a real `ToolRegistry`/`ToolExecutor`, and the real `delegatedToolExecuteRoute` — to
 * confirm the fix actually reaches Tovu rather than merely existing at the Jini unit level.
 * The shared normalizer now repairs separator/case aliases such as theme_id; genuine invalid
 * values, missing ids and unknown themes must still produce 400 rather than 500.
 */

const DECLARATIVE_MANIFEST = JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "declarative", engine: 1 }, null, 2);

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-list-files-status-"));
  const plain = path.join(root, "plain");
  fs.mkdirSync(plain, { recursive: true });
  fs.writeFileSync(path.join(plain, "theme.json"), DECLARATIVE_MANIFEST, "utf8");
  fs.writeFileSync(path.join(plain, "tokens.json"), "{}", "utf8");
  return root;
}

async function buildDelegatedToolDeps() {
  const themesDir = makeThemesRoot();
  const routeDeps: ThemeToolDeps = {
    workspaceId: "ws-1",
    resolveActiveThemeId: async () => "",
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    themesDir,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };

  const registry = createToolRegistry({});
  for (const registration of buildThemesRegistrations(routeDeps)) registry.register(registration);
  // The lister `themeId` points at is registered by the content-read tool, not by the theme domain: a read-only stand-in of it.
  registry.register({ descriptor: { id: "content_read.theme", readOnly: true }, policy: { authorize: () => "allow" }, handler: async () => ({ themes: [] }) });
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });

  return { run, lifecycle, toolExecutor, registry, resolvePrincipal: () => ({ id: "principal-1" }) };
}

test("theme_list_files normalizes theme_id to themeId end to end and reports the repair", async () => {
  const { run, lifecycle, toolExecutor, resolvePrincipal } = await buildDelegatedToolDeps();

  const result = await delegatedToolExecuteRoute.handle({
    input: { runId: run.id, toolUseId: "tu-1", toolId: "theme_list_files", input: { theme_id: "plain" } },
    deps: { lifecycle, toolExecutor, resolvePrincipal },
  });

  // A separator alias is unambiguous, so the forgiving gate repairs it before domain validation.
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.result, {
      executionId: result.value.result.executionId,
      status: "completed",
      output: { themeId: "plain", files: ["theme.json", "tokens.json"], normalizationNotes: ["theme_id→themeId"] },
      truncated: false,
      normalizationNotes: ["theme_id→themeId"],
    });
  }
});

test("theme_list_files called with themeId missing entirely is also a 400 BAD_REQUEST, not a 500", async () => {
  const { run, lifecycle, toolExecutor, resolvePrincipal } = await buildDelegatedToolDeps();

  const result = await delegatedToolExecuteRoute.handle({
    input: { runId: run.id, toolUseId: "tu-1", toolId: "theme_list_files", input: {} },
    deps: { lifecycle, toolExecutor, resolvePrincipal },
  });

  assert.deepEqual(result, {
    ok: false,
    error: { code: "BAD_REQUEST", message: "'themeId' (non-empty string) is required" },
  });
});

test("a well-formed theme_list_files call still succeeds end to end (the fix does not break the golden path)", async () => {
  const { run, lifecycle, toolExecutor, resolvePrincipal } = await buildDelegatedToolDeps();

  const result = await delegatedToolExecuteRoute.handle({
    input: { runId: run.id, toolUseId: "tu-1", toolId: "theme_list_files", input: { themeId: "plain" } },
    deps: { lifecycle, toolExecutor, resolvePrincipal },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.result, {
      executionId: result.value.result.executionId,
      status: "completed",
      output: { themeId: "plain", files: ["theme.json", "tokens.json"] },
      truncated: false,
    });
  }
});

test("an unknown themeId (a shape rejection decorated with the tool's schema) is ALSO a 400 BAD_REQUEST, not a 500", async () => {
  const { run, lifecycle, toolExecutor, resolvePrincipal } = await buildDelegatedToolDeps();

  const result = await delegatedToolExecuteRoute.handle({
    input: { runId: run.id, toolUseId: "tu-1", toolId: "theme_list_files", input: { themeId: "nope" } },
    deps: { lifecycle, toolExecutor, resolvePrincipal },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "BAD_REQUEST");
    assert.match(result.error.message, /theme 'nope' was not found/);
  }
});

test("the mounted HTTP adapter returns 200 for a repaired alias and 400 for malformed, missing and unknown theme ids", { timeout: 5000 }, async () => {
  for (const input of [{ theme_id: "plain" }, { themeId: 42 }, {}, { themeId: "nope" }]) {
    const { run, ...deps } = await buildDelegatedToolDeps();
    const app = express();
    app.use(express.json());
    const context = { originPolicy: createLocalSameOriginPolicy({ port: () => 7456, env: {}, config: { allowedOriginsEnvVar: "JINI_ALLOWED_ORIGINS", webPortEnvVar: "JINI_WEB_PORT", bindHostEnvVar: "JINI_BIND_HOST" } }) };
    // 100 KB: the byte size of the default `express.json()` parser above; the list derives its body limit from it.
    mountJiniRoutes({ app, routes: delegatedToolRoutes({ deps, host: daemonRouteHost({ context, parserLimitBytes: 100 * 1024 }) }) });

    // Drive real IncomingMessage/ServerResponse and Express routing over an in-memory
    // stream: no listening socket, and no stub of the adapter's status or JSON writers.
    const socket = new PassThrough();
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    const body = JSON.stringify({ runId: run.id, toolUseId: "tu-http", toolId: "theme_list_files", input });
    const req = new IncomingMessage(socket as unknown as Socket);
    req.method = "POST";
    req.url = "/api/delegated-tool-calls";
    req.httpVersion = "1.1";
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;
    req.headers = { host: "localhost:7456", origin: "http://localhost:7456", "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) };
    const res = new ServerResponse(req);
    res.assignSocket(socket as unknown as Socket);
    try {
      const finished = new Promise<void>((resolve, reject) => { res.once("finish", resolve); res.once("error", reject); });
      app(req, res);
      req.push(body);
      req.complete = true;
      req.push(null);
      await finished;
      const wire = Buffer.concat(chunks).toString("utf8");
      const parsed = JSON.parse(wire.slice(wire.indexOf("\r\n\r\n") + 4)) as {
        result?: { status: string; output: unknown; normalizationNotes?: string[] };
        error?: { code: string; message: string };
      };
      if ("theme_id" in input) {
        assert.match(wire, /^HTTP\/1\.1 200 OK\r\n/);
        assert.ok(parsed.result);
        assert.equal(parsed.result.status, "completed");
        assert.deepEqual(parsed.result.output, { themeId: "plain", files: ["theme.json", "tokens.json"], normalizationNotes: ["theme_id→themeId"] });
        assert.deepEqual(parsed.result.normalizationNotes, ["theme_id→themeId"]);
      } else {
        assert.match(wire, /^HTTP\/1\.1 400 Bad Request\r\n/);
        assert.ok(parsed.error);
        assert.equal(parsed.error.code, "BAD_REQUEST");
        if (input.themeId === "nope") assert.match(parsed.error.message, /theme 'nope' was not found/);
        else assert.equal(parsed.error.message, "'themeId' (non-empty string) is required");
      }
    } finally {
      socket.destroy();
    }
  }
});

/** The gateway's text for a missing `themeId` when the route holds the registry: the handler's own words, then where valid ids come from. */
const MISSING_THEME_ID = "'themeId' (non-empty string) is required";
const LIST_VALID_THEMES = " List valid values for `themeId` with content_read.theme.";

test("theme_list_files without themeId, through the gateway that holds the registry, says which tool lists themes", async () => {
  const { run, lifecycle, toolExecutor, registry, resolvePrincipal } = await buildDelegatedToolDeps();

  const result = await delegatedToolExecuteRoute.handle({
    input: { runId: run.id, toolUseId: "tu-1", toolId: "theme_list_files", input: {} },
    deps: { lifecycle, toolExecutor, resolvePrincipal, toolRegistry: registry },
  });

  assert.deepEqual(result, { ok: false, error: { code: "BAD_REQUEST", message: `${MISSING_THEME_ID}${LIST_VALID_THEMES}` } });
});

/** The registry's own descriptors, published as the typed MCP tools a run would see. */
function typedTools({ registry }: { registry: ToolRegistry }): McpToolDef[] {
  return registry.list({})
    .filter(({ id }) => id === "theme_list_files" || id === "content_read.theme")
    .map((d) => ({ name: d.id, description: d.description ?? d.id, inputSchema: d.inputSchema as McpToolDef["inputSchema"], handler: () => "ran" }));
}

test("theme_list_files without themeId, as a typed MCP tool, says which tool lists themes between the instruction and the contract", async () => {
  const { registry } = await buildDelegatedToolDeps();
  const tools = typedTools({ registry });
  const schema = tools.find(({ name }) => name === "theme_list_files")?.inputSchema;

  const result = await handleToolCall({ name: "theme_list_files", tools: buildToolIndex({ tools }), ctx: { baseUrl: "http://daemon", fetchImpl: fetch, diagnosticToolIds: registry.list({}).map(({ id }) => id) } }, { rawArgs: {} });

  assert.deepEqual(result.content, [{ type: "text", text: `invalid arguments for theme_list_files: supply required argument \`themeId\`; list valid values with content_read.theme; Input schema: ${JSON.stringify(schema)}` }]);
});
