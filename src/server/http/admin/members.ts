import type { MemberRecord, MemberStatus } from "#src/members/index";

/**
 * @file Admin-facing member response DTO (mirrors `admin/posts.ts`'s pattern).
 *
 * Purpose:
 * Maps the internal `MemberRecord` to what the admin API/UI may see.
 * Deliberately excludes anything session/token-shaped (ADR-030/ADR-021 trust
 * boundary: a member's `MemberSessionRecord.tokenHash` /
 * `MagicLinkTokenRecord.tokenHash` must never leave the server, and this
 * serializer is the chokepoint that guarantees it — those records aren't
 * even reachable from a `MemberRecord`, so there is no field to accidentally
 * forward). Also excludes `note` (operator-only annotation) and `fields`
 * (the namespaced ext bag, ADR-022 §2): neither is needed by the current
 * Members admin screen. Add them here deliberately if a future screen needs
 * them — never pass `MemberRecord` through unfiltered.
 */

/** Admin-facing shape of a member. */
export interface AdminMemberResponse {
  id: string;
  workspaceId: string;
  email: string;
  name?: string;
  status: MemberStatus;
  emailVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Envelope for a single-member response (GET/disable by id). */
export interface AdminMemberEnvelope {
  member: AdminMemberResponse;
}

/** Envelope for a member-list response. */
export interface AdminMemberListResponse {
  members: AdminMemberResponse[];
}

/**
 * Serialize a `MemberRecord` to the admin-facing `AdminMemberResponse`.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function toAdminMemberResponse(member: MemberRecord): AdminMemberResponse {
  return {
    id: member.id,
    workspaceId: member.workspaceId,
    email: member.email,
    name: member.name,
    status: member.status,
    emailVerifiedAt: member.emailVerifiedAt,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    version: member.version,
  };
}
