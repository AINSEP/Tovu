/**
 * @file The published-contract half of the Widgets tool wiring — the sibling of
 * `tool-registrations.widgets-authorization.test.ts`, and the Widgets counterpart of
 * `tool-registrations.forms.test.ts`'s contract sections.
 *
 * Covers: catalog completeness/honesty about the one deliberate exclusion (purge), published
 * schema/description parity, the confirmation-transport guard, model-facing output projection, risk
 * metadata cross-checking, and a multi-tool workflow test proving several of these 12 tools compose
 * correctly in the sequence a real admin task would use (create a widget, bind a region, place the
 * widget into it, then read it back resolved) — not just that each tool works in isolation.
 *
 * Real in-memory adapters throughout (`InMemoryEntryRepo`, `InMemoryContentTypeRepo`,
 * `InMemoryEntryRefsRepo`, `InMemoryWidgetRegionBindingRepo`) — no mocking of the chokepoint itself,
 * per Constitution Article V (Integration-First Testing), mirroring
 * `widgets/__tests__/integration/*.test.ts`'s own discipline.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryEntryRefsRepo } from "../../contracts/core/entry-refs/repo.memory.js";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import type { UIResource } from "../index.js";
import { InMemoryContentTypeRepo, NoopContentTypeIndexProvisioner } from "../../features/content-types/index.js";
import { registerContentType } from "../../features/content-types/index.js";
import { InMemoryEntryRepo } from "../../features/entries/index.js";
import { createEntry } from "../../features/entries/index.js";
import { PRE_AUTHORIZED } from "../../features/widgets/authorize-helper.js";
import { widgetsAgentToolCatalog, type AgentToolDefinition } from "../../features/widgets/agent-tools.js";
import { InMemoryWidgetRegionBindingRepo } from "../../features/widgets/repo.memory.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeWidgetsTools } from "../../features/widgets/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

// Widgets moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 batch 2 — see `tool-contribution-registry.ts`'s
// header), so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly
// installs it first, mirroring what the real composition roots now do via
// `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
registerToolContributor(contributeWidgetsTools());

const WORKSPACE_ID = "ws-widgets-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";
const HOST_CONTENT_TYPE = "article";

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

  return { deps: deps as unknown as RouteDeps, entryRepo, contentTypeRepo, entryRefsRepo, widgetBindingRepo, authorizeCalls };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = widgetsAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

// widgets_get_instance/widgets_list_instances merge into content_read.widget_instance, and
// widgets_get_region/widgets_list_regions merge into content_read.widget_region (2026-09-08, see
// assistant/content-read-tool.ts). Neither collapsed id starts with "widgets_", so it is listed
// here explicitly rather than by prefix.
const WIDGETS_COLLAPSED_CONTENT_READ_IDS: ReadonlySet<string> = new Set(["content_read.widget_instance", "content_read.widget_region"]);

function widgetsRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => r.descriptor.id.startsWith("widgets_") || WIDGETS_COLLAPSED_CONTENT_READ_IDS.has(r.descriptor.id))
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = widgetsRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/**
 * `widgets_trash_instance` now raises a confirmation dialog (2026-09-08, ADS-memory/reports/
 * 2026-09-08-delete-confirmation-build.md) rather than trashing synchronously. `wired()`/
 * `widgetsRegistrations()` above build a FRESH `buildAssistantToolRegistrations` (and so a fresh,
 * unshared `SurfaceExchangeStore`) on every call, which cannot answer a dialog raised by an earlier
 * call — this helper builds registrations against ONE explicit store so the raise-then-confirm
 * round trip lands on the same exchange, standing in for the human's click in this workflow test
 * (the confirmation gate itself is certified by `widgets/__tests__/agent-tools.trash-confirmation.test.ts`).
 */
async function trashInstance(deps: RouteDeps, widgetInstanceId: string): Promise<{ instance: { status: string } }> {
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "widgets_trash_instance");
  assert.ok(trashTool, "expected 'widgets_trash_instance' to be wired");
  const emitted: unknown[] = [];
  const pending = trashTool.handler({
    ...executionContext({ widgetInstanceId }),
    emitSurface: async (s) => void emitted.push(s),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  surfaceExchanges.deliver({ exchangeId: match[1]!, toolId: "widgets_trash_instance", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  return pending as Promise<{ instance: { status: string } }>;
}

/** Seeds a 'text' widget instance through the real create tool, so tests operate on genuine domain output. */
async function seedInstance(deps: RouteDeps, title = "Footer Note"): Promise<{ id: string; version: number }> {
  const out = (await wired("widgets_create_instance", deps).handler(
    executionContext({ widgetType: "text", title, config: { body: "hello" } }),
  )) as { instance: { id: string; version: number } };
  return out.instance;
}

/** Registers a non-widget host content type + creates one entry of it — the target for embed tests. Bypasses the tool layer deliberately: this is test SETUP for a capability (authoring an ordinary page/article entry) outside this task's scope, not a widgets tool under test. */
async function makeHostEntry(deps: RouteDeps): Promise<{ id: string; version: number }> {
  const routeDeps = deps as unknown as { contentTypeRepo: InMemoryContentTypeRepo; entryRepo: InMemoryEntryRepo };
  const ctDeps = {
    repo: routeDeps.contentTypeRepo,
    clock: { nowIso: () => NOW },
    ids: { newId: () => `ct-${Math.random()}` },
    authorize: PRE_AUTHORIZED,
    indexProvisioner: new NoopContentTypeIndexProvisioner(),
    outbox: { enqueue: async () => undefined },
  };
  const existing = await routeDeps.contentTypeRepo.findByKey({ workspaceId: WORKSPACE_ID, key: HOST_CONTENT_TYPE });
  if (!existing) {
    await registerContentType({ deps: ctDeps, input: { actorId: PRINCIPAL_ID, workspaceId: WORKSPACE_ID, key: HOST_CONTENT_TYPE, label: "Article", fields: [] } });
  }
  const created = await createEntry({
    deps: { entryRepo: routeDeps.entryRepo, contentTypeRepo: routeDeps.contentTypeRepo, clock: { nowIso: () => NOW }, ids: { newId: () => `entry-${Math.random()}` }, authorize: PRE_AUTHORIZED, outbox: { enqueue: async () => undefined } },
    input: {
      actorId: PRINCIPAL_ID,
      workspaceId: WORKSPACE_ID,
      type: HOST_CONTENT_TYPE,
      slug: `host-${Math.random().toString(36).slice(2)}`,
      title: "Host Entry",
      fieldsJson: { ext: { site: {} } },
      bodyJson: { type: "doc", content: [] },
    },
  });
  if (!created.ok) throw created.error;
  return { id: created.value.entry.id, version: created.value.entry.version };
}

// ---------------------------------------------------------------------------
// 1. The catalog is complete and honest about what Widgets can do
// ---------------------------------------------------------------------------

test("exactly the 12 safe widgets operations are wired — no invented purge/force-delete tool", () => {
  const { deps } = fakeRouteDeps();
  // widgets_get_instance/widgets_list_instances -> content_read.widget_instance,
  // widgets_get_region/widgets_list_regions -> content_read.widget_region (2026-09-08 collapse) —
  // still 12 wired ids, 2 of them merged pairs under their new name.
  assert.deepEqual([...widgetsRegistrations(deps).keys()].sort(), [
    "content_read.widget_instance",
    "content_read.widget_region",
    "widgets_bind_region",
    "widgets_create_instance",
    "widgets_insert_embed",
    "widgets_remove_embed",
    "widgets_reorder_embeds",
    "widgets_set_region_placements",
    "widgets_trash_instance",
    "widgets_update_instance",
  ]);
});

test("no wired widgets tool is named or claims a purge/force-delete of a widget instance", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of widgetsRegistrations(deps)) {
    assert.equal(/purge|force/i.test(id), false, `'${id}' must not be named for a purge/force-delete`);
    // Carve out negated clauses ("there is no purge/force-delete tool") AND legitimate mentions of
    // 'purged' as a filterable STATUS VALUE (widgets_list_instances' own "trashed/purged instances"
    // wording, describing what includeInactive surfaces — not a claim this tool purges anything).
    const claim = registration.descriptor.description
      .replace(/\b(never|no|not|cannot|can't|won't)\b[^.;—]*/gi, "")
      .replace(/trash(ed)?\/purged/gi, "");
    assert.equal(/force-delet/i.test(claim), false, `'${id}' must not claim a force-delete capability`);
    assert.equal(/\bpurges?\b/i.test(claim), false, `'${id}' must not claim it purges anything`);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired Widgets registration publishes its catalog entry's inputSchema and description", () => {
  const { deps } = fakeRouteDeps();
  // Collapsed content_read.* ids excluded: their catalog entry lives in assistant/content-read-tool.ts,
  // not widgetsAgentToolCatalog — already cross-checked against ITS OWN catalog at construction time.
  for (const [id, registration] of widgetsRegistrations(deps)) {
    if (WIDGETS_COLLAPSED_CONTENT_READ_IDS.has(id)) continue;
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's, not a second copy`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired Widgets tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of widgetsRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined, `${id} must not request confirmation until a transport exists`);
  }
});

test("an unregistered widgetType is rejected with the schema attached for retry", async () => {
  const { deps } = fakeRouteDeps();
  const error = await wired("widgets_create_instance", deps)
    .handler(executionContext({ widgetType: "carousel", title: "Bad", config: {} }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "an unregistered widgetType must reject");
  assert.match(error.message, /will not resolve on retry without an input change/);
  assert.match(error.message, /"enum"/, "the published schema must travel with the failure");
});

test("an invalid config bag is rejected with the schema attached for retry", async () => {
  const { deps } = fakeRouteDeps();
  const error = await wired("widgets_create_instance", deps)
    .handler(executionContext({ widgetType: "text", title: "Bad Config", config: { wrongField: 1 } }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "an invalid config bag must reject");
  assert.match(error.message, /failed schema validation/);
  assert.match(error.message, /will not resolve on retry without an input change/);
  assert.match(error.message, /"widgetType"/, "the published schema must travel with the failure");
});

test("widgets_reorder_embeds rejects a count mismatch before writing anything", async () => {
  const { deps } = fakeRouteDeps();
  const host = await makeHostEntry(deps);
  await assert.rejects(
    () => wired("widgets_reorder_embeds", deps).handler(executionContext({ hostEntryId: host.id, baseVersion: host.version, orderedWidgetEntryIds: ["nonexistent"] })),
    /reorder must supply exactly one widgetEntryId per existing embed slot/,
  );
});

// ---------------------------------------------------------------------------
// 3. Output projection
// ---------------------------------------------------------------------------

test("a widgets_create_instance result is an explicit model-facing view: workspaceId dropped, id kept for follow-up calls", async () => {
  const { deps } = fakeRouteDeps();
  const created = (await wired("widgets_create_instance", deps).handler(executionContext({ widgetType: "text", title: "Footer Note", config: { body: "hi" } }))) as {
    instance: Record<string, unknown>;
  };

  assert.deepEqual(Object.keys(created.instance).sort(), ["config", "id", "slug", "status", "title", "version", "widgetType"]);
  assert.equal("workspaceId" in created.instance, false, "the agent is already scoped to one workspace it cannot change");
  assert.equal(created.instance.status, "active");
  assert.equal(created.instance.version, 1);
});

test("widgets_get_instance folds in the where-used disclosure, sourced from the real entry_refs index", async () => {
  const { deps } = fakeRouteDeps();
  const instance = await seedInstance(deps);
  const bound = (await wired("widgets_bind_region", deps).handler(executionContext({ regionKey: "footer" }))) as { area: { version: number } };
  await wired("widgets_set_region_placements", deps).handler(
    executionContext({ regionKey: "footer", baseVersion: bound.area.version, placements: [{ widgetEntryId: instance.id, enabled: true }] }),
  );

  const read = (await wired("content_read.widget_instance", deps).handler(executionContext({ widgetInstanceId: instance.id }))) as {
    whereUsed: { count: number; references: Array<{ kind: string }> };
  };
  assert.equal(read.whereUsed.count, 1);
  assert.equal(read.whereUsed.references[0].kind, "region");
});

// ---------------------------------------------------------------------------
// 4. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the real Widgets catalog and tool-registrations' independent classification agree for all 12 wired tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of widgetsRegistrations(deps).keys()) {
    if (WIDGETS_COLLAPSED_CONTENT_READ_IDS.has(id)) continue;
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a Widgets catalog entry cannot downgrade its own risk — declaring sideEffects:'none' fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("widgets_create_instance", { ...catalogEntry("widgets_create_instance"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("no wired Widgets tool carries a confirmation-requiring actor-class rule", () => {
  const { deps } = fakeRouteDeps();
  for (const id of widgetsRegistrations(deps).keys()) {
    if (WIDGETS_COLLAPSED_CONTENT_READ_IDS.has(id)) continue;
    assert.notEqual(catalogEntry(id).actorClassRule, "confirmer-must-equal-own-delegatedBy");
  }
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow — proving several tools compose correctly in sequence
// ---------------------------------------------------------------------------

test("workflow: create a widget instance, bind a region, place the widget into it, then read the region back fully resolved", async () => {
  const { deps } = fakeRouteDeps();

  // Step 1: create a new widget instance.
  const created = (await wired("widgets_create_instance", deps).handler(
    executionContext({ widgetType: "text", title: "Announcement Bar", config: { body: "Sale ends Friday" } }),
  )) as { instance: { id: string; status: string; version: number } };
  assert.equal(created.instance.status, "active");

  // Step 2: bind a fresh region — its area starts with version 1 and zero placements.
  const bound = (await wired("widgets_bind_region", deps).handler(executionContext({ regionKey: "header" }))) as {
    area: { regionKey: string; version: number };
  };
  assert.equal(bound.area.regionKey, "header");
  assert.equal(bound.area.version, 1);

  // Step 3: place the widget created in step 1 into the region bound in step 2 — the placement
  // omits placementId (a NEW slot), and the tool's own idGen must mint one.
  const placed = (await wired("widgets_set_region_placements", deps).handler(
    executionContext({ regionKey: "header", baseVersion: bound.area.version, placements: [{ widgetEntryId: created.instance.id, enabled: true }] }),
  )) as { area: { version: number } };
  assert.equal(placed.area.version, 2, "the area's version must have advanced from the bind's version 1");

  // Step 4: read the region back — the placement must resolve with the SAME widget instance's own
  // title/type, and must not be flagged broken (it is active and really is a 'text' widget).
  const region = (await wired("content_read.widget_region", deps).handler(executionContext({ regionKey: "header" }))) as {
    area: { version: number };
    placements: Array<{ placementId: string; widgetEntryId: string; widgetTitle: string | null; widgetType: string | null; broken: boolean; enabled: boolean }>;
  };
  assert.equal(region.area.version, 2, "the region read must see the version left by step 3, not a stale one");
  assert.equal(region.placements.length, 1);
  const [placement] = region.placements;
  assert.equal(placement.widgetEntryId, created.instance.id, "the placement must reference the SAME widget id minted in step 1");
  assert.equal(placement.widgetTitle, "Announcement Bar", "the resolved title must come from the instance created in step 1");
  assert.equal(placement.widgetType, "text");
  assert.equal(placement.broken, false);
  assert.equal(placement.enabled, true);
  assert.ok(placement.placementId.length > 0, "an auto-minted placementId must be present even though the call omitted one");

  // Step 5: trashing the placed instance must NOT be blocked by the reference (trash is
  // unconditional) — proving the full chain leaves consistent, inspectable state end to end.
  const trashed = await trashInstance(deps, created.instance.id);
  assert.equal(trashed.instance.status, "trash");

  const diagnosis = (await wired("content_read.widget_instance", deps).handler(executionContext({ widgetInstanceId: created.instance.id }))) as {
    whereUsed: { count: number };
  };
  assert.equal(diagnosis.whereUsed.count, 1, "the region placement from step 3 still counts as a reference even after the instance is trashed");
});

test("workflow: insert an inline embed referencing a freshly-created widget, then remove it — the host entry's version advances consistently across both calls", async () => {
  const { deps } = fakeRouteDeps();
  const instance = await seedInstance(deps, "Sidebar CTA");
  const host = await makeHostEntry(deps);

  const inserted = (await wired("widgets_insert_embed", deps).handler(
    executionContext({ hostEntryId: host.id, baseVersion: host.version, widgetEntryId: instance.id }),
  )) as { entryId: string; entryVersion: number; placementId: string };
  assert.equal(inserted.entryId, host.id);
  assert.ok(inserted.entryVersion > host.version, "the host entry's version must have advanced after the insert");
  assert.ok(inserted.placementId.length > 0);

  const removed = (await wired("widgets_remove_embed", deps).handler(
    executionContext({ hostEntryId: host.id, baseVersion: inserted.entryVersion, placementId: inserted.placementId }),
  )) as { entryId: string; entryVersion: number };
  assert.equal(removed.entryId, host.id);
  assert.ok(removed.entryVersion > inserted.entryVersion, "removing the embed must advance the version again, chained off the insert's own returned version");
});
