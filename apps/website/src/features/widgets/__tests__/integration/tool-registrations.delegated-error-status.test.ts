import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryPostRepo, type PostRecord } from "#src/features/post/index";
import { PRE_AUTHORIZED } from "../../authorize-helper.js";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory.js";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "../../tool-registrations.js";

/**
 * @file RED regression suite (`2026-09-15-widgets-insert-embed-PLAN.md` T2): drives the REAL
 * delegated-tool-call transport (`delegatedToolExecuteRoute`, real `ToolRegistry`/`ToolExecutor`/
 * `RunLifecycle`) end to end, so both bugs the plan describes are proven fixed through the exact
 * path a spawned agent CLI calls this site's tools through, not merely at the service-function
 * level `embed-service.post-host.integration.test.ts` (Lane A) already covers:
 *
 * 1. The wrong-table host-lookup bug (fixed by Lane A) — proven here only incidentally, via the
 *    golden-path case.
 * 2. The "typed domain error reaches the model as a redacted, message-stripped 500" bug — THIS
 *    file's actual subject, fixed by `toModelFacingWidgetsError` wrapping every widgets handler
 *    (`tool-registrations.ts`).
 *
 * RED today (before this Lane's fix) for every not-found/conflict case below: `{ ok: false, error:
 * { code: "INTERNAL_ERROR", message: "an internal error occurred" } }` instead of the named
 * `BAD_REQUEST` + intact message.
 */

const WORKSPACE_ID = "ws-1";
const NOW = "2026-09-15T00:00:00.000Z";

function makeRouteDeps(): WidgetsToolDeps {
  let counter = 0;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    postRepo: new InMemoryPostRepo(),
    changeSets: new InMemoryChangeSetRepo(),
    pluginBeforeSaveHook: undefined as unknown as WidgetsToolDeps["pluginBeforeSaveHook"],
    authorize: PRE_AUTHORIZED,
  };
}

async function seedPost(routeDeps: WidgetsToolDeps, overrides: Partial<PostRecord> = {}): Promise<PostRecord> {
  const post = {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "Host Post",
    slug: "host-post-1",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: NOW,
    version: 1,
    ...overrides,
  } as PostRecord;
  await routeDeps.postRepo.save(post as never);
  return post;
}

async function buildHarness(routeDeps: WidgetsToolDeps) {
  const registry = createToolRegistry();
  for (const registration of buildWidgetsRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: "principal-1" }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle({ runId: harness.run.id, toolUseId: `tu-${toolId}`, toolId, input }, harness);
}

async function createWidget(harness: Harness): Promise<string> {
  const result = await call(harness, "widgets_create_instance", { widgetType: "text", title: "Sidebar note", config: { body: "hi" } });
  assert.equal(result.ok, true, `setup: widgets_create_instance failed: ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error("unreachable");
  return (result.value.result.output as { instance: { id: string } }).instance.id;
}

test("widgets_insert_embed against a real post host succeeds end to end (golden path, not just RED)", async () => {
  const routeDeps = makeRouteDeps();
  const post = await seedPost(routeDeps);
  const harness = await buildHarness(routeDeps);
  const widgetId = await createWidget(harness);

  const result = await call(harness, "widgets_insert_embed", { hostEntryId: post.id, baseVersion: post.version, widgetEntryId: widgetId });

  assert.equal(result.ok, true, `expected success, got ${JSON.stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.value.result.status, "completed");
  const output = result.value.result.output as { entryId: string; entryVersion: number; placementId: string };
  assert.equal(output.entryId, post.id);
  assert.equal(output.entryVersion, 2);
  assert.equal(typeof output.placementId, "string");
});

test("widgets_insert_embed against an unknown host is BAD_REQUEST with the host-not-found message, not a redacted 500", async () => {
  const routeDeps = makeRouteDeps();
  const harness = await buildHarness(routeDeps);

  const result = await call(harness, "widgets_insert_embed", { hostEntryId: "nope", baseVersion: 1, widgetEntryId: "whatever" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `WIDGETS_EMBED_HOST_NOT_FOUND: host entry 'nope' was not found in workspace '${WORKSPACE_ID}' (it must be the id of an existing, non-trashed post, page, or content entry)`,
  });
});

test("widgets_remove_embed against an unknown host is the SAME BAD_REQUEST text (this arm has no withSchemaOnRejection of its own)", async () => {
  const routeDeps = makeRouteDeps();
  const harness = await buildHarness(routeDeps);

  const result = await call(harness, "widgets_remove_embed", { hostEntryId: "nope", baseVersion: 1, placementId: "whatever" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `WIDGETS_EMBED_HOST_NOT_FOUND: host entry 'nope' was not found in workspace '${WORKSPACE_ID}' (it must be the id of an existing, non-trashed post, page, or content entry)`,
  });
});

test("widgets_reorder_embeds against an unknown host is the SAME BAD_REQUEST text", async () => {
  const routeDeps = makeRouteDeps();
  const harness = await buildHarness(routeDeps);

  const result = await call(harness, "widgets_reorder_embeds", { hostEntryId: "nope", baseVersion: 1, orderedWidgetEntryIds: [] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `WIDGETS_EMBED_HOST_NOT_FOUND: host entry 'nope' was not found in workspace '${WORKSPACE_ID}' (it must be the id of an existing, non-trashed post, page, or content entry)`,
  });
});

test("widgets_insert_embed against an HTML-format page host is BAD_REQUEST with the unsupported-host message", async () => {
  const routeDeps = makeRouteDeps();
  const page = await seedPost(routeDeps, { kind: "page", bodyFormat: "html", bodyHtml: "<main></main>" });
  const harness = await buildHarness(routeDeps);

  const result = await call(harness, "widgets_insert_embed", { hostEntryId: page.id, baseVersion: page.version, widgetEntryId: "whatever" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `WIDGETS_EMBED_HOST_UNSUPPORTED: host '${page.id}' is an HTML-format page, which has no rich-text body for widgetEmbed nodes; embed widgets in it with a data-embed-config marker of type "widget" via pages_write_region or pages_write_html instead`,
  });
});

test("widgets_insert_embed with a stale baseVersion on a post host is BAD_REQUEST with the version-conflict guidance, not a redacted 500", async () => {
  const routeDeps = makeRouteDeps();
  const post = await seedPost(routeDeps, { version: 2 });
  const harness = await buildHarness(routeDeps);
  const widgetId = await createWidget(harness);

  const result = await call(harness, "widgets_insert_embed", { hostEntryId: post.id, baseVersion: 1, widgetEntryId: widgetId });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message:
      `WIDGETS_VERSION_CONFLICT: post '${post.id}' was modified by another save (expected version 1, current version 2). ` +
      "Nothing was written. Re-read the host or instance to get its current version (2) and resend with that as baseVersion.",
  });
});

test("widgets_insert_embed with an unknown widgetEntryId against a valid post host is BAD_REQUEST with the instance-not-found message", async () => {
  const routeDeps = makeRouteDeps();
  const post = await seedPost(routeDeps);
  const harness = await buildHarness(routeDeps);

  const result = await call(harness, "widgets_insert_embed", { hostEntryId: post.id, baseVersion: post.version, widgetEntryId: "nope" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `WIDGETS_INSTANCE_NOT_FOUND: embed references widget 'nope', which does not exist in workspace '${WORKSPACE_ID}' (REQ-16/17)`,
  });
});

test("widgets_insert_embed denied on the internal content.write chokepoint (widgets.place itself allowed) is BAD_REQUEST with the real permission and reason, not a redacted 500", async () => {
  // Owner ruling 2026-09-15: model-facing errors must say the real reason, not
  // "an internal error occurred", so the model (or a person reading its trace) can tell "you lack
  // permission" from "the server broke". Same denial shape as
  // `embed-service.post-host.integration.test.ts`'s "authorize() denying ONLY content.write" case,
  // driven here through the real delegated-tool-call transport instead of calling the domain
  // function directly.
  const routeDeps = makeRouteDeps();
  routeDeps.authorize = async ({ permission }) => (permission === "content.write" ? { allowed: false, reason: "test: denied" } : { allowed: true, reason: "matched" });
  const post = await seedPost(routeDeps);
  const harness = await buildHarness(routeDeps);
  const widgetId = await createWidget(harness);

  const result = await call(harness, "widgets_insert_embed", { hostEntryId: post.id, baseVersion: post.version, widgetEntryId: widgetId });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `WIDGETS_FORBIDDEN: principal 'principal-1' lacks permission 'content.write' (test: denied)`,
  });
});

test("sibling handlers with no host-lookup bug still had the SAME redacted-500 surfacing bug — all now BAD_REQUEST with the message intact", async () => {
  const routeDeps = makeRouteDeps();
  const harness = await buildHarness(routeDeps);
  const widgetId = await createWidget(harness);

  const getInstance = await call(harness, "widgets_get_instance", { widgetInstanceId: "nope" });
  assert.equal(getInstance.ok, false);
  if (!getInstance.ok) {
    assert.deepEqual(getInstance.error, { code: "BAD_REQUEST", message: "WIDGETS_INSTANCE_NOT_FOUND: widget instance 'nope' was not found" });
  }

  const updateInstance = await call(harness, "widgets_update_instance", { widgetInstanceId: "nope", baseVersion: 1, config: { body: "hi" } });
  assert.equal(updateInstance.ok, false);
  if (!updateInstance.ok) {
    assert.deepEqual(updateInstance.error, { code: "BAD_REQUEST", message: "WIDGETS_INSTANCE_NOT_FOUND: widget instance 'nope' was not found" });
  }

  const trashInstance = await call(harness, "widgets_trash_instance", { widgetInstanceId: "nope" });
  assert.equal(trashInstance.ok, false);
  if (!trashInstance.ok) {
    assert.deepEqual(trashInstance.error, { code: "BAD_REQUEST", message: "WIDGETS_INSTANCE_NOT_FOUND: widget instance 'nope' was not found" });
  }

  const getRegion = await call(harness, "widgets_get_region", { regionKey: "nope" });
  assert.equal(getRegion.ok, false);
  if (!getRegion.ok) {
    assert.deepEqual(getRegion.error, { code: "BAD_REQUEST", message: "WIDGETS_AREA_NOT_FOUND: region 'nope' is not bound" });
  }

  const setRegionPlacements = await call(harness, "widgets_set_region_placements", { regionKey: "nope", baseVersion: 1, placements: [] });
  assert.equal(setRegionPlacements.ok, false);
  if (!setRegionPlacements.ok) {
    assert.deepEqual(setRegionPlacements.error, { code: "BAD_REQUEST", message: "WIDGETS_AREA_NOT_FOUND: region 'nope' is not bound" });
  }

  // Stale baseVersion on an update: bump the instance to version 2, then resend against version 1.
  const bumped = await call(harness, "widgets_update_instance", { widgetInstanceId: widgetId, baseVersion: 1, config: { body: "updated once" } });
  assert.equal(bumped.ok, true, `setup: first update failed: ${JSON.stringify(bumped)}`);

  const staleUpdate = await call(harness, "widgets_update_instance", { widgetInstanceId: widgetId, baseVersion: 1, config: { body: "updated twice" } });
  assert.equal(staleUpdate.ok, false);
  if (!staleUpdate.ok) {
    assert.equal(staleUpdate.error.code, "BAD_REQUEST");
    assert.match(staleUpdate.error.message, /^WIDGETS_VERSION_CONFLICT: /);
  }
});
