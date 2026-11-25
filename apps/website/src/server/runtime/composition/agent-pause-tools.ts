import { buildDomainRegistrations, indexCatalogById, ToolInputError, type DerivedRiskByToolId, type ToolContributor, type ToolRegistration } from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { toolMetadata } from "#src/contracts/core/tool-metadata/agent-pause";
import { requireHumanConfirm } from "../../../contracts/core/human-confirm.js";
import type { AgentPauseGate } from "./agent-pause-gate.js";

/**
 * @file `resume_agent_work` (H4, owner decision 11-23): the only way agent-created webhooks, sends
 * and scheduled publishes resume after the admin assistant switch paused them. Never automatic —
 * the gate releases its hold only when this tool's approval card comes back confirmed.
 */

export const RESUME_AGENT_WORK_TOOL_ID = "resume_agent_work";
const DOMAIN = "agent-pause";
const EMPTY_SCHEMA = { type: "object", additionalProperties: false, properties: {} } as const;

export const catalog = indexCatalogById({ catalog: [{
  name: RESUME_AGENT_WORK_TOOL_ID,
  description: "Resumes work an AGENT created (webhooks, scheduled posts and sends) that the admin assistant switch paused. Shows the owner an approval card and resumes only if they confirm; declining leaves everything paused. Takes no input.",
  sideEffects: "mutates-durable-state" as const, authorization: { permission: "admin.assistant.use" }, inputSchema: EMPTY_SCHEMA,
}] });
export const agentPauseDerivedRisk: DerivedRiskByToolId = new Map([[RESUME_AGENT_WORK_TOOL_ID, "mutates-durable-state"]]);

export interface AgentPauseToolDeps {
  readonly workspaceId: string;
  readonly authorize: AuthorizeFn;
  readonly agentPauseGate?: Pick<AgentPauseGate, "resume">;
}

const RESUME_SPEC = {
  toolId: RESUME_AGENT_WORK_TOOL_ID, errorCode: "RESUME_AGENT_WORK", title: "Resume paused agent work?",
  description: "While the assistant was switched off, webhooks, sends and scheduled posts that an agent created were held. Resuming lets them run and go live again.",
  details: [], confirmLabel: "Resume agent work", cancelLabel: "Keep paused",
};

/** One registration; the card is asked through the injected `askHuman` (production: `requireHumanConfirm`).
 * @throws ToolInputError when the caller may not use the assistant or no gate is composed.
 * @complexity O(1) plus the wait for the human. */
export function buildAgentPauseRegistrations(
  required: { deps: AgentPauseToolDeps; surfaces: AssistantSurfaceDeps },
  { askHuman = requireHumanConfirm }: { askHuman?: typeof requireHumanConfirm } = {},
): ToolRegistration[] {
  const { deps, surfaces } = required;
  return buildDomainRegistrations({
    domain: DOMAIN, catalogModule: "server/runtime/composition/agent-pause-tools.ts", catalog, derivedRisk: agentPauseDerivedRisk, metadata: toolMetadata,
    handlers: { [RESUME_AGENT_WORK_TOOL_ID]: async (ctx, options) => {
      const decision = await deps.authorize({ principalId: ctx.principal.id, workspaceId: deps.workspaceId, permission: "admin.assistant.use" });
      if (!decision.allowed) throw new ToolInputError({ message: "resume_agent_work: this caller may not use the admin assistant." });
      if (!deps.agentPauseGate) throw new ToolInputError({ message: "resume_agent_work: this site has no agent-pause gate composed; nothing is held." });
      return deps.agentPauseGate.resume({ confirm: () => askHuman({ ctx, surfaces, spec: RESUME_SPEC }, options) });
    } },
  });
}

/** Installed once by `tool-catalog-manifest.ts`, beside the other first-party contributors. */
export function contributeAgentPauseTools(_input: Record<string, never> = {}, _options = {}): ToolContributor<AgentPauseToolDeps, AssistantSurfaceDeps> {
  return { domain: DOMAIN, risk: agentPauseDerivedRisk, build: (deps, surfaces) => buildAgentPauseRegistrations({ deps, surfaces }) };
}
