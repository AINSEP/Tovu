import assert from "node:assert/strict";
import test from "node:test";

import { buildOwnerOnlyInstanceAuthorize } from "../../composition.js";

/**
 * @file Direct/isolated unit coverage for `composition.ts`'s `buildOwnerOnlyInstanceAuthorize` —
 * the minimal `InstanceAuthorizeFn` binding that closes `gateway.ts`'s instance-scope
 * authorization gap (see `GatewayDeps.authorizeInstance`'s doc comment in `../../gateway`).
 * `gateway.unit.test.ts`'s "Instance scope" section covers this same primitive composed through
 * the gateway's fixed check-sequence; this file isolates the primitive itself.
 */

test("grants every permission to exactly the resolved owner principal", async () => {
  const authorizeInstance = buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: Promise.resolve("owner-1") });

  const result = await authorizeInstance({ principalId: "owner-1", permission: "database.migrate" });

  assert.deepEqual(result, { allowed: true, reason: "owner_wildcard" });
});

test("denies a non-owner principal, even a workspace-scoped admin holding the same permission string", async () => {
  const authorizeInstance = buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: Promise.resolve("owner-1") });

  const result = await authorizeInstance({ principalId: "workspace-admin-1", permission: "database.migrate" });

  assert.deepEqual(result, { allowed: false, reason: "not_instance_owner" });
});

test("is agnostic to the requested permission string — the owner is granted, and a non-owner is denied, regardless of which permission is asked for", async () => {
  const authorizeInstance = buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: Promise.resolve("owner-1") });

  const ownerResult = await authorizeInstance({ principalId: "owner-1", permission: "taxonomy.mergeTerm" });
  const otherResult = await authorizeInstance({ principalId: "someone-else", permission: "recovery.restore" });

  assert.equal(ownerResult.allowed, true);
  assert.equal(otherResult.allowed, false);
});

test("resolves ownerPrincipalId fresh on every call, matching identity.ownerPrincipalId's fire-and-forget promise shape", async () => {
  let resolveOwner: (id: string) => void = () => {};
  const ownerPrincipalId = new Promise<string>((resolve) => {
    resolveOwner = resolve;
  });
  const authorizeInstance = buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId });

  const pending = authorizeInstance({ principalId: "owner-1", permission: "database.migrate" });
  resolveOwner("owner-1");

  assert.deepEqual(await pending, { allowed: true, reason: "owner_wildcard" });
});
