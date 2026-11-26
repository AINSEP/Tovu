import { buildMailProviderRegistrations as build, mailProviderDerivedRisk, type MailProviderToolDeps as Deps } from "@jini-ai/user-management/mail/status/provider-tool-registrations";
import type { ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { issueCredentialSetup } from "#src/contracts/core/tool-failure-diagnostics";
import { loadAgentPluginSearchCandidates, type AgentPluginSearchToolDeps } from "../agent-plugins/tool-registrations.js";
import { loadPluginCredentialCardsSafely, type LoadPluginCredentialCards } from "@jini-ai/agent-plugins/connect";

export interface MailProviderToolDeps extends Omit<Deps, "category" | "loadAgentPluginSearchCandidates" | "loadPluginCredentialCardsSafely" | "issueCredentialSetup"> {
  agentPluginLayout?: AgentPluginSearchToolDeps["agentPluginLayout"];
  loadPluginCredentialCards?: LoadPluginCredentialCards;
}

export function buildMailProviderRegistrations(deps: MailProviderToolDeps, _options: AssistantSurfaceDeps | Record<string, never> = {}) {
  return build({ ...deps, category: "ops", issueCredentialSetup,
    ...(deps.agentPluginLayout ? { loadAgentPluginSearchCandidates: ({ workspaceId }: { workspaceId: string }) => loadAgentPluginSearchCandidates({ workspaceId, agentPluginLayout: deps.agentPluginLayout! }) } : {}),
    loadPluginCredentialCardsSafely: ({ workspaceId }) => loadPluginCredentialCardsSafely({ loadCards: deps.loadPluginCredentialCards, workspaceId }),
  }, _options);
}

export function contributeMailProviderTools(): ToolContributor<MailProviderToolDeps, AssistantSurfaceDeps> {
  return { domain: "system-mail-providers", build: buildMailProviderRegistrations, risk: mailProviderDerivedRisk };
}
