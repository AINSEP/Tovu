import { buildPublishContentRegistrations as build } from "@jini-ai/cms/publish/content/tool-registrations";
import { confirm as gatewayConfirm, execute as gatewayExecute, plan as gatewayPlan } from "#src/contracts/core/gated-mutations/gateway";
import { publishContentDerivedRisk } from "@jini-ai/cms/publish/content/tool-helpers";
import { buildPublishContentImportHooks, PublishContentBundleNotFoundError } from "@jini-ai/cms/publish/content/gated-hooks";
import { connectDestination, disconnectDestination, PublishTrustConnectError } from "@jini-ai/cms/publish/trust/connect";
import type { PublishContentToolDeps } from "./tool-deps.js";
import type { ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { publishContentAgentToolCatalog } from "@jini-ai/cms/publish/content/agent-tools";
import { humanConfirmedToolHandler } from "../../contracts/core/human-confirm.js";
import { refuseUnexpectedKeysPort as refuseUnexpectedKeys } from "@jini-ai/core";
import { planHashOf, resolveActorClassIdentity } from "../../contracts/core/gated-mutations/composition.js";
import { PUBLISH_TRUST_WIRE } from "#src/contracts/core/publish-trust-wire";
import { PluginHookFailedError } from "@jini-ai/plugins/host";
import { toModelFacingPluginHookError } from "@jini-ai/plugins/host/hook-refusals";
import { PUBLISH_READINESS_COPY } from "./publish-readiness-copy.js";
import { pullAndStageFromPeer } from "./pull.js";
import { publishContentFromTool } from "./publish-tool.js";
import { buildPublishContentCatalog, listPublishContentContributors } from "./type-registry.js";
import type { PublishContentDeps } from "./type-registry.js";

/** Tovu's gated-mutation gateway (its own token store and TTL), handed to Jini as the host gateway. */
const TOVU_GATEWAY = { plan: gatewayPlan, confirm: gatewayConfirm, execute: gatewayExecute };

export function buildPublishContentRegistrations({ routeDeps, surfaces }: { routeDeps: PublishContentToolDeps; surfaces: AssistantSurfaceDeps }, _optional = {}) {
  return build({ routeDeps: { ...routeDeps, catalog: publishContentAgentToolCatalog, gateway: TOVU_GATEWAY, readinessCopy: PUBLISH_READINESS_COPY,
    listPublishContentContributors, buildPublishContentCatalog, planHashOf, resolveActorClassIdentity, publishTrustProtocol: PUBLISH_TRUST_WIRE,
    humanConfirmedToolHandler, refuseUnexpectedKeys, buildPublishContentImportHooks, PublishContentBundleNotFoundError,
    connectDestination, disconnectDestination, PublishTrustConnectError, isPluginHookFailedError: error => error instanceof PluginHookFailedError,
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
