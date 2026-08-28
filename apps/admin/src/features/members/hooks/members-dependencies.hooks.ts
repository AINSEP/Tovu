import { api, type AdminMember } from "@/lib/api";
import type { MembersPort } from "./members-port.hooks";

/**
 * @file The only place under `features/members` that reaches `lib/api` — see
 * `members-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultMembersPort: MembersPort = {
  listMembers: () => api.listMembers(),
  getMember: (id) => api.getMember(id),
  disableMember: (id) => api.disableMember(id),
  requestMemberMagicLink: (input) => api.requestMemberMagicLink(input),
};

/** Seed state for {@link createFakeMembersPort}. */
export interface FakeMembersPortOptions {
  members?: AdminMember[];
}

/**
 * An in-memory {@link MembersPort} for tests — the fake that lets a test describe "the list has
 * these two members" directly, instead of hand-building `Response` objects and stubbing global
 * `fetch`. Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 */
export function createFakeMembersPort(options: FakeMembersPortOptions = {}): MembersPort & {
  /** Every member currently in the fake's store, in list order. */
  readonly members: AdminMember[];
  /** Emails a magic link was requested for, in call order — lets a test assert on the request
   *  without caring what `requestMemberMagicLink`'s fulfilled response looks like. */
  readonly magicLinkRequests: string[];
} {
  const members = [...(options.members ?? [])];
  const magicLinkRequests: string[] = [];

  function findOrThrow(id: string): AdminMember {
    const member = members.find((m) => m.id === id);
    if (!member) throw new Error(`fake member not found: ${id}`);
    return member;
  }

  return {
    members,
    magicLinkRequests,

    async listMembers() {
      return { members: [...members] };
    },

    async getMember(id) {
      return { member: findOrThrow(id) };
    },

    async disableMember(id) {
      const index = members.findIndex((m) => m.id === id);
      if (index < 0) throw new Error(`fake member not found: ${id}`);
      const updated: AdminMember = { ...members[index]!, status: "disabled" };
      members[index] = updated;
      return { member: updated };
    },

    async requestMemberMagicLink({ email }) {
      magicLinkRequests.push(email);
      return { delivered: true };
    },
  };
}
