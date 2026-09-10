import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildDatabaseRegistrations, type DatabaseToolDeps } from "../../tool-registrations.js";

/**
 * @file RED->GREEN for the 500-redact defect: `database_query_timeline`/`backup_create_restore_point`
 * both used to reject a non-object `input` with a bare `Error`, which `@jini-ai/daemon`'s
 * `ToolExecutor` tags `errorKind: 'internal'` — redacted by `@jini-ai/http-kit`'s
 * `delegatedToolExecuteRoute` (SEC-005) into a message-stripped 500, instead of a 400 carrying the
 * actionable reason. Both now throw `@jini-ai/core`'s `ToolInputError`, mirroring
 * `features/post/tool-registrations.ts`'s `requirePostKind`/`requirePostStatus` fix. Asserting
 * `instanceof ToolInputError` directly is the exact fact `ToolExecutor.execute` branches on
 * (`tool-executor.ts`: `err instanceof ToolInputError ? 'validation' : 'internal'`), so this proves
 * the classification the wire-level fix depends on without re-driving the whole HTTP route.
 */

function ctxWithInput(input: unknown): ToolExecutionContext {
  return { executionId: "e1", principal: { id: "p1" }, run: { id: "r1" }, input, signal: new AbortController().signal };
}

function buildTool(id: string) {
  const deps = createRouteDeps() as unknown as DatabaseToolDeps;
  const registration = buildDatabaseRegistrations(deps).find((r) => r.descriptor.id === id);
  assert.ok(registration, `expected '${id}' to be wired`);
  return registration;
}

test("database_query_timeline: a non-object input is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const registration = buildTool("database_query_timeline");
  await assert.rejects(
    () => registration.handler(ctxWithInput("not-an-object")),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /input must be an object/);
      return true;
    },
  );
});

test("backup_create_restore_point: a non-object input is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const registration = buildTool("backup_create_restore_point");
  await assert.rejects(
    () => registration.handler(ctxWithInput("not-an-object")),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /input must be an object/);
      return true;
    },
  );
});
