/**
 * @file The Newsletter agent-tool catalog (ADR-PIPE-011/SPEC-011), instantiating SPEC-016 REQ-22's
 * naming/callability convention for this domain — the same shape `forms/agent-tools.ts` and
 * `identity/agent-tools.ts` use, including the `inputSchema` contract.
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission each carries. Every entry maps 1:1 onto a real admin HTTP route already exposed to a
 * human operator (`server/routes/admin/newsletter/*.ts`) — this catalog never names an operation
 * the admin UI does not already perform.
 *
 * Deliberate absences (the point of a catalog, not an oversight) — of the 19 real admin routes,
 * 5 are withheld:
 * - `newsletter_send_campaign` (`SEND_CAMPAIGN`). Triggers the send pipeline to actually email the
 *   campaign's real, frozen subscriber audience. This is precisely the "real-world side effect an
 *   agent should probably not trigger autonomously" the dispatch directive names by example —
 *   third-party email at scale, and one that cannot be undone once delivered. Draft/list/create/
 *   update tools are wired; the launch action is not.
 * - `newsletter_send_test_campaign` (`SEND_TEST_CAMPAIGN`). Narrower blast radius than a full send,
 *   but the recipient is a caller-supplied free-form address, not (like every other included
 *   write tool) an existing, already-known subscriber/member. That makes it a mechanism an agent
 *   could be manipulated into using to email attacker-chosen addresses with attacker-influenced
 *   campaign content — a spam/abuse vector distinct from every other tool here, all of which only
 *   ever email a party the workspace already has a subscription/consent relationship with.
 * - `newsletter_schedule_campaign` (`SCHEDULE_CAMPAIGN`). Sets `draft -> scheduled`, which the send
 *   pipeline later drains with NO further human click required — functionally a deferred, unattended
 *   launch. Excluded for the identical reason `send_campaign` is: the dispatch directive's "consider
 *   excluding send campaign / launch" covers scheduling an autonomous future send just as much as an
 *   immediate one.
 * - `newsletter_resume_campaign` (`RESUME_CAMPAIGN`, `paused -> sending`). `campaign.ts`'s
 *   `transitionCampaignStatus` groups this with the `send` tier for a reason: resuming CONTINUES
 *   actual outbound mail to the remaining frozen audience, the same real-world effect as
 *   `send_campaign`, just for whatever recipients a prior send hadn't yet reached. `pause_campaign`
 *   (the opposite direction, `sending -> paused`) IS wired — it only ever HALTS outbound mail, never
 *   starts or continues it, so it carries none of that risk; it is the "brake," not the "accelerator."
 * - `newsletter_import_subscriptions` (`IMPORT_SUBSCRIPTIONS`). `subscriptions.ts`'s
 *   `importSubscriptions` routes every row through the identical `saveSubscription` path
 *   `newsletter_create_subscription` (below) uses, which is deliberately wired for a SINGLE
 *   subscriber — but import accepts 1-500 rows per call, and each new subscription mints and
 *   emails a real confirmation link to its contact. A single call could therefore email up to 500
 *   third parties at once, which is exactly the "emails third parties at scale" concern the
 *   dispatch directive raises; a single-target add does not carry that risk.
 *
 * `newsletter_create_subscription` and `newsletter_resend_confirmation` ARE wired despite each
 * sending a real email, for the same reason Members' `members_request_magic_link` is: the
 * recipient is always a single, already-known contact (an existing Members subscriber the caller
 * already named), the action already exists in the admin UI, and it is a double-opt-in
 * confirmation link, not the marketing content itself — nothing is delivered to the subscriber's
 * inbox as "the campaign," only a confirm-your-subscription link they must still act on.
 * `newsletter_remove_subscription` (unsubscribe) is wired too: like `identity_user_disable`/
 * `members_disable`, it only ever narrows access/reach, never grants it, so it carries none of the
 * compliance risk the dispatch directive flags for consent/unsubscribe operations that ADD or
 * ASSERT consent.
 *
 * How it relates to the project:
 * `assistant/tool-registrations.ts` maps these entries into `@jini-ai/core` `ToolRegistration`s.
 * Like Comments/Members and UNLIKE Forms/Identity, none of Newsletter's domain functions call
 * `authorize()` internally (`http/admin/newsletter.ts`'s own file header: "none of Newsletter's
 * domain functions call authorize()/throw NewsletterForbiddenError themselves ... every admin
 * route therefore calls requireNewsletterPermissionOrRespond as its own first line") —
 * `tool-registrations.ts`'s handlers mirror that same explicit call, translated into throw-on-deny
 * for a `ToolHandler`. See that file's Newsletter section header for the full disclosure.
 *
 * Architectural role:
 * `newsletter` domain declaration. Imports only the constants its own domain already enforces
 * (`campaign-write-service.ts`'s subject/preheader bounds), so the published JSON Schemas cannot
 * drift from the validators. Performs no I/O and no enforcement itself.
 */

import { PREHEADER_MAX, SUBJECT_MAX, SUBJECT_MIN } from "./campaign-write-service.js";

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

const CAMPAIGN_ID_SCHEMA = {
  type: "string",
  minLength: 1,
  description: "The campaign's id. Get it from newsletter_create_campaign's result or content_read.newsletter_campaign.",
} as const;

const LIST_ID_SCHEMA = {
  type: "string",
  minLength: 1,
  description: "A newsletter list's id. Get it from newsletter_create_list's result or content_read.newsletter_list.",
} as const;

/** Campaign editorial fields shared by `create`/`update` — every field but `listId` maps 1:1 onto `CampaignRecord`. */
const CAMPAIGN_FIELDS_PROPERTIES = {
  subject: {
    type: "string",
    minLength: SUBJECT_MIN,
    maxLength: SUBJECT_MAX,
    description: `Email subject line (${SUBJECT_MIN}-${SUBJECT_MAX} characters).`,
  },
  preheader: {
    type: ["string", "null"],
    maxLength: PREHEADER_MAX,
    description: `Optional inbox-preview text (max ${PREHEADER_MAX} characters). Omit or pass null for none.`,
  },
  fromName: { type: "string", minLength: 1, description: "Envelope From display name." },
  fromEmail: { type: "string", minLength: 1, description: "Envelope From address." },
  replyTo: { type: "string", minLength: 1, description: "Reply-To address." },
  listId: LIST_ID_SCHEMA,
} as const;

/** Newsletter's fixed agent-tool catalog. */
export const newsletterAgentToolCatalog: AgentToolDefinition[] = [
  // --- Read tools ---
  {
    name: "newsletter_list_campaigns",
    description: "Lists the workspace's campaigns, optionally filtered by status. Read-only. Call this to find a campaign's id before getting, updating, canceling, or pausing it.",
    sideEffects: "none",
    authorization: { permission: "admin.newsletter.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        status: {
          type: "string",
          enum: ["draft", "scheduled", "sending", "sent", "paused", "canceled", "failed"],
          description: "Filter to campaigns in exactly this status. Omit to list every status.",
        },
      },
    },
  },
  {
    name: "newsletter_get_campaign",
    description: "Fetches a single campaign's full details by id, including its current status and delivery counters. Read-only.",
    sideEffects: "none",
    authorization: { permission: "admin.newsletter.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["campaignId"],
      properties: { campaignId: CAMPAIGN_ID_SCHEMA },
    },
  },
  {
    name: "newsletter_list_lists",
    description: "Lists the workspace's subscriber lists. Read-only. Call this to find a listId before creating a campaign, adding a subscription, or archiving a list.",
    sideEffects: "none",
    authorization: { permission: "admin.newsletter.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
  },
  {
    name: "newsletter_list_subscriptions",
    description: "Lists the subscriptions on one list. Read-only.",
    sideEffects: "none",
    authorization: { permission: "admin.newsletter.subscriber.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["listId"],
      properties: { listId: LIST_ID_SCHEMA },
    },
  },
  {
    name: "newsletter_list_send_log",
    description: "Lists the per-recipient delivery log for one campaign (id, recipient email, delivery status, attempts). Read-only; PII-adjacent (recipient email addresses).",
    sideEffects: "none",
    authorization: { permission: "admin.newsletter.subscriber.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["campaignId"],
      properties: { campaignId: CAMPAIGN_ID_SCHEMA },
    },
  },

  // --- Write tools: draft campaign composition (never touches status) ---
  {
    name: "newsletter_create_campaign",
    description:
      "Creates a new campaign in 'draft' status. A draft is never sent by this tool or any other agent tool — there is no agent-callable send/schedule tool. Use newsletter_update_campaign to edit it further, or the admin UI to actually launch it.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.newsletter.campaign.compose" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["subject", "fromName", "fromEmail", "replyTo", "listId"],
      properties: CAMPAIGN_FIELDS_PROPERTIES,
    },
  },
  {
    name: "newsletter_update_campaign",
    description:
      "Edits an existing campaign's editorial fields (subject/preheader/fromName/fromEmail/replyTo/listId). Only works while the campaign is 'draft' — refused once it is scheduled or beyond. A partial patch: omitted fields keep their current value. Never changes status.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.newsletter.campaign.compose" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["campaignId"],
      properties: { campaignId: CAMPAIGN_ID_SCHEMA, ...CAMPAIGN_FIELDS_PROPERTIES },
    },
  },
  {
    name: "newsletter_cancel_campaign",
    description:
      "Cancels a 'draft' or 'scheduled' campaign, terminally taking it out of the send pipeline before it ever sends. This is a safety/rollback action — it never causes mail to go out, only prevents it. Cannot cancel a campaign that is already 'sending' or 'sent'.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.newsletter.campaign.compose" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["campaignId"],
      properties: { campaignId: CAMPAIGN_ID_SCHEMA },
    },
  },
  {
    name: "newsletter_pause_campaign",
    description:
      "Pauses a campaign that is actively 'sending', halting further outbound mail. This only ever STOPS sending, never starts or continues it — there is no agent-callable resume tool, so pausing here cannot be reversed by any agent tool.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.newsletter.campaign.send" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["campaignId"],
      properties: { campaignId: CAMPAIGN_ID_SCHEMA },
    },
  },

  // --- Write tools: lists ---
  {
    name: "newsletter_create_list",
    description: "Creates a new subscriber list with a unique name and slug. Always created active, never the default list.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.newsletter.list.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "slug"],
      properties: {
        name: { type: "string", minLength: 1, description: "Human-readable list name." },
        slug: { type: "string", minLength: 1, description: "Unique-per-workspace slug." },
      },
    },
  },
  {
    name: "newsletter_archive_list",
    description: "Archives a subscriber list. The workspace's default 'all subscribers' list can never be archived and is refused.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.newsletter.list.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["listId"],
      properties: { listId: LIST_ID_SCHEMA },
    },
  },

  // --- Write tools: individual subscriptions (never bulk import — see file header) ---
  {
    name: "newsletter_create_subscription",
    description:
      "Adds a single existing Members subscriber to a list, creating a 'pending' subscription and emailing them ONE double-opt-in confirmation link (they must still click it to become 'subscribed'). subscriberId must resolve to an existing Members principal. Never sends marketing content — only the confirmation link.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.newsletter.subscriber.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["listId", "subscriberId"],
      properties: {
        listId: LIST_ID_SCHEMA,
        subscriberId: { type: "string", minLength: 1, description: "An existing Members subscriber's id." },
        source: { type: "string", enum: ["admin", "import", "api"], description: "Provenance tag for audit/consent purposes. Defaults to 'admin'." },
      },
    },
  },
  {
    name: "newsletter_remove_subscription",
    description:
      "Unsubscribes one existing subscription (admin-triggered removal, by id — not a caller-supplied email). Idempotent: removing an already-unsubscribed subscription is a no-op success. This only ever narrows a subscriber's access to future sends, never grants or re-adds it.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.newsletter.subscriber.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["listId", "subscriptionId"],
      properties: {
        listId: LIST_ID_SCHEMA,
        subscriptionId: { type: "string", minLength: 1, description: "The subscription's id, as returned by newsletter_create_subscription or newsletter_list_subscriptions." },
      },
    },
  },
  {
    name: "newsletter_resend_confirmation",
    description:
      "Resends the double-opt-in confirmation email for an existing 'pending' subscription (invalidates any prior unconsumed link first). Resolves {delivered:true} even if the underlying contact cannot be resolved (anti-enumeration), except for a genuinely unknown subscriptionId, which is refused.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.newsletter.subscriber.manage" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["subscriptionId"],
      properties: {
        subscriptionId: { type: "string", minLength: 1, description: "The subscription's id, as returned by newsletter_create_subscription or newsletter_list_subscriptions." },
      },
    },
  },
];
