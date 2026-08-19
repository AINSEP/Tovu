/**
 * @file The ADR-021 §2 half of the Widgets tool wiring — the sibling of
 * `tool-registrations.widgets-contracts.test.ts`, and the Widgets counterpart of
 * `tool-registrations.forms.test.ts`'s authorization section / `tool-registrations.identity-
 * authorization.test.ts`.
 *
 * What is pinned:
 * 1. every one of the 12 wired tools calls `authorize()` with its catalog's declared
 *    `widgets.*` permission and the run's principal, before any durable write;
 * 2. a denied caller is refused and writes nothing, for every tool;
 * 3. the 9 tools whose underlying domain function self-gates (`createWidgetInstance` et al.
 *    calling `requireWidgetPermission` as their own first line) and the 3 that instead rely on
 *    THIS wiring file's own inline `requireWidgetPermission` call (`widgets_list_regions`/
 *    `widgets_get_region`/`widgets_bind_region` — see `tool-registrations.ts`'s widgets section
 *    header) are both proven to actually gate, not just declared to;
 * 4. the `ToolPolicy` layer is a pass-through for all 12, consistent with (3).
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryEntryRefsRepo } from "../../core/entry-refs/repo.memory.js";
import { InMemoryContentTypeRepo } from "../../features/content-types/index.js";
import { InMemoryEntryRepo } from "../../features/entries/index.js";
import { widgetsAgentToolCatalog, type AgentToolDefinition } from "../../widgets/agent-tools.js";
import { WidgetForbiddenError } from "../../widgets/errors.js";
import { InMemoryWidgetRegionBindingRepo } from "../../widgets/repo.memory.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeWidgetsTools } from "../../widgets/tool-registrations.js";

// Widgets moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 batch 2 — see `tool-contribution-registry.ts`'s
// header), so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly
// installs it first, mirroring what the real composition roots now do via
// `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
contributeWidgetsTools();

const WORKSPACE_ID = "ws-widgets-auth";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const entryRepo = new InMemoryEntryRepo();
  const contentTypeRepo = new InMemoryContentTypeRepo();
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  const widgetBindingRepo = new InMemoryWidgetRegionBindingRepo();
  const authorizeCalls: Array<Record<string, unknown>> = [];

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined },
    entryRepo,
    contentTypeRepo,
    entryRefsRepo,
    widgetBindingRepo,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, entryRepo, widgetBindingRepo, authorizeCalls };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

const WIDGETS_TOOL_IDS: ReadonlySet<string> = new Set(widgetsAgentToolCatalog.map((tool) => tool.name));

function widgetsRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => WIDGETS_TOOL_IDS.has(r.descriptor.id))
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = widgetsRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = widgetsAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

/** Seed a full workspace fixture (a widget instance, a bound region containing it, and an inline embed) so every tool's happy-path input has real state to act on before the gate. */
async function seedFixture(deps: RouteDeps): Promise<{ widgetInstanceId: string; regionKey: string; areaVersion: number; hostEntryId: string; hostVersion: number; placementId: string }> {
  const created = (await wired("widgets_create_instance", deps).handler(executionContext({ widgetType: "text", title: "Seed", config: { body: "x" } }))) as {
    instance: { id: string };
  };
  const bound = (await wired("widgets_bind_region", deps).handler(executionContext({ regionKey: "footer" }))) as { area: { version: number } };
  const placed = (await wired("widgets_set_region_placements", deps).handler(
    executionContext({ regionKey: "footer", baseVersion: bound.area.version, placements: [{ widgetEntryId: created.instance.id, enabled: true }] }),
  )) as { area: { version: number } };

  // A non-widget host entry for the embed tools — same envelope shape `write-service.ts`'s own
  // `createEntry` chokepoint requires (ADR-022 §2).
  const contentTypeRepo = (deps as unknown as { contentTypeRepo: InMemoryContentTypeRepo }).contentTypeRepo;
  const entryRepo = (deps as unknown as { entryRepo: InMemoryEntryRepo }).entryRepo;
  const { registerContentType } = await import("../../features/content-types/write-service.js");
  const { createEntry } = await import("../../features/entries/index.js");
  const { NoopContentTypeIndexProvisioner } = await import("../../features/content-types/repo.memory.js");
  const { PRE_AUTHORIZED } = await import("../../widgets/authorize-helper.js");
  await registerContentType({
    deps: { repo: contentTypeRepo, clock: { nowIso: () => NOW }, ids: { newId: () => "ct-seed" }, authorize: PRE_AUTHORIZED, indexProvisioner: new NoopContentTypeIndexProvisioner(), outbox: { enqueue: async () => undefined } },
    input: { actorId: PRINCIPAL_ID, workspaceId: WORKSPACE_ID, key: "article", label: "Article", fields: [] },
  });
  const hostCreated = await createEntry({
    deps: { entryRepo, contentTypeRepo, clock: { nowIso: () => NOW }, ids: { newId: () => "entry-seed" }, authorize: PRE_AUTHORIZED, outbox: { enqueue: async () => undefined } },
    input: { actorId: PRINCIPAL_ID, workspaceId: WORKSPACE_ID, type: "article", slug: "host-seed", title: "Host", fieldsJson: { ext: { site: {} } }, bodyJson: { type: "doc", content: [] } },
  });
  if (!hostCreated.ok) throw hostCreated.error;

  const embedded = (await wired("widgets_insert_embed", deps).handler(
    executionContext({ hostEntryId: hostCreated.value.entry.id, baseVersion: hostCreated.value.entry.version, widgetEntryId: created.instance.id }),
  )) as { entryVersion: number; placementId: string };

  return {
    widgetInstanceId: created.instance.id,
    regionKey: "footer",
    areaVersion: placed.area.version,
    hostEntryId: hostCreated.value.entry.id,
    hostVersion: embedded.entryVersion,
    placementId: embedded.placementId,
  };
}

// ---------------------------------------------------------------------------
// 1. Coverage — a newly wired tool cannot silently skip this file
// ---------------------------------------------------------------------------

test("every wired widgets tool has an input fixture here — wiring one without adding it fails rather than going untested", async () => {
  const { deps } = fakeRouteDeps();
  const wiredIds = [...widgetsRegistrations(deps).keys()].sort();
  assert.deepEqual(wiredIds, widgetsAgentToolCatalog.map((tool) => tool.name).sort());
  assert.equal(wiredIds.length, 12);
});

// ---------------------------------------------------------------------------
// 2/3. Every tool actually gates on its declared permission, whichever layer enforces it
// ---------------------------------------------------------------------------

function toolInputs(fixture: Awaited<ReturnType<typeof seedFixture>>): Record<string, Record<string, unknown>> {
  return {
    widgets_list_instances: {},
    widgets_get_instance: { widgetInstanceId: fixture.widgetInstanceId },
    widgets_list_regions: {},
    widgets_get_region: { regionKey: fixture.regionKey },
    widgets_create_instance: { widgetType: "text", title: "Another", config: { body: "y" } },
    widgets_update_instance: { widgetInstanceId: fixture.widgetInstanceId, baseVersion: 1, config: { body: "updated" } },
    widgets_trash_instance: { widgetInstanceId: fixture.widgetInstanceId },
    widgets_bind_region: { regionKey: "sidebar" },
    widgets_set_region_placements: { regionKey: fixture.regionKey, baseVersion: fixture.areaVersion, placements: [{ widgetEntryId: fixture.widgetInstanceId, enabled: true }] },
    widgets_insert_embed: { hostEntryId: fixture.hostEntryId, baseVersion: fixture.hostVersion, widgetEntryId: fixture.widgetInstanceId },
    widgets_remove_embed: { hostEntryId: fixture.hostEntryId, baseVersion: fixture.hostVersion, placementId: fixture.placementId },
    widgets_reorder_embeds: { hostEntryId: fixture.hostEntryId, baseVersion: fixture.hostVersion, orderedWidgetEntryIds: [fixture.widgetInstanceId] },
  };
}

const EXPECTED_PERMISSIONS: Record<string, string> = {
  widgets_list_instances: "widgets.read",
  widgets_get_instance: "widgets.read",
  widgets_list_regions: "widgets.read",
  widgets_get_region: "widgets.read",
  widgets_create_instance: "widgets.create",
  widgets_update_instance: "widgets.update",
  widgets_trash_instance: "widgets.delete",
  widgets_bind_region: "widgets.place",
  widgets_set_region_placements: "widgets.place",
  widgets_insert_embed: "widgets.place",
  widgets_remove_embed: "widgets.place",
  widgets_reorder_embeds: "widgets.place",
};

test("every wired widgets tool declares exactly the permission EXPECTED_PERMISSIONS pins — a drift here means the catalog and this test disagree", () => {
  for (const toolId of Object.keys(EXPECTED_PERMISSIONS)) {
    assert.equal(catalogEntry(toolId).authorization.permission, EXPECTED_PERMISSIONS[toolId]);
  }
});

for (const toolId of Object.keys(EXPECTED_PERMISSIONS)) {
  test(`${toolId}: calls authorize() with its declared permission and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    const fixture = await seedFixture(deps);
    authorizeCalls.length = 0;

    await wired(toolId, deps).handler(executionContext(toolInputs(fixture)[toolId]));

    const matching = authorizeCalls.filter((call) => call.permission === EXPECTED_PERMISSIONS[toolId]);
    assert.ok(matching.length >= 1, `expected at least one authorize() call for '${EXPECTED_PERMISSIONS[toolId]}', got calls: ${JSON.stringify(authorizeCalls)}`);
    assert.equal(matching[0].principalId, PRINCIPAL_ID);
    assert.equal(matching[0].workspaceId, WORKSPACE_ID);
  });

  test(`${toolId}: a denied principal is rejected and NOTHING is written`, async () => {
    const { deps: seedDeps } = fakeRouteDeps();
    const fixture = await seedFixture(seedDeps);

    const { deps, entryRepo, widgetBindingRepo } = fakeRouteDeps({ allow: false });
    // `widgets_set_region_placements` resolves regionKey -> areaEntryId via
    // `widgetBindingRepo.findByRegion` BEFORE calling `mutateWidgetAreaPlacements` (whose internal
    // `requireWidgetPermission` is the actual gate) — mirroring `region-mutate-placements.ts`'s own
    // identical order (that route has no authorize() call of its own either). Against a workspace
    // with NO region bound at all, that resolution 404s before the gate is ever reached, which would
    // prove nothing about authorization. Seed a binding row directly (bypassing the tool layer,
    // exactly the setup this ordering requires) so the call reaches the real internal gate.
    if (toolId === "widgets_set_region_placements") {
      await widgetBindingRepo.upsert({ workspaceId: WORKSPACE_ID, regionKey: fixture.regionKey, areaEntryId: "placeholder-area-entry", updatedAt: NOW });
    }

    await assert.rejects(
      () => wired(toolId, deps).handler(executionContext(toolInputs(fixture)[toolId])),
      (error: unknown) => {
        assert.ok(error instanceof WidgetForbiddenError, `expected WidgetForbiddenError, got ${String(error)}`);
        return true;
      },
    );

    assert.deepEqual(await entryRepo.listByWorkspace({ workspaceId: WORKSPACE_ID, type: "widget" }), [], "a denied caller must not have created/altered any widget entry");
    const bindings = await widgetBindingRepo.listByWorkspace({ workspaceId: WORKSPACE_ID });
    const realBindings = bindings.filter((b) => b.areaEntryId !== "placeholder-area-entry");
    assert.deepEqual(realBindings, [], "a denied caller must not have bound/altered any REAL region (the placeholder seed row itself is test setup, not tool output)");
  });
}

test("the ToolPolicy layer is a pass-through 'allow' for every widgets registration — enforcement is the domain layer's (or this file's own inline gate), by design", async () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of widgetsRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

test("every wired widgets tool declares a widgets.* permission — never an unrelated or read-only-looking permission on a mutating tool", () => {
  for (const toolId of Object.keys(EXPECTED_PERMISSIONS)) {
    assert.match(catalogEntry(toolId).authorization.permission, /^widgets\./);
  }
});
