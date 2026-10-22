import assert from "node:assert/strict";
import test from "node:test";

import { FIELD_TYPES } from "@jini-ai/cms/forms";
import { WIDGET_TYPE_REGISTRATIONS } from "@jini-ai/cms/widgets";
import { EMBED_MARKER_TARGET_KEYS, FEATURED_IMAGE_MARKER_TYPE } from "@jini-ai/cms/widgets/markers";
import { ToolInputError } from "@jini-ai/core";
import { resolveThemeLayout } from "#src/features/theme/index";
import { siteGuideFactDeps } from "../site-guide.js";

/** The site guide's fact ports, exercised without a guide engine: registries are projected by key,
 * and the agent-plugin inventory is field-projected with activation mapped to enabled/disabled/unknown. */

type Plugin = { pluginId: string; id?: string; displayName?: string; version?: string };

function harness(installed: Plugin[], verdicts: Record<string, string>) {
  const reads: string[] = [];
  const lifecycle = {
    listInstalledPlugins: async (root: string) => { reads.push(`list:${root}`); return installed; },
    readBundledAgentPluginDigests: async (root: string) => { reads.push(`digests:${root}`); return "digests"; },
    preferBundledAgentPluginDigests: (plugins: Plugin[], digests: string) => { reads.push(`prefer:${digests}`); return plugins; },
    resolveAgentPluginActivation: async ({ workspaceRoot, pluginId }: { workspaceRoot: string; pluginId: string }) => {
      reads.push(`activation:${workspaceRoot}:${pluginId}`);
      return { verdict: verdicts[pluginId] };
    },
  };
  const deps = {
    workspaceId: "ws-1",
    marker: "site-own-dep",
    agentPluginLayout: { forWorkspace: (workspaceId: string) => ({ root: `/plugins/${workspaceId}` }) },
  };
  return { reads, facts: siteGuideFactDeps({ deps: deps as never, lifecycle: lifecycle as never }) as ReturnType<typeof siteGuideFactDeps> & { marker: string } };
}

test("registry projections list type keys, field types, unique markers and both theme layouts; membership state is unknown", async () => {
  const { facts } = harness([], {});
  assert.equal(facts.marker, "site-own-dep");
  assert.deepEqual(facts.listWidgetTypes(), Object.values(WIDGET_TYPE_REGISTRATIONS).map((item) => item.typeKey));
  assert.deepEqual(facts.listFormFieldTypes(), [...FIELD_TYPES]);
  const markers = facts.listMarkers();
  assert.deepEqual(new Set(markers), new Set([...Object.keys(EMBED_MARKER_TARGET_KEYS), FEATURED_IMAGE_MARKER_TYPE]));
  assert.equal(new Set(markers).size, markers.length);
  assert.deepEqual(facts.listLayouts(), [resolveThemeLayout().pagesDir, resolveThemeLayout(2).pagesDir]);
  assert.equal(await facts.readMembersEnabled(), null);
});

test("agent-plugin inventory is field-projected; an undetermined activation is unknown, not disabled", async () => {
  const { facts, reads } = harness([
    { pluginId: "p-active", id: "id-a", displayName: "Active", version: "1.2.0" },
    { pluginId: "p-off" },
    { pluginId: "p-unknown" },
  ], { "p-active": "active", "p-off": "inactive", "p-unknown": "undetermined" });
  assert.deepEqual(await facts.readAgentPlugins(), [
    { id: "id-a", name: "Active", version: "1.2.0", enabled: true },
    { id: "p-off", name: "p-off", version: null, enabled: false },
    { id: "p-unknown", name: "p-unknown", version: null, enabled: null },
  ]);
  assert.deepEqual(reads.slice(0, 3), ["list:/plugins/ws-1", "digests:/plugins/ws-1", "prefer:digests"]);
});

test("an agent-plugin inventory above the 256-record read limit is refused before any activation read", async () => {
  const many = Array.from({ length: 257 }, (_, index) => ({ pluginId: `p-${index}` }));
  const { facts, reads } = harness(many, {});
  await assert.rejects(facts.readAgentPlugins(), (error: unknown) => error instanceof ToolInputError && /exceeds the 256-record read limit/.test((error as Error).message));
  assert.equal(reads.some((read) => read.startsWith("activation:")), false);
});
