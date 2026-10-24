import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ForbiddenError } from "@jini-ai/cms/core";

import { getFsFilesAgentToolCatalog, FS_LIST_FILES_TOOL_ID, FS_READ_FILE_TOOL_ID } from "../agent-tools.js";
import { FS_ROOT_IDS, type FsRootId } from "../layout.js";
import { buildFsFilesRegistrations, fsFilesDerivedRisk, type FsFilesToolDeps, contributeFsFilesTools } from "../tool-registrations.js";

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
  return testSiteLayoutContext({
    workspaceId: "workspace-local",
    siteBinding: { dir: roots.site },
    authorize: async () => ({ allowed: true }) as never,
    resolveRoots: () => roots,
    ...overrides,
  });
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

for (const toolId of [FS_LIST_FILES_TOOL_ID, FS_READ_FILE_TOOL_ID]) {
  test(`${toolId} refuses a denied principal before resolving readable fixture roots`, async () => {
    const requests: unknown[] = [];
    let resolutions = 0;
    const { roots } = makeFixtureRoots();
    const deps = toolDeps({
      authorize: async (request) => {
        requests.push(request);
        return { allowed: false, reason: "no_grant" } as never;
      },
      resolveRoots: () => { resolutions++; return roots; },
    });
    await assert.rejects(
      () => handlerFor(buildFsFilesRegistrations(deps), toolId)(toolContext({ root: "site", path: "agent-plugins/site-compliance/references/checklist.template.md" }, toolId)),
      (error) => error instanceof ForbiddenError && error.permission === "content.read",
    );
    assert.equal(resolutions, 0);
    assert.deepEqual(requests, [{ principalId: PRINCIPAL_ID, permission: "content.read", workspaceId: "workspace-local", entityType: "fs-root", entityId: "site" }]);
  });

  test(`${toolId} forwards the full authorization context`, async () => {
    const expected = { principalId: PRINCIPAL_ID, permission: "content.read", workspaceId: "workspace-local", entityType: "fs-root", entityId: "site" };
    const requests: unknown[] = [];
    const deps = toolDeps({ authorize: async (request) => {
      requests.push(request);
      return { allowed: JSON.stringify(request) === JSON.stringify(expected), reason: "no_grant" } as never;
    } });
    await handlerFor(buildFsFilesRegistrations(deps), toolId)(toolContext({ root: "site", path: toolId === FS_LIST_FILES_TOOL_ID ? "agent-plugins" : "agent-plugins/site-compliance/references/checklist.template.md" }, toolId));
    assert.deepEqual(requests, [expected]);
  });
}

// ---------------------------------------------------------------------------
// 3. Handler dispatch — real reads through fs-files.ts.
// ---------------------------------------------------------------------------

test("fs_list_files lists a real fixture file through the injected resolveRoots seam", async () => {
  const deps = toolDeps();
  const registrations = buildFsFilesRegistrations(deps);
  const handler = handlerFor(registrations, FS_LIST_FILES_TOOL_ID);

  const result = (await handler(toolContext({ root: "site", path: "agent-plugins" }, FS_LIST_FILES_TOOL_ID))) as {
    files: string[];
    truncated: boolean;
  };
  assert.equal(result.truncated, false);
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

// ---------------------------------------------------------------------------
// 4. The operator-set `custom` root.
// ---------------------------------------------------------------------------

test("site agents refuse repo and outside custom roots at execution (owner 2026-10-23)", async () => {
  const { roots } = makeFixtureRoots();
  const outside = path.dirname(roots.site);
  fs.writeFileSync(path.join(outside, "outside-canary.txt"), "OUTSIDE_CANARY_CONTENT");
  const deps = toolDeps({ siteBinding: { dir: roots.site }, resolveRoots: () => ({ ...roots, custom: outside }) });
  for (const toolId of [FS_LIST_FILES_TOOL_ID, FS_READ_FILE_TOOL_ID]) {
    const handler = handlerFor(buildFsFilesRegistrations(deps), toolId);
    for (const root of ["repo", "custom"]) {
      await assert.rejects(() => handler(toolContext({ root, path: "outside-canary.txt" }, toolId)));
    }
    await assert.rejects(() => handler(toolContext({ root: "site", path: "outside-canary.txt", site: "another-site" }, toolId)), /active site/);
  }
});

test("an in-site custom root reads normally without exposing a sibling canary", async () => {
  const { roots } = makeFixtureRoots();
  const custom = path.join(roots.site, "custom");
  fs.mkdirSync(custom);
  fs.writeFileSync(path.join(custom, "inside.txt"), "INSIDE_CANARY");
  fs.writeFileSync(path.join(path.dirname(roots.site), "outside-canary.txt"), "OUTSIDE_CANARY_CONTENT");
  const deps = toolDeps({ siteBinding: { dir: roots.site }, resolveRoots: () => ({ ...roots, custom }) });
  const registrations = buildFsFilesRegistrations(deps);
  const listed = await handlerFor(registrations, FS_LIST_FILES_TOOL_ID)(toolContext({ root: "custom" }, FS_LIST_FILES_TOOL_ID));
  assert.ok(!JSON.stringify(listed).includes("outside-canary"));
  const read = await handlerFor(registrations, FS_READ_FILE_TOOL_ID)(toolContext({ root: "custom", path: "inside.txt" }, FS_READ_FILE_TOOL_ID)) as { content: string };
  assert.equal(read.content, "INSIDE_CANARY");
});

test('a custom-root symlink replaced between validation and reading cannot establish an outside reader base', async t => {
  if (process.platform === 'win32') return t.skip('Symlink fixture requires host symlink privileges');
  const { roots } = makeFixtureRoots();
  const site = fs.realpathSync(roots.site);
  const safe = path.join(site, 'safe-custom');
  const outside = path.join(path.dirname(site), 'site-other');
  fs.mkdirSync(safe); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(safe, 'notes.txt'), 'INSIDE_CANARY');
  fs.writeFileSync(path.join(outside, 'notes.txt'), 'OUTSIDE_CONTENT_CANARY');
  const alias = path.join(site, 'custom-alias');
  fs.symlinkSync(safe, alias);
  const originalRealpath = fs.realpathSync;
  let aliasResolutions = 0;
  t.mock.method(fs, 'realpathSync', (input, options) => {
    if (String(input) === alias && ++aliasResolutions === 3) {
      fs.rmSync(alias); fs.symlinkSync(outside, alias);
    }
    return originalRealpath(input, options);
  });
  const deps = toolDeps({ siteBinding: { dir: site }, resolveRoots: () => ({ ...roots, site, custom: alias }) });
  const handler = handlerFor(buildFsFilesRegistrations(deps), FS_READ_FILE_TOOL_ID);
  await assert.rejects(() => handler(toolContext({ root: 'custom', path: 'notes.txt' }, FS_READ_FILE_TOOL_ID)));
  assert.ok(aliasResolutions >= 3, 'the fixture must replace the root after its initial containment checks');
});

test("root: 'custom' before an operator has set one is refused with actionable guidance, not a crash", async () => {
  const { roots } = makeFixtureRoots();
  const deps = toolDeps({ resolveRoots: () => ({ ...roots, custom: undefined }) });
  const registrations = buildFsFilesRegistrations(deps);

  await assert.rejects(
    () => handlerFor(registrations, FS_READ_FILE_TOOL_ID)(toolContext({ root: "custom", path: "x.txt" }, FS_READ_FILE_TOOL_ID)),
    /no folder has been set for the 'custom' root/,
  );
});

test("the denylist still fires inside the 'custom' root — an .env file is refused and excluded from listing", async () => {
  const { roots } = makeFixtureRoots();
  const outsideDir = path.join(roots.site, "custom-denylist");
  fs.mkdirSync(outsideDir);
  fs.writeFileSync(path.join(outsideDir, ".env"), "SECRET=1", "utf8");
  fs.writeFileSync(path.join(outsideDir, "readme.md"), "# hi", "utf8");
  const deps = toolDeps({ siteBinding: { dir: roots.site }, resolveRoots: () => ({ ...roots, custom: outsideDir }) });
  const registrations = buildFsFilesRegistrations(deps);

  const listResult = (await handlerFor(registrations, FS_LIST_FILES_TOOL_ID)(
    toolContext({ root: "custom" }, FS_LIST_FILES_TOOL_ID),
  )) as { files: string[] };
  assert.deepEqual(listResult.files, ["readme.md"]);

  await assert.rejects(
    () => handlerFor(registrations, FS_READ_FILE_TOOL_ID)(toolContext({ root: "custom", path: ".env" }, FS_READ_FILE_TOOL_ID)),
    /denied filename pattern/,
  );
});

test("fs_list_files forwards truncation for a directory exceeding the file cap", async () => {
  const { roots } = makeFixtureRoots();
  const dir = path.join(roots.site, "capped");
  fs.mkdirSync(dir);
  try {
    for (let i = 0; i < 2001; i++) fs.writeFileSync(path.join(dir, `${i}.txt`), "fixture");
    const deps = toolDeps({ siteBinding: { dir: roots.site }, resolveRoots: () => roots });
    const result = await handlerFor(buildFsFilesRegistrations(deps), FS_LIST_FILES_TOOL_ID)(toolContext({ root: "site", path: "capped" }, FS_LIST_FILES_TOOL_ID)) as { files: string[]; truncated: boolean };
    assert.equal(result.files.length, 2000);
    assert.equal(result.truncated, true);
  } finally {
    fs.rmSync(path.dirname(roots.site), { recursive: true, force: true });
  }
});

test("fs_list_files refuses an unrecognized root and a traversal path the same way fs_read_file does", async () => {
  const handler = handlerFor(buildFsFilesRegistrations(toolDeps()), FS_LIST_FILES_TOOL_ID);
  await assert.rejects(() => handler(toolContext({ root: "not-a-real-root" }, FS_LIST_FILES_TOOL_ID)), /is not a recognized root/);
  await assert.rejects(() => handler(toolContext({ root: "site", path: "../../../etc" }, FS_LIST_FILES_TOOL_ID)), /resolves outside the allowed root/);
});

test("without a resolveRoots override, the 'site' root is the bound site directory and 'custom' is unset", async () => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-fsfiles-default-roots-"));
  try {
    fs.writeFileSync(path.join(siteDir, "notes.txt"), "hello");
    const deps = toolDeps({ resolveRoots: undefined, siteBinding: { dir: siteDir } });
    const registrations = buildFsFilesRegistrations(deps);
    const listed = await handlerFor(registrations, FS_LIST_FILES_TOOL_ID)(toolContext({ root: "site" }, FS_LIST_FILES_TOOL_ID)) as { files: Array<{ path: string } | string> };
    assert.ok(JSON.stringify(listed.files).includes("notes.txt"));
    await assert.rejects(() => handlerFor(registrations, FS_READ_FILE_TOOL_ID)(toolContext({ root: "custom", path: "x.txt" }, FS_READ_FILE_TOOL_ID)), /no folder has been set for the 'custom' root yet/);
  } finally { fs.rmSync(siteDir, { recursive: true, force: true }); }
});

test("contributeFsFilesTools contributes this domain's registrations and derived risk", () => {
  const contributor = contributeFsFilesTools();
  assert.equal(contributor.domain, "fs-files");
  assert.equal(contributor.build, buildFsFilesRegistrations);
  assert.equal(contributor.risk, fsFilesDerivedRisk);
});

test("the exported raw handler reaches requireCurrentSite before root resolution", async () => {
  const { roots } = makeFixtureRoots();
  const deps = toolDeps({ siteBinding: { dir: roots.site }, resolveRoots: () => { assert.fail('site selector must be refused before root access'); } });
  for (const toolId of [FS_LIST_FILES_TOOL_ID, FS_READ_FILE_TOOL_ID]) {
    const handler = handlerFor(buildFsFilesRegistrations(deps), toolId);
    await assert.rejects(() => handler(toolContext({ root: 'site', path: 'inside.txt', site: 'another-site' }, toolId)), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /active site/);
      assert.doesNotMatch(error.message, /OUTSIDE_CANARY_CONTENT|outside-canary.txt/);
      return true;
    });
  }
});
