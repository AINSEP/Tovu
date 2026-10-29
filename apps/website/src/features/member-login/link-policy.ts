import type { MemberRecord } from "../members/index.js";
import type { VerifiedLoginIdentity } from "./types.js";

export type LinkDecision = "sign_in" | "link" | "create" | "email_verification_required" | "blocked" | "conflict";

function admission(member: MemberRecord | null, connectMemberId: string | undefined): "blocked" | "conflict" | undefined {
  if (member?.status === "disabled" || member?.status === "trash") return "blocked";
  if (connectMemberId && member?.id !== connectMemberId) return "conflict";
  return undefined;
}

function needsInboxProof({ identity, connectMemberId, emailProofVerified }: {
  identity: VerifiedLoginIdentity; connectMemberId?: string; emailProofVerified?: boolean;
}): boolean {
  return !connectMemberId && !identity.emailAuthoritative && !emailProofVerified;
}

/** Pure policy: persisted issuer/subject wins over a changed email; unlink markers prevent auto-link.
 * Inbox proof is required once before auto-linking a non-authoritative address (owner 10-24). A
 * signed-in connect is the member's own deliberate act, so it needs no extra emailed code.
 * @returns A fixed decision; no persistence, credentials or session effects.
 * @complexity O(1), independent of workspace/member counts.
 */
export function decideMemberLogin(required: {
  identity: VerifiedLoginIdentity;
  member: MemberRecord | null;
  subjectLinked: boolean;
  unlinked: boolean;
  connectMemberId?: string;
  emailProofVerified?: boolean;
}, _options = {}): LinkDecision {
  const { member, subjectLinked, unlinked, connectMemberId, identity, emailProofVerified } = required;
  const refused = admission(member, connectMemberId);
  if (refused) return refused;
  if (subjectLinked) return member ? "sign_in" : "blocked";
  if (unlinked && !connectMemberId) return "blocked";
  if (needsInboxProof({ identity, connectMemberId, emailProofVerified })) return "email_verification_required";
  return member ? "link" : "create";
}
