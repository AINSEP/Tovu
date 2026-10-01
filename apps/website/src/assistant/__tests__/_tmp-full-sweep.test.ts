import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { createByokToolSurface } from "../byok-tool-surface.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { sanitizeGoogleSchema } from "../byok-provider-turn.js";
import { listToolContributors, resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { createSurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";

// This file's whole point is "the FULL wired-tool catalog" — install the registry-contributed
// domains (comments/newsletter, 2026-08-17) or "full" silently means ~21 tools short.
resetToolContributorsForTests();
installFirstPartyToolContributors();

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function walk(node: unknown, path: string, report: (msg: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((e, i) => {
      walk(e, `${path}[${i}]`, report);
    });
    return;
  }
  if (!isRec(node)) return;
  if (Array.isArray(node.type)) report(`${path}: type is still an array`);
  if (!("type" in node) && !Array.isArray(node.anyOf)) report(`${path}: no type and no anyOf`);
  if (Array.isArray(node.enum)) {
    for (const m of node.enum) if (typeof m !== "string") report(`${path}: enum member ${JSON.stringify(m)} not a string`);
  }
  if (isRec(node.properties)) for (const [n, p] of Object.entries(node.properties)) walk(p, `${path}.properties.${n}`, report);
  if (node.items !== undefined) walk(node.items, `${path}.items`, report);
  if (Array.isArray(node.anyOf)) walk(node.anyOf, `${path}.anyOf`, report);
}

test("TEMP: full wired-tool catalog sanitizes cleanly for Gemini across all 5 classes", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const surface = createByokToolSurface(deps as never);
  const tools = surface.registry.list();
  assert.ok(tools.length > 100, `expected ~130 tools, got ${tools.length}`);

  const ids = new Set(tools.map((tool) => tool.id));
  // Required first-party domains from today's composition contract, independent of the
  // resulting catalog size. The contributor builders supply every tool identity per domain.
  const requiredDomains = [
    "agent-plugin-search", "agent-plugin-connect", "comments", "content-duplication", "content-types",
    "custom-credentials", "database", "database-transfer", "deployments", "entries", "external-mcp",
    "fs-files", "forms", "identity", "integrations", "media", "media-view", "media-generation", "media-import",
    "members", "menus", "newsletter", "pages", "plugins", "post", "publish-content", "recovery", "redirects",
    "seo", "settings", "site-backup", "site-evidence", "site-inspection", "sites", "source-control", "static-publish",
    "taxonomy", "themes", "theme-set-active", "change-sets", "trash", "widgets", "workspace",
  ];
  const contributors = listToolContributors();
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore() };
  const rawIds = new Set(buildAssistantToolRegistrations(deps as never, surfaces, { includeContentReadCollapse: false }).map((registration) => registration.descriptor.id));
  assert.deepEqual([...ids].sort(), buildAssistantToolRegistrations(deps as never, surfaces).map((registration) => registration.descriptor.id).sort(), "the BYOK surface must retain the complete assembled catalog after content-read collapse");
  for (const domain of requiredDomains) {
    const contributor = contributors.find((entry) => entry.domain === domain);
    assert.ok(contributor, `missing contributor ${domain}`);
    const expected = contributor.build(deps as never, surfaces);
    assert.ok(expected.length > 0, `empty contributor ${domain}`);
    for (const registration of expected) assert.ok(rawIds.has(registration.descriptor.id), `${domain}: missing ${registration.descriptor.id}`);
  }
  for (const id of ["assistant_demo_choices", "assistant_demo_a2ui", "assistant_demo_image", "assistant_render_ui", "search_components", "describe_component", "assistant_ask_choice", "external_mcp_reauth_prompt", "assistant_admin_screen_link"]) {
    assert.ok(ids.has(id), `missing built-in tool ${id}`);
  }

  const forbidden = ['"additionalProperties"', '"$schema"', '"$ref"', '"$defs"', '"const"', '"oneOf"', '"allOf"'];
  let totalSize = 0;
  let issues = 0;
  const perTool: Array<{ name: string; size: number }> = [];
  for (const tool of tools) {
    const sanitized = sanitizeGoogleSchema(tool.inputSchema ?? { type: "object", properties: {} });
    const serialized = JSON.stringify(sanitized);
    totalSize += serialized.length;
    perTool.push({ name: tool.id, size: serialized.length });
    for (const key of forbidden) {
      if (serialized.includes(key)) {
        issues += 1;
        console.log(`FORBIDDEN KEY: ${tool.id}: ${key}`);
      }
    }
    walk(sanitized, tool.id, (msg) => {
      issues += 1;
      console.log(`STRUCTURAL ISSUE: ${msg}`);
    });
  }
  perTool.sort((a, b) => b.size - a.size);
  console.log("tool count:", tools.length);
  console.log("Top 8 largest sanitized schemas:", JSON.stringify(perTool.slice(0, 8)));
  console.log("Total sanitized tools payload size (chars):", totalSize);
  console.log("Total issues found:", issues);
  assert.equal(issues, 0, `expected zero issues across the full catalog, found ${issues}`);
});
