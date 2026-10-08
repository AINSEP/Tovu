import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { TrashEntityType } from "@jini-ai/cms/trash";

import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { deriveTrashItemRegistrations, type TrashItemToolDeps, type TrashUserPort } from "#src/features/trash/trash-item-tool";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file `trash_item`'s `user` kind (2026-10-05, capability gap U-06): `identity_user_delete` needs the
 * user in the Trash first, and `trash_item` had no way to put one there. The kind is reachable only
 * through the injected {@link TrashUserPort} (bound in production to the Users screen's own
 * `trashUser`; that binding is covered by `server/runtime/composition/__tests__/trash-user-tool-port.test.ts`).
 */

const CALLER = "principal-caller";

/** Route deps with no delegates and no registry, so `user` is the only kind that can be reachable. */
function routeDeps(trashable: (entityType: TrashEntityType) => boolean = () => true): TrashItemToolDeps {
  return {
    authorize: async () => ({ allowed: false, reason: "insufficient_permission" }),
    workspaceId: "ws-trash-user",
    isTrashableEntityType: trashable,
    registry: new Map(),
  } as unknown as TrashItemToolDeps;
}

function derive(deps: TrashItemToolDeps, trashUser?: TrashUserPort): ToolRegistration[] {
  return deriveTrashItemRegistrations(
    { registrations: [], routeDeps: deps, surfaces: { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) } },
    trashUser ? { trashUser } : {}
  );
}

function call(registration: ToolRegistration, input: unknown) {
  return registration.handler({
    executionId: "exec-1",
    principal: { id: CALLER },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  } as ToolExecutionContext);
}

function enumOf(registration: ToolRegistration): string[] {
  return (registration.descriptor.inputSchema as { properties: { entityType: { enum: string[] } } }).properties.entityType.enum;
}

test("with a trashUser port, 'user' is an accepted kind and the call hands the id and the caller to the port", async () => {
  const calls: unknown[] = [];
  const [trashItem] = derive(routeDeps(), async (required) => {
    calls.push(required);
    return { noop: false };
  });
  assert.deepEqual(enumOf(trashItem), ["user"]);

  const result = await call(trashItem, { entityType: "user", entityId: "principal-jane" });

  assert.deepEqual(calls, [{ principalId: "principal-jane", callerPrincipalId: CALLER }]);
  assert.deepEqual(result, {
    entityType: "user",
    entityId: "principal-jane",
    via: "trashUser",
    outcome: { trashed: true, cancelled: false, alreadyInTrash: false },
  });
});

test("a user already in the Trash reports alreadyInTrash: true", async () => {
  const [trashItem] = derive(routeDeps(), async () => ({ noop: true }));
  const result = (await call(trashItem, { entityType: "user", entityId: "principal-jane" })) as { outcome: unknown };
  assert.deepEqual(result.outcome, { trashed: true, cancelled: false, alreadyInTrash: true });
});

test("a refusal from the port reaches the model unchanged", async () => {
  const refusal = new ToolInputError({ message: "trash_item: you cannot delete your own account. Nothing was changed." });
  const [trashItem] = derive(routeDeps(), async () => {
    throw refusal;
  });
  await assert.rejects(call(trashItem, { entityType: "user", entityId: CALLER }), (error) => error === refusal);
});

test("without a trashUser port, 'user' is not accepted and nothing is registered for it", () => {
  assert.deepEqual(derive(routeDeps()), []);
});

test("with no live user Trash adapter, 'user' is refused with an exact error and the port is never called", async () => {
  let called = false;
  const [trashItem] = derive(
    routeDeps((entityType) => entityType !== "user"),
    async () => {
      called = true;
      return { noop: false };
    }
  );
  await assert.rejects(call(trashItem, { entityType: "user", entityId: "principal-jane" }), {
    message: "trash_item: 'user' is not a kind of thing the Trash can hold. Expected one of: . Nothing was changed.",
  });
  assert.equal(called, false);
});

test("a missing entityId is refused before the port is called", async () => {
  let called = false;
  const [trashItem] = derive(routeDeps(), async () => {
    called = true;
    return { noop: false };
  });
  await assert.rejects(call(trashItem, { entityType: "user" }), { message: "'entityId' (non-empty string) is required" });
  assert.equal(called, false);
});
