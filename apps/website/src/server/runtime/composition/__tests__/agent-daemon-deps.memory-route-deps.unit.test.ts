import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRouteDeps } from "../app.js";
import { coreForSite } from "./helpers/daemon-core.js";

/** Memory composition has local run resources, never a second site or enqueue-only outbox. */
test("TOVU_DB=memory retains daemon resources without creating site tool or outbox dependencies", async t => {
  const server = createRouteDeps();
  const core = await coreForSite({ deps: server, t, env: { TOVU_DB: "memory" } });
  assert.equal(core.workspaceId, server.workspaceId);
  for (const field of ["outbox", "bus", "postRepo", "pluginRuntimeReady"]) assert.equal(field in core, false, field);
  assert.equal(core.siteStoragePaths.chatAttachmentsDir, server.siteStoragePaths.chatAttachmentsDir);
});
