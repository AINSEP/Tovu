import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { PRE_AUTHORIZED } from "../authorize-helper.js";
import { WidgetForbiddenError } from "../errors.js";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryWidgetRegionBindingRepo } from "../repo.memory.js";
import { buildWidgetsDeps } from "../deps.js";
import { createWidgetInstance } from "../write-service.js";
import type { WidgetInstanceEntry } from "../types.js";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "../tool-registrations.js";

/**
 * @file Certification of `widgets_trash_instance`'s confirmation gate — the third tool (after
 * `content_post_delete`/`comments_trash_comment`) migrated onto the shared MCP-UI held-open exchange
 * (2026-09-08, ADS-memory/reports/2026-09-08-delete-confirmation-build.md). Modeled on
 * `features/post/__tests__/agent-tools.delete-confirmation.test.ts`, scoped to this domain's own
 * result shape. Unlike Posts/Pages, `trashWidgetInstance` re-derives `expectedVersion` from a FRESH
 * read taken at confirm time (inside itself), so there is no separate staleness re-check to certify
 * here — see this domain's handler comment.
 */

const WORKSPACE_ID = "ws-widgets-trash-confirm";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-20T00:00:00.000Z";
const TRASH_TOOL_ID = "widgets_trash_instance";

function makeDeps(options: { allow?: boolean; entryRepo?: InMemoryEntryRepo } = {}): WidgetsToolDeps {
  let counter = 0;
  const authorize = options.allow === false ? (async () => ({ allowed: false, reason: "insufficient_permission" as const })) : PRE_AUTHORIZED;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: options.entryRepo ?? new InMemoryEntryRepo(),
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

function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  return match[1]!;
}

async function raiseDialog(trashTool: ToolRegistration, widgetInstanceId: string) {
  const emitted: unknown[] = [];
  const pending = call(trashTool, { input: { widgetInstanceId }, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, ui, exchangeId };
}

// ---------------------------------------------------------------------------
// 1. The call parks, the dialog names the instance, nothing is trashed while pending
// ---------------------------------------------------------------------------

test("the call stays open after the dialog is shown, and nothing is trashed while it is pending", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(trashTool, instance.id);

  assert.equal(ui.type, "resource");
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers",
  );

  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog names the title, widget type, and current status, so consent is informed", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps, { title: "Sidebar CTA" });
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(trashTool, instance.id);

  assert.match(ui.resource.text, /Sidebar CTA/);
  assert.match(ui.resource.text, /text/);
  assert.match(ui.resource.text, /moved to the trash/i);

  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

// ---------------------------------------------------------------------------
// 2. Confirm / cancel / fail-closed decision
// ---------------------------------------------------------------------------

test("confirm: the human's click trashes the widget instance and the SAME call reports it to the agent", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool, instance.id);
  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { trashed: boolean; cancelled: boolean; instance: { status: string } };
  assert.equal(result.trashed, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.instance.status, "trash");

  const row = await deps.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: instance.id });
  assert.ok(row, "trashing a widget instance is a status flip, not a delete — the row must still exist");
});

test("cancel: nothing is trashed, and the SAME call reports the cancellation", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool, instance.id);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  const result = (await pending) as { trashed: boolean; cancelled: boolean; instance: { status: string } };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.instance.status, "active");
});

test("an answer with no 'decision' field at all is NOT confirm — nothing is trashed (fail-closed)", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool, instance.id);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: {} });

  const result = (await pending) as { trashed: boolean; cancelled: boolean };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, true);
});

test("an unanswered dialog expires and reports 'expired', not a hang or a throw", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps);
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const result = (await call(trashTool, { input: { widgetInstanceId: instance.id }, emitSurface: async () => undefined })) as {
    trashed: boolean;
    cancelled: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
});

// ---------------------------------------------------------------------------
// 3. No emit seam, authorization, not-found
// ---------------------------------------------------------------------------

test("with no emitSurface, the trash is refused outright — there is no fallback second call", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool, { input: { widgetInstanceId: instance.id } }), /no interactive confirmation channel/);
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
});

test("widgets.read is checked before any dialog is raised, and a denied principal never sees one", async () => {
  const seedDeps = makeDeps();
  const instance = await seedWidgetInstance(seedDeps);
  const deps = makeDeps({ allow: false, entryRepo: seedDeps.entryRepo });
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool, { input: { widgetInstanceId: instance.id } }), (error: unknown) => {
    assert.ok(error instanceof WidgetForbiddenError);
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

test("widgets.delete is still checked at confirm time, even though the pre-dialog read only checked widgets.read", async () => {
  const deps = makeDeps();
  const instance = await seedWidgetInstance(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const wrappedDeps: WidgetsToolDeps = {
    ...deps,
    authorize: async (params) => {
      authorizeCalls.push(params as unknown as Record<string, unknown>);
      return { allowed: true, reason: "matched" };
    },
  };
  const trashTool = tool(buildRegistrations(wrappedDeps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool, instance.id);
  assert.ok(authorizeCalls.some((c) => c.permission === "widgets.read"), "the pre-dialog read must have checked widgets.read");
  assert.equal(authorizeCalls.some((c) => c.permission === "widgets.delete"), false, "widgets.delete must not be checked before the human answers");

  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  await pending;
  assert.ok(authorizeCalls.some((c) => c.permission === "widgets.delete"), "the confirmed write must check widgets.delete");
});
