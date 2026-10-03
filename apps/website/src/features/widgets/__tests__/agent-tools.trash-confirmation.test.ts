import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { PRE_AUTHORIZED } from "../authorize-helper.js";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import type { TrashAwareInMemoryEntryRepo } from "#src/features/entries/trash-aware-memory-repo";
import { memoryWidgetTrash } from "./support/memory-widget-trash.js";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryWidgetRegionBindingRepo } from "../repo.memory.js";
import { buildWidgetsDeps } from "../deps.js";
import { createWidgetInstance } from "../write-service.js";
import type { WidgetInstanceEntry } from "../types.js";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "../tool-registrations.js";

/** Owner policy: reversible removal runs immediately; authorization and data integrity remain enforced. */

const WORKSPACE_ID = "ws-widgets-trash-confirm";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-20T00:00:00.000Z";
const TRASH_TOOL_ID = "widgets_trash_instance";

function makeDeps(options: { allow?: boolean; entryRepo?: TrashAwareInMemoryEntryRepo } = {}): WidgetsToolDeps {
  let counter = 0;
  const trash = memoryWidgetTrash(options.entryRepo);
  const authorize = options.allow === false ? (async () => ({ allowed: false, reason: "insufficient_permission" as const })) : PRE_AUTHORIZED;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: trash.entryRepo,
    removeWidget: trash.remove,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    postRepo: { marker: "not needed by this suite" } as unknown as WidgetsToolDeps["postRepo"],
    changeSets: { marker: "not needed by this suite" } as unknown as WidgetsToolDeps["changeSets"],
    pluginBeforeSaveHook: undefined as unknown as WidgetsToolDeps["pluginBeforeSaveHook"],
    authorize,
  } as WidgetsToolDeps;
}

/** Seeds a real widget instance through the actual domain function, mirroring exactly what
 *  `widgets_create_instance`'s own handler does — matches `tool-registrations.shape-rejection.test.ts`'s
 *  own discipline of using the real function rather than hand-rolling entry rows, which would risk
 *  drifting from `createWidgetInstance`'s own field-shape/registered-content-type requirements. */
async function seedWidgetInstance(deps: WidgetsToolDeps, overrides: { title?: string } = {}): Promise<WidgetInstanceEntry> {
  const { instance } = await createWidgetInstance({
    deps: buildWidgetsDeps(deps),
    input: {
      workspaceId: WORKSPACE_ID,
      actor: { principalId: PRINCIPAL_ID },
      widgetType: "text",
      title: overrides.title ?? "Announcement Bar",
      config: { body: "hi" },
    },
  });
  return instance;
}

function buildRegistrations(deps: WidgetsToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildWidgetsRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}


test("widgets.read is checked before any dialog is raised, and a denied principal never sees one", async () => {
  const seedDeps = makeDeps();
  const instance = await seedWidgetInstance(seedDeps);
  const deps = makeDeps({ allow: false, entryRepo: seedDeps.entryRepo as TrashAwareInMemoryEntryRepo });
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool, { input: { widgetInstanceId: instance.id } }), (error: unknown) => {
    // WidgetForbiddenError is reclassified into a ToolInputError (prefix `WIDGETS_FORBIDDEN:`) on
    // its way to the model — see `toModelFacingWidgetsError`'s doc comment (tool-registrations.ts).
    assert.ok(error instanceof ToolInputError);
    assert.match((error as Error).message, /^WIDGETS_FORBIDDEN: /);
    return true;
  });
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a dialog opened for them");
});

test("a nonexistent widget instance id is refused before any dialog is raised", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool, { input: { widgetInstanceId: "nope" } }), /was not found/);
  assert.equal(surfaceExchanges.size(), 0);
});

test("n06: reversible removal runs without a confirmation channel", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps);
  const store = createSurfaceExchangeStore();
  const result = await call(tool(buildRegistrations(deps, store), TRASH_TOOL_ID), {input: {widgetInstanceId: instance.id}}) as {trashed: boolean; cancelled: boolean};
  assert.equal(result.trashed, true);
  assert.equal(result.cancelled, false);
  assert.equal(await deps.entryRepo.findById({workspaceId: WORKSPACE_ID, id: instance.id}), null);
  assert.equal(store.size(), 0);
});

test("widgets.delete remains required when widgets.read is granted", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps);
  deps.authorize = async ({ permission }) => ({ allowed: permission === "widgets.read", reason: "test permission grant" });
  await assert.rejects(call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TRASH_TOOL_ID), {input: {widgetInstanceId: instance.id}}), /widgets.delete/);
  assert.notEqual(await deps.entryRepo.findById({workspaceId: WORKSPACE_ID, id: instance.id}), null);
});
