import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/core";
import { requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import type { SurfaceDetail } from "@jini-ai/ui/mcp-ui/surfaces";
import type { ToolContributor } from "#src/assistant/index";
import type { AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import { notConfirmedResult, refuseUnexpectedKeys, requireHumanConfirm } from "../../contracts/core/human-confirm.js";
import { PERMANENT_DELETE_SPECS, permanentDeleteAgentToolCatalog, type PermanentDeleteToolId } from "./agent-tools.js";
import type { ForgetRemovedEntity } from "@jini-ai/cms/trash";
import type { StaticPublishToolDeps } from "../deployments/publish-agent-tools.js";

/** Extra host ports read by the injected adapter, beyond the existing domains' deps slices. */
export interface PermanentDeleteHostDeps {
  forgetRemovedMedia: ForgetRemovedEntity;
  loadDeployTargets: NonNullable<StaticPublishToolDeps["loadDeployTargets"]>;
}

/** A prepared effect fixes the target before consent; callback params never enter execute(). */
export interface PermanentDeletePlan {
  readonly details: readonly SurfaceDetail[];
  readonly warning?: string;
  execute(): Promise<Record<string, unknown>>;
}

/** Inject the existing resource services at the composition root; no DB/provider coupling here. */
export interface PermanentDeleteToolDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  prepare(toolId: PermanentDeleteToolId, id: string | null, principalId: string): Promise<PermanentDeletePlan>;
}

export const permanentDeleteDerivedRisk: DerivedRiskByToolId = new Map([
  // -> TrashPort.purgeSelected on the confirmed snapshot; per-row auth and compare-delete retained.
  ["trash_empty", "mutates-durable-state"],
  // -> TrashPort.purgeSelected for one confirmed Trash row.
  ["trash_purge_item", "mutates-durable-state"],
  // -> purgeMedia + forgetRemovedMedia: asset/rendition removal and blob tombstone.
  ["media_purge_asset", "mutates-durable-state"],
  // -> CommentWriteService.purge: row/index removal plus audit event.
  ["comments_purge_comment", "mutates-durable-state"],
  // -> TrashPort.purgeSelected -> user adapter / SqlUserPurge: identity cascade.
  ["identity_user_delete", "mutates-durable-state"],
  // -> deleteExternalMcpServer: saved server/config/auth removal.
  ["external_mcp_delete", "mutates-durable-state"],
  // -> deleteCustomCredential: deletes the saved encrypted credential.
  ["custom_credential_delete", "mutates-durable-state"],
  // -> deletePublishCredential: deletes vendor credential, promotes next default.
  ["deployment_delete_provider_credential", "mutates-durable-state"],
  // -> deleteSourceControlCredential: deletes source-control credential, promotes next default.
  ["source_control_delete_credential", "mutates-durable-state"],
]);

/**
 * Wire every delete through the existing human-confirm exchange. Parse -> authorize -> prepare ->
 * card -> reauthorize -> effect. The second authorization closes revocation during the human wait.
 * @param deps - Permission evaluator and resource-specific preparation/effect adapter.
 * @param surfaces - The transport's shared exchange store, also used by the authenticated callback.
 * @returns Nine non-read-only registrations; no headless or model-input confirmation fallback.
 * @throws ToolInputError for invalid input, no confirmation channel, not-found or changed targets.
 * @complexity O(t) to build for t tools; execution adds the resource service cost and human latency.
 */
export function buildPermanentDeleteRegistrations(deps: PermanentDeleteToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {};
  for (const spec of PERMANENT_DELETE_SPECS) {
    handlers[spec.name] = async (ctx, optional = {}) => {
      const input = requireInputRecord({ input: ctx.input });
      refuseUnexpectedKeys(input, spec.key === null ? [] : [spec.key]);
      const id = spec.key === null ? null : requireString({ input: input, key: spec.key }).trim();
      if (id === "") throw new ToolInputError({ message: `${spec.name}: '${spec.key}' must be a non-empty id.` });
      const authorize = () => requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: spec.permission }, { entityType: spec.entityType, ...(id === null ? {} : { entityId: id }) });
      await authorize();
      const plan = await deps.prepare(spec.name, id, ctx.principal.id);
      // Already-aborted calls cannot ask the human or perform an irreversible effect.
      if (ctx.signal.aborted) return { removed: false, ...notConfirmedResult({ confirmed: false, reason: "abandoned" }) };
      const toolId = spec.name;
      const outcome = await requireHumanConfirm({ ctx, surfaces, spec: {
        toolId, errorCode: "PERMANENT_DELETE", title: `Permanently delete ${spec.subject}?`,
        description: "Review the exact saved items below. This action cannot be undone.",
        details: plan.details, warning: plan.warning ?? "Permanent deletion has no undo or restore.",
        danger: true, confirmLabel: "Permanently delete",
      } }, optional);
      if (!outcome.confirmed) return { removed: false, ...notConfirmedResult(outcome) };
      await authorize();
      if (ctx.signal.aborted) return { removed: false, ...notConfirmedResult({ confirmed: false, reason: "abandoned" }) };
      return plan.execute();
    };
  }
  return buildDomainRegistrations({ domain: "permanent-delete", catalogModule: "features/permanent-delete/agent-tools.ts", catalog: indexCatalogById({ catalog: permanentDeleteAgentToolCatalog }), handlers, derivedRisk: permanentDeleteDerivedRisk });
}

/** Compose with host adapters without importing server/assistant implementations into the feature. */
export function contributePermanentDeleteTools(spec: { buildDeps: (routeDeps: Parameters<ToolContributor["build"]>[0]) => PermanentDeleteToolDeps }): ToolContributor {
  return { domain: "permanent-delete", build: (routeDeps, surfaces) => buildPermanentDeleteRegistrations(spec.buildDeps(routeDeps), surfaces), risk: permanentDeleteDerivedRisk };
}
