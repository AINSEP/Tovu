import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { MemberValidationError } from "#src/features/members/index";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMemberDisableRoute } from "../disable.js";
import type { MembersRouteDeps } from "../deps.js";

/**
 * @file Closes the one branch `disable.test.ts` (the real-HTTP suite) cannot reach: the route's
 * `err instanceof MemberValidationError` mapping (400). Confirmed by reading `write-service.ts`'s
 * `disableMember` in full — its own guards only throw `MemberNotFoundError`, never
 * `MemberValidationError`. Injecting that error through the member repository exercises the
 * ROUTE's defensive error mapping through the real service for the day validation is added.
 *
 * No composition-root bootstrap or module replacement is needed: the repository is an existing
 * DI seam, and `res.locals.principal` is the real authentication helper's input.
 */

test("MEMBER_DISABLE route: 400 VALIDATION_ERROR when disableMember throws MemberValidationError (currently dead, defensive)", async () => {
  const app = express();
  const deps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "granted" }),
    memberRepo: {
      findById: async ({ workspaceId, id }: { workspaceId: string; id: string }) => {
        assert.deepEqual({ workspaceId, id }, { workspaceId: "ws-1", id: "member-1" });
        throw new MemberValidationError("member cannot be disabled (hypothetical future rule)");
      },
    },
  } as unknown as MembersRouteDeps;
  registerAdminMemberDisableRoute(app, deps);
  const routeHandler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/members/:memberId/disable");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-123" };

  await routeHandler({ params: { workspaceId: "ws-1", memberId: "member-1" } }, res);
  assert.equal(capture.statusCode, 400);
  assert.deepEqual(capture.jsonBody, { error: "member cannot be disabled (hypothetical future rule)" });
});
