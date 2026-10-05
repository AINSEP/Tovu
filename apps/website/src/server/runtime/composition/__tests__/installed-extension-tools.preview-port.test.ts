import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { ToolRegistration } from "@jini-ai/core";

import { CONTENT_ANALYZER_MANIFEST } from "#src/features/plugin-runtime/built-ins/content-analyzer/index";
import type { PluginDiscoveryRecord } from "#src/features/plugin-runtime/discovery";
import { InMemoryPluginActivationRepo } from "#src/features/plugin-runtime/repo.memory";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import type { InstalledExtensionToolDeps } from "#src/assistant/installed-extension-tools";
import { registerInstalledExtensionTools } from "../installed-extension-tools.js";

/**
 * @file AW-7 Tier 2: the composition root's installed-extension pass hands the process's
 * `previewPluginBeforeSave` binding to the plugin-capability family, so the agent daemon's
 * `plugin_capability_content_analyzer` tool computes a fresh result there instead of reading the
 * last save's values. Without the binding the same tool reads stored values.
 */

const RECORD: PluginDiscoveryRecord = {
  id: "content-analyzer",
  name: "Content Analyzer",
  version: "1.0.0",
  source: "built-in",
  tier: "tier-2",
  status: "valid",
  errors: [],
  manifest: CONTENT_ANALYZER_MANIFEST,
};

async function callAnalyzerTool(extra: Partial<InstalledExtensionToolDeps>): Promise<Record<string, unknown>> {
  const workspaceId = randomUUID();
  const registrations: ToolRegistration[] = [];
  const registry = { register: (registration: ToolRegistration) => void registrations.push(registration) };
  await registerInstalledExtensionTools(
    registry,
    {
      authorize: async () => ({ allowed: true }) as never,
      workspaceId,
      postRepo: new InMemoryPostRepo([
        {
          id: "post-1",
          workspaceId,
          title: "Hello",
          slug: "hello",
          bodyJson: { type: "doc", content: [] },
          status: "draft",
          kind: "post",
          bodyFormat: "doc",
          bodyHtml: null,
          updatedAt: "2026-10-04T00:00:00.000Z",
          version: 1,
          ext: { "content-analyzer": { score: 12 } },
        },
      ]),
      pluginActivationRepo: new InMemoryPluginActivationRepo([
        { pluginId: "content-analyzer", workspaceId, version: "1.0.0", enabled: true, updatedAt: "2026-10-04T00:00:00.000Z" },
      ]),
      discoverPlugins: async () => [RECORD],
      ...extra,
    },
    "[preview-port-test]",
  );
  const tool = registrations.find((registration) => registration.descriptor.id === "plugin_capability_content_analyzer");
  assert.ok(tool, "the enabled tier-2 plugin's capability tool must be registered");
  return (await tool.handler({ input: { postId: "post-1" }, principal: { id: "owner" }, run: { id: "run-1" } } as never)) as Record<string, unknown>;
}

test("the daemon's capability tool runs a tier-2 plugin fresh through the injected preview binding", async () => {
  const result = await callAnalyzerTool({ previewPluginBeforeSave: async () => ({ score: 90 }) });
  assert.equal(result.computedNow, true);
  assert.equal((result.fields as Record<string, unknown>).score, 90);
});

test("without a preview binding the same tool reads the stored value", async () => {
  const result = await callAnalyzerTool({});
  assert.equal(result.computedNow, false);
  assert.equal((result.fields as Record<string, unknown>).score, 12);
});
