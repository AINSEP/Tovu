/**
 * ADR-030 §2 hard invariant: a `kind='member'` principal must never hold an
 * operator RBAC role or permission. Operator RBAC exists, but its principal-kind vocabulary
 * does not include members yet; there is no member-kind `authorize()` gate to exercise.
 * This is a structural placeholder,
 * not a full enforcement test. It asserts the two things that ARE checkable
 * today: (1) the `members` public barrel exposes no role/permission/RBAC-shaped
 * symbol, and (2) representative typed fixtures carry no role/permission field.
 * Production member and resolved-context shapes are checked in `write-service.test.ts`.
 * When ADR-021's principal-kind extension + `authorize()` guard
 * land, replace this with a real "member-kind authorize() call is rejected" test.
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as membersModule from "../index.js";
import type { MemberContext, MemberRecord } from "../types.js";

test("members barrel exports no RBAC role/permission symbol (ADR-030 §2, structural check)", () => {
  const exportedNames = Object.keys(membersModule);
  const rbacLike = exportedNames.filter((name) => /role|permission|rbac|authorize/i.test(name));
  assert.deepEqual(rbacLike, [], "members barrel must not export any operator RBAC role/permission symbol");
});

test("representative MemberRecord and MemberContext fixtures carry no role/permission field", () => {
  // These fixtures document the intended shape; they cannot prohibit optional type keys.
  // The sibling write-service tests inspect real sign-in and resolver outputs.
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
