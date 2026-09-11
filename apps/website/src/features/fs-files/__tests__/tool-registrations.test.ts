import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getFsFilesAgentToolCatalog, FS_LIST_FILES_TOOL_ID, FS_READ_FILE_TOOL_ID } from "../agent-tools.js";
import { FS_ROOT_IDS, type FsRootId } from "../layout.js";
import { buildFsFilesRegistrations, fsFilesDerivedRisk, type FsFilesToolDeps } from "../tool-registrations.js";

/**
 * @file The `fs_list_files`/`fs_read_file` registrations — their catalog shape, their permission
 * check, and the handler dispatch down to `fs-files.ts`'s real path containment. Mirrors
 * `features/site-evidence/__tests__/unit/tool-registrations.unit.test.ts`'s own structure.
 *
 * `resolveRoots` is overridden in every test below to point at a temp fixture tree instead of a real
 * `sites/<name>/` directory — see `FsFilesToolDeps.resolveRoots`'s own doc for why that seam exists.
 */

const PRINCIPAL_ID = "66666666-6666-4666-8666-666666666666";

function makeFixtureRoots(): { roots: Record<FsRootId, string>; agentPluginsDir: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-fsfiles-tool-"));
  const roots = Object.fromEntries(FS_ROOT_IDS.map((id) => [id, path.join(base, id)])) as Record<FsRootId, string>;
  // `site` is now the whole site directory (not a narrow "agent-plugins only" root), so the fixture
  // nests a realistic `agent-plugins/<plugin>/references/*` shape under it, same as production.
  const agentPluginsDir = path.join(roots.site, "agent-plugins");
  fs.mkdirSync(path.join(agentPluginsDir, "site-compliance", "references"), { recursive: true });
  fs.writeFileSync(path.join(agentPluginsDir, "site-compliance", "references", "checklist.template.md"), "# Checklist", "utf8");
  return { roots, agentPluginsDir };
}

function toolDeps(overrides: Partial<FsFilesToolDeps> = {}): FsFilesToolDeps {
  const { roots } = makeFixtureRoots();
  return {
    workspaceId: "workspace-local",
    authorize: async () => ({ allowed: true }) as never,
    resolveRoots: () => roots,
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: ToolHandler's ctx type is owned by @jini-ai/cms/core and is not exported; a structural stand-in here would drift from it silently.
function toolContext(input: unknown, toolId: string): any {
  return { input, principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: { id: toolId } };
}

function handlerFor(registrations: ReturnType<typeof buildFsFilesRegistrations>, toolId: string) {
  const registration = registrations.find((r) => r.descriptor.id === toolId);
  assert.ok(registration, `expected a registration for '${toolId}'`);
  return registration.handler;
}

// ---------------------------------------------------------------------------
// 1. Catalog shape.
// ---------------------------------------------------------------------------

test("the catalog declares exactly the two documented tools, both read-only, both content.read-gated", () => {
  const catalog = getFsFilesAgentToolCatalog();
  assert.equal(catalog.length, 2);
  for (const definition of catalog) {
    assert.equal(definition.sideEffects, "none");
    assert.equal(definition.authorization.permission, "content.read");
    assert.equal(fsFilesDerivedRisk.get(definition.name), "none");
  }
  assert.deepEqual(
    catalog.map((d) => d.name).sort(),
    [FS_LIST_FILES_TOOL_ID, FS_READ_FILE_TOOL_ID],
  );
});

test("the catalog exposes no write/edit/delete/rename tool — this domain is read-only by design", () => {
  const names = getFsFilesAgentToolCatalog().map((d) => d.name);
  for (const forbidden of ["fs_write_file", "fs_edit_file", "fs_delete_file", "fs_rename_file"]) {
    assert.ok(!names.includes(forbidden), `'${forbidden}' must not exist in this domain`);
  }
});

test("fs_read_file's schema requires both root and path; fs_list_files requires only root", () => {
  const byId = new Map(getFsFilesAgentToolCatalog().map((d) => [d.name, d]));
  const readSchema = byId.get(FS_READ_FILE_TOOL_ID)?.inputSchema as Record<string, unknown>;
  const listSchema = byId.get(FS_LIST_FILES_TOOL_ID)?.inputSchema as Record<string, unknown>;
  assert.deepEqual(readSchema.required, ["root", "path"]);
  assert.deepEqual(listSchema.required, ["root"]);
  assert.equal(readSchema.additionalProperties, false);
  assert.equal(listSchema.additionalProperties, false);
});

// ---------------------------------------------------------------------------
// 2. Handler dispatch — permission gate.
// ---------------------------------------------------------------------------

test("a denied authorize() refuses the call before any filesystem read happens", async () => {
  const deps = toolDeps({ authorize: async () => ({ allowed: false, reason: "no-grant" }) as never });
  const registrations = buildFsFilesRegistrations(deps);
  const handler = handlerFor(registrations, FS_READ_FILE_TOOL_ID);

  await assert.rejects(() => handler(toolContext({ root: "site", path: "agent-plugins/x.txt" }, FS_READ_FILE_TOOL_ID)));
});

// ---------------------------------------------------------------------------
// 3. Handler dispatch — real reads through fs-files.ts.
// ---------------------------------------------------------------------------

test("fs_list_files lists a real fixture file through the injected resolveRoots seam", async () => {
  const deps = toolDeps();
  const registrations = buildFsFilesRegistrations(deps);
  const handler = handlerFor(registrations, FS_LIST_FILES_TOOL_ID);

  const result = (await handler(toolContext({ root: "site", path: "agent-plugins" }, FS_LIST_FILES_TOOL_ID))) as {
    files: string[];
  };
  assert.deepEqual(result.files, ["site-compliance/references/checklist.template.md"]);
});

test("fs_read_file reads a real fixture file's content through the injected resolveRoots seam", async () => {
  const deps = toolDeps();
  const registrations = buildFsFilesRegistrations(deps);
  const handler = handlerFor(registrations, FS_READ_FILE_TOOL_ID);

  const result = (await handler(
    toolContext({ root: "site", path: "agent-plugins/site-compliance/references/checklist.template.md" }, FS_READ_FILE_TOOL_ID),
  )) as { content: string };
  assert.equal(result.content, "# Checklist");
});

test("an unrecognized root is refused with the schema attached, not a raw lookup failure", async () => {
  const deps = toolDeps();
  const registrations = buildFsFilesRegistrations(deps);
  const handler = handlerFor(registrations, FS_READ_FILE_TOOL_ID);

  await assert.rejects(
    () => handler(toolContext({ root: "not-a-real-root", path: "x.txt" }, FS_READ_FILE_TOOL_ID)),
    /is not a recognized root/,
  );
});

test("a traversal attempt through the real handler (not just the unit-level resolveFsFilePath) is refused", async () => {
  const deps = toolDeps();
  const registrations = buildFsFilesRegistrations(deps);
  const handler = handlerFor(registrations, FS_READ_FILE_TOOL_ID);

  await assert.rejects(
    () => handler(toolContext({ root: "site", path: "../../../etc/passwd" }, FS_READ_FILE_TOOL_ID)),
    /resolves outside the allowed root/,
  );
});

test("a 'secrets' path segment is refused through the real handler", async () => {
  const deps = toolDeps();
  const registrations = buildFsFilesRegistrations(deps);
  const handler = handlerFor(registrations, FS_READ_FILE_TOOL_ID);

  await assert.rejects(
    () => handler(toolContext({ root: "site", path: "secrets/token.txt" }, FS_READ_FILE_TOOL_ID)),
    /denied path segment/,
  );
});
