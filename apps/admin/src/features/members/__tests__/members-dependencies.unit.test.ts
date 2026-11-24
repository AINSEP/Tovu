import { describe, expect, it, vi } from "vitest";

import type { AdminMember } from "@jini-ai/core/contracts/site/user-management-react";
import { createFakeMembersPort } from "@jini-ai/user-management/react/testing";

/**
 * @file Coverage for `members-dependencies.hooks.ts` (3/12 funcs, 0% branch) —
 * `defaultMembersPort`'s four live `api.*` binds, and the shared `createFakeMembersPort` (`@jini-ai/user-management/react/testing`) stateful
 * in-memory implementation (list/get/disable/request-magic-link), including its own `findOrThrow`
 * not-found branch — the likely source of the reported 0% branch coverage, since nothing before
 * this file exercised a lookup miss.
 */

const { listMembers, getMember, disableMember, requestMemberMagicLink } = vi.hoisted(() => ({
  listMembers: vi.fn(),
  getMember: vi.fn(),
  disableMember: vi.fn(),
  requestMemberMagicLink: vi.fn(),
}));

vi.mock("../api/members-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/members-api")>();
  return { ...actual, membersApi: { ...actual.membersApi, listMembers, getMember, disableMember, requestMemberMagicLink } };
});

const { defaultMembersPort } = await import("../hooks/members-dependencies.hooks");

function member(overrides: Partial<AdminMember> = {}): AdminMember {
  return {
    id: "m1",
    workspaceId: "ws1",
    email: "reader@example.com",
    status: "active",
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("defaultMembersPort", () => {
  it("listMembers delegates to api.listMembers, returning its result unchanged", async () => {
    const result = { members: [member()] };
    listMembers.mockResolvedValue(result);
    await expect(defaultMembersPort.listMembers({})).resolves.toEqual(result);
    expect(listMembers).toHaveBeenCalledWith();
  });

  it("getMember forwards id to api.getMember", async () => {
    const result = { member: member() };
    getMember.mockResolvedValue(result);
    await expect(defaultMembersPort.getMember({ id: "m1" })).resolves.toEqual(result);
    expect(getMember).toHaveBeenCalledWith({ id: "m1" });
  });

  it("disableMember forwards id to api.disableMember", async () => {
    const result = { member: member({ status: "disabled" }) };
    disableMember.mockResolvedValue(result);
    await expect(defaultMembersPort.disableMember({ id: "m1" })).resolves.toEqual(result);
    expect(disableMember).toHaveBeenCalledWith({ id: "m1" });
  });

  it("requestMemberMagicLink forwards the input to api.requestMemberMagicLink", async () => {
    requestMemberMagicLink.mockResolvedValue({ delivered: true });
    await expect(defaultMembersPort.requestMemberMagicLink({ email: "reader@example.com" })).resolves.toEqual({ delivered: true });
    expect(requestMemberMagicLink).toHaveBeenCalledWith({ email: "reader@example.com" });
  });
});

describe("createFakeMembersPort — stateful in-memory fake", () => {
  it("seeds from options.members and lists them back in order", async () => {
    const port = createFakeMembersPort({}, { members: [member({ id: "m1" }), member({ id: "m2", email: "b@example.com" })] });
    await expect(port.listMembers({})).resolves.toEqual({ members: [member({ id: "m1" }), member({ id: "m2", email: "b@example.com" })] });
    expect(port.members.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("defaults to an empty roster when no options are given", async () => {
    const port = createFakeMembersPort({});
    await expect(port.listMembers({})).resolves.toEqual({ members: [] });
  });

  it("getMember finds an existing member by id", async () => {
    const port = createFakeMembersPort({}, { members: [member({ id: "m1" })] });
    await expect(port.getMember({ id: "m1" })).resolves.toEqual({ member: member({ id: "m1" }) });
  });

  it("getMember throws a named error for an id that does not exist (the findOrThrow branch)", async () => {
    const port = createFakeMembersPort({}, { members: [member({ id: "m1" })] });
    await expect(port.getMember({ id: "missing" })).rejects.toThrow("fake member not found: missing");
  });

  it("disableMember flips status to 'disabled' and persists it in the store", async () => {
    const port = createFakeMembersPort({}, { members: [member({ id: "m1", status: "active" })] });
    const result = await port.disableMember({ id: "m1" });
    expect(result.member.status).toBe("disabled");
    await expect(port.getMember({ id: "m1" })).resolves.toEqual({ member: member({ id: "m1", status: "disabled" }) });
  });

  it("disableMember throws a named error for an id that does not exist (its OWN not-found branch, separate from findOrThrow)", async () => {
    const port = createFakeMembersPort({}, { members: [member({ id: "m1" })] });
    await expect(port.disableMember({ id: "missing" })).rejects.toThrow("fake member not found: missing");
  });

  it("requestMemberMagicLink records the requested email and resolves delivered:true", async () => {
    const port = createFakeMembersPort({});
    const result = await port.requestMemberMagicLink({ email: "reader@example.com" });
    expect(result).toEqual({ delivered: true });
    expect(port.magicLinkRequests).toEqual(["reader@example.com"]);
  });

  it("requestMemberMagicLink accumulates multiple requests in call order", async () => {
    const port = createFakeMembersPort({});
    await port.requestMemberMagicLink({ email: "a@example.com" });
    await port.requestMemberMagicLink({ email: "b@example.com" });
    expect(port.magicLinkRequests).toEqual(["a@example.com", "b@example.com"]);
  });
});
