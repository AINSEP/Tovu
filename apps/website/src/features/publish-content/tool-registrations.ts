import { buildPublishContentRegistrations as build } from "@jini-ai/cms/publish/content/tool-registrations";
import { publishContentDerivedRisk } from "@jini-ai/cms/publish/content/tool-helpers";
import type { PublishContentToolDeps } from "./tool-deps.js";
import type { ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { publishContentAgentToolCatalog } from "@jini-ai/cms/publish/content/agent-tools";
import { humanConfirmedToolHandler, refuseUnexpectedKeys } from "../../contracts/core/human-confirm.js";
import { planHashOf, resolveActorClassIdentity } from "../../contracts/core/gated-mutations/composition.js";
import { PUBLISH_TRUST_WIRE } from "#src/contracts/core/publish-trust-wire";
import { PluginHookFailedError } from "@jini-ai/plugins/host";
import { toModelFacingPluginHookError } from "@jini-ai/plugins/host/hook-refusals";
import { PUBLISH_READINESS_COPY } from "./publish-readiness-copy.js";
import { pullAndStageFromPeer } from "./pull.js";
import { publishContentFromTool } from "./publish-tool.js";
import { buildPublishContentCatalog, listPublishContentContributors } from "./type-registry.js";
import type { PublishContentDeps } from "./type-registry.js";

export function buildPublishContentRegistrations({ routeDeps, surfaces }: { routeDeps: PublishContentToolDeps; surfaces: AssistantSurfaceDeps }, _optional = {}) {
  return build({ routeDeps: { ...routeDeps, catalog: publishContentAgentToolCatalog, readinessCopy: PUBLISH_READINESS_COPY,
    listPublishContentContributors, buildPublishContentCatalog, planHashOf, resolveActorClassIdentity, publishTrustProtocol: PUBLISH_TRUST_WIRE,
    humanConfirmedToolHandler, refuseUnexpectedKeys, isPluginHookFailedError: error => error instanceof PluginHookFailedError,
    toModelFacingPluginHookError: ({ err }) => toModelFacingPluginHookError({ err: err as PluginHookFailedError }),
    pullAndStageFromPeer: ({ input }) => pullAndStageFromPeer({ deps: routeDeps, input }),
    publishContentFromTool: ({ principalId }, input) => publishContentFromTool({ deps: routeDeps, principalId }, input),
  }, surfaces });
}

export function contributePublishContentTools<TDeps extends PublishContentToolDeps = PublishContentToolDeps>(options: {
  buildPublishContentDeps?: (deps: TDeps) => PublishContentDeps;
} = {}): ToolContributor<TDeps, AssistantSurfaceDeps> {
  return { domain: "publish-content", risk: publishContentDerivedRisk, build: (deps, surfaces) => buildPublishContentRegistrations({ routeDeps: { ...deps,
    ...(options.buildPublishContentDeps ? { makePublishContentDeps: () => options.buildPublishContentDeps!(deps) } : {}),
  }, surfaces }) };
}
