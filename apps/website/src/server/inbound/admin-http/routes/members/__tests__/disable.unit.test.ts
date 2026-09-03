import assert from "node:assert/strict";
import test from "node:test";

/**
 * @file Closes the one branch `disable.test.ts` (the real-HTTP suite) cannot reach: the route's
 * `err instanceof MemberValidationError` mapping (400). Confirmed by reading `write-service.ts`'s
 * `disableMember` in full — it only ever throws `MemberNotFoundError`, never
 * `MemberValidationError` — so this branch is genuinely unreachable through the real service today
 * and can only be exercised by substituting a fake `disableMember` that throws it, proving the
 * ROUTE's own error-mapping is correct for the day this validation is added (mirrors this
 * directory's `widgets/__tests__/unit/update.unit.test.ts` `mock.module()` technique for the same
 * shape of defensive-but-currently-dead catch branch).
 *
 * Deliberately does NOT import `createRouteDeps`/`app.js` or even `../disable.js` statically —
 * `mock.module()` cannot retroactively change a binding a module already resolved at its first
 * load (see `assistant/__tests__/test-agent-mock-module.test.ts`'s header for the same caveat), so
 * the mock is registered before the route module is ever imported, dynamically, below.
 */

test("MEMBER_DISABLE route: 400 VALIDATION_ERROR when disableMember throws MemberValidationError (currently dead, defensive)", async (t) => {
  const realMembers = await import("#src/features/members/index");
  t.mock.module("#src/features/members/index", {
    namedExports: {
      ...realMembers,
      disableMember: async () => {
        throw new realMembers.MemberValidationError("member cannot be disabled (hypothetical future rule)");
      },
    },
  });

  const realDevAuth = await import("#src/server/inbound/admin-http/dev-auth");
  t.mock.module("#src/server/inbound/admin-http/dev-auth", {
    namedExports: {
      ...realDevAuth,
      getAuthedPrincipal: () => ({ id: "principal-123" }),
    },
  });

  const { registerAdminMemberDisableRoute } = await import("../disable.js");

  let routeHandler: any;
  const mockApp = {
    post: (_path: string, handler: any) => {
      routeHandler = handler;
    },
  };

  const deps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "granted" }),
  };

  registerAdminMemberDisableRoute(mockApp as any, deps as any);
  assert.ok(routeHandler, "route handler was registered");

  let capturedStatus = 0;
  let capturedBody: any = null;
  const res = {
    locals: { principal: { id: "principal-123" } },
    status(code: number) {
      capturedStatus = code;
      return this;
    },
    json(body: any) {
      capturedBody = body;
      return this;
    },
  };

  await routeHandler({ params: { workspaceId: "ws-1", memberId: "member-1" } }, res);
  assert.equal(capturedStatus, 400);
  assert.equal(capturedBody.error, "member cannot be disabled (hypothetical future rule)");
});
