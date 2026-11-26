import { buildNewsletterDeliveryRegistrations as build, newsletterDeliveryDerivedRisk, type NewsletterDeliveryToolDeps as Deps } from "@jini-ai/user-management/newsletter/delivery/tool-registrations";
import { newsletterAgentToolCatalog } from "@jini-ai/user-management/newsletter/agent-tools";
import { contentReadVocabulary } from "#src/contracts/core/tool-metadata/content-read";
import { buildConfirmationDeps, buildSendPipelineDeps, buildSubscriptionsDeps } from "../deps-builders.js";
import type { ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { approvalToolHandler } from "../../../contracts/core/human-confirm.js";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

export type NewsletterDeliveryToolDeps = Omit<Deps, "catalog" | "hostReads" | "buildConfirmationDeps" | "buildSubscriptionsDeps" | "buildSendPipelineDeps" | "deliveryCopy" | "reportDeliveryFailure" | "approvalToolHandler">;

export function buildNewsletterDeliveryRegistrations(deps: NewsletterDeliveryToolDeps, surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }) {
  return build({ ...deps, catalog: newsletterAgentToolCatalog, hostReads: contentReadVocabulary, buildConfirmationDeps, buildSubscriptionsDeps, buildSendPipelineDeps,
    approvalToolHandler, reportDeliveryFailure: (message, diagnostic) => console.error(message, diagnostic),
    deliveryCopy: {
      mailOff: "NEWSLETTER_MAIL_OFF: Email sending is not configured. Configure an SMTP credential or a mail adapter in Agent Plugins before sending newsletters. Nothing was sent or scheduled.",
      processingAttention: "The issue started, but audience processing needs attention. Inspect the send log before retrying; delivery is not confirmed.",
      scheduled: "The issue's scheduled date was saved. Automatic delivery at that time is not wired; launch it with newsletter_send_campaign when due.",
      ownerOnly: "NEWSLETTER_OWNER_ONLY: Test sends only use the site owner's stored email. Remove recipient fields and retry.",
      ownerEmailMissing: "NEWSLETTER_OWNER_EMAIL_MISSING: Set the site owner's email in their user profile before sending a test.",
      testNotAccepted: "The mail provider did not accept the test email. Check the email provider configuration and retry.",
      launchGateBlocked: unmetPreconditions => `NEWSLETTER_LAUNCH_GATE_BLOCKED: ${unmetPreconditions.join(", ")}. Enable newsletter sending and bind Members consent before launching a mass send.`,
    },
  }, surfaces);
}

export function contributeNewsletterDeliveryTools(): ToolContributor<NewsletterDeliveryToolDeps, AssistantSurfaceDeps> {
  return { domain: "newsletter-delivery", build: buildNewsletterDeliveryRegistrations, risk: newsletterDeliveryDerivedRisk };
}
