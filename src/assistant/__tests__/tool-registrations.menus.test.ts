/**
 * Covers, for the 5 Menus (navigation) tools, the union of what `tool-registrations.forms.test.ts`
 * covers for Forms: published contracts, risk cross-check, the confirmation-transport guard, the
 * model-facing output projection, and the authorization half — combined into one file (mirrors
 * Forms' combined style) rather than split, since Menus' tool count and risk profile are
 * Forms-sized, not Identity-sized.
 *
 * Like Media, `menu-service.ts`'s functions perform NO internal `authorize()` call of their own —
 * this file's assertions pin that `tool-registrations.ts`'s OWN inline `requireMenusPermission` call
 * is what actually gates every Menus tool (see `navigation/agent-tools.ts`'s file header).
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { ForbiddenError } from "../../core/commands/command";
import {
  InMemoryMenuRepo,
  InMemoryNavLocationBindingRepo,
  menusAgentToolCatalog,
  type NavigationAgentToolDefinition,
} from "../../navigation";
import type { RouteDeps } from "../../server/routes/types";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations";

const WORKSPACE_ID = "ws-menus-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const menuRepo = new InMemoryMenuRepo();
  const navLocationBindingRepo = new InMemoryNavLocationBindingRepo();
  const authorizeCalls: Array<Record<string, unknown>> = [];

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined },
    menuRepo,
    navLocationBindingRepo,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, menuRepo, authorizeCalls };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): NavigationAgentToolDefinition {
  const entry = menusAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function menusRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => r.descriptor.id.startsWith("menus_"))
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = menusRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/** Seeds a menu through the real create tool, so tests operate on genuine domain output. */
async function seedMenu(deps: RouteDeps): Promise<{ id: string }> {
  const out = (await wired("menus_create_menu", deps).handler(executionContext({ title: "Primary", slug: "primary" }))) as {
    menu: { id: string };
  };
  return out.menu;
}

// ---------------------------------------------------------------------------
// 1. The catalog is complete and honest about what Menus can do
// ---------------------------------------------------------------------------

test("exactly the 5 safe menu-service.ts operations are wired — no invented delete/purge tool", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...menusRegistrations(deps).keys()].sort(), [
    "menus_assign_location",
    "menus_create_menu",
    "menus_get_menu",
    "menus_list_menus",
    "menus_update_menu_tree",
  ]);
});

test("no wired menus tool is named or claims a delete/purge — deleteMenu conflates trash and purge with no decomposed trash-only entrypoint", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of menusRegistrations(deps)) {
    assert.equal(/delete|destroy|purge|drop|trash/i.test(id), false, `'${id}' must not be named for a delete/trash/purge`);
    const claim = registration.descriptor.description.replace(/\b(never|no|not|cannot|can't|won't)\b[^.;—]*/gi, "");
    assert.equal(/\b(delete|destroy|purge|drop|trash)(s|d|ing)?\b/i.test(claim), false, `'${id}' must not claim a delete/trash/purge capability`);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired Menus registration publishes its catalog entry's inputSchema and description", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of menusRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's, not a second copy`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired Menus tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of menusRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined, `${id} must not request confirmation until a transport exists`);
  }
});

test("an invalid slug is rejected with the schema attached for retry", async () => {
  const { deps } = fakeRouteDeps();
  const error = await wired("menus_create_menu", deps)
    .handler(executionContext({ title: "Bad Slug", slug: "Not A Slug!" }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "an invalid slug must reject");
  assert.match(error.message, /will not resolve on retry without an input change/);
  assert.match(error.message, /"pattern":"\^\[a-z0-9-\]\+\$"/, "the published schema must travel with the failure");
});

test("a duplicate slug on update is refused, distinctly from a validation-shaped error", async () => {
  const { deps } = fakeRouteDeps();
  await wired("menus_create_menu", deps).handler(executionContext({ title: "Footer", slug: "footer" }));
  const { id } = await seedMenu(deps);

  await assert.rejects(
    () => wired("menus_update_menu_tree", deps).handler(executionContext({ menuId: id, expectedVersion: 1, items: [], slug: "footer" })),
    /already exists/,
  );
});

// ---------------------------------------------------------------------------
// 3. Output projection
// ---------------------------------------------------------------------------

test("a tool result is an explicit model-facing view: workspaceId/updatedAt dropped, id kept for the next call's menuId", async () => {
  const { deps } = fakeRouteDeps();
  const created = (await wired("menus_create_menu", deps).handler(executionContext({ title: "Primary", slug: "primary" }))) as {
    menu: Record<string, unknown>;
  };

  assert.deepEqual(Object.keys(created.menu).sort(), ["id", "items", "locations", "slug", "status", "title", "version"]);
  assert.equal("workspaceId" in created.menu, false, "the agent is already scoped to one workspace it cannot change");
  assert.equal("updatedAt" in created.menu, false);
  assert.equal(created.menu.status, "draft");
});

test("the returned items tree is a deep copy — mutating a nested child cannot reach stored domain state", async () => {
  const { deps, menuRepo } = fakeRouteDeps();
  const created = (await wired("menus_create_menu", deps).handler(
    executionContext({
      title: "Primary",
      slug: "primary",
      items: [{ id: "item-1", target: { kind: "url", href: "/" }, children: [{ id: "item-1-child", target: { kind: "url", href: "/a" } }] }],
    }),
  )) as { menu: { id: string; items: Array<{ children?: Array<{ id: string }> }> } };

  created.menu.items[0].children?.push({ id: "injected" });

  const stored = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: created.menu.id });
  assert.equal(stored?.doc.items[0].children?.length, 1, "pushing onto the returned view's nested array must not reach the stored record");
});

// ---------------------------------------------------------------------------
// 4. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the real Menus catalog and tool-registrations' independent classification agree for all 5 wired tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of menusRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a Menus catalog entry cannot downgrade its own risk — declaring sideEffects:'none' fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("menus_create_menu", { ...catalogEntry("menus_create_menu"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("no wired Menus tool carries a confirmation-requiring actor-class rule", () => {
  const { deps } = fakeRouteDeps();
  for (const id of menusRegistrations(deps).keys()) {
    assert.notEqual(catalogEntry(id).actorClassRule, "confirmer-must-equal-own-delegatedBy");
  }
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow — proving several tools compose correctly in sequence
// ---------------------------------------------------------------------------

test("workflow: create a menu, add items to it, then assign it to a location — reads reflect the whole chain under the SAME id", async () => {
  const { deps } = fakeRouteDeps();

  // Step 1: create an empty draft menu.
  const created = (await wired("menus_create_menu", deps).handler(executionContext({ title: "Main Nav", slug: "main-nav" }))) as {
    menu: { id: string; status: string; version: number; items: unknown[] };
  };
  assert.equal(created.menu.status, "draft");
  assert.equal(created.menu.version, 1);
  assert.deepEqual(created.menu.items, []);

  // Step 2: replace its whole item tree, chaining off the id and version step 1 returned.
  const updated = (await wired("menus_update_menu_tree", deps).handler(
    executionContext({
      menuId: created.menu.id,
      expectedVersion: created.menu.version,
      items: [
        { id: "home", label: "Home", target: { kind: "url", href: "/" } },
        { id: "about", label: "About", target: { kind: "url", href: "/about" } },
      ],
    }),
  )) as { menu: { id: string; version: number; items: Array<{ id: string; label?: string }> } };
  assert.equal(updated.menu.id, created.menu.id, "the id returned by create must be the exact id accepted by update");
  assert.equal(updated.menu.items.length, 2);
  assert.equal(updated.menu.version, 2, "version must have advanced from create's version 1");

  // Step 3: read it back independently — the items from step 2 must be visible via a fresh read, not just the write's own echo.
  const read = (await wired("menus_get_menu", deps).handler(executionContext({ menuId: created.menu.id }))) as {
    menu: { items: Array<{ id: string; label?: string }>; version: number };
  };
  assert.deepEqual(read.menu.items.map((item) => item.id).sort(), ["about", "home"]);
  assert.equal(read.menu.version, 2);

  // Step 4: assign the menu (still identified by the SAME id) to a location, chaining off step 2's version.
  const assigned = (await wired("menus_assign_location", deps).handler(
    executionContext({ menuId: created.menu.id, locationKey: "primary" }),
  )) as { menu: { id: string; locations: string[]; version: number }; binding: { locationKey: string; menuId: string } };
  assert.equal(assigned.menu.id, created.menu.id);
  assert.deepEqual(assigned.menu.locations, ["primary"]);
  assert.equal(assigned.binding.menuId, created.menu.id, "the binding must reference the SAME menu id created in step 1");
  assert.equal(assigned.menu.version, 3, "version must have advanced again from step 2's version 2");

  // Step 5: list_menus must show the fully composed result of the whole chain — items, location, and final version.
  const listed = (await wired("menus_list_menus", deps).handler(executionContext({}))) as {
    menus: Array<{ id: string; items: unknown[]; locations: string[]; version: number }>;
  };
  const found = listed.menus.find((m) => m.id === created.menu.id);
  assert.ok(found, "the menu created in step 1 must be visible via list, under the SAME id used throughout");
  assert.equal(found.items.length, 2, "the list read must reflect step 2's item tree");
  assert.deepEqual(found.locations, ["primary"], "the list read must reflect step 4's location assignment");
  assert.equal(found.version, 3, "the list read must see the final version after the whole chain, not a stale one");
});

// ---------------------------------------------------------------------------
// 6. Authorization — Menus' own inline gate (menu-service.ts has none of its own)
// ---------------------------------------------------------------------------

const TOOL_INPUTS: Record<string, (seededId: string) => Record<string, unknown>> = {
  menus_list_menus: () => ({}),
  menus_get_menu: (id) => ({ menuId: id }),
  menus_create_menu: () => ({ title: "Footer", slug: "footer" }),
  menus_update_menu_tree: (id) => ({ menuId: id, expectedVersion: 1, items: [] }),
  menus_assign_location: (id) => ({ menuId: id, locationKey: "primary" }),
};

const EXPECTED_PERMISSIONS: Record<string, string> = {
  menus_list_menus: "admin.menus.read",
  menus_get_menu: "admin.menus.read",
  menus_create_menu: "admin.menus.create",
  menus_update_menu_tree: "admin.menus.update",
  menus_assign_location: "admin.menus.assign",
};

test("every wired Menus tool has a known input fixture and expected permission — a newly wired tool must be added here, not silently skipped", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...menusRegistrations(deps).keys()].sort(), Object.keys(TOOL_INPUTS).sort());
  assert.deepEqual(Object.keys(TOOL_INPUTS).sort(), Object.keys(EXPECTED_PERMISSIONS).sort());
});

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with the catalog's declared permission and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    const { id } = await seedMenu(deps);
    authorizeCalls.length = 0;

    await wired(toolId, deps).handler(executionContext(TOOL_INPUTS[toolId](id)));

    assert.equal(authorizeCalls.length, 1, "exactly one authorization evaluation");
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, catalogEntry(toolId).authorization.permission);
    assert.equal(authorizeCalls[0].permission, EXPECTED_PERMISSIONS[toolId]);
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
    assert.equal(authorizeCalls[0].entityType, "menu");
  });

  test(`${toolId}: a denied principal is rejected and NOTHING is written`, async () => {
    const { deps: seedDeps, menuRepo: seedRepo } = fakeRouteDeps();
    const { id } = await seedMenu(seedDeps);
    const before = await seedRepo.list({ workspaceId: WORKSPACE_ID });

    const { deps, menuRepo } = fakeRouteDeps({ allow: false });
    await assert.rejects(
      () => wired(toolId, deps).handler(executionContext(TOOL_INPUTS[toolId](id))),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError, `expected ForbiddenError, got ${String(error)}`);
        assert.match((error as Error).message, new RegExp(PRINCIPAL_ID));
        assert.match((error as Error).message, new RegExp(EXPECTED_PERMISSIONS[toolId].replace(/\./g, "\\.")));
        return true;
      },
    );

    assert.deepEqual(await menuRepo.list({ workspaceId: WORKSPACE_ID }), [], "the permission gate must run ahead of every durable effect");
    assert.equal(before.length, 1, "sanity: the seed really did create a menu when allowed");
  });
}

test("the ToolPolicy layer is a pass-through 'allow' for every Menus registration — enforcement is this file's own inline requireMenusPermission call, by design", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of menusRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});
