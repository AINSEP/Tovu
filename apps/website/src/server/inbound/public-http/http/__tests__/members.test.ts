import assert from "node:assert/strict";
import test from "node:test";
import { toPublicMemberResponse } from "../members.js";

// F1.2/F4.1: removing name or spreading the internal record must fail.
test("public member preserves name and disabled status while excluding private fields", () => {
  const member = {
    id: "member-7", email: "ada@example.org", name: "Ada Seven", status: "disabled" as const,
    workspaceId: "ws-private", version: 8, emailVerifiedAt: "2026-09-01T00:00:00Z",
    createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z",
    note: "operator secret", fields: { private: "data" }, tokenHash: "secret-token",
  };
  assert.deepEqual(toPublicMemberResponse(member), {
    id: "member-7", email: "ada@example.org", name: "Ada Seven", status: "disabled",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(toPublicMemberResponse({ ...member, name: undefined, status: "active" }))), {
    id: "member-7", email: "ada@example.org", status: "active",
  });
});
