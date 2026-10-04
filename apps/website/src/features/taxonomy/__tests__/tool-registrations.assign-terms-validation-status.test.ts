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

// Mirrors the assign-side fix above, same defect shape, same production wiring (`createRouteDeps()`
// — the real `SqliteEntryTermRepo`, not an in-memory double) — see that test's own file comment.
test("taxonomy_unassign_terms: a non-array 'termIds' is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  const deps = createRouteDeps() as unknown as TaxonomyToolDeps;
  const registration = buildTaxonomyRegistrations(deps).find((r) => r.descriptor.id === "taxonomy_unassign_terms");
  assert.ok(registration, "expected taxonomy_unassign_terms to be wired");

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

for (const id of ["taxonomy_assign_terms", "taxonomy_unassign_terms"]) {
  test(`${id}: malformed fields fail before authorization or writes`, async () => {
    const deps = createRouteDeps();
    deps.authorize = async () => { assert.fail("invalid input must not authorize"); };
    const registration = buildTaxonomyRegistrations(deps).find((r) => r.descriptor.id === id)!;
    for (const input of [
      { contentType: "post", contentId: "post-home", termIds: ["a", 5] },
      { contentType: "post", termIds: ["a"] },
      { contentType: 5, contentId: "post-home", termIds: ["a"] },
    ]) {
      await assert.rejects(() => registration.handler(ctxWithInput(input)), (error: unknown) => {
        assert.ok(error instanceof ToolInputError);
        return true;
      });
    }
  });
}

test("assignment handlers persist changes and permission refusals preserve those changes", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  await deps.settingsReady;
  let deniedPermission: string | undefined;
  const permissions: string[] = [];
  deps.authorize = async (request) => {
    assert.equal(request.principalId, "p1");
    assert.equal(request.workspaceId, deps.workspaceId);
    permissions.push(request.permission);
    return { allowed: request.permission !== deniedPermission, reason: "fixture grant" };
  };
  const registrations = buildTaxonomyRegistrations(deps);
  const call = (id: string, input: unknown) => registrations.find((r) => r.descriptor.id === id)!.handler(ctxWithInput(input));
  const { taxonomy } = await call("taxonomy_create_taxonomy", { name: "Handler taxonomy", hierarchical: false }) as { taxonomy: { id: string } };
  const { term } = await call("taxonomy_create_term", { taxonomyId: taxonomy.id, name: "Handler term" }) as { term: { id: string } };
  const target = { contentType: "post", contentId: "post-home" };
  const input = { ...target, termIds: [term.id] };
  const assignedIds = async () => (await deps.entryTermRepo.listForContent(target)).map((row) => row.termId);
  assert.deepEqual(await assignedIds(), []);
  permissions.length = 0;
  assert.deepEqual(await call("taxonomy_assign_terms", input), { ...target, assignedTermIds: [term.id] });
  assert.deepEqual(await assignedIds(), [term.id]);
  assert.deepEqual(permissions, ["content.write", "admin.taxonomy.manage"]);
  for (const permission of ["content.write", "admin.taxonomy.manage"]) {
    deniedPermission = permission;
    await assert.rejects(() => call("taxonomy_unassign_terms", input), /not authorized/);
    assert.deepEqual(await assignedIds(), [term.id]);
  }
  deniedPermission = undefined;
  assert.deepEqual(await call("taxonomy_unassign_terms", input), { ...target, unassignedTermIds: [term.id], notAssignedTermIds: [] });
  assert.deepEqual(await assignedIds(), []);
  for (const permission of ["content.write", "admin.taxonomy.manage"]) {
    deniedPermission = permission;
    await assert.rejects(() => call("taxonomy_assign_terms", input), /not authorized/);
    assert.deepEqual(await assignedIds(), []);
  }
});
