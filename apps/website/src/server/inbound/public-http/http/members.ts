import type { MemberRecord, MemberStatus } from "#src/features/members/index";

/**
 * @file Public-facing member response DTO (ADR-PIPE-013 Decision §2, C-014).
 *
 * Purpose:
 * Serializes `MemberRecord` for the new PUBLIC `sign-in/complete` route — the
 * response a member's own (unauthenticated) browser receives. Mirrors
 * `http/admin/members.ts`'s `toAdminMemberResponse` exclusion discipline, but
 * STRICTER: this response goes to the member's own client on an
 * unauthenticated surface, not to an operator, so it additionally excludes
 * `emailVerifiedAt`, `workspaceId`, and `version` on top of everything the
 * admin serializer already excludes (`note`, `fields`, anything
 * session/token-shaped). A public serializer leaking an internal field here
 * is a direct PII/internal-state exposure — see ADR-PIPE-013 Enforcement.
 */

/** Public-facing shape of a member — deliberately the smallest useful surface. */
export interface PublicMemberResponse {
  id: string;
  email: string;
  name?: string;
  status: MemberStatus;
}

/**
 * Serialize a `MemberRecord` to the public-facing `PublicMemberResponse`.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function toPublicMemberResponse(member: MemberRecord): PublicMemberResponse {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    status: member.status,
  };
}
