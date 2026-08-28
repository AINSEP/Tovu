import type { AdminMember } from "@/lib/api";

/**
 * @file What `use-members.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented on
 * `assistant-chats-port.hooks.ts` (the canonical reference in this workspace) and the shape
 * `redirects-port.hooks.ts` uses for a single-hook feature.
 *
 * `describeApiError` is deliberately NOT part of this port — a pure error-message rule with no
 * I/O, imported directly per the pattern's own carve-out (see `redirects-port.hooks.ts`'s
 * identical note).
 */
export interface MembersPort {
  listMembers(): Promise<{ members: AdminMember[] }>;
  getMember(id: string): Promise<{ member: AdminMember }>;
  disableMember(id: string): Promise<{ member: AdminMember }>;
  requestMemberMagicLink(input: { email: string }): Promise<{ delivered: true }>;
}
