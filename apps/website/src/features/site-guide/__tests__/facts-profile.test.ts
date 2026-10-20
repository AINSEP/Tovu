/** Pin guide projection at the Site Inspection boundary, including absent and truncated sections. */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { InMemorySettingsRepo, getEffective } from "@jini-ai/core/settings";
import type { SiteProfile } from "../../site-inspection/index.js";
import type { SiteGuideFactsDeps } from "../facts.js";

const inspection = await import("../../site-inspection/index.js");
let sections: SiteProfile["sections"] = {};
const requests: unknown[] = [];
const buildSiteProfile: typeof inspection.buildSiteProfile = async (_deps, _caller, options) => {
  requests.push(options?.sections);
  return { schemaVersion: "1", capturedAt: "2026-10-09T00:00:00Z", completeness: "partial", sections };
};
mock.module("#src/features/site-inspection/index", { namedExports: { ...inspection, buildSiteProfile } });
const { readSiteGuideFacts } = await import("../facts.js");
const deps: SiteGuideFactsDeps = {
  workspaceId: "site-a", authorize: async () => ({ allowed: true, reason: "test decision" }),
  clock: { nowIso: () => "2026-10-09T00:00:00Z" }, postRepo: { list: async () => [] }, themes: [],
  presentationRepo: { findByWorkspaceId: async () => null }, settingsRepo: new InMemorySettingsRepo(), getEffective,
  contentTypeRepo: { listByWorkspace: async () => [] }, pluginActivationRepo: { listAll: async () => [] }, discoverPlugins: async () => [],
  listWidgetTypes: () => [], listFormFieldTypes: () => [], listMarkers: () => [], listLayouts: () => [],
  readMembersEnabled: async () => false, readAgentPlugins: async () => [],
};
const caller = { principalId: "editor" };

test("guide projection pins absent sections, safe DTOs, truncation and ordered profile selection", async () => {
  assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: ["forms"] }), { forms: { status: "ok", data: { fieldTypes: [] } } });
  assert.deepEqual(requests, []);
  assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: ["content", "plugins", "themes", "content"] }), {
    themes: { status: "unavailable" }, plugins: { status: "unavailable" },
  });
  assert.deepEqual(requests, [["theme", "plugins", "contentTypes"]]);
  sections = { plugins: { status: "ok", data: [], truncated: true }, contentTypes: { status: "ok", data: [], truncated: true } };
  assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: ["plugins", "content"] }), {
    plugins: { status: "ok", data: { profile: [], registry: { agentPlugins: [] } }, truncated: true },
    content: { status: "ok", data: [], truncated: true },
  });
  sections = { contentTypes: { status: "ok", data: [], truncated: false } };
  assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: ["content"] }), { content: { status: "ok", data: [] } });
  sections = { plugins: { status: "forbidden", reason: "PRIVATE_CANARY" }, contentTypes: { status: "unavailable", reason: "PRIVATE_CANARY" } };
  assert.deepEqual(await readSiteGuideFacts({ deps, caller, topics: ["plugins", "content"] }), {
    plugins: { status: "forbidden" }, content: { status: "unavailable" },
  });
});
