/**
 * Pins the model-facing text Members publishes through Tovu: `@jini-ai/user-management` names the
 * member read as a `{{read:member}}` placeholder (the engine may not name a host tool id), and Tovu
 * binds `contentReadVocabulary` at its call sites. The model must keep seeing `content_read.member`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMembersRegistrations, type MembersToolDeps } from "../tool-registrations.js";
import { TOVU_CAPABILITY_CARDS } from "#src/server/runtime/composition/site-guide";

const MEMBER_ID_DESCRIPTION =
  "The member's id. Get it from content_read.member — omit memberId to list every member, or supply one to fetch that member.";

test("members tool schemas name the member read as content_read.member", () => {
  const registrations = buildMembersRegistrations({} as MembersToolDeps);
  for (const id of ["members_update_profile", "members_get_by_id", "members_delete", "members_disable"]) {
    const registration = registrations.find((r) => r.descriptor.id === id);
    assert.ok(registration, `missing ${id}`);
    const schema = registration.descriptor.inputSchema as { properties: { memberId: { description: string } } };
    assert.equal(schema.properties.memberId.description, MEMBER_ID_DESCRIPTION);
  }
  assert.ok(!JSON.stringify(registrations.map((r) => r.descriptor)).includes("{{read:"));
});

test("the Members capability card points at content_read.member", () => {
  const card = TOVU_CAPABILITY_CARDS.find((c) => c.id === "members");
  assert.ok(card);
  assert.deepEqual(card.pointers?.map((p) => p.tool ?? p.href), ["content_read.member", "/admin/members"]);
});
