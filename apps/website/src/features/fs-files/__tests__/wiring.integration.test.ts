import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "../../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../../server/runtime/composition/tool-catalog-manifest.js";
import { resetToolContributorsForTests } from "../../../assistant/tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../../../assistant/tool-registrations.js";
import { FS_LIST_FILES_TOOL_ID, FS_READ_FILE_TOOL_ID } from "../agent-tools.js";

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
  resetToolContributorsForTests();
});

test("fs_list_files and fs_read_file are registered by installFirstPartyToolContributors and reach buildAssistantToolRegistrations's real catalog", () => {
  installFirstPartyToolContributors();

  const registrations = buildAssistantToolRegistrations(createRouteDeps());
  const ids = registrations.map((r) => r.descriptor.id);

  assert.ok(ids.includes(FS_LIST_FILES_TOOL_ID), `expected '${FS_LIST_FILES_TOOL_ID}' in the built catalog`);
  assert.ok(ids.includes(FS_READ_FILE_TOOL_ID), `expected '${FS_READ_FILE_TOOL_ID}' in the built catalog`);
});

test("both tools are marked readOnly in their descriptor, matching their 'none' sideEffects declaration", () => {
  installFirstPartyToolContributors();

  const registrations = buildAssistantToolRegistrations(createRouteDeps());
  const byId = new Map(registrations.map((r) => [r.descriptor.id, r]));

  assert.equal(byId.get(FS_LIST_FILES_TOOL_ID)?.descriptor.readOnly, true);
  assert.equal(byId.get(FS_READ_FILE_TOOL_ID)?.descriptor.readOnly, true);
});

test("without installFirstPartyToolContributors, neither tool is present — proving the assertion above is about real installation, not an always-present default", () => {
  // Deliberately no installFirstPartyToolContributors() call — resetToolContributorsForTests() in
  // beforeEach already left the registry empty.
  const registrations = buildAssistantToolRegistrations(createRouteDeps());
  const ids = registrations.map((r) => r.descriptor.id);

  assert.equal(ids.includes(FS_LIST_FILES_TOOL_ID), false);
  assert.equal(ids.includes(FS_READ_FILE_TOOL_ID), false);
});
