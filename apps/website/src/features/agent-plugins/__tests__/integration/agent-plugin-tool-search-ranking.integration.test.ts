import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { forceRemove } from "../fixtures/force-remove.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { installAgentPlugin, type AgentPluginArchiveEntry, type AgentPluginArchiveReaderPort } from "../../install.js";
import { registerInstalledAgentPluginTools } from "../../tool-registrations.js";
import { createRouteDeps } from "../../../../server/runtime/composition/app.js";
import { buildAssistantToolRegistrations } from "../../../../assistant/tool-registrations.js";
import { buildToolCatalogQuery } from "../../../../assistant/tool-catalog-query.js";
import { resetToolContributorsForTests } from "../../../../assistant/tool-contribution-registry.js";
import { installFirstPartyToolContributors } from "../../../../server/runtime/composition/tool-catalog-manifest.js";

/**
 * @file THE crux test for the one-tool-per-plugin design (2026-08-24, superseding the 2026-08-23
 * one-tool-per-skill pilot): does a realistic operator query, run against the REAL ~150-tool
 * catalog PLUS this plugin's single collapsed tool, still surface it — with plain `search_tools`,
 * no prompt-level mandate — and does collapsing 7 tools into 1 free up result slots for genuinely
 * relevant native tools the way the pilot's own crowding-out problem predicted it should?
 *
 * Builds the real production tool surface exactly the way `agent-daemon-server.ts` does
 * (`installFirstPartyToolContributors()` + `buildAssistantToolRegistrations(createRouteDeps())`,
 * the same two calls `tool-registrations.contracts.test.ts`'s own `buildRealAssembledSurface` uses),
 * then additionally registers this module's plugin tool for a REAL installed `ui-ux-design` plugin
 * (its 7 real skill folders, with their real SKILL.md frontmatter) into the SAME registry before
 * seeding `buildToolCatalogQuery` — so ranking is measured against genuine competition, not an
 * isolated toy catalog.
 *
 * This file does not tune queries to force a pass. Where it asserts a hard pass/fail, that reflects
 * what was actually observed while writing it — see this change's own report for the literal
 * before/after numbers, including where collapsing measurably DROPPED a per-term BM25 score (an
 * expected, accepted trade-off — the score itself is not what governs the pass/fail here, rank is).
 */

function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

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

function manifest(name: string, version = "1.0.0"): string {
  return JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, version });
}

async function withAgentPluginsDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-tool-search-ranking-test-"));
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

// The reference plugin's 7 real skills, real frontmatter — sampled 2026-08-23 from the installed
// fixture at <site>/agent-plugins/ws/workspace-local/packages/sha256/.../skills/*/SKILL.md.
const UI_UX_DESIGN_SKILLS: Readonly<Record<string, string>> = {
  "ui-ux-design": `---
name: ui-ux-design
version: 1.1.0
description: Use when creating frontend design systems, visual direction, component/state specs, responsive behavior, brand-aware UI guidance, premium/high-converting website polish, or implementation-ready design handoff from a feature spec or existing product constraints.
---

# Skill: UI/UX Design
`,
  "frontend-accessibility": `---
name: frontend-accessibility
version: 1.0.0
description: WCAG 2.1 AA compliance guidance for frontend code review and E2E testing.
---

# Frontend Accessibility
`,
  "shadcn-ui": `---
name: shadcn-ui
description: Expert guidance for integrating and building applications with shadcn/ui components, including component discovery, installation, customization, and best practices.
---

# shadcn/ui Component Integration
`,
  "interface-design": `---
name: interface-design
version: 1.0.0
description: Use when designing interfaces for dashboards, apps, tools, or admin panels where craft, memory, and consistency matter. Not for marketing sites.
---

# Interface Design
`,
  "vercel-web-design-guidelines": `---
name: vercel-web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
---

# Web Interface Guidelines
`,
  "gstack-design": `---
name: gstack-design
version: 0.1.0
description: Use when a user manually invokes gstack-inspired design workflows for product design consultation, visual variants, frontend implementation handoff, or UI design review.
---

# gstack Design
`,
  "web-compliance": `# Web Compliance

## Purpose
Provide a practical compliance checklist for website-facing features so review agents can consistently catch legal and policy risks before release.
`,
};

async function installRealUiUxDesignPlugin(workspaceId: string) {
  const entries: AgentPluginArchiveEntry[] = [fileEntry("plugin.json", manifest("ui-ux-design"))];
  for (const [skillName, skillMarkdown] of Object.entries(UI_UX_DESIGN_SKILLS)) {
    entries.push(fileEntry(`skills/${skillName}/SKILL.md`, skillMarkdown));
  }
  const archive = new Uint8Array(Buffer.from("archive-real-ui-ux-design-pilot"));
  const digest = createHash("sha256").update(archive).digest("hex");
  return installAgentPlugin({ archive, expectedSha256: digest, archiveReader: reader(entries), layout: resolveAgentPluginLayout(), workspaceId });
}

/** Builds the real production surface, WITHOUT the plugin tool — the "before" side of the
 *  freed-up-slots comparison this file's report draws on. */
async function buildRealNativeOnlySurface() {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(routeDeps)) registry.register(registration);

  const catalog = buildToolCatalogQuery(registry);
  return { registry, catalog };
}

async function buildRealSurfaceWithPluginTool() {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  await installRealUiUxDesignPlugin(routeDeps.workspaceId);

  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(routeDeps)) registry.register(registration);
  await registerInstalledAgentPluginTools(registry, { workspaceId: routeDeps.workspaceId });

  const catalog = buildToolCatalogQuery(registry);
  return { registry, catalog };
}

/** Logs the full ranked hit list for a query — the actual evidence this change's report quotes,
 *  rather than a pass/fail bit alone. */
function logHits(query: string, hits: readonly { id: string; score: number }[]): void {
  console.log(`\n[agent-plugin-tool-search-ranking] query="${query}" (top ${hits.length}):`);
  hits.forEach((hit, index) => console.log(`  ${index + 1}. ${hit.id}  (score ${hit.score.toFixed(3)})`));
}

test("the plugin tool IS present in registry.list() and describable by exact id — the registration mechanism itself works, and collapsing 7 tools into 1 shows up as exactly +1 in the real catalog size", async () => {
  await withAgentPluginsDir(async () => {
    const { registry: nativeOnly } = await buildRealNativeOnlySurface();
    const { registry, catalog } = await buildRealSurfaceWithPluginTool();

    assert.equal(registry.has("agent_plugin_ui_ux_design"), true);
    assert.equal(
      registry.list().length,
      nativeOnly.list().length + 1,
      "one installed plugin must add exactly ONE tool to the real catalog, not seven",
    );

    const described = catalog.describe("agent_plugin_ui_ux_design");
    assert.ok(described, "agent_plugin_ui_ux_design must be describable via the real FTS-backed catalog");
  });
});

test("CRUX: realistic operator queries against the full real catalog (~150 native tools + 1 collapsed plugin tool) — reports actual ranks, does not tune to force a pass", async () => {
  await withAgentPluginsDir(async () => {
    const { catalog } = await buildRealSurfaceWithPluginTool();

    // Identical to the queries the one-tool-per-skill pilot measured — reusing the exact set is
    // what makes the before/after comparison in this change's report meaningful rather than
    // cherry-picked.
    const queries = [
      "design guidance",
      "accessibility",
      "UI components",
      "what design guidance is available",
      "how do I make this page more accessible",
      "shadcn component library",
      "review my UI for compliance",
    ];

    const PLUGIN_TOOL_ID = "agent_plugin_ui_ux_design";

    let everyQueryRankedThePluginToolTop3 = true;
    for (const query of queries) {
      const hits = catalog.search(query, 10);
      logHits(query, hits);
      const rank = hits.findIndex((hit) => hit.id === PLUGIN_TOOL_ID);
      if (rank === -1 || rank > 2) everyQueryRankedThePluginToolTop3 = false;
    }

    // Reported, not asserted on, because it is expected to fail for at least one query (the known
    // "accessible" vs indexed "accessibility" FTS5 stemming miss the pilot already found) — see the
    // report for the literal per-query numbers instead of collapsing them into one boolean here.
    console.log(`\n[agent-plugin-tool-search-ranking] plugin tool ranked top-3 for every query: ${everyQueryRankedThePluginToolTop3}`);

    // The one load-bearing assertion this test makes: at least one plausible operator phrasing
    // surfaces the plugin tool in the top 10 — the same window `byok-tool-surface.ts` returns to a
    // model. If this fails, that is this change's real, honest result (see the report), not a bug
    // in this test.
    const anyQueryFoundThePluginToolInTop10 = queries.some((query) => catalog.search(query, 10).some((hit) => hit.id === PLUGIN_TOOL_ID));
    assert.ok(
      anyQueryFoundThePluginToolInTop10,
      "no realistic operator query surfaced the plugin tool in the top 10 — see the console output above for every query's actual ranked hits",
    );
  });
});
