import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryMemberRepo } from "../repo.memory";
import { MembersSubscriberDirectory } from "../subscriber-directory";
import type { MemberRecord } from "../types";

const WORKSPACE_ID = "ws-1";
const OTHER_WORKSPACE_ID = "ws-2";

function makeMember(overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id: "member-1",
    workspaceId: WORKSPACE_ID,
    email: "reader@example.com",
    status: "active",
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test("getContact: returns null for an unknown subscriber id", async () => {
  const directory = new MembersSubscriberDirectory({ members: new InMemoryMemberRepo() });

  const contact = await directory.getContact({ workspaceId: WORKSPACE_ID, subscriberId: "no-such-id" });

  assert.equal(contact, null);
});

test("getContact: an active + verified member is emailDeliverable, subscriberId = memberId", async () => {
  const member = makeMember();
  const directory = new MembersSubscriberDirectory({
    members: new InMemoryMemberRepo([member]),
  });

  const contact = await directory.getContact({ workspaceId: WORKSPACE_ID, subscriberId: member.id });

  assert.deepEqual(contact, {
    subscriberId: member.id,
    workspaceId: WORKSPACE_ID,
    email: member.email,
    emailDeliverable: true,
  });
});

test("getContact: an unverified member is not emailDeliverable", async () => {
  const member = makeMember({ id: "member-unverified", emailVerifiedAt: undefined });
  const directory = new MembersSubscriberDirectory({
    members: new InMemoryMemberRepo([member]),
  });

  const contact = await directory.getContact({ workspaceId: WORKSPACE_ID, subscriberId: member.id });

  assert.equal(contact?.emailDeliverable, false);
});

test("getContact: a pending (not-yet-active) member is not emailDeliverable", async () => {
  const member = makeMember({ id: "member-pending", status: "pending", emailVerifiedAt: undefined });
  const directory = new MembersSubscriberDirectory({
    members: new InMemoryMemberRepo([member]),
  });

  const contact = await directory.getContact({ workspaceId: WORKSPACE_ID, subscriberId: member.id });

  assert.equal(contact?.emailDeliverable, false);
});

test("getContact: a disabled member (even if previously verified) is not emailDeliverable", async () => {
  const member = makeMember({ id: "member-disabled", status: "disabled" });
  const directory = new MembersSubscriberDirectory({
    members: new InMemoryMemberRepo([member]),
  });

  const contact = await directory.getContact({ workspaceId: WORKSPACE_ID, subscriberId: member.id });

  assert.equal(contact?.emailDeliverable, false);
});

test("getContact: a member in another workspace is not visible (workspace scoping)", async () => {
  const member = makeMember({ workspaceId: OTHER_WORKSPACE_ID });
  const directory = new MembersSubscriberDirectory({
    members: new InMemoryMemberRepo([member]),
  });

  const contact = await directory.getContact({ workspaceId: WORKSPACE_ID, subscriberId: member.id });

  assert.equal(contact, null);
});

test("getContacts: returns one contact per found id, in no particular required order", async () => {
  const active = makeMember({ id: "member-active" });
  const unverified = makeMember({ id: "member-unverified", emailVerifiedAt: undefined });
  const directory = new MembersSubscriberDirectory({
    members: new InMemoryMemberRepo([active, unverified]),
  });

  const contacts = await directory.getContacts({
    workspaceId: WORKSPACE_ID,
    subscriberIds: [active.id, unverified.id],
  });

  const byId = new Map(contacts.map((contact) => [contact.subscriberId, contact]));
  assert.equal(contacts.length, 2);
  assert.equal(byId.get(active.id)?.emailDeliverable, true);
  assert.equal(byId.get(unverified.id)?.emailDeliverable, false);
});

test("getContacts: unknown ids are silently omitted from the result, not errored or null-padded", async () => {
  const known = makeMember({ id: "member-known" });
  const directory = new MembersSubscriberDirectory({
    members: new InMemoryMemberRepo([known]),
  });

  const contacts = await directory.getContacts({
    workspaceId: WORKSPACE_ID,
    subscriberIds: [known.id, "member-does-not-exist"],
  });

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].subscriberId, known.id);
});

test("getContacts: an empty subscriberIds array returns an empty array", async () => {
  const directory = new MembersSubscriberDirectory({ members: new InMemoryMemberRepo() });

  const contacts = await directory.getContacts({ workspaceId: WORKSPACE_ID, subscriberIds: [] });

  assert.deepEqual(contacts, []);
});
