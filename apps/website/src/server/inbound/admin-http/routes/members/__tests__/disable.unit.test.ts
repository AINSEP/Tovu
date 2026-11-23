import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { MemberValidationError } from "@jini-ai/user-management/members/types";
import { InMemoryMemberRepo, InMemoryMemberSessionRepo } from "@jini-ai/user-management/members/repo.memory";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { MEMBER_VERSION_CONFLICT_MESSAGE, registerAdminMemberDisableRoute } from "../disable.js";
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
  registerAdminMemberDisableRoute({ app, deps });
  const routeHandler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/members/:memberId/disable");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-123" };

  await routeHandler({ params: { workspaceId: "ws-1", memberId: "member-1" } }, res);
  assert.equal(capture.statusCode, 400);
  assert.deepEqual(capture.jsonBody, { error: "member cannot be disabled (hypothetical future rule)" });
});

// C058: a disable that lost the member compare-and-set to a concurrent writer is a
// `409 VERSION_CONFLICT` carrying the admin's reload copy, not an opaque 500.
test("MEMBER_DISABLE route: a concurrent member write surfaces 409 VERSION_CONFLICT with the reload message", async () => {
  const app = express();
  const members = new InMemoryMemberRepo({}, { initialRows: [{ id: "member-1", workspaceId: "ws-1", email: "m@example.test",
    status: "active", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", version: 1 }] });
  const deps = {
    workspaceId: "ws-1",
    clock: createFakeClock({ startIso: "2026-11-02T00:00:00.000Z" }),
    authorize: async () => ({ allowed: true, reason: "granted" }),
    memberSessionRepo: new InMemoryMemberSessionRepo(),
    memberRepo: {
      // The operator's read wins the race to load, then another writer saves before the disable does.
      findById: async (args: { workspaceId: string; id: string }) => {
        const read = await members.findById(args);
        assert.ok(read);
        await members.save({ ...read, name: "Renamed meanwhile", version: read.version + 1 });
        return read;
      },
      save: (record: Parameters<InMemoryMemberRepo["save"]>[0]) => members.save(record),
    },
  } as unknown as MembersRouteDeps;
  registerAdminMemberDisableRoute({ app, deps });
  const routeHandler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/members/:memberId/disable");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-123" };

  await routeHandler({ params: { workspaceId: "ws-1", memberId: "member-1" } }, res);
  assert.equal(capture.statusCode, 409);
  assert.deepEqual(capture.jsonBody, { code: "VERSION_CONFLICT", error: MEMBER_VERSION_CONFLICT_MESSAGE });
  assert.equal((await members.findById({ workspaceId: "ws-1", id: "member-1" }))?.status, "active");
});
