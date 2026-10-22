import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { listPublishedPosts } from "#src/features/post/index";
import { anonymousMemberAccess } from "./member-access.fixture.js";
import { createSiteCapabilityRegistry } from "../capability-registry.js";
import { EMPTY_VISITOR_TOOL_POLICY, parseVisitorToolPolicy } from "../../../contracts/site-assistant/visitor-tools.js";
import type { VisitorExecutionPorts } from "../visitor-executor.js";

function fixture() {
  let id = 0;
  const rows = [
    { slug: "public", status: "published", kind: "post", deletedAt: null, memberAccessJson: '{"visibility":"public"}' },
    { slug: "draft", status: "draft", kind: "page", deletedAt: null },
    { slug: "trash", status: "published", kind: "page", deletedAt: "2026-10-22" },
    ...["members", "paid", "private", "tiers"].map(visibility => ({ slug: visibility, status: "published", kind: "page", deletedAt: null,
      memberAccessJson: JSON.stringify({ visibility, tierIds: ["gold"] }) })),
  ].map(row => ({ ...row, id: row.slug, workspaceId: "w", title: row.slug, bodyJson: { text: row.slug }, updatedAt: "2026-10-22", version: 1 }));
  const deps = { workspaceId: "w", postRepo: { list: async () => rows } as never, listPublishedPosts, memberAccess: anonymousMemberAccess() };
  const ports: VisitorExecutionPorts = { initialPolicy: EMPTY_VISITOR_TOOL_POLICY, readPolicy: async () => EMPTY_VISITOR_TOOL_POLICY,
    budgets: { charge: async () => true }, ip: "ip", workspaceId: "w", runId: "turn", clock: { nowMs: () => 0, nowIso: () => "1970-01-01T00:00:00.000Z" },
    ids: { newId: () => `parity-${++id}` }, sink: { append: async () => {} }, reportError: error => assert.fail(String(error)) };
  return { deps, ports };
}

for (const name of ["search_published_entries", "get_published_entry", "list_categories", "navigate_to_entry", "scroll_to_entry", "highlight_entry"]) {
  test(`${name}: managed executor preserves public/draft/trash/membership behavior`, async () => {
    const f = fixture();
    for (const slug of ["public", "draft", "trash", "members", "paid", "private", "tiers", "absent"]) {
      // Each is an independent turn; the parity test must not trip its own four-call budget.
      const legacy = createSiteCapabilityRegistry(f.deps);
      const managed = createSiteCapabilityRegistry(f.deps, { visitorExecution: f.ports });
      const invocation = { name, caller: "anonymous-visitor" as const, input: { slug, query: slug } };
      const result = await managed.invoke(invocation);
      assert.deepEqual(result, await legacy.invoke(invocation));
      assert.equal(result.kind, "ok");
      const json = JSON.stringify(result);
      if (slug !== "public") assert.doesNotMatch(json, new RegExp(`"(?:slug|title)":"${slug}"`));
      if (name === "list_categories") assert.deepEqual(result, { kind: "ok", result: ["post"], directive: undefined });
    }
  });
}

test("site_guide receives only effective capability names, and empty/invalid policy has no schemas", async () => {
  const f = fixture();
  const policy = parseVisitorToolPolicy({ value: { version: 1, tools: { list_categories: { mode: "off" }, navigate_to_entry: { mode: "ask" } } } });
  const registry = createSiteCapabilityRegistry(f.deps, { visitorExecution: { ...f.ports, initialPolicy: policy, readPolicy: async () => policy },
    siteGuide: { inputSchema: {}, run: async ({ availableTools }) => ({ availableTools }) } });
  const names = registry.schemas.map(schema => schema.name);
  assert.equal(names.length, 5);
  assert.ok(!names.includes("list_categories"));
  assert.ok(!names.includes("navigate_to_entry"));
  for (const schema of registry.schemas) {
    assert.deepEqual(Object.keys(schema).sort(), ["description", "name", "parameters"]);
  }
  assert.equal(registry.schemas.find(schema => schema.name === "site_guide")?.description,
    "Read-only overview or explain(topic) of the capabilities granted to this visitor. Administrator topics and private site facts are unavailable.");
  assert.deepEqual(await registry.invoke({ name: "site_guide", input: { operation: "overview" }, caller: "anonymous-visitor" }),
    { kind: "ok", result: { availableTools: names }, directive: undefined });
  const invalid = createSiteCapabilityRegistry(f.deps, { visitorExecution: { ...f.ports, initialPolicy: null, readPolicy: async () => null } });
  assert.deepEqual(invalid.schemas, []);
  assert.deepEqual(await invalid.invoke({ name: "list_categories", input: {}, caller: "anonymous-visitor" }), { kind: "refused", reason: "This tool is unavailable." });
});

test("public execution import graph cannot reach admin composition, registry contributions or plugin loaders", async () => {
  const src = fileURLToPath(new URL("../../../", import.meta.url));
  const queue = [resolve(src, "assistant/site/capability-registry.ts"), resolve(src, "assistant/site/visitor-executor.ts")];
  const visited = new Set<string>();
  while (queue.length) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    assert.doesNotMatch(file, /\/server\/|\/admin\/|tool-registrations|byok-tool|agent-daemon|\/plugins\//);
    const ast = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) continue;
      if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const module = statement.moduleSpecifier.text;
      assert.doesNotMatch(module, /agent-plugins|credential|sandbox|child_process/);
      if (module.startsWith(".")) queue.push(resolve(dirname(file), module.replace(/\.js$/, ".ts")));
      if (module.startsWith("#src/")) queue.push(resolve(src, module.slice(5) + ".ts"));
    }
  }
  assert.ok(visited.has(resolve(src, "assistant/site/public-content.ts")), "must trace public content access, not only the entry files");
});
