import assert from "node:assert/strict";
import test from "node:test";

import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import type { PermissionGrantRegistry } from "../permission-grants.js";
import { registerUserManagePermissionGrants } from "../user-manage-permission.js";

/**
 * @file Owner decision 2026-10-07: built-in admins get `user.manage` (L7 Stryker: removing the grant
 * survived every test). Only `admin` — never editor/viewer — and the app composition registers it.
 */

test("registerUserManagePermissionGrants registers exactly one admin user.manage role grant", () => {
  const registered: unknown[] = [];
  const registry = { roleGrants: { register: (grant: unknown) => { registered.push(grant); } } } as unknown as PermissionGrantRegistry;
  registerUserManagePermissionGrants({ registry });
  assert.equal(registered.length, 1);
  assert.deepEqual({ ...(registered[0] as object), reason: undefined }, { role: "admin", permission: "user.manage", reason: undefined });
  assert.match((registered[0] as { reason: string }).reason, /Owner decision 2026-10-07/);
});

test("the app permission grants give user.manage to admin only", () => {
  const holders = createAppPermissionGrants({}).roleGrants.list({})
    .filter((grant) => grant.permission === "user.manage").map((grant) => grant.role);
  assert.deepEqual(holders, ["admin"]);
});
