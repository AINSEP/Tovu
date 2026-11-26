import { buildNewsletterRegistrations as build, newsletterDerivedRisk, type NewsletterToolDeps as Deps } from "@jini-ai/user-management/newsletter/tool-registrations";
import { newsletterAgentToolCatalog } from "@jini-ai/user-management/newsletter/agent-tools";
import { contentReadVocabulary } from "#src/contracts/core/tool-metadata/content-read";
import { buildConfirmationDeps, buildSendPipelineDeps, buildSubscriptionsDeps } from "./deps-builders.js";
import type { ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";

export type NewsletterToolDeps = Omit<Deps, "catalog" | "hostReads" | "buildConfirmationDeps" | "buildSubscriptionsDeps" | "buildSendPipelineDeps">;

export function toNewsletterSendPipelineDeps(deps: NewsletterToolDeps, _optional: Record<string, never> = {}) {
  return buildSendPipelineDeps({ deps, isSendingEnabled: deps.newsletterSendingEnabled ?? (async () => false) });
}

export function buildNewsletterRegistrations(deps: NewsletterToolDeps, _surfaces?: AssistantSurfaceDeps) {
  return build({ ...deps, catalog: newsletterAgentToolCatalog, hostReads: contentReadVocabulary, buildConfirmationDeps, buildSubscriptionsDeps, buildSendPipelineDeps }, _surfaces);
}

export function contributeNewsletterTools(): ToolContributor<NewsletterToolDeps, AssistantSurfaceDeps> {
  return { domain: "newsletter", build: buildNewsletterRegistrations, risk: newsletterDerivedRisk };
}
