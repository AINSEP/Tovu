/**
 * @file Newsletter's half of ADR-049 Decision 4 (ADR-PIPE-011/SPEC-011): maps `agent-tools.ts`'s
 * fourteen catalog entries onto the campaign/list/subscription operations the admin routes expose,
 * as `ToolRegistration`s. The entire catalog is wired — the 5 withheld operations
 * (send/send_test/schedule/resume/import) are simply absent from the catalog file rather than
 * present-but-declared-unwired; see `newsletter/agent-tools.ts`'s own header.
 *
 * Authorization shape: `http/admin/newsletter.ts`'s file header records that "none of Newsletter's
 * domain functions call authorize() ... every admin route therefore calls
 * requireNewsletterPermissionOrRespond as its own first line". Every handler here does the same via
 * the kit's `requireToolPermission` — ADR-021 §2's single evaluation, located where the real route
 * locates it.
 */
import {
  type AuthorizeFn,
  type EventBusPort,
  type OutboxPort,
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import type { MailerPort } from "../../platform/mail/index.js";
import type { OriginRegistryPort } from "../../features/origin/index.js";
import type { ToolContributor } from "#src/assistant/index";
import { newsletterAgentToolCatalog } from "./agent-tools.js";
import {
  cancelCampaign,
  saveCampaign,
  type CampaignWriteServiceDeps,
} from "./campaign-write-service.js";
import { issueConfirmationToken, type ConfirmationDeps } from "./confirmation.js";
import { NewsletterCampaignNotFoundError, NewsletterSubscriptionNotFoundError } from "./errors.js";
import type { HookRegistry } from "./hooks.js";
import { archiveList, saveList, type ListsDeps } from "./lists.js";
import type {
  MembersConsentCapability,
  NewsletterAudienceSnapshotRepoPort,
  NewsletterCampaignRepoPort,
  NewsletterConfirmationTokenRepoPort,
  NewsletterListRepoPort,
  NewsletterSendRepoPort,
  NewsletterSubscriptionRepoPort,
  SubscriberDirectoryPort,
} from "./ports.js";
import { pauseCampaign, type SendPipelineDeps } from "./send-pipeline.js";
import {
  saveSubscription,
  unsubscribeSubscription,
  type SubscriptionsDeps,
  type UnsubscribeSubscriptionDeps,
} from "./subscriptions.js";
import type { CampaignRecord, NewsletterListRow, SendRow, SubscriptionRow } from "./types.js";

const CATALOG_BY_ID = indexCatalogById(newsletterAgentToolCatalog);

/**
 * The exact slice of the route-deps bag Newsletter's tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`, or `server/routes/admin/newsletter/
 * deps.ts`'s `NewsletterRouteDeps`, which itself extends `RouteDeps`) so this module carries no
 * back-edge into the composition root. `server/routes/*` satisfies this structurally by passing its
 * existing `NewsletterRouteDeps` object; nothing there changes.
 */
export interface NewsletterToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  outbox: OutboxPort;
  bus: EventBusPort;
  mailer: MailerPort;
  originRegistry: OriginRegistryPort;
  newsletterReady: Promise<void>;
  newsletterCampaignRepo: NewsletterCampaignRepoPort;
  newsletterListRepo: NewsletterListRepoPort;
  newsletterSubscriptionRepo: NewsletterSubscriptionRepoPort;
  newsletterAudienceSnapshotRepo: NewsletterAudienceSnapshotRepoPort;
  newsletterSendRepo: NewsletterSendRepoPort;
  newsletterConfirmationTokenRepo: NewsletterConfirmationTokenRepoPort;
  newsletterSubscriberDirectory: SubscriberDirectoryPort;
  newsletterHooks: HookRegistry;
  membersConsentCapability: MembersConsentCapability | null;
}

/**
 * Assembles `campaign-write-service.ts`'s deps bundle from {@link NewsletterToolDeps} — a local
 * duplicate of `server/routes/admin/newsletter/deps.ts`'s `toCampaignWriteServiceDeps` rather than
 * an import of it, for the same reason `features/settings/tool-registrations.ts`'s header gives for
 * duplicating `toWriteServiceDeps`: importing from the HTTP admin layer would invert this codebase's
 * ports/adapters direction. Each `to*Deps` mapper below carries the identical rationale.
 */
function toCampaignWriteServiceDeps(deps: NewsletterToolDeps): CampaignWriteServiceDeps {
  return {
    campaignRepo: deps.newsletterCampaignRepo,
    listRepo: deps.newsletterListRepo,
    clock: deps.clock,
    ids: deps.idGen,
  };
}

/** Assembles `lists.ts`'s deps bundle — the local twin of `toCampaignWriteServiceDeps` above. */
function toListsDeps(deps: NewsletterToolDeps): ListsDeps {
  return { listRepo: deps.newsletterListRepo, clock: deps.clock, ids: deps.idGen };
}

/** Assembles `confirmation.ts`'s deps bundle — the local twin of `toCampaignWriteServiceDeps` above. */
function toConfirmationDeps(deps: NewsletterToolDeps): ConfirmationDeps {
  return {
    tokenRepo: deps.newsletterConfirmationTokenRepo,
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    mailer: deps.mailer,
    consentCapability: deps.membersConsentCapability,
    originRegistry: deps.originRegistry,
    clock: deps.clock,
    ids: deps.idGen,
  };
}

/** Assembles `subscriptions.ts`'s deps bundle (nests `toConfirmationDeps` — `saveSubscription`
 * triggers `issueConfirmationToken`) — the local twin of `toCampaignWriteServiceDeps` above. */
function toSubscriptionsDeps(deps: NewsletterToolDeps): SubscriptionsDeps {
  return {
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    listRepo: deps.newsletterListRepo,
    subscriberDirectory: deps.newsletterSubscriberDirectory,
    confirmationDeps: toConfirmationDeps(deps),
    clock: deps.clock,
    ids: deps.idGen,
  };
}

/** Assembles `subscriptions.ts`'s `unsubscribeSubscription` deps bundle — the local twin of
 * `toCampaignWriteServiceDeps` above. */
function toUnsubscribeSubscriptionDeps(deps: NewsletterToolDeps): UnsubscribeSubscriptionDeps {
  return {
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    consentCapability: deps.membersConsentCapability,
    clock: deps.clock,
  };
}

/**
 * Assembles `send-pipeline.ts`'s deps bundle — the local twin of `toCampaignWriteServiceDeps` above.
 * `launchGateDeps.isSendingEnabled` always resolves `false`, matching
 * `server/routes/admin/newsletter/deps.ts`'s own identical, disclosed default (see that file's doc
 * comment for the full rationale — no admin route manages this toggle yet).
 */
function toSendPipelineDeps(deps: NewsletterToolDeps): SendPipelineDeps {
  return {
    campaignRepo: deps.newsletterCampaignRepo,
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    audienceSnapshotRepo: deps.newsletterAudienceSnapshotRepo,
    sendRepo: deps.newsletterSendRepo,
    subscriberDirectory: deps.newsletterSubscriberDirectory,
    hooks: deps.newsletterHooks,
    mailer: deps.mailer,
    launchGateDeps: {
      isSendingEnabled: async () => false,
      consentCapability: deps.membersConsentCapability,
      originRegistry: deps.originRegistry,
      mailer: deps.mailer,
    },
    outbox: deps.outbox,
    bus: deps.bus,
    clock: deps.clock,
    ids: deps.idGen,
  };
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const newsletterDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> newsletterCampaignRepo.list / .findById: read only.
  ["newsletter_list_campaigns", "none"],
  ["newsletter_get_campaign", "none"],
  // -> newsletterListRepo.list: read only.
  ["newsletter_list_lists", "none"],
  // -> newsletterSubscriptionRepo.list: read only.
  ["newsletter_list_subscriptions", "none"],
  // -> newsletterSendRepo.listByCampaign: read only.
  ["newsletter_list_send_log", "none"],
  // -> saveCampaign (campaign-write-service.ts): campaign row + revision write in one tx.
  ["newsletter_create_campaign", "mutates-durable-state"],
  ["newsletter_update_campaign", "mutates-durable-state"],
  // -> cancelCampaign (campaign-write-service.ts): status transition + revision.
  ["newsletter_cancel_campaign", "mutates-durable-state"],
  // -> pauseCampaign (send-pipeline.ts): status transition + revision; only ever HALTS sending.
  ["newsletter_pause_campaign", "mutates-durable-state"],
  // -> saveList (lists.ts): list row write.
  ["newsletter_create_list", "mutates-durable-state"],
  // -> archiveList (lists.ts): status flip.
  ["newsletter_archive_list", "mutates-durable-state"],
  // -> saveSubscription (subscriptions.ts): subscription row write + mints/sends one confirmation email.
  ["newsletter_create_subscription", "mutates-durable-state"],
  // -> unsubscribeSubscription (subscriptions.ts): status flip + conditional consent revoke.
  ["newsletter_remove_subscription", "mutates-durable-state"],
  // -> issueConfirmationToken (confirmation.ts): invalidates prior tokens, writes a new token row, sends mail.
  ["newsletter_resend_confirmation", "mutates-durable-state"],
]);

/** Model-facing campaign view — drops `workspaceId` (same reasoning as every other `to*View` in this codebase) and the pipeline-internal `audienceSnapshotId`/`sendStartedAt`/`createdByPrincipal` (plumbing no wired tool's follow-up call consumes). */
function toCampaignToolView(campaign: CampaignRecord) {
  return {
    id: campaign.id,
    status: campaign.status,
    subject: campaign.subject,
    preheader: campaign.preheader,
    fromName: campaign.fromName,
    fromEmail: campaign.fromEmail,
    replyTo: campaign.replyTo,
    listId: campaign.listId,
    scheduledAt: campaign.scheduledAt,
    counters: { ...campaign.counters },
    version: campaign.version,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}

/** Model-facing list view. */
function toListToolView(list: NewsletterListRow) {
  return { id: list.id, name: list.name, slug: list.slug, isDefault: list.isDefault, status: list.status };
}

/** Model-facing subscription view — drops `consentRevisionIdAtSubscribe` (an internal binding token, not a decision-relevant value). */
function toSubscriptionToolView(subscription: SubscriptionRow) {
  return {
    id: subscription.id,
    listId: subscription.listId,
    subscriberId: subscription.subscriberId,
    status: subscription.status,
    source: subscription.source,
    subscribedAt: subscription.subscribedAt,
    unsubscribedAt: subscription.unsubscribedAt,
  };
}

/** Model-facing send-log row view — drops `idempotencyKey`/`audienceSnapshotId` (delivery-plumbing internals). */
function toSendLogToolView(row: SendRow) {
  return {
    id: row.id,
    subscriberId: row.subscriberId,
    recipientEmail: row.recipientEmail,
    status: row.status,
    attempts: row.attempts,
    providerMessageId: row.providerMessageId,
    lastError: row.lastError,
    nextAttemptAt: row.nextAttemptAt,
    updatedAt: row.updatedAt,
  };
}

export function buildNewsletterRegistrations(deps: NewsletterToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    newsletter_list_campaigns: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.read", entityType: "newsletter_campaign" });

      await deps.newsletterReady;
      const status = typeof input.status === "string" ? input.status : undefined;
      const campaigns = await deps.newsletterCampaignRepo.list({ workspaceId: deps.workspaceId });
      const filtered = status ? campaigns.filter((campaign) => campaign.status === status) : campaigns;
      return { campaigns: filtered.map(toCampaignToolView) };
    },

    newsletter_get_campaign: async (ctx) => {
      const campaignId = requireString(requireInputRecord(ctx.input), "campaignId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.read", entityType: "newsletter_campaign" });

      await deps.newsletterReady;
      const campaign = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id: campaignId });
      if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${campaignId} was not found`);
      return { campaign: toCampaignToolView(campaign) };
    },

    newsletter_list_lists: async (ctx) => {
      requireInputRecord(ctx.input);
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.read", entityType: "newsletter_list" });

      await deps.newsletterReady;
      const lists = await deps.newsletterListRepo.list({ workspaceId: deps.workspaceId });
      return { lists: lists.map(toListToolView) };
    },

    newsletter_list_subscriptions: async (ctx) => {
      const listId = requireString(requireInputRecord(ctx.input), "listId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.subscriber.read", entityType: "newsletter_subscription" });

      await deps.newsletterReady;
      const subscriptions = await deps.newsletterSubscriptionRepo.list({ workspaceId: deps.workspaceId, listId });
      return { subscriptions: subscriptions.map(toSubscriptionToolView) };
    },

    newsletter_list_send_log: async (ctx) => {
      const campaignId = requireString(requireInputRecord(ctx.input), "campaignId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.subscriber.read", entityType: "newsletter_campaign" });

      await deps.newsletterReady;
      const campaign = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id: campaignId });
      if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${campaignId} was not found`);
      const rows = await deps.newsletterSendRepo.listByCampaign({ workspaceId: deps.workspaceId, campaignId });
      return { sends: rows.map(toSendLogToolView) };
    },

    newsletter_create_campaign: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.campaign.compose", entityType: "newsletter_campaign" });

      await deps.newsletterReady;
      const { campaign } = await saveCampaign({
        deps: toCampaignWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actorId: ctx.principal.id,
          fields: {
            subject: requireString(input, "subject"),
            preheader: typeof input.preheader === "string" ? input.preheader : null,
            fromName: requireString(input, "fromName"),
            fromEmail: requireString(input, "fromEmail"),
            replyTo: requireString(input, "replyTo"),
            listId: requireString(input, "listId"),
          },
        },
      });
      return { campaign: toCampaignToolView(campaign) };
    },

    newsletter_update_campaign: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const campaignId = requireString(input, "campaignId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.campaign.compose", entityType: "newsletter_campaign" });

      await deps.newsletterReady;
      const existing = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id: campaignId });
      if (!existing) throw new NewsletterCampaignNotFoundError(`campaign ${campaignId} was not found`);

      const { campaign } = await saveCampaign({
        deps: toCampaignWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          id: campaignId,
          actorId: ctx.principal.id,
          fields: {
            subject: typeof input.subject === "string" ? input.subject : existing.subject,
            preheader: typeof input.preheader === "string" ? input.preheader : existing.preheader,
            fromName: typeof input.fromName === "string" ? input.fromName : existing.fromName,
            fromEmail: typeof input.fromEmail === "string" ? input.fromEmail : existing.fromEmail,
            replyTo: typeof input.replyTo === "string" ? input.replyTo : existing.replyTo,
            listId: typeof input.listId === "string" ? input.listId : existing.listId,
          },
        },
      });
      return { campaign: toCampaignToolView(campaign) };
    },

    newsletter_cancel_campaign: async (ctx) => {
      const campaignId = requireString(requireInputRecord(ctx.input), "campaignId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.campaign.compose", entityType: "newsletter_campaign" });

      await deps.newsletterReady;
      const { campaign } = await cancelCampaign({
        deps: toCampaignWriteServiceDeps(deps),
        input: { workspaceId: deps.workspaceId, id: campaignId, actorId: ctx.principal.id },
      });
      return { campaign: toCampaignToolView(campaign) };
    },

    newsletter_pause_campaign: async (ctx) => {
      const campaignId = requireString(requireInputRecord(ctx.input), "campaignId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.campaign.send", entityType: "newsletter_campaign" });

      await deps.newsletterReady;
      const { campaign } = await pauseCampaign({ deps: toSendPipelineDeps(deps), input: { workspaceId: deps.workspaceId, campaignId } });
      return { campaign: toCampaignToolView(campaign) };
    },

    newsletter_create_list: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.list.manage", entityType: "newsletter_list" });

      await deps.newsletterReady;
      const { list } = await saveList({
        deps: toListsDeps(deps),
        input: { workspaceId: deps.workspaceId, name: requireString(input, "name"), slug: requireString(input, "slug") },
      });
      return { list: toListToolView(list) };
    },

    newsletter_archive_list: async (ctx) => {
      const listId = requireString(requireInputRecord(ctx.input), "listId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.list.manage", entityType: "newsletter_list" });

      await deps.newsletterReady;
      const { list } = await archiveList({ deps: toListsDeps(deps), input: { workspaceId: deps.workspaceId, id: listId } });
      return { list: toListToolView(list) };
    },

    newsletter_create_subscription: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const listId = requireString(input, "listId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.subscriber.manage", entityType: "newsletter_subscription" });

      await deps.newsletterReady;
      const source = typeof input.source === "string" ? (input.source as SubscriptionRow["source"]) : "admin";
      const { subscription } = await saveSubscription({
        deps: toSubscriptionsDeps(deps),
        input: { workspaceId: deps.workspaceId, listId, subscriberId: requireString(input, "subscriberId"), source },
      });
      return { subscription: toSubscriptionToolView(subscription) };
    },

    newsletter_remove_subscription: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const listId = requireString(input, "listId");
      const subscriptionId = requireString(input, "subscriptionId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.subscriber.manage", entityType: "newsletter_subscription" });

      await deps.newsletterReady;
      const existing = await deps.newsletterSubscriptionRepo.findById({ workspaceId: deps.workspaceId, id: subscriptionId });
      if (!existing || existing.listId !== listId) {
        throw new NewsletterSubscriptionNotFoundError(`subscription ${subscriptionId} was not found`);
      }

      const { subscription } = await unsubscribeSubscription({
        deps: toUnsubscribeSubscriptionDeps(deps),
        input: { workspaceId: deps.workspaceId, id: subscriptionId },
      });
      return { subscription: toSubscriptionToolView(subscription) };
    },

    newsletter_resend_confirmation: async (ctx) => {
      const subscriptionId = requireString(requireInputRecord(ctx.input), "subscriptionId");
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "admin.newsletter.subscriber.manage", entityType: "newsletter_subscription" });

      await deps.newsletterReady;
      const subscription = await deps.newsletterSubscriptionRepo.findById({ workspaceId: deps.workspaceId, id: subscriptionId });
      if (!subscription) throw new NewsletterSubscriptionNotFoundError(`subscription ${subscriptionId} was not found`);

      // Constant `{delivered:true}` response even if the underlying contact cannot be resolved
      // (anti-enumeration) — mirrors `resend-confirmation.ts`'s route exactly.
      const contact = await deps.newsletterSubscriberDirectory.getContact({ workspaceId: deps.workspaceId, subscriberId: subscription.subscriberId });
      if (contact) {
        await issueConfirmationToken({
          deps: toConfirmationDeps(deps),
          input: { workspaceId: deps.workspaceId, subscriptionId: subscription.id, recipientEmail: contact.email },
        });
      }
      return { delivered: true };
    },
  };

  // No `unwiredToolIds`: Newsletter wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({
    domain: "newsletter",
    catalogModule: "newsletter/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: newsletterDerivedRisk,
  });
}

/**
 * Contributes Newsletter's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildNewsletterRegistrations`/
 * `newsletterDerivedRisk` by name; this is the seam that replaced it (2026-08-17 — see
 * `tool-contribution-registry.ts`'s header for why: this edge used to close a module cycle with
 * `assistant`, and a one-directional `newsletter -> assistant` registration call does not).
 */
export function contributeNewsletterTools(): ToolContributor {
  return { domain: "newsletter", build: buildNewsletterRegistrations, risk: newsletterDerivedRisk };
}
