import assert from "node:assert/strict";
import test from "node:test";
import { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { publicPageSecurityHeaders } from "#src/features/theme/public-page-security-headers";
import { routeDepsAssistantSettings, routeDepsExecutionPlugins } from "../route-deps-assistant-mcp.js";

/**
 * @file The late-bound closures of the assistant/MCP route-deps slices: the agent-plugin preference
 * writer (must go through `routeDeps().set` read at call time, not the module-level settings `set`),
 * the public page security headers (built from the form collection providers read per call), and
 * the plugin export hosts (this workspace's declared hosts from the composed export runtime).
 */

function kernelWithWorkspace() {
  const db = openContentDb(":memory:");
  db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run("site-7", "site-7", "site-7", "2031-01-01T00:00:00.000Z");
  return contentKernel({ store: db });
}

test("preferences.saveAuto writes through the route deps' own set, read at call time", async () => {
  const writes: Array<{ input: unknown; optional: unknown; via: string }> = [];
  let via = "early";
  const deps = routeDepsAssistantSettings({
    agentPluginLayout: { forWorkspace: () => ({ root: "/roots/site-7" }) },
    kernel: kernelWithWorkspace(),
    workspaceId: "site-7",
    clock: { nowMs: () => Date.parse("2031-02-03T04:05:06.000Z"), nowIso: () => "2031-02-03T04:05:06.000Z" },
    idGen: { newId: () => "id-1" },
    identity: { authorize: async () => ({ allowed: true }) },
    settingsPrincipals: {},
    assistantSettingsReady: new Promise(() => {}),
    routeDeps: () => ({ set: async (required: { input: unknown }, optional: unknown) => { writes.push({ input: required.input, optional, via }); } }),
  } as unknown as Parameters<typeof routeDepsAssistantSettings>[0]);
  via = "late";
  await deps.preferences?.saveAuto({ workspaceId: "site-7", principalId: "owner-1", expectedRevisionSeq: 4 });
  assert.deepEqual(writes, [{
    via: "late",
    optional: { expectedRevisionSeq: 4 },
    input: { namespace: "core.interface", key: "chatAgentPlugins", value: "auto", scope: "user", workspaceId: "site-7",
      principalId: "owner-1", callerPrincipalId: "owner-1", authWorkspaceId: "site-7" },
  }]);
});

test("publicPageSecurityHeaders reads the form collection providers on every call", () => {
  let reads = 0;
  const declaredHostCalls: unknown[] = [];
  const deps = routeDepsExecutionPlugins({
    kernel: kernelWithWorkspace(),
    workspaceId: "site-7",
    formCollectionProviders: () => { reads += 1; return createFormCollectionRegistry({}); },
    pluginExports: { declaredHosts: (input: unknown) => { declaredHostCalls.push(input); return Promise.resolve({ scripts: ["https://cdn.example.test"] }); } },
  } as unknown as Parameters<typeof routeDepsExecutionPlugins>[0]);
  assert.equal(reads, 0, "providers are not read at composition time");
  const headers = deps.publicPageSecurityHeaders?.();
  assert.deepEqual(headers, publicPageSecurityHeaders({}), "no available provider adds no frame origin");
  deps.publicPageSecurityHeaders?.();
  assert.equal(reads, 2);
  assert.deepEqual(declaredHostCalls, []);
});

test("pluginExportHosts asks the export runtime for this workspace's declared hosts", async () => {
  const declaredHostCalls: unknown[] = [];
  const deps = routeDepsExecutionPlugins({
    kernel: kernelWithWorkspace(),
    workspaceId: "site-7",
    formCollectionProviders: () => createFormCollectionRegistry({}),
    pluginExports: { declaredHosts: (input: unknown) => { declaredHostCalls.push(input); return Promise.resolve({ scripts: ["https://cdn.example.test"] }); } },
  } as unknown as Parameters<typeof routeDepsExecutionPlugins>[0]);
  assert.deepEqual(await deps.pluginExportHosts?.(), { scripts: ["https://cdn.example.test"] });
  assert.deepEqual(declaredHostCalls, [{ workspaceId: "site-7" }]);
});
