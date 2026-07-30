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
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "../assistant/tool-registration-kit";
import { toMembersWriteServiceDeps, type MembersRouteDeps } from "../server/routes/admin/members/deps";
import type { RouteDeps } from "../server/routes/types";
import { membersAgentToolCatalog } from "./agent-tools";
import { MemberNotFoundError, type MemberRecord } from "./types";
import { disableMember, requestSignInLink } from "./write-service";

const CATALOG_BY_ID = indexCatalogById(membersAgentToolCatalog);

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
  //    token row, and sends mail.
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

export function buildMembersRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  // Narrowing cast, not a widening one (`MembersRouteDeps extends RouteDeps`) — the identical,
  // already-established precedent every `routes/admin/members/*.ts` registrar uses for the one
  // field (`magicLinkPerEmailLimiter`) `RouteDeps` itself does not yet declare. See
  // `routes/admin/members/deps.ts`'s own file header for the "report the field set back, don't
  // edit the shared file" rationale this inherits unchanged.
  const deps = routeDeps as MembersRouteDeps;

  const handlers: Record<string, ToolHandler> = {
    members_list: async (ctx) => {
      const input = requireInputRecord(ctx.input);

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "member.manage", entityType: "member" });

      const afterId = typeof input.afterId === "string" ? input.afterId : undefined;
      const limit = typeof input.limit === "number" ? input.limit : undefined;
      const members = await deps.memberRepo.list({ workspaceId: deps.workspaceId, afterId, limit });
      return { members: members.map(toMemberToolView) };
    },

    members_get_by_id: async (ctx) => {
      const memberId = requireString(requireInputRecord(ctx.input), "memberId");

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "member.manage", entityType: "member", entityId: memberId });

      const member = await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: memberId });
      if (!member) throw new MemberNotFoundError(`member '${memberId}' was not found`);
      return { member: toMemberToolView(member) };
    },

    members_disable: async (ctx) => {
      const memberId = requireString(requireInputRecord(ctx.input), "memberId");

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "member.manage", entityType: "member", entityId: memberId });

      const { member } = await disableMember({ deps: toMembersWriteServiceDeps(deps), input: { workspaceId: deps.workspaceId, memberId } });
      return { member: toMemberToolView(member) };
    },

    members_request_magic_link: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const email = requireString(input, "email");

      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "member.manage", entityType: "member" });

      // INV-NEW-03: the shared per-email rate limit is consulted strictly AFTER authorize() —
      // mirrors `request-magic-link.ts`'s own ordering, so an unauthorized caller can never spend
      // rate-limit budget for a target email as a side channel.
      const rateLimitResult = deps.magicLinkPerEmailLimiter.check(email.trim().toLowerCase());
      if (!rateLimitResult.allowed) {
        throw new Error(`too many sign-in requests for '${email}' — retry after ${rateLimitResult.retryAfterSeconds}s`);
      }

      return requestSignInLink({
        deps: toMembersWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          email,
          redirectPath: typeof input.redirectPath === "string" ? input.redirectPath : undefined,
        },
      });
    },
  };

  // No `unwiredToolIds`: Members wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({
    domain: "members",
    catalogModule: "members/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: membersDerivedRisk,
  });
}
