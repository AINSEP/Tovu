import { buildPermanentDeleteRegistrations as build, permanentDeleteDerivedRisk, type PermanentDeleteToolDeps as Deps } from "@jini-ai/cms/trash/permanent/tool-registrations";
import { createPermanentDeleteAgentToolCatalog, createPermanentDeleteSpecs } from "@jini-ai/cms/trash/permanent/agent-tools";
import { approvalToolHandler, notConfirmedResult, refuseUnexpectedKeys } from "../../contracts/core/human-confirm.js";
import type { ForgetRemovedEntity } from "@jini-ai/cms/trash";
import type { StaticPublishToolDeps } from "../deployments/publish-agent-tools.js";
import type { ChatDeleteSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import type { ToolContributor } from "@jini-ai/core";

/** Host binding (K3): the custom-credential guidance names this host's own read tool, which the engine catalog cannot know. */
export const PERMANENT_DELETE_SPECS = createPermanentDeleteSpecs({ customCredentialIdSource: "content_read.custom_credential" });
export const permanentDeleteAgentToolCatalog = createPermanentDeleteAgentToolCatalog({ specs: PERMANENT_DELETE_SPECS });

/** Extra host ports read by the injected adapter, beyond the existing domains' deps slices. */
export interface PermanentDeleteHostDeps {
  forgetRemovedMedia: ForgetRemovedEntity;
  contentKernel?: import("#src/platform/db/content-kernel").ContentKernel;
  loadDeployTargets: NonNullable<StaticPublishToolDeps["loadDeployTargets"]>;
}


export type PermanentDeleteToolDeps = Omit<Deps, "specs" | "catalog" | "refuseUnexpectedKeys" | "notConfirmedResult" | "approvalToolHandler">;

export function buildPermanentDeleteRegistrations(deps: PermanentDeleteToolDeps, surfaces: ChatDeleteSurfaceDeps) {
  return build({ ...deps, specs: PERMANENT_DELETE_SPECS, catalog: permanentDeleteAgentToolCatalog, approvalToolHandler, notConfirmedResult, refuseUnexpectedKeys }, surfaces);
}

export function contributePermanentDeleteTools<TDeps>(spec: { buildDeps: (routeDeps: TDeps) => PermanentDeleteToolDeps }): ToolContributor<TDeps, ChatDeleteSurfaceDeps> {
  return { domain: "permanent-delete", build: (routeDeps, surfaces) => buildPermanentDeleteRegistrations(spec.buildDeps(routeDeps), surfaces), risk: permanentDeleteDerivedRisk };
}
