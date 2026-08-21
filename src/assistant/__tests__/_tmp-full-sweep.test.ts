import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "../../server/app.js";
import { createByokToolSurface } from "../byok-tool-surface.js";
import { sanitizeGoogleSchema } from "../byok-provider-turn.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { installFirstPartyToolContributors } from "../../server/tool-catalog-manifest.js";

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
