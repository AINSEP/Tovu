import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { currentToolIdFor, deriveContentReadRegistrations } from "#src/assistant/content-read-tool";
import { buildRegistrations, type Deps } from "../list-tool.js";

test("site card remaps eval ground truth and reads by folder name with serving context preserved", async () => {
  let reads = 0;
  const site = { name: "alpha", dir: "/tmp/sites/alpha", displayName: "Alpha", createdAt: "now", active: true };
  const deps: Deps = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }),
    siteBinding: { dir: site.dir, name: "alpha", dirOverridden: false, switcherCompatible: true },
    listSites: () => { reads++; return [site]; }, readPersistedActiveSite: () => "beta", isSiteSwitcherEnabled: () => false };
  const card = () => deriveContentReadRegistrations(buildRegistrations(deps)).find(r => r.descriptor.id === "content_read.site")!;
  assert.equal(currentToolIdFor("sites_list"), "content_read.site");
  assert.ok(card());
  const ctx = (input: unknown) => ({ input, principal: { id: "owner" } } as ToolExecutionContext);
  const listed = await card().handler(ctx({})) as { sites: unknown[]; persistedSiteName: string };
  const single = await card().handler(ctx({ name: "alpha" })) as typeof listed;
  assert.deepEqual(single, listed);
  assert.equal(single.persistedSiteName, "beta");
  await assert.rejects(card().handler(ctx({ name: "missing" })), { message: "site 'missing' was not found — call content_read.site without name to list valid sites" });
  await assert.rejects(card().handler(ctx({ name: "" })), ToolInputError);
  deps.authorize = async () => ({ allowed: false, reason: "denied" });
  await assert.rejects(card().handler(ctx({ name: "alpha" })), { message: "principal 'owner' is not authorized for 'system.read' (denied)" });
  assert.equal(reads, 3);
});
