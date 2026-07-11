/**
 * ADR-030 §2 hard invariant: a `kind='member'` principal must never hold an
 * operator RBAC role or permission. There is no operator-permission/RBAC code
 * in this repo yet to test an actual `authorize()` rejection against (ADR-021's
 * `principals`/`principal_roles` tables + the "reject any member-kind principal"
 * gate are not implemented anywhere yet) — so this is a structural placeholder,
 * not a full enforcement test. It asserts the two things that ARE checkable
 * today: (1) the `members` public barrel exposes no role/permission/RBAC-shaped
 * symbol, so nothing here could accidentally wire a member into the operator
 * axis, and (2) `MemberRecord`/`MemberContext` carry no role/permission field at
 * the type level. When ADR-021's principal-kind extension + `authorize()` guard
 * land, replace this with a real "member-kind authorize() call is rejected" test.
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as membersModule from "../index";
import type { MemberContext, MemberRecord } from "../types";

test("members barrel exports no RBAC role/permission symbol (ADR-030 §2, structural check)", () => {
  const exportedNames = Object.keys(membersModule);
  const rbacLike = exportedNames.filter((name) => /role|permission|rbac|authorize/i.test(name));
  assert.deepEqual(rbacLike, [], "members barrel must not export any operator RBAC role/permission symbol");
});

test("MemberRecord and MemberContext carry no role/permission field (type-level note, enforced by the compiler)", () => {
  // If `MemberRecord`/`MemberContext` ever grow a `role`/`permissions` field,
  // this object literal (built from only the documented keys) would need one
  // too to type-check the assignment below — the compiler is the actual
  // enforcement; this test just keeps a runtime witness of the intended shape.
  const member: MemberRecord = {
    id: "member-1",
    workspaceId: "ws-1",
    email: "member@example.com",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  const context: MemberContext = { isAuthenticated: true, activeTierIds: [], isPaid: false };

  assert.ok(!("role" in member) && !("permissions" in member));
  assert.ok(!("role" in context) && !("permissions" in context));
});
