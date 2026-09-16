import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";

import { InMemoryChangeSetRepo } from "../../contracts/core/commands/index.js";
import { InMemoryEntryRefsRepo } from "../../contracts/core/entry-refs/repo.memory.js";
import { InMemoryContentTypeRepo } from "../../features/content-types/index.js";
import { InMemoryEntryRepo } from "../../features/entries/index.js";
import { InMemoryPostRepo } from "../../features/post/index.js";
import { PRE_AUTHORIZED } from "../../features/widgets/authorize-helper.js";
import {
  WidgetAreaConflictError,
  WidgetAreaNotFoundError,
  WidgetEmbedHostNotFoundError,
  WidgetEmbedHostUnsupportedError,
  WidgetForbiddenError,
  WidgetInstanceNotFoundError,
  WidgetVersionConflictError,
} from "../../features/widgets/errors.js";
import { InMemoryWidgetRegionBindingRepo } from "../../features/widgets/repo.memory.js";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "../../features/widgets/tool-registrations.js";
import { widgetErrorToResponse } from "../inbound/admin-http/http/widgets.js";

/**
 * @file RED regression test (`2026-09-15-widgets-insert-embed-PLAN.md` T4): pins that the
 * HTTP-facing mapper (`widgetErrorToResponse`, `server/inbound/admin-http/http/widgets.ts`) and the
 * model-facing mapper (`toModelFacingWidgetsError`, `features/widgets/tool-registrations.ts`) never
 * drift onto two different codes for the same typed error. Both mappers are private/unexported by
 * design (`toModelFacingWidgetsError` is a local helper, not part of this module's public surface),
 * so each error here is thrown from a stubbed `entryRepo.findById` through a REAL wired
 * registration (`widgets_get_instance`) rather than importing the model-facing mapper directly —
 * the same "drive it through the real seam" discipline `tool-registrations.delegated-error-status
 * .test.ts` (T2) uses.
 *
 * RED today: the new error classes did not exist yet, and the tool path was not reclassified — a
 * `WidgetEmbedHostNotFoundError`/`WidgetEmbedHostUnsupportedError` case could not even be
 * constructed, and every other case's caught error was `INTERNAL_ERROR`-shaped internally (no
 * `CODE:` prefix at all to compare).
 */

const WORKSPACE_ID = "ws-1";
const NOW = "2026-09-15T00:00:00.000Z";

function makeRouteDeps(entryRepo: WidgetsToolDeps["entryRepo"]): WidgetsToolDeps {
  let counter = 0;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo,
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
  return { executionId: "exec-1", principal: { id: "principal-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

/** Throws `toThrow` from `entryRepo.findById` and reaches the model-facing mapper through the real
 *  `widgets_get_instance` registration — `getWidgetInstance` (`read-service.ts:62`) calls
 *  `entryRepo.findById` unconditionally right after its permission check, so this seam is generic
 *  across every error class under test here, not specific to widget-instance lookups. */
async function throwThroughRealRegistration(toThrow: Error): Promise<unknown> {
  const entryRepo = new InMemoryEntryRepo() as unknown as WidgetsToolDeps["entryRepo"];
  entryRepo.findById = async () => {
    throw toThrow;
  };
  const deps = makeRouteDeps(entryRepo);
  const registration = buildWidgetsRegistrations(deps).find((r) => r.descriptor.id === "widgets_get_instance");
  assert.ok(registration, "expected widgets_get_instance to be wired");

  try {
    await registration.handler(executionContext({ widgetInstanceId: "whatever" }));
    throw new Error("expected the stubbed entryRepo.findById error to propagate, but the call succeeded");
  } catch (err) {
    return err;
  }
}

const CASES: ReadonlyArray<{ name: string; make: () => Error }> = [
  { name: "WidgetInstanceNotFoundError", make: () => new WidgetInstanceNotFoundError("widget instance 'x' was not found") },
  { name: "WidgetAreaNotFoundError", make: () => new WidgetAreaNotFoundError("region 'x' is not bound") },
  {
    name: "WidgetEmbedHostNotFoundError",
    make: () => new WidgetEmbedHostNotFoundError(`host entry 'x' was not found in workspace '${WORKSPACE_ID}' (it must be the id of an existing, non-trashed post, page, or content entry)`),
  },
  {
    name: "WidgetEmbedHostUnsupportedError",
    make: () => new WidgetEmbedHostUnsupportedError("host 'x' is an HTML-format page, which has no rich-text body for widgetEmbed nodes", "html-page"),
  },
  { name: "WidgetVersionConflictError", make: () => new WidgetVersionConflictError("post 'x' was modified by another save (expected version 1, current version 2)", 2) },
  { name: "WidgetAreaConflictError", make: () => new WidgetAreaConflictError("widget_area 'x' was modified by another save (expected version 1, current version 2)", 2) },
  {
    name: "WidgetForbiddenError",
    // Real message shape from `authorize-helper.ts`'s `requireWidgetPermission`, which is what
    // `widgetForbiddenToResponse` (`widgets.ts`) parses for its `details.permission`/`details.reason`.
    make: () => new WidgetForbiddenError("principal 'x' lacks permission 'widgets.read' (not granted)"),
  },
];

for (const { name, make } of CASES) {
  test(`${name}: the model-facing code prefix and the HTTP-facing widgetErrorToResponse code agree`, async () => {
    const httpCode = widgetErrorToResponse(make()).body.code;

    const modelFacingErr = await throwThroughRealRegistration(make());
    assert.ok(modelFacingErr instanceof Error, `expected an Error, got ${String(modelFacingErr)}`);
    const message = (modelFacingErr as Error).message;
    const colonIndex = message.indexOf(":");
    assert.ok(colonIndex > 0, `expected a 'CODE: ...' shaped message, got ${JSON.stringify(message)}`);
    const modelCode = message.slice(0, colonIndex);

    assert.equal(modelCode, httpCode, `model-facing code '${modelCode}' must match HTTP code '${httpCode}' for ${name}`);
  });
}
