import { toolMetadata } from '../../contracts/core/tool-metadata/members.js';
import { type Clock } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
/**
 * @file Members' half of ADR-049 Decision 4 (ADR-030/ADR-PIPE-013): maps `agent-tools.ts`'s four
 * catalog entries onto the member roster reads and the two `write-service.ts` transitions the admin
 * routes expose, as `ToolRegistration`s. The entire catalog is wired.
 *
 * Authorization shape: `members/ports.ts`'s `MembersWriteServiceDeps` has no `authorize` field at
 * all — the domain functions carry no gate to inherit, and the admin routes check inline. Every
 * handler here therefore performs that same check itself via the kit's `requireToolPermission`,
 * which is ADR-021 §2's single evaluation for these tools, located where the real route locates it.
 */
import { buildDomainRegistrations, indexCatalogById, optionalString, readToolLimit, requireInputRecord, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { type AuthorizeFn, requireToolPermission } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";

import type { ToolContributor } from "#src/assistant/index";
import { isMailDeliveryAvailable, MAIL_DELIVERY_UNAVAILABLE_NOTE } from "../../platform/mail/index.js";
import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule } from "@jini-ai/core/model-facing-tool-errors";
import { withModelFacingErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";
import { membersAgentToolCatalog } from "./agent-tools.js";
import type {
  MagicLinkTokenRepoPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
  MembersWriteServiceDeps,
} from "./ports.js";
import { MemberConflictError, MemberNotFoundError, MemberValidationError, type MemberRecord } from "./types.js";
import { disableMember, requestSignInLink } from "./write-service.js";

const CATALOG_BY_ID = indexCatalogById({ catalog: membersAgentToolCatalog });

/**
 * The rate-limiter shape `members_request_magic_link` actually calls (`await limiter.check({ key })`), declared
 * structurally instead of importing `core/rate-limit/rate-limit`'s nominal `RateLimiter` type.
 *
 * This is the one field in this file that would otherwise cost Members its whole architectural win:
 * unlike every other domain wired here, Members has no OTHER file that reaches into `server/*`
 * today, so importing `RateLimiter` from there — even though that specific type carries no Express
 * coupling itself — would single-handedly reintroduce the `members <-> server` module cycle this
 * narrowing exists to remove. `createRateLimiter()`'s real return value already has exactly this
 * shape, so it satisfies this structurally with no adapter needed.
 */
export interface MagicLinkRateLimiter {
  check(required: { key: string }): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }>;
}

/**
 * The exact slice of the route-deps bag Members' tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`, or `server/routes/admin/members/deps.ts`'s
 * `MembersRouteDeps`, which itself extends `RouteDeps`) so this module carries no back-edge into the
 * composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `MembersRouteDeps` object; nothing there changes.
 */
export interface MembersToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: Clock;
  idGen: { newId(): string };
  memberRepo: MemberRepoPort;
  memberTierRepo: MemberTierRepoPort;
  memberSubscriptionRepo: MemberSubscriptionRepoPort;
  memberSessionRepo: MemberSessionRepoPort;
  magicLinkRepo: MagicLinkTokenRepoPort;
  mailer: MembersWriteServiceDeps["mailer"];
  /** See `MembersWriteServiceDeps.principals` — sign-up writes the member's `kind: "member"` principal here. */
  principalRepo: MembersWriteServiceDeps["principals"];
  /** Resolves configuration independently of sending; production supplies this so disabled
   * members (which skip sends) cannot be distinguished during a lazy driver swap. */
  settleMailer?: () => Promise<void>;
  magicLinkPerEmailLimiter: MagicLinkRateLimiter;
}

/**
 * Assembles `write-service.ts`'s `MembersWriteServiceDeps` bundle from {@link MembersToolDeps} —
 * a local duplicate of `server/routes/admin/members/deps.ts`'s `toMembersWriteServiceDeps` rather
 * than an import of it, for the identical reason `features/settings/tool-registrations.ts`'s header
 * gives for duplicating `toWriteServiceDeps`: importing from the HTTP admin layer would invert this
 * codebase's ports/adapters direction. It is a field mapping, not logic, so the two copies carry no
 * behavioral drift risk.
 */
function toMembersWriteServiceDeps(deps: MembersToolDeps): MembersWriteServiceDeps {
  return {
    clock: deps.clock,
    ids: deps.idGen,
    members: deps.memberRepo,
    tiers: deps.memberTierRepo,
    subscriptions: deps.memberSubscriptionRepo,
    sessions: deps.memberSessionRepo,
    magicLinks: deps.magicLinkRepo,
    mailer: deps.mailer,
    principals: deps.principalRepo,
  };
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const membersDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> memberRepo.list: read only.
  ["members_list", "none"],
  // -> memberRepo.findById: read only.
  ["members_get_by_id", "none"],
  // -> disableMember (write-service.ts): status flip + revokes every live session.
  ["members_disable", "mutates-durable-state"],
  // -> requestSignInLink (write-service.ts): may create a pending member row, saves a magic-link
  //    token row, and sends mail; settleMailer refreshes configuration without sending.
  ["members_request_magic_link", "mutates-durable-state"],
]);

/**
 * Projects a `MemberRecord` into the model-facing shape used by every Members tool — mirrors
 * `http/admin/members.ts`'s own `toAdminMemberResponse` field set (so a tool sees exactly what the
 * admin UI already shows a human) MINUS `workspaceId` (the agent is already scoped to one
 * workspace it cannot change, the same reasoning content-types'/Forms' `to*View` apply) and MINUS
 * `note`/`fields` (the admin response itself already withholds the operator-only note and the raw
 * extension bag — this view does not re-expose what the human-facing response hides).
 *
 * @complexity O(1).
 * @overallScore 100
 */
function toMemberToolView(member: MemberRecord) {
  const view: {
    id: string;
    email: string;
    status: MemberRecord["status"];
    name?: string;
    emailVerifiedAt?: string;
    createdAt: string;
    updatedAt: string;
    version: number;
  } = {
    id: member.id,
    email: member.email,
    status: member.status,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    version: member.version,
  };
  if (member.name) view.name = member.name;
  if (member.emailVerifiedAt) view.emailVerifiedAt = member.emailVerifiedAt;
  return view;
}

/**
 * The Members errors that reach the model with their real reason instead of a redacted
 * `INTERNAL_ERROR` — see `contracts/core/model-facing-tool-errors.ts` for the mechanism and for why
 * this list is an ALLOWLIST rather than a blanket unwrap.
 *
 * Every message here is built from the caller's OWN input (`member '<id>' was not found`,
 * `'<email>' is not a valid email address`) plus this domain's vocabulary. None carries a member's
 * stored record, another workspace's data, a token, or an internal path: `types.ts`'s four classes
 * are all constructed at `write-service.ts` call sites that interpolate ids and the submitted email
 * only. `MemberAuthError` is deliberately ABSENT — it is thrown on the magic-link REDEMPTION path
 * (`consumeSignInLink`), which no tool here calls, and its messages ("sign-in link was already
 * used", "this account has been disabled") answer a question about a token holder rather than about
 * the caller's own request. If a redemption tool is ever wired, that class needs its own decision,
 * not this list's by default.
 */
const MEMBERS_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  forbiddenRule({ domainPrefix: "MEMBERS", error: ForbiddenError }),
  { error: MemberNotFoundError, code: "MEMBERS_NOT_FOUND" },
  { error: MemberValidationError, code: "MEMBERS_VALIDATION_FAILED" },
  { error: MemberConflictError, code: "MEMBERS_CONFLICT" },
];

/** `members_list`'s schema cap (`agent-tools.ts`), which is also the repo's own page size. */
const MEMBERS_LIST_MAX_LIMIT = 100;

export function buildMembersRegistrations(deps: MembersToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    members_list: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });

      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "member.manage" }, { entityType: "member" });

      const afterId = optionalString({ input, key: "afterId" });
      const limit = readToolLimit({ input, max: MEMBERS_LIST_MAX_LIMIT, fallback: MEMBERS_LIST_MAX_LIMIT });
      // The repo treats an afterId it cannot find as "first page" (the admin list relies on that);
      // a model that passed one meant a real member, so a miss is its mistake to hear about.
      if (afterId !== undefined && !(await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: afterId }))) {
        throw new ToolInputError({ message: `unknown afterId '${afterId}'` });
      }
      const members = await deps.memberRepo.list({ workspaceId: deps.workspaceId, afterId, limit });
      return { members: members.map(toMemberToolView) };
    },

    members_get_by_id: async (ctx) => {
      const memberId = requireString({ input: requireInputRecord({ input: ctx.input }), key: "memberId" });

      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "member.manage" }, { entityType: "member", entityId: memberId });

      const member = await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: memberId });
      if (!member) throw new MemberNotFoundError(`member '${memberId}' was not found`);
      return { member: toMemberToolView(member) };
    },

    members_disable: async (ctx) => {
      const memberId = requireString({ input: requireInputRecord({ input: ctx.input }), key: "memberId" });

      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "member.manage" }, { entityType: "member", entityId: memberId });

      const { member } = await disableMember({ deps: toMembersWriteServiceDeps(deps), input: { workspaceId: deps.workspaceId, memberId } });
      return { member: toMemberToolView(member) };
    },

    members_request_magic_link: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const email = requireString({ input: input, key: "email" });

      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "member.manage" }, { entityType: "member" });

      // INV-NEW-03: the shared per-email rate limit is consulted strictly AFTER authorize() —
      // mirrors `request-magic-link.ts`'s own ordering, so an unauthorized caller can never spend
      // rate-limit budget for a target email as a side channel.
      const emailKey = email.trim().toLowerCase();
      // Preserve model-facing validation instead of passing an empty key to the limiter.
      if (!emailKey) throw new MemberValidationError(`'${email}' is not a valid email address`);
      const rateLimitResult = await deps.magicLinkPerEmailLimiter.check({ key: emailKey });
      if (!rateLimitResult.allowed) {
        // A `ToolInputError`, not a bare `Error`: that marker is the ONLY thing `@jini-ai/daemon`'s
        // `ToolExecutor` reads to keep a rejection out of the `errorKind: 'internal'` bucket the
        // delegated-tool transport SEC-005-redacts, and "you are rate limited, retry after Ns" is
        // precisely the reason a model needs in order to back off instead of hammering the same
        // call. Thrown directly rather than routed through `MEMBERS_MODEL_FACING_ERRORS` because
        // this is THIS wiring layer's own check against an injected limiter, not a domain error
        // class `write-service.ts` raises — the same shape `features/forms/tool-registrations.ts`'s
        // `requireSubmissionsLimit` uses for its own ad-hoc check.
        throw new ToolInputError({ message: `MEMBERS_RATE_LIMITED: too many sign-in requests for '${email}' — retry after ${rateLimitResult.retryAfterSeconds}s` });
      }

      await deps.settleMailer?.();
      await requestSignInLink({
        deps: toMembersWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          email,
          redirectPath: typeof input.redirectPath === "string" ? input.redirectPath : undefined,
        },
      });
      // send() awaits lazy driver resolution; checking afterwards avoids misreporting the
      // boot-time console fallback. Neither result discloses the address's membership status.
      return isMailDeliveryAvailable(deps.mailer)
        ? { delivered: true, mailDeliveryAvailable: true }
        : { delivered: false, mailDeliveryAvailable: false, note: MAIL_DELIVERY_UNAVAILABLE_NOTE };
    },
  };

  // No `unwiredToolIds`: Members wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "members",
    catalogModule: "members/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    // The whole map at once, so no handler can be the one that forgot — see
    // `withModelFacingErrors`' own doc for why a per-call-site reshape is the defect this avoids.
    handlers: withModelFacingErrors({ handlers: handlers, rules: MEMBERS_MODEL_FACING_ERRORS }),
    derivedRisk: membersDerivedRisk,
  });
}

/**
 * Contributes Members' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildMembersRegistrations`/
 * `membersDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 of the
 * rollout — no sibling domain still statically wired through `assistant` imports `members`, so this
 * one-directional `members -> assistant` call closes no new cycle).
 */
export function contributeMembersTools(): ToolContributor {
  return { domain: "members", build: buildMembersRegistrations, risk: membersDerivedRisk };
}
