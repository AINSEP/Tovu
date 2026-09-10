import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
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

test("comments_update_settings: an empty patch is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const deps = createRouteDeps() as unknown as CommentsToolDeps;
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
