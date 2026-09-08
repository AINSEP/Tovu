import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "#src/contracts/core/tool-surface-exchanges";
import type { UIResource } from "#src/assistant/index";
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
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
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
 * `widgets_trash_instance` now raises a confirmation dialog (2026-09-08, ADS-memory/reports/
 * 2026-09-08-delete-confirmation-build.md) rather than trashing synchronously — this helper raises
 * it and immediately confirms, standing in for the human's click, for tests (like this file's own)
 * that only need a trashed instance to exist and are not themselves certifying the confirmation gate
 * (that is `widgets/__tests__/agent-tools.trash-confirmation.test.ts`'s job).
 */
async function trashInstance(deps: WidgetsToolDeps, widgetInstanceId: string): Promise<unknown> {
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = buildWidgetsRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "widgets_trash_instance");
  assert.ok(trashTool, "expected 'widgets_trash_instance' to be wired");
  const emitted: unknown[] = [];
  const pending = trashTool.handler({
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: { widgetInstanceId },
    signal: new AbortController().signal,
    emitSurface: async (s) => void emitted.push(s),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  surfaceExchanges.deliver({ exchangeId: match[1]!, toolId: "widgets_trash_instance", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  return pending;
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
      return true;
    }
  );
});

test("widgets_list_instances: includeInactive true returns a trashed instance; includeInactive omitted excludes it", async () => {
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
  assert.deepEqual(including.instances.map((i) => i.id), [created.instance.id], "includeInactive: true must surface it");
});
