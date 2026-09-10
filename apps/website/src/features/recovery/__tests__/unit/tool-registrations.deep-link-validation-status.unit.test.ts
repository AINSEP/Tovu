import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildRecoveryRegistrations, type RecoveryToolDeps } from "../../tool-registrations.js";

/**
 * @file RED->GREEN for the 500-redact defect: `recovery_resolve_deep_link`'s envelope validators
 * (`requireDeepLinkEnvelope` and its per-field helpers) used to reject a malformed envelope with a
 * bare `Error`, tagged `errorKind: 'internal'` by `@jini-ai/daemon`'s `ToolExecutor` and redacted to
 * a message-stripped 500 by `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` (SEC-005). All now
 * throw `ToolInputError`, mirroring `features/post/tool-registrations.ts`'s fix shape. Asserting
 * `instanceof ToolInputError` directly is the exact fact `ToolExecutor.execute` branches its
 * classification on.
 */

function ctxWithInput(input: unknown): ToolExecutionContext {
  return { executionId: "e1", principal: { id: "p1" }, run: { id: "r1" }, input, signal: new AbortController().signal };
}

function buildTool() {
  const deps = createRouteDeps() as unknown as RecoveryToolDeps;
  const registration = buildRecoveryRegistrations(deps).find((r) => r.descriptor.id === "recovery_resolve_deep_link");
  assert.ok(registration, "expected recovery_resolve_deep_link to be wired");
  return registration;
}

test("recovery_resolve_deep_link: a non-object input is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const registration = buildTool();
  await assert.rejects(
    () => registration.handler(ctxWithInput("not-an-object")),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /'envelope' \(object\) is required/);
      return true;
    },
  );
});

test("recovery_resolve_deep_link: a malformed envelope field is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const registration = buildTool();
  await assert.rejects(
    () => registration.handler(ctxWithInput({ envelope: { v: "not-a-number" } })),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /'envelope\.v' \(number\) is required/);
      return true;
    },
  );
});
