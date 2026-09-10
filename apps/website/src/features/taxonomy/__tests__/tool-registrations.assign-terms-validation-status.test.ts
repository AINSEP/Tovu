import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildTaxonomyRegistrations, type TaxonomyToolDeps } from "../tool-registrations.js";

/**
 * @file RED->GREEN for the 500-redact defect: `taxonomy_assign_terms`'s `termIds` array check used
 * to reject a bad value with a bare `Error`, tagged `errorKind: 'internal'` by `@jini-ai/daemon`'s
 * `ToolExecutor` and redacted to a message-stripped 500 by `@jini-ai/http-kit`'s
 * `delegatedToolExecuteRoute` (SEC-005). Now throws `ToolInputError`, mirroring
 * `features/post/tool-registrations.ts`'s fix shape. Asserting `instanceof ToolInputError` directly
 * is the exact fact `ToolExecutor.execute` branches its classification on.
 */

function ctxWithInput(input: unknown): ToolExecutionContext {
  return { executionId: "e1", principal: { id: "p1" }, run: { id: "r1" }, input, signal: new AbortController().signal };
}

test("taxonomy_assign_terms: a non-array 'termIds' is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const deps = createRouteDeps() as unknown as TaxonomyToolDeps;
  const registration = buildTaxonomyRegistrations(deps).find((r) => r.descriptor.id === "taxonomy_assign_terms");
  assert.ok(registration, "expected taxonomy_assign_terms to be wired");

  await assert.rejects(
    () =>
      registration.handler(
        ctxWithInput({ contentType: "post", contentId: "p1", termIds: "not-an-array" }),
      ),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /'termIds' \(string array\) is required/);
      return true;
    },
  );
});
