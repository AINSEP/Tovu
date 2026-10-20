import type { Express } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import type { JsonValue } from "@jini-ai/core/primitives";
import { mountSettingsJsonRoute, rejectSettingsRequest, toWriteServiceDeps } from "../settings/shared.js";
import { set } from "#src/features/settings/index";
export type AssistantOwnerGrantDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "settingsReady" | "settingsUiTabsReady" | "settingsRepo" | "clock" | "idGen" | "principalRepo" | "ownerPrincipalId" | "getEffective">;
/** Shared site-owner grant ceremony over the existing audited settings chokepoint.
 * For grants requiring acknowledgment, a receipt is persisted before enabling: failure can leave
 * a receipt, never an unacknowledged grant. Subagents need only the owner's ordinary toggle.
 * Every value change has its normal atomic setting revision; no alternate store or schema.
 * @param required - Existing authenticated route/ledger ports and setting-specific parse/read/value projections.
 * @param optional - Site-grant acknowledgment policy; required by default for permanent deletes.
 * @returns Nothing; mounts GET/PUT routes over this site's existing store.
 * @throws Route adapters report validation, authorization and storage errors without converting them into success.
 * @example registerAssistantOwnerGrantRoutes({ app, deps, path, namespace, key, writeReason, validationError, read, parse, value });
 * @complexity O(1) local space/time for bounded grants, one value write and (on enable) one receipt write. */
export function registerAssistantOwnerGrantRoutes<T extends { enabled: boolean }>(required: {
  app: Express; deps: AssistantOwnerGrantDeps; path: string; namespace: string; key: string;
  writeReason: string; validationError: string;
  read(): Promise<T>; parse(body: Record<string, unknown>): T;
  value(settings: T): JsonValue;
  projectRead?(input: { settings: T; isOwner: boolean }): T;
  canEdit?(input: { isOwner: boolean }): boolean;
}, optional: { requireAcknowledgment?: boolean; scope?: "user" | "workspace" } = {}): void {
  const { app, deps, path } = required;
  const routeDeps = { ...deps, settingsReady: deps.settingsUiTabsReady };
  async function parseGrantUpdate({ body }: { body: Record<string, unknown> | null }, _optional = {}) {
    if (!body || Array.isArray(body) || typeof body.enabled !== "boolean") rejectSettingsRequest({ status: 400, code: "VALIDATION_ERROR", error: required.validationError });
    const settings = required.parse(body);
    const previous = await required.read();
    const needsAcknowledgment = optional.requireAcknowledgment !== false && settings.enabled && !previous.enabled;
    if (needsAcknowledgment && body.riskAcknowledged !== true) rejectSettingsRequest({ status: 400, code: "VALIDATION_ERROR", error: required.validationError });
    return { settings, needsAcknowledgment };
  }
  mountSettingsJsonRoute({ app, deps: routeDeps, method: "get", path,
    handle: async ({ principal }) => {
      // The dock is available to every authenticated administrator, including those without
      // settings.read. These non-secret grants must remain visible to everyone they affect.
      const isOwner = principal.id === await deps.ownerPrincipalId;
      const settings = await required.read();
      return { ...(required.projectRead?.({ settings, isOwner }) ?? settings), canEdit: required.canEdit?.({ isOwner }) ?? isOwner };
    },
  });
  mountSettingsJsonRoute({ app, deps: routeDeps, method: "put", path,
    handle: async ({ request, principal, authorize }) => {
      if (principal.id !== await deps.ownerPrincipalId) rejectSettingsRequest({ status: 403, code: "FORBIDDEN", error: required.writeReason });
      if (required.canEdit && !required.canEdit({ isOwner: true })) rejectSettingsRequest({ status: 403, code: "FORBIDDEN", error: "Not available on hosted sites" });
      const { settings, needsAcknowledgment } = await parseGrantUpdate({ body: request.body as Record<string, unknown> | null });
      const scope = optional.scope ?? "workspace";
      await authorize({ permission: scope === "user" ? "settings.user.self.write" : "settings.workspace.write", entityType: "setting-value" });
      const input = { namespace: required.namespace, scope,
        ...(scope === "user" ? { principalId: principal.id } : {}),
        workspaceId: deps.workspaceId, authWorkspaceId: deps.workspaceId, callerPrincipalId: principal.id };
      if (needsAcknowledgment) await set({ deps: toWriteServiceDeps(routeDeps), input: {
        ...input, key: "riskAcknowledgment", value: { riskAcknowledged: true, acknowledgedAt: deps.clock.nowIso(), grant: required.value(settings) },
      } });
      const result = await set({ deps: toWriteServiceDeps(routeDeps), input: { ...input, key: required.key, value: required.value(settings) } });
      return { ...(required.projectRead?.({ settings, isOwner: true }) ?? settings), canEdit: true, revisionSeq: result.revisionSeq };
    },
  });
}
