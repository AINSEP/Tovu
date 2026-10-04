import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { memoryWidgetTrash } from "../support/memory-widget-trash.js";
import { InMemoryPostRepo } from "#src/features/post/index";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { PRE_AUTHORIZED } from "../../authorize-helper.js";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory.js";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "../../tool-registrations.js";

/**
 * @file Closes two gaps neither `region-gaps.test.ts` nor `write-service.integration.test.ts`
 * reaches, because both call the DOMAIN functions (`createWidgetInstance`/`updateWidgetInstance`)
 * directly rather than through the tool layer:
 *
 * - `isWidgetsShapeRejection` (`tool-registrations.ts`) — the predicate deciding which domain
 *   errors get the published-schema decoration `withSchemaOnRejection` appends. Never invoked by
 *   any other test in this slice: `write-service.integration.test.ts`'s equivalent config/type
 *   errors are asserted against the plain, undecorated `createWidgetInstance`/`updateWidgetInstance`
 *   call, never through `widgets_create_instance`'s tool handler.
 * - `widgets_list_instances`' `includeInactive: true` branch — every other test either omits the
 *   flag or passes `false`.
 *
 * Real in-memory adapters throughout, matching `region-gaps.test.ts`'s own discipline.
 */

const WORKSPACE_ID = "ws-shape-rejection";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-20T00:00:00.000Z";

function makeDeps(): WidgetsToolDeps {
  let counter = 0;
  const widgetTrash = memoryWidgetTrash();
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: widgetTrash.entryRepo,
    removeWidget: widgetTrash.remove,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    postRepo: new InMemoryPostRepo(),
    changeSets: new InMemoryChangeSetRepo(),
    pluginBeforeSaveHook: undefined as unknown as WidgetsToolDeps["pluginBeforeSaveHook"],
    authorize: PRE_AUTHORIZED,
  };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function wired(toolId: string, deps: WidgetsToolDeps): ToolRegistration {
  const found = buildWidgetsRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/**
 * `widgets_trash_instance` trashes immediately: reversible removal needs no confirmation dialog
 * (6eac86229, owner policy "confirm destructive and protected actions only"). This helper calls it
 * directly, for tests (like this file's own) that only need a trashed instance to exist and are not
 * themselves certifying the trash tool (that is `widgets/__tests__/agent-tools.trash-confirmation.test.ts`'s job).
 */
async function trashInstance(deps: WidgetsToolDeps, widgetInstanceId: string): Promise<unknown> {
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = buildWidgetsRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "widgets_trash_instance");
  assert.ok(trashTool, "expected 'widgets_trash_instance' to be wired");
  const result = (await trashTool.handler(executionContext({ widgetInstanceId }))) as { trashed: boolean };
  assert.equal(result.trashed, true, "the trash tool must report the instance trashed");
  return result;
}

test("widgets_create_instance: an unregistered widgetType is a shape rejection — the thrown error carries the tool's own published schema, not the bare domain message", async () => {
  const deps = makeDeps();

  await assert.rejects(
    () =>
      wired("widgets_create_instance", deps).handler(
        executionContext({ widgetType: "carousel", title: "Carousel", config: {} })
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      // isWidgetsShapeRejection decorates this one (WidgetTypeUnregisteredError) — the decorated
      // message is a plain `Error`, so `.name` is NOT preserved; only the message text is.
      assert.ok(
        error.message.startsWith("widget type 'carousel' is not registered (REQ-03). Fix the input and retry"),
        `expected the decorated WidgetTypeUnregisteredError message, got: ${error.message}`
      );
      assert.match(error.message, /Schema for 'widgets_create_instance':/);
      const banner = "Schema for 'widgets_create_instance': ";
      const includedSchema = JSON.parse(error.message.slice(error.message.indexOf(banner) + banner.length));
      assert.equal(includedSchema.type, "object");
      assert.deepEqual(includedSchema.required, ["widgetType", "title", "config"]);
      assert.equal(includedSchema.additionalProperties, false);
      assert.equal(includedSchema.properties.widgetType.type, "string");
      assert.deepEqual(includedSchema.properties.widgetType.enum, ["text", "social-links", "recent-entries", "menu", "contact-form"]);
      assert.equal(includedSchema.properties.title.type, "string");
      assert.equal(includedSchema.properties.title.minLength, 1);
      assert.equal(includedSchema.properties.config.type, "object");
      return true;
    }
  );
});

test("widgets_create_instance: a config missing a required field is a shape rejection with the same decoration", async () => {
  const deps = makeDeps();

  await assert.rejects(
    () =>
      wired("widgets_create_instance", deps).handler(
        // `text` requires `body` (registry.ts) — omitted here on purpose.
        executionContext({ widgetType: "text", title: "Missing body", config: {} })
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(
        error.message.startsWith("config for widget type 'text' failed schema validation (REQ-02). Fix the input and retry"),
        `expected the decorated WidgetConfigValidationError message, got: ${error.message}`
      );
      assert.match(error.message, /Schema for 'widgets_create_instance':/);
      const banner = "Schema for 'widgets_create_instance': ";
      const includedSchema = JSON.parse(error.message.slice(error.message.indexOf(banner) + banner.length));
      assert.equal(includedSchema.type, "object");
      assert.deepEqual(includedSchema.required, ["widgetType", "title", "config"]);
      assert.equal(includedSchema.additionalProperties, false);
      assert.equal(includedSchema.properties.widgetType.type, "string");
      assert.deepEqual(includedSchema.properties.widgetType.enum, ["text", "social-links", "recent-entries", "menu", "contact-form"]);
      assert.equal(includedSchema.properties.title.type, "string");
      assert.equal(includedSchema.properties.title.minLength, 1);
      assert.equal(includedSchema.properties.config.type, "object");
      return true;
    }
  );
});

test("widgets_list_instances: a trashed instance is left out whether or not includeInactive is set (the Trash hides it from every read)", async () => {
  const deps = makeDeps();
  const created = (await wired("widgets_create_instance", deps).handler(
    executionContext({ widgetType: "text", title: "Will be trashed", config: { body: "hi" } })
  )) as { instance: { id: string } };

  await trashInstance(deps, created.instance.id);

  const excluding = (await wired("widgets_list_instances", deps).handler(executionContext({}))) as {
    instances: Array<{ id: string }>;
  };
  assert.deepEqual(excluding.instances, [], "omitting includeInactive must exclude the trashed instance");

  const including = (await wired("widgets_list_instances", deps).handler(
    executionContext({ includeInactive: true })
  )) as { instances: Array<{ id: string }> };
  assert.deepEqual(including.instances, [], "includeInactive: true must not surface a widget that is in the Trash");
});
