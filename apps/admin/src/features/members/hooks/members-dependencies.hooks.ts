import type { MembersPort } from "@jini-ai/user-management/react";
import { membersApi } from "@/features/members/api/members-api";

/**
 * @file The only place under `features/members` that reaches `lib/api`. The port it binds and the
 * in-memory fake tests use both live in `@jini-ai/user-management` (`/react` and `/react/testing`);
 * Tovu keeps only this binding to its HTTP client and the content-refresh resource name.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s `redirectsHostPorts`. */
export const defaultMembersPort: MembersPort = {
  listMembers: (_required = {}) => membersApi.listMembers(),
  getMember: ({ id }) => membersApi.getMember({ id }),
  disableMember: ({ id }) => membersApi.disableMember({ id }),
  requestMemberMagicLink: (input) => membersApi.requestMemberMagicLink(input),
};

/** This screen's name on `lib/content-refresh-bus.ts` — see `taxonomy/rules.ts`'s
 *  `TAXONOMY_RESOURCE` for why this is a plain colocated constant rather than a shared registry.
 *  Agent-writable via `members_disable` (`apps/website/src/features/members/agent-tools.ts`), which
 *  flips a member's status this list renders. `members_request_magic_link` mutates durable state too
 *  but changes nothing this screen displays, so it needs no separate justification here. */
export const MEMBERS_RESOURCE = "members";
