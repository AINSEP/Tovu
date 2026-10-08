import { toolMetadata } from '../../../contracts/core/tool-metadata/newsletter.js';
/**
 * Newsletter delivery registrations over the existing send pipeline and campaign write services.
 * Subscriber delivery uses browser-only confirmation; test recipients resolve from the owner profile.
 */
import { ToolInputError, type ToolHandler } from "@jini-ai/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { UserRepoPort } from "@jini-ai/user-management";
import type { ToolContributor } from "#src/assistant/index";
import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule } from "@jini-ai/core/model-facing-tool-errors";
import { withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { AgentToolDefinition } from "@jini-ai/core";
import { isValidScheduleTimestamp, scheduleCampaign } from "../campaign-write-service.js";
import { approvalToolHandler } from "../../../contracts/core/human-confirm.js";
import type { CampaignRecord } from "../types.js";
import { NewsletterCampaignNotEditableError, NewsletterCampaignNotFoundError, NewsletterLaunchGateBlockedError, NewsletterValidationError } from "../errors.js";
import { evaluateLaunchGate } from "../launch-gate.js";
import { authorizeSend, claimBatch, completeIfDrained, freezeAudience, resumeCampaign, sendTestCampaign } from "../send-pipeline.js";
import { toNewsletterSendPipelineDeps, type NewsletterToolDeps } from "../tool-registrations.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/** Owner identity is injected by composition; recipient addresses never come from tool input. */
export interface NewsletterDeliveryToolDeps extends NewsletterToolDeps {
  ownerPrincipalId: Promise<string>;
  userRepo: Pick<UserRepoPort, "findByPrincipalId">;
}

const campaignIdSchema = { type: "string", minLength: 1 } as const;
// Real campaign mail cannot be undone; resume continues that same effect for the remaining audience,
// and scheduling expresses future-send intent. Browser-only human confirmation gates these tools.
// Test mail resolves the owner's stored address: accepting an arbitrary model-supplied recipient
// would allow attacker-chosen addresses to receive attacker-influenced campaign content.
/** Newsletter delivery catalog, separate from composition/list management. */
export const newsletterDeliveryAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "newsletter_send_test",
    description: "Sends a test copy of an existing newsletter issue only to the site owner's stored email, without a confirmation card. Call before a subscriber send; never accepts recipient addresses. Returns {delivered,mailDeliveryAvailable}. Refuses missing owner email, unconfigured mail or an unverified origin. A successful result means provider acceptance, not confirmed inbox delivery.",
    sideEffects: "mutates-durable-state", authorization: { permission: "admin.newsletter.campaign.send_test" },
    inputSchema: { type: "object", additionalProperties: false, required: ["campaignId"], properties: { campaignId: campaignIdSchema } },
  },
  {
    name: "newsletter_send_campaign",
    description: "Launches an existing newsletter issue to its subscriber list after a human confirmation card. Call to send an issue now, not to compose a draft or test it. Returns {confirmed,started,campaignId,status,delivered:false,mailDeliveryAvailable}; launch is not inbox delivery. Refuses mail-off, failed launch readiness, stale confirmation or unavailable confirmation channel.",
    sideEffects: "mutates-durable-state", authorization: { permission: "admin.newsletter.campaign.send" },
    inputSchema: { type: "object", additionalProperties: false, required: ["campaignId"], properties: { campaignId: campaignIdSchema } },
  },
  {
    name: "newsletter_schedule_campaign",
    description: "Saves a draft newsletter issue's scheduled date after a human confirmation card. Call to record when a subscriber send should occur. Returns {confirmed,scheduled,campaignId,status,scheduledAt,delivered:false,mailDeliveryAvailable,note}. Automatic timed delivery is not wired: use newsletter_send_campaign when due. Refuses mail-off, invalid dates, non-drafts, stale confirmation or unavailable confirmation channel.",
    sideEffects: "mutates-durable-state", authorization: { permission: "admin.newsletter.campaign.schedule" },
    inputSchema: { type: "object", additionalProperties: false, required: ["campaignId", "scheduledAt"], properties: { campaignId: campaignIdSchema, scheduledAt: { type: "string", format: "date-time", description: "ISO date-time with explicit timezone." } } },
  },
  {
    name: "newsletter_resume_campaign",
    description: "Resumes a paused newsletter issue's remaining subscriber delivery after a human confirmation card. Use after newsletter_pause_campaign, not to resend a finished issue. Returns {confirmed,started,campaignId,status,delivered:false,mailDeliveryAvailable}. Refuses mail-off, failed launch readiness, stale confirmation, wrong status or unavailable confirmation channel.",
    sideEffects: "mutates-durable-state", authorization: { permission: "admin.newsletter.campaign.send" },
    inputSchema: { type: "object", additionalProperties: false, required: ["campaignId"], properties: { campaignId: campaignIdSchema } },
  },
];

export const newsletterDeliveryDerivedRisk: DerivedRiskByToolId = new Map([
  // sendTestCampaign -> mailer.send (externally visible mail, provider dedup state).
  ["newsletter_send_test", "mutates-durable-state"],
  // authorizeSend -> campaign/revision writes; freezeAudience -> snapshot/send/outbox writes; claimBatch -> mail.
  ["newsletter_send_campaign", "mutates-durable-state"],
  // scheduleCampaign -> campaign/revision writes, authorizes a future mass send.
  ["newsletter_schedule_campaign", "mutates-durable-state"],
  // resumeCampaign -> campaign write; claimBatch -> remaining mail.
  ["newsletter_resume_campaign", "mutates-durable-state"],
]);

/** Returns an explicit refusal for non-delivering adapters before a card or write. @complexity O(1). */
function mailOffResult(deps: NewsletterToolDeps) {
  const driver = deps.mailer.capabilities().driver;
  if (driver !== "console" && driver !== "memory") return null;
  return { delivered: false, mailDeliveryAvailable: false, note: "NEWSLETTER_MAIL_OFF: Email sending is not configured. Configure an SMTP credential or a mail adapter in Agent Plugins before sending newsletters. Nothing was sent or scheduled." };
}

/** Reports committed launch state without claiming that downstream processing finished. @complexity O(1). */
function processingAttentionResult(campaignId: string, status: string) {
  return { confirmed: true, started: true, campaignId, status, delivered: false, mailDeliveryAvailable: true, note: "The issue started, but audience processing needs attention. Inspect the send log before retrying; delivery is not confirmed." };
}

/** Publishes only fixed launch prerequisites, never provider errors or subscriber addresses. @complexity O(1). */
async function requireMassLaunchReady(deps: NewsletterToolDeps): Promise<void> {
  const result = await evaluateLaunchGate({ deps: toNewsletterSendPipelineDeps(deps).launchGateDeps, workspaceId: deps.workspaceId, isTestSend: false });
  if (!result.met) throw new ToolInputError({ message: `NEWSLETTER_LAUNCH_GATE_BLOCKED: ${result.unmetPreconditions.join(", ")}. Enable newsletter sending and bind Members consent before launching a mass send.` });
}

/**
 * Builds handlers over existing services. Human consent is scoped to an unchanged campaign.
 * @param deps - Existing newsletter services and owner identity, bound at boot.
 * @param surfaces - Shared browser-only exchange store (a local store is useful for isolated callers).
 * @returns Four durable-write registrations; none supports a model-supplied confirmation flag.
 * @throws ToolInputError for permissions, missing configuration, invalid input or stale consent.
 * @complexity O(1) registration setup; launch uses the existing pipeline's audience cost.
 */
export function buildNewsletterDeliveryRegistrations(deps: NewsletterDeliveryToolDeps, surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    newsletter_send_test: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "admin.newsletter.campaign.send_test" }, { entityType: "newsletter_campaign" });
      if (Object.keys(input).some((key) => key !== "campaignId")) throw new ToolInputError({ message: "NEWSLETTER_OWNER_ONLY: Test sends only use the site owner's stored email. Remove recipient fields and retry." });
      const campaignId = requireString({ input: input, key: "campaignId" });
      const mailOff = mailOffResult(deps);
      if (mailOff) return mailOff;
      await deps.newsletterReady;
      const owner = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId: await deps.ownerPrincipalId });
      if (!owner?.email?.trim()) throw new ToolInputError({ message: "NEWSLETTER_OWNER_EMAIL_MISSING: Set the site owner's email in their user profile before sending a test." });
      const { results } = await sendTestCampaign({ deps: toNewsletterSendPipelineDeps(deps), input: { workspaceId: deps.workspaceId, campaignId, testAddresses: [owner.email] } });
      // Provider error text can carry an email or endpoint; the caller receives only a fixed recovery note.
      if (results[0].outcome !== "sent") return { delivered: false, mailDeliveryAvailable: true, note: "The mail provider did not accept the test email. Check the email provider configuration and retry." };
      return { delivered: true, mailDeliveryAvailable: true };
    },
  };
  for (const toolId of ["newsletter_send_campaign", "newsletter_schedule_campaign", "newsletter_resume_campaign"]) {
    type Prepared = { refusal: NonNullable<ReturnType<typeof mailOffResult>> } | { campaignId: string; existing: CampaignRecord; scheduledAt: string | null };
    handlers[toolId] = approvalToolHandler<Prepared>({ surfaces, prepare: async ({ ctx }) => {
      const input = requireInputRecord({ input: ctx.input });
      const campaignId = requireString({ input: input, key: "campaignId" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: toolId === "newsletter_schedule_campaign" ? "admin.newsletter.campaign.schedule" : "admin.newsletter.campaign.send" }, { entityType: "newsletter_campaign" });
      const mailOff = mailOffResult(deps);
      if (mailOff) return { refusal: mailOff };
      await deps.newsletterReady;
      const existing = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id: campaignId });
      if (!existing) throw new NewsletterCampaignNotFoundError(`campaign ${campaignId} was not found`);
      const scheduledAt = toolId === "newsletter_schedule_campaign" ? requireString({ input: input, key: "scheduledAt" }) : null;
      if (scheduledAt !== null && !isValidScheduleTimestamp(scheduledAt)) throw new NewsletterValidationError("scheduledAt must be a valid ISO date-time string with an explicit timezone", "scheduledAt", "format");
      return { campaignId, existing: structuredClone(existing), scheduledAt };
    }, describe: ({ prepared }) => {
      const spec = { toolId, errorCode: "NEWSLETTER", title: toolId === "newsletter_schedule_campaign" ? "Schedule this newsletter?" : toolId === "newsletter_resume_campaign" ? "Resume this newsletter?" : "Send this newsletter?",
        description: "This action can send email to real people. Only your confirmation can authorize it.", confirmLabel: "Confirm" };
      if ("refusal" in prepared) return { ...spec, details: [] };
      const { existing, campaignId, scheduledAt } = prepared;
      return { ...spec, details: [
        { label: "Subject", value: existing.subject }, { label: "Campaign", value: campaignId }, { label: "Subscriber list", value: existing.listId }, { label: "Status", value: existing.status },
        ...(scheduledAt === null ? [] : [{ label: "Scheduled date", value: scheduledAt }]),
      ] };
    }, run: async ({ ctx, prepared }) => {
      if ("refusal" in prepared) return prepared.refusal;
      const { campaignId, existing, scheduledAt } = prepared;
      // Authorization and mail configuration may change while the human reads the card.
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: toolId === "newsletter_schedule_campaign" ? "admin.newsletter.campaign.schedule" : "admin.newsletter.campaign.send" }, { entityType: "newsletter_campaign" });
      if (ctx.signal.aborted) return { confirmed: false, reason: "abandoned", delivered: false, mailDeliveryAvailable: true };
      const currentMailOff = mailOffResult(deps);
      if (currentMailOff) return currentMailOff;
      const transition = await deps.newsletterCampaignRepo.transaction(async () => {
        const current = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id: campaignId });
        // Pipeline transitions do not always increment version; compare the complete snapshot as well.
        if (JSON.stringify(current) !== JSON.stringify(existing)) throw new ToolInputError({ message: "NEWSLETTER_STALE_CONFIRMATION: The campaign changed while the card was open. Review it and request a new confirmation." });
        if (ctx.signal.aborted) return { abandoned: true as const };
        if (scheduledAt !== null) return scheduleCampaign({ deps: { campaignRepo: deps.newsletterCampaignRepo, listRepo: deps.newsletterListRepo, clock: deps.clock, ids: deps.idGen }, input: { workspaceId: deps.workspaceId, id: campaignId, actorId: ctx.principal.id, scheduledAt } });
        if (toolId === "newsletter_resume_campaign") {
          await requireMassLaunchReady(deps);
          if (ctx.signal.aborted) return { abandoned: true as const };
          return resumeCampaign({ deps: toNewsletterSendPipelineDeps(deps), input: { workspaceId: deps.workspaceId, campaignId } });
        }
        return authorizeSend({ deps: toNewsletterSendPipelineDeps(deps), input: { workspaceId: deps.workspaceId, campaignId } });
      });
      if ("abandoned" in transition) return { confirmed: false, reason: "abandoned", delivered: false, mailDeliveryAvailable: true };
      const { campaign } = transition;
      if (scheduledAt !== null) return { confirmed: true, scheduled: true, campaignId, status: campaign.status, scheduledAt: campaign.scheduledAt, delivered: false, mailDeliveryAvailable: true, note: "The issue's scheduled date was saved. Automatic delivery at that time is not wired; launch it with newsletter_send_campaign when due." };
      if ("requeueFailed" in transition && transition.requeueFailed) return processingAttentionResult(campaignId, campaign.status);
      // The campaign status has committed, so a later fan-out failure must not imply no launch occurred.
      try {
        await freezeAudience({ deps: toNewsletterSendPipelineDeps(deps), input: { workspaceId: deps.workspaceId, campaignId, listId: campaign.listId } });
        await claimBatch({ deps: toNewsletterSendPipelineDeps(deps) });
        // An empty audience emits no batch event, so the subscriber cannot complete it for us.
        await completeIfDrained({ deps: toNewsletterSendPipelineDeps(deps), input: { workspaceId: deps.workspaceId, campaignId } });
      } catch {
        console.error("[newsletter] delivery fan-out failed after launch; inspect the send log before retrying");
        return processingAttentionResult(campaignId, campaign.status);
      }
      return { confirmed: true, started: true, campaignId, status: campaign.status, delivered: false, mailDeliveryAvailable: true };
    } }, { ask: ({ prepared }) => !("refusal" in prepared),
      declined: ({ reason }) => ({ confirmed: false, reason, delivered: false, mailDeliveryAvailable: true }),
    });
  }
  // authorizeSend's gate result is safe vocabulary; its generic message alone omits the reason.
  const guarded: Record<string, ToolHandler> = {};
  for (const [id, handler] of Object.entries(handlers)) guarded[id] = async (ctx, options = {}) => {
    try { return await handler(ctx, options); } catch (error) {
      if (error instanceof NewsletterLaunchGateBlockedError) throw new ToolInputError({ message: `NEWSLETTER_LAUNCH_GATE_BLOCKED: ${error.unmetPreconditions.join(", ")}. Enable newsletter sending and bind Members consent before launching a mass send.` });
      throw error;
    }
  };
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "newsletter-delivery", catalogModule: "newsletter/delivery/tool-registrations.ts", catalog: indexCatalogById({ catalog: newsletterDeliveryAgentToolCatalog }), handlers: withModelFacingErrors({ handlers: guarded, rules: [forbiddenRule({ domainPrefix: "NEWSLETTER", error: ForbiddenError }), { error: NewsletterCampaignNotFoundError, code: "NEWSLETTER_CAMPAIGN_NOT_FOUND" }, { error: NewsletterCampaignNotEditableError, code: "NEWSLETTER_CAMPAIGN_NOT_EDITABLE" }, { error: NewsletterValidationError, code: "NEWSLETTER_VALIDATION_FAILED" }] }), derivedRisk: newsletterDeliveryDerivedRisk });
}

/** Registers delivery under its own key so it cannot replace the existing newsletter catalog. */
export function contributeNewsletterDeliveryTools(): ToolContributor {
  return { domain: "newsletter-delivery", build: buildNewsletterDeliveryRegistrations, risk: newsletterDeliveryDerivedRisk };
}
