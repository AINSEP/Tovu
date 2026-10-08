import { toolMetadata } from '../../contracts/core/tool-metadata/publish-content.js';
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import { buildDomainRegistrations, indexCatalogById, type DerivedRiskByToolId, type ToolRegistration, type AgentToolDefinition } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { disconnectDestination, PublishTrustConnectError } from "../publish-trust/connect.js";
import { disconnectAndForgetDestination } from "./connect-destination.js";
import { defaultProvisioning, defaultFindCandidate, type PublishContentToolDeps } from "./tool-registrations.js";

/** Only the ports the admin disconnect handler uses; no HTTP handshake or secret decryption. */
export type Deps = Pick<PublishContentToolDeps, "workspaceId" | "authorize" | "clock" | "idGen" | "publishContentPeerRepo" | "siteAssistantSecretKeyring" | "publishTrustProvisioning" | "findPublishCandidate">;
export const catalog: AgentToolDefinition[] = [{
  name: "publish_content_disconnect",
  description: "Disconnects this computer from its connected live publish destination, forgetting the connected peer and reversing its local deploy-config grant together. Call to stop publishing to that site; reconnect with publish_content_connect to undo. Returns {connected:false, site:null, candidateUrl, message, nextStep}; nextStep describes a deploy still needed for the grant change. Does not delete remote content or saved credential peers, revoke the live site's immediate deny list, or publish content. A settings write failure is refused with recovery guidance.",
  sideEffects: "mutates-durable-state",
  authorization: { permission: "publish_content.apply" },
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
}];
export const derivedRisk: DerivedRiskByToolId = new Map([
  // disconnectAndForgetDestination -> peer delete/compensating restore + disconnectDestination config write.
  ["publish_content_disconnect", "mutates-durable-state"],
]);

/**
 * Wires the same compensated disconnect used by the admin destination route.
 * @param deps - Workspace, authorization, connected-peer and local grant ports.
 * @returns One reversible mutation; disconnected calls remain successful.
 * @throws ToolInputError when local settings cannot be saved; unexpected port faults propagate.
 * @complexity O(1) wiring; handler O(n) in saved peers plus one config write.
 */
export function buildRegistrations(deps: Deps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "publish-content-disconnect", catalogModule: "features/publish-content/disconnect-tool.ts", catalog: indexCatalogById({ catalog: catalog }), derivedRisk,
    handlers: { publish_content_disconnect: async ctx => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "publish_content.apply" });
      try {
        const removed = await disconnectAndForgetDestination({ repo: deps.publishContentPeerRepo, clock: deps.clock, idGen: deps.idGen,
          reverseGrant: () => disconnectDestination({ keyring: deps.siteAssistantSecretKeyring, provisioning: deps.publishTrustProvisioning ?? defaultProvisioning(), workspaceId: deps.workspaceId }),
        }, { workspaceId: deps.workspaceId });
        return { connected: false, site: null, candidateUrl: removed.site?.baseUrl ?? await (deps.findPublishCandidate ?? defaultFindCandidate)(),
          message: removed.site ? `This computer no longer publishes to ${removed.site.label}.` : "This computer was not publishing anywhere.",
          nextStep: removed.changed ? removed.target?.nextStep ?? null : null };
      } catch (error) {
        if (error instanceof PublishTrustConnectError) throw new ToolInputError({ message: "Publishing settings could not be saved. Check that this project's files can be written, then disconnect again." });
        throw error;
      }
    } },
  });
}

/** Contributes a distinct domain so status/connect tools remain registered. */
export function contributePublishContentDisconnectTools(): ToolContributor {
  return { domain: "publish-content-disconnect", build: buildRegistrations, risk: derivedRisk };
}
