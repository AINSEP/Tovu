/**
 * @file The Members agent-tool catalog (ADR-030/ADR-PIPE-013), instantiating SPEC-016 REQ-22's
 * naming/callability convention for this domain — the same shape `forms/agent-tools.ts` and
 * `identity/agent-tools.ts` use, including the `inputSchema` contract.
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission each carries. Every entry maps 1:1 onto a real operation the admin HTTP surface
 * (`server/routes/admin/members/*.ts`) already exposes to a human operator — not merely onto a
 * `write-service.ts` export. That distinction matters here specifically: see the deliberate
 * absences below.
 *
 * Deliberate absences (the point of a catalog, not an oversight):
 * - `updateProfile`, `compSubscription`, `setSubscriptionStatus` (`write-service.ts`) have NO
 *   admin HTTP route at all today — `server/modules/members.ts` wires exactly 4 admin registrars
 *   (list/get/disable/request-magic-link) plus 2 public sign-in routes, nothing else. Wiring an
 *   agent tool for a write-service function the admin UI does not yet expose would give the
 *   assistant MORE capability than a human clicking through the admin screens has today — the
 *   opposite of this pattern's own premise (the tool is gated by "the SAME gate the human admin
 *   routes use," which presupposes a human admin route exists to share a gate with). Promoting
 *   these three to tools is a decision for whoever ships their admin routes, not this pass.
 * - `requestConsent`/`confirmConsent`/`revokeConsent`/`checkConsent` (`consent-service.ts`) are
 *   excluded for the same "no admin route" reason, with extra weight: these are the INV-NEW-02
 *   consent-ledger chokepoint (the ONLY path that may ever assert `status: 'granted'`), and the
 *   dispatch directive for this pass explicitly calls out consent/unsubscribe operations in
 *   Members as deserving "the same scrutiny as Identity's password reset." No admin surface
 *   reviews or exposes them today, so an agent must not gain a capability with no human-reachable
 *   equivalent to compare it against.
 * - `completeSignIn` is the MEMBER's own self-service session-mint (consumes a magic-link token,
 *   authenticates as that member) — never an operator action, and has no admin route. A tool that
 *   let an assistant complete a sign-in "on behalf of" a member would let it authenticate as an
 *   arbitrary member, which is an account-access primitive in the same family Identity's
 *   `resetUserPassword` exclusion warns about, just reached from the other side (session-minting
 *   instead of password-setting).
 * - No `members_comp_subscription`/`members_set_subscription_status`: see the write-service
 *   bullet above — these two also touch billing/entitlement state with no admin UI review path.
 *
 * How it relates to the project:
 * `assistant/tool-registrations.ts` maps these entries into `@jini-ai/core` `ToolRegistration`s.
 * Members' own `write-service.ts` does NOT call `authorize()` internally — `MembersWriteServiceDeps`
 * has no `authorize` field at all, and every admin route (`disable.ts`/`list.ts`/`get-by-id.ts`/
 * `request-magic-link.ts`) calls `deps.authorize()` itself, directly, before calling into the
 * write-service or repo. `tool-registrations.ts`'s handlers mirror that exact sequence rather than
 * relying on a self-enforcing domain function the way Forms/Identity do — see that file's Members
 * section header for the full disclosure.
 *
 * Architectural role:
 * `members` domain declaration. Performs no I/O and no enforcement itself.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export type AgentToolActorClassRule = "confirmer-must-equal-own-delegatedBy" | "user-only" | "none";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  actorClassRule?: AgentToolActorClassRule;
  /**
   * JSON Schema for this tool's `input`, published to the model via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registrations.ts`, which refuses to wire any tool lacking one).
   */
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** A member's id, as returned by `content_read.member` (the single card `members_list` and
 *  `members_get_by_id` collapsed into on 2026-09-08 — it dispatches on `memberId`'s presence). */
const MEMBER_ID_SCHEMA = {
  type: "string",
  minLength: 1,
  description: "The member's id. Get it from content_read.member — omit memberId to list every member, or supply one to fetch that member.",
} as const;

/** The input shape shared by `members_get_by_id`/`members_disable` — exactly `{memberId}`. */
const MEMBER_ID_ONLY_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["memberId"],
  properties: { memberId: MEMBER_ID_SCHEMA },
} as const;

/** Members' fixed agent-tool catalog. */
export const membersAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "members_list",
    description:
      "Lists the workspace's members (any status: pending/active/disabled), keyset-paginated. Read-only. Call this to find a member's id before getting details or disabling them.",
    sideEffects: "none",
    authorization: { permission: "member.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        afterId: { type: "string", description: "Keyset cursor (a previously-seen member id) for the next page. Omit for the first page." },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Max rows to return (1-100). Defaults to the repo's own default page size." },
      },
    },
  },
  {
    name: "members_get_by_id",
    description: "Fetches a single member's details by id. Read-only.",
    sideEffects: "none",
    authorization: { permission: "member.manage" },
    inputSchema: MEMBER_ID_ONLY_INPUT_SCHEMA,
  },
  {
    name: "members_disable",
    description:
      "Disables a member, revoking their access and every one of their live sessions. Members are never hard-deleted, so this is how a member is removed. Idempotent — disabling an already-disabled member is a no-op. There is no agent-callable re-enable tool for members (unlike identity users) because the admin UI does not expose one either.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "member.manage" },
    inputSchema: MEMBER_ID_ONLY_INPUT_SCHEMA,
  },
  {
    name: "members_request_magic_link",
    description:
      "Requests (or resends) a passwordless sign-in link for a member's email — the same 'resend sign-in link' action available in the admin UI. Always resolves {delivered:true} for a syntactically valid email regardless of whether it is actually registered (anti-enumeration by design); rate-limited per email.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "member.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["email"],
      properties: {
        email: { type: "string", description: "The member's email address." },
        redirectPath: { type: "string", description: "Optional relative path to redirect to after a successful sign-in." },
      },
    },
  },
];
