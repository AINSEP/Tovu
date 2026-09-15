import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { PRE_AUTHORIZED } from "../../authorize-helper.js";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory.js";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "../../tool-registrations.js";

/**
 * @file RED->GREEN for the 500-redact defect on two Widgets validators:
 *
 * - `widgets_set_region_placements`'s `placements` shape checks used to throw a bare `Error`.
 * - `widgets_reorder_embeds`'s `orderedWidgetEntryIds` shape check ran BEFORE its own
 *   `withSchemaOnRejection` wrap even started, so moving it inside the wrap is the actual fix (a
 *   bare `Error` thrown either place still reaches `ToolExecutor` as `errorKind: 'internal'` — that
 *   classification reads `instanceof ToolInputError`, not call-stack position — but leaving the
 *   check outside made this validator the one exception among this handler's siblings, all of which
 *   run inside the wrap).
 *
 * Both now throw `@jini-ai/core`'s `ToolInputError`, mirroring
 * `features/post/tool-registrations.ts`'s fix shape. Real in-memory adapters, matching this
 * directory's own `tool-registrations.shape-rejection.test.ts` discipline.
 */

const WORKSPACE_ID = "ws-input-validation-status";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-09T00:00:00.000Z";

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
    postRepo: new InMemoryPostRepo(),
    changeSets: new InMemoryChangeSetRepo(),
    pluginBeforeSaveHook: undefined as unknown as WidgetsToolDeps["pluginBeforeSaveHook"],
    authorize: PRE_AUTHORIZED,
  };
}

function executionContext(input: unknown): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function wired(toolId: string, deps: WidgetsToolDeps): ToolRegistration {
  const found = buildWidgetsRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

test("widgets_set_region_placements: a non-array 'placements' is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => wired("widgets_set_region_placements", deps).handler(executionContext({ regionKey: "footer", baseVersion: 1, placements: "not-an-array" })),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /'placements' \(array\) is required/);
      return true;
    },
  );
});

test("widgets_set_region_placements: a non-object placement entry is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => wired("widgets_set_region_placements", deps).handler(executionContext({ regionKey: "footer", baseVersion: 1, placements: ["nope"] })),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /each placement must be an object/);
      return true;
    },
  );
});

test("widgets_reorder_embeds: a non-array 'orderedWidgetEntryIds' is a ToolInputError (400), not a bare Error (redacted 500) — and IS reachable through the tool's own withSchemaOnRejection wrap", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => wired("widgets_reorder_embeds", deps).handler(executionContext({ hostEntryId: "h1", baseVersion: 1, orderedWidgetEntryIds: "not-an-array" })),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /'orderedWidgetEntryIds' \(non-empty string array\) is required/);
      return true;
    },
  );
});
