import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setCustomFsRoot } from "../custom-root-store.js";

import { createRouteDeps } from "../../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../../server/runtime/composition/tool-catalog-manifest.js";

import { buildAssistantToolRegistrations } from "../../../assistant/tool-registrations.js";
import { FS_LIST_FILES_TOOL_ID, FS_READ_FILE_TOOL_ID } from "../agent-tools.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/**
 * @file Proves `fs_list_files`/`fs_read_file` are not merely DEFINED but actually REGISTERED and
 * reachable through the real production wiring path — this repo's dominant defect class is "correct
 * primitive, unwired call site" (a tool that exists in a file but never reaches the catalog).
 *
 * Traces the exact path a real boot takes: `installFirstPartyToolContributors()`
 * (`server/runtime/composition/tool-catalog-manifest.ts`) registers `contributeFsFilesTools()` into
 * the same module-level registry every other first-party domain uses, and
 * `buildAssistantToolRegistrations` (`assistant/tool-registrations.ts`) folds every registered
 * contributor together against a REAL `RouteDeps` fixture (`createRouteDeps()` — the identical
 * function `agent-daemon-server.ts` calls at real boot when `TOVU_DB=memory`), exactly mirroring
 * `assistant/__tests__/tool-contribution-registry.test.ts`'s own "domain IS installed" pattern.
 */

test.beforeEach(() => {
  contributions.contributors.clear({});
});

test("fs_list_files and fs_read_file are registered by installFirstPartyToolContributors and reach buildAssistantToolRegistrations's real catalog", () => {
  installFirstPartyToolContributors({ contributions });

  const registrations = buildAssistantToolRegistrations(createRouteDeps(), undefined, { contributions });
  const ids = registrations.map((r) => r.descriptor.id);

  assert.ok(ids.includes(FS_LIST_FILES_TOOL_ID), `expected '${FS_LIST_FILES_TOOL_ID}' in the built catalog`);
  assert.ok(ids.includes(FS_READ_FILE_TOOL_ID), `expected '${FS_READ_FILE_TOOL_ID}' in the built catalog`);
});

test("both tools are marked readOnly in their descriptor, matching their 'none' sideEffects declaration", () => {
  installFirstPartyToolContributors({ contributions });

  const registrations = buildAssistantToolRegistrations(createRouteDeps(), undefined, { contributions });
  const byId = new Map(registrations.map((r) => [r.descriptor.id, r]));

  assert.equal(byId.get(FS_LIST_FILES_TOOL_ID)?.descriptor.readOnly, true);
  assert.equal(byId.get(FS_READ_FILE_TOOL_ID)?.descriptor.readOnly, true);
});

test("without installFirstPartyToolContributors, neither tool is present — proving the assertion above is about real installation, not an always-present default", () => {
  // Deliberately no installFirstPartyToolContributors() call — resetToolContributorsForTests() in
  // beforeEach already left the registry empty.
  const registrations = buildAssistantToolRegistrations(createRouteDeps(), undefined, { contributions });
  const ids = registrations.map((r) => r.descriptor.id);

  assert.equal(ids.includes(FS_LIST_FILES_TOOL_ID), false);
  assert.equal(ids.includes(FS_READ_FILE_TOOL_ID), false);
});

test("catalog filesystem handlers use the current workspace's persisted custom root", async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "fs-catalog-root-"));
  const original = process.env.TOVU_SITE_DIR;
  process.env.TOVU_SITE_DIR = base;
  t.after(() => {
    if (original === undefined) delete process.env.TOVU_SITE_DIR;
    else process.env.TOVU_SITE_DIR = original;
    fs.rmSync(base, { recursive: true, force: true });
  });
  const ownRoot = path.join(base, "own");
  const otherRoot = path.join(base, "other");
  fs.mkdirSync(ownRoot);
  fs.mkdirSync(otherRoot);
  fs.writeFileSync(path.join(ownRoot, "note.txt"), "own workspace");
  fs.writeFileSync(path.join(otherRoot, "note.txt"), "other workspace");
  fs.writeFileSync(path.join(otherRoot, "other-only.txt"), "other file");
  const deps = createRouteDeps();
  setCustomFsRoot(deps.workspaceId, ownRoot, { siteDir: base });
  setCustomFsRoot("other-workspace", otherRoot, { siteDir: base });
  deps.authorize = async () => ({ allowed: true }) as never;
  installFirstPartyToolContributors({ contributions });
  const catalog = buildAssistantToolRegistrations(deps, undefined, { contributions });
  const read = catalog.find((r) => r.descriptor.id === FS_READ_FILE_TOOL_ID);
  const list = catalog.find((r) => r.descriptor.id === FS_LIST_FILES_TOOL_ID);
  assert.ok(read);
  assert.ok(list);
  const context = { principal: { id: "principal-1" }, run: { id: "run-1" } };
  assert.deepEqual(await read.handler({ ...context, tool: { id: FS_READ_FILE_TOOL_ID }, input: { root: "custom", path: "note.txt" } } as never),
    { root: "custom", path: "note.txt", content: "own workspace", bytes: 13 });
  const listing = await list.handler({ ...context, tool: { id: FS_LIST_FILES_TOOL_ID }, input: { root: "custom" } } as never) as { files: unknown[] };
  assert.equal(listing.files.length, 1);
  assert.deepEqual(listing.files, ["note.txt"]);
});
