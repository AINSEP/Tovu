import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { ensureCommentsSettingDefinitions, getCommentsSettings } from "../settings.js";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { buildCommentsRegistrations, type CommentsToolDeps } from "../tool-registrations.js";

/**
 * @file RED->GREEN for the 500-redact defect: `comments_update_settings`'s `requireCommentsSettingsPatch`
 * used to reject an empty patch with a bare `Error`, tagged `errorKind: 'internal'` by
 * `@jini-ai/daemon`'s `ToolExecutor` and redacted to a message-stripped 500 by `@jini-ai/http-kit`'s
 * `delegatedToolExecuteRoute` (SEC-005). Now throws `ToolInputError`, mirroring
 * `features/post/tool-registrations.ts`'s fix shape. Asserting `instanceof ToolInputError` directly
 * is the exact fact `ToolExecutor.execute` branches its classification on.
 */

function ctxWithInput(input: unknown): ToolExecutionContext {
  return { executionId: "e1", principal: { id: "p1" }, run: { id: "r1" }, input, signal: new AbortController().signal };
}

async function makeDeps(): Promise<CommentsToolDeps> {
  const settingsRepo = new InMemorySettingsRepo();
  const principalRepo = new InMemoryPrincipalRepo({}, { initialRows: [] });
  let id = 0;
  const clock = { nowIso: () => "2026-07-16T00:00:00.000Z", nowMs: () => Date.parse("2026-07-16T00:00:00.000Z") };
  const idGen = { newId: () => `settings-test-${++id}` };
  await ensureCommentsSettingDefinitions({ settingsRepo, principals: principalRepo, clock, ids: idGen }, { workspaceId: "ws-settings", systemPrincipalId: "system" });
  return {
    workspaceId: "ws-settings", settingsRepo, principalRepo, clock, idGen,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    commentsSettingsReady: Promise.resolve(),
  } as CommentsToolDeps;
}

test("comments_update_settings: an empty patch is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const deps = await makeDeps();
  const registration = buildCommentsRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).find(
    (r) => r.descriptor.id === "comments_update_settings",
  );
  assert.ok(registration, "expected comments_update_settings to be wired");

  await assert.rejects(
    () => registration.handler(ctxWithInput({})),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /at least one of/);
      return true;
    },
  );
});

test("comments_update_settings extracts every supported field and persists the patch in the ledger", async () => {
  const deps = await makeDeps();
  const registration = buildCommentsRegistrations(deps).find((r) => r.descriptor.id === "comments_update_settings");
  assert.ok(registration);
  const patch = { enabled: false, requireModeration: false, maxDepth: 2, closeAfterDays: 30, spamAutoRejectScore: 0.8, maxPerIpPerHour: 7 };
  await registration.handler(ctxWithInput({ ...patch, unrelated: "ignored" }));
  assert.deepEqual(await getCommentsSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId }), patch);
});

test("comments_update_settings maps out-of-range domain validation to ToolInputError and writes nothing", async () => {
  const deps = await makeDeps();
  const before = await getCommentsSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId });
  const registration = buildCommentsRegistrations(deps).find((r) => r.descriptor.id === "comments_update_settings");
  assert.ok(registration);
  await assert.rejects(registration.handler(ctxWithInput({ spamAutoRejectScore: 1.5, requireModeration: false })), (error: unknown) => error instanceof ToolInputError && /spamAutoRejectScore/.test(error.message));
  assert.deepEqual(await getCommentsSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId }), before);
});
