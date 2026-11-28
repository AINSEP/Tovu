import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "../../app.js";
import { ownerAccessFor, type ServingRoutineDeps } from "../serving-routines.js";

/**
 * @file `ownerAccessFor`: the routine commands' access check over the REAL in-memory identity stack.
 * Only the mounted workspace's live `*` holder passes; another workspace is refused before any lookup,
 * and a failing lookup denies instead of throwing.
 */

function servingDeps(): ServingRoutineDeps & ReturnType<typeof createRouteDeps> {
  const deps = createRouteDeps();
  return Object.assign(deps, { adminAssistantEnabled: true, authorize: async () => ({ ok: true }) }) as never;
}

test("the mounted workspace's owner may run routine commands; another principal there may not", async () => {
  const deps = servingDeps();
  await deps.identityReady;
  const ownerId = await deps.ownerPrincipalId;
  const access = ownerAccessFor(deps);
  assert.equal(await access({ actor: { workspaceId: deps.workspaceId, principalId: ownerId } }), true);
  assert.equal(await access({ actor: { workspaceId: deps.workspaceId, principalId: "not-the-owner" } }), false);
});

test("an actor from another workspace is refused without any identity lookup", async () => {
  const deps = servingDeps();
  await deps.identityReady;
  const ownerId = await deps.ownerPrincipalId;
  let lookups = 0;
  const access = ownerAccessFor({ ...deps, principalRoleRepo: new Proxy(deps.principalRoleRepo, { get: (target, key) => { lookups += 1; return Reflect.get(target, key); } }) });
  assert.equal(await access({ actor: { workspaceId: `${deps.workspaceId}-other`, principalId: ownerId } }), false);
  assert.equal(lookups, 0);
});

test("an identity lookup that fails denies the command instead of throwing", async () => {
  const deps = servingDeps();
  await deps.identityReady;
  const ownerId = await deps.ownerPrincipalId;
  const broken = new Proxy(deps.principalRoleRepo, { get: () => () => { throw new Error("role store offline"); } });
  const access = ownerAccessFor({ ...deps, principalRoleRepo: broken });
  assert.equal(await access({ actor: { workspaceId: deps.workspaceId, principalId: ownerId } }), false);
});
