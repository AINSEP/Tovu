/**
 * @file Deps bundle for the new PUBLIC (unauthenticated) `members` route family
 * (ADR-PIPE-013 Decision §2-3).
 *
 * Purpose:
 * `MemberPublicRouteDeps` is deliberately NARROWER than
 * `routes/admin/members/deps.ts`'s `MembersRouteDeps` — no `authorize`, no
 * admin session dependency at all. This route family
 * (`POST .../sign-in`, `POST .../sign-in/complete`) must stay unauthenticated
 * by design (ADR-030 §3): a visitor has no admin session, and must never be
 * required to have one to sign in.
 *
 * Architectural role:
 * Composition-boundary glue only — no business logic. Mirrors
 * `routes/admin/members/deps.ts`'s `toMembersWriteServiceDeps` helper.
 */
import type {
  MagicLinkTokenRepoPort,
  MailerPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
  MembersWriteServiceDeps,
} from "#src/features/members/index";
import type { Clock as ClockPort, IdGenerator as IdGeneratorPort, UUID } from "@jini-ai/core/primitives";
import type { OriginRegistryPort } from "@jini-ai/http-kit/verified-origin";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { MailSenderIdentityPort } from "#src/platform/mail/index";
import type { PasswordHasherPort, PrincipalRepoPort } from "@jini-ai/user-management";
import type { Request, Response } from "express";
import { isSameOriginCommentPost } from "../site/comments-submit.js";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { rejectOversizedJsonBody } from "../../../shared/body-size-limit.js";

/**
 * Deps the public sign-in/complete-sign-in routes need. Intentionally has NO
 * admin `authorize`/session field — see file header. Rate-limiter instances
 * are shared, app-boot-scoped singletons (C-015): `magicLinkPerEmailLimiter`
 * is the SAME instance the admin `request-magic-link.ts` route also
 * consults, so the two surfaces share one counter per email, not two.
 */
export interface MemberPublicRouteDeps {
  workspaceId: UUID;
  memberRepo: MemberRepoPort;
  memberTierRepo: MemberTierRepoPort;
  memberSubscriptionRepo: MemberSubscriptionRepoPort;
  memberSessionRepo: MemberSessionRepoPort;
  magicLinkRepo: MagicLinkTokenRepoPort;
  mailer: MailerPort;
  mailStatus?: MembersWriteServiceDeps["mailStatus"];
  clock: ClockPort;
  idGen: IdGeneratorPort;
  /** Where sign-up writes the member's `kind: "member"` principal — see `MembersWriteServiceDeps.principals`.
   *  Write-only and kind-fixed by the write service, so this family still holds no session or authorize power. */
  principalRepo: Pick<PrincipalRepoPort, "save">;
  /** ADR-040 canonical-origin registry — required for sign-in, see `MembersWriteServiceDeps.origin`. */
  origin?: OriginRegistryPort;
  /** The site's system-email From resolver — see `MembersWriteServiceDeps.senderIdentity`. */
  mailSenderIdentity?: MailSenderIdentityPort;
  /** The very same Argon2 adapter used by staff; never construct a route-local hasher. */
  passwordHasher: PasswordHasherPort;
  passwordSignInPerEmailLimiter: RateLimiter;
  passwordSignInPerIpLimiter: RateLimiter;
  magicLinkPerEmailLimiter: RateLimiter;
  magicLinkPerIpLimiter: RateLimiter;
  magicLinkCompleteAttemptLimiter: RateLimiter;
}

/** Assemble the `MembersWriteServiceDeps` bundle from `MemberPublicRouteDeps`. */
export function toPublicMembersWriteServiceDeps(deps: MemberPublicRouteDeps): MembersWriteServiceDeps {
  return {
    passwordHasher: deps.passwordHasher,
    clock: deps.clock,
    ids: deps.idGen,
    members: deps.memberRepo,
    tiers: deps.memberTierRepo,
    subscriptions: deps.memberSubscriptionRepo,
    sessions: deps.memberSessionRepo,
    magicLinks: deps.magicLinkRepo,
    mailer: deps.mailer,
    mailStatus: deps.mailStatus,
    principals: deps.principalRepo,
    origin: deps.origin,
    senderIdentity: deps.mailSenderIdentity,
  };
}

/** Workspace mismatch is independent of credentials. @complexity O(1). */
export function checkMemberWorkspace({ req, res, deps }: MemberRequest, _options = {}): boolean {
  if (req.params.workspaceId === deps.workspaceId) return true;
  res.status(404).json({ error: "workspace was not found" });
  return false;
}

const memberBodyLimit = rejectOversizedJsonBody({ maxBytes: 4096 });

type MemberRequest = { req: Request; res: Response; deps: MemberPublicRouteDeps };

/** All member mutations reuse the comments CSRF policy; cap work even after a global JSON parser.
 * @complexity O(n), n is the parsed JSON size, bounded by the ingress parser.
 */
export function checkMemberPost(required: MemberRequest, _options = {}): boolean {
  const { req, res } = required;
  if (!checkMemberWorkspace(required)) return false;
  if (!isSameOriginCommentPost({ request: req })) {
    res.status(403).json({ error: "same-origin request required" });
    return false;
  }
  let accepted = false;
  // The upstream parser already ran; reuse Jini's synchronous post-parse byte cap.
  memberBodyLimit(req, res, () => { accepted = true; });
  return accepted;
}

/** Tovu's public member HTTP bodies; service/domain contracts stay transport-independent. */
const MEMBER_BODY_SHAPES = {
  signIn: [["email"], ["redirectPath"]],
  passwordSignIn: [["email", "password"], []],
  forgotPassword: [["email"], []],
  resetPassword: [["token", "password"], []],
  token: [["token"], []],
  code: [["challengeId", "code"], []],
} satisfies Record<string, [string[], string[]]>;

/** Validate this API's string-only DTOs before missing identifiers can reach repository queries. O(k) fields. */
export function memberStringBody(required: {
  body: unknown; kind: keyof typeof MEMBER_BODY_SHAPES;
}, _options = {}): Record<string, string> | null {
  const { body, kind } = required;
  const [fields, optionalFields] = MEMBER_BODY_SHAPES[kind];
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (!fields.every(field => typeof record[field] === "string")) return null;
  const allowed = [...fields, ...optionalFields];
  if (!Object.keys(record).every(field => allowed.includes(field) && typeof record[field] === "string")) return null;
  return record as Record<string, string>;
}

/** Both counters are charged, including when the first denies. Shared by password/link/reset requests.
 * Both must pass before any service call (W-002/W-003), against shared, app-boot-scoped limiter
 * instances (C-015), never per-request ones. The email key is trimmed and lowercased like the service.
 */
export async function checkMemberRequestLimits(required: MemberRequest & {
  email?: string; emailLimiter?: RateLimiter; ipLimiter: RateLimiter;
}, _options = {}): Promise<boolean> {
  const { req, res, emailLimiter, email, ipLimiter } = required;
  const checks = await Promise.all([
    ipLimiter.check({ key: resolveClientIp(req) }),
    ...(emailLimiter ? [emailLimiter.check({ key: (email ?? "").trim().toLowerCase() || "<empty>" })] : []),
  ]);
  for (const result of checks) {
    if (result.allowed) continue;
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    res.status(429).json({ error: "too many member authentication requests", code: "RATE_LIMIT_EXCEEDED",
      details: { retryAfterSeconds: result.retryAfterSeconds } });
    return false;
  }
  return true;
}
