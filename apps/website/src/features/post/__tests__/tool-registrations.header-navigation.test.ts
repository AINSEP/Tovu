import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { capabilityCard as themes } from "#src/features/theme/capability-card";
import { InMemoryPostRepo } from "../repo.memory.js";
import { postAgentToolCatalog } from "../agent-tools.js";
import { buildPostRegistrations, PAGE_HEADER_NAVIGATION, type PostToolDeps } from "../tool-registrations.js";

/**
 * @file Demo 2026-11-02: after creating pages the chat's final summary named header links ("Menu",
 * "Visit", …) that the live header did not show. The theme header renders the site MENU (the
 * `menu-header-nav` marker in the starter's nav partial), not the page list, and nothing the model
 * saw said so. A created page's result now says where header links come from, and the guidance names
 * the menu tools that change them.
 */

function registrations(): Map<string, ToolRegistration> {
  let counter = 0;
  const deps = {
    workspaceId: "ws-header-nav", clock: { nowMs: () => Date.parse("2026-11-02T00:00:00.000Z") },
    idGen: { newId: () => `id-${++counter}` }, changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(), bus: new InMemoryEventBus(), postRepo: new InMemoryPostRepo(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as PostToolDeps;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  return new Map(buildPostRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

async function create(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const registration = registrations().get("content_post_create");
  assert.ok(registration);
  const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: "owner" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
  return await registration.handler(ctx) as Record<string, unknown>;
}

test("a created page's result says the header shows the site menu, not the page, and names the menu tools", async () => {
  const result = await create({ kind: "page", title: "Visit", status: "published" });
  assert.equal(result.headerNavigation, PAGE_HEADER_NAVIGATION);
  assert.match(PAGE_HEADER_NAVIGATION, /header shows the site menu/);
  assert.match(PAGE_HEADER_NAVIGATION, /menus_list_menus/);
  assert.match(PAGE_HEADER_NAVIGATION, /menus_update_menu_tree/);
});

test("a created post carries no header note: posts are listed by the theme, not linked from the header", async () => {
  const result = await create({ title: "Hello" });
  assert.equal("headerNavigation" in result, false);
});

test("the create description and the Themes guide topic say navigation changes through the menu tools", () => {
  const description = postAgentToolCatalog.find((tool) => tool.name === "content_post_create")?.description ?? "";
  assert.match(description, /not added to the site header/);
  assert.match(description, /menus_update_menu_tree/);
  assert.match(themes.explanation, /header and footer render the site menus/);
  assert.match(themes.explanation, /menus_update_menu_tree/);
});
