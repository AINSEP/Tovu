import type { Express } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import type { JsonValue } from "@jini-ai/core/primitives";
import { mountSettingsJsonRoute, rejectSettingsRequest, toWriteServiceDeps } from "../settings/shared.js";
import { set } from "#src/features/settings/index";
export type AssistantOwnerGrantDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "settingsReady" | "settingsUiTabsReady" | "settingsRepo" | "clock" | "idGen" | "principalRepo" | "ownerPrincipalId" | "getEffective">;
/** Shared site-owner grant ceremony over the existing audited settings chokepoint.
 * A receipt is persisted before enabling: failure can leave a receipt, never an unacknowledged grant.
 * Every value change has its normal atomic setting revision; no alternate store or schema.
 * @param required - Existing authenticated route/ledger ports and setting-specific parse/read/value projections.
 * @returns Nothing; mounts GET/PUT routes over this site's existing store.
 * @throws Route adapters report validation, authorization and storage errors without converting them into success.
 * @example registerAssistantOwnerGrantRoutes({ app, deps, path, namespace, key, writeReason, validationError, read, parse, value });
 * @complexity O(1) local space/time for bounded grants, one value write and (on enable) one receipt write. */
export function registerAssistantOwnerGrantRoutes<T extends { enabled: boolean }>(required: {
  app: Express; deps: AssistantOwnerGrantDeps; path: string; namespace: string; key: string;
  writeReason: string; validationError: string;
  read(): Promise<T>; parse(body: Record<string, unknown>): T;
  value(settings: T): JsonValue;
}, _optional = {}): void {
  const { app, deps, path } = required;
  const routeDeps = { ...deps, settingsReady: deps.settingsUiTabsReady };
  mountSettingsJsonRoute({ app, deps: routeDeps, method: "get", path,
    handle: async ({ principal }) => {
      // The dock is available to every authenticated administrator, including those without
      // settings.read. These non-secret grants must remain visible to everyone they affect.
      return { ...await required.read(), canEdit: principal.id === await deps.ownerPrincipalId };
    },
  });
  mountSettingsJsonRoute({ app, deps: routeDeps, method: "put", path,
    handle: async ({ request, principal, authorize }) => {
      if (principal.id !== await deps.ownerPrincipalId) rejectSettingsRequest({ status: 403, code: "FORBIDDEN", error: required.writeReason });
      const body = request.body as Record<string, unknown> | null;
      if (!body || Array.isArray(body) || typeof body.enabled !== "boolean") rejectSettingsRequest({ status: 400, code: "VALIDATION_ERROR", error: required.validationError });
      const settings = required.parse(body);
      const previous = await required.read();
      if (settings.enabled && !previous.enabled && body.riskAcknowledged !== true) rejectSettingsRequest({ status: 400, code: "VALIDATION_ERROR", error: required.validationError });
      await authorize({ permission: "settings.workspace.write", entityType: "setting-value" });
      const input = { namespace: required.namespace, scope: "workspace" as const,
        workspaceId: deps.workspaceId, authWorkspaceId: deps.workspaceId, callerPrincipalId: principal.id };
      if (settings.enabled && !previous.enabled) await set({ deps: toWriteServiceDeps(routeDeps), input: {
        ...input, key: "riskAcknowledgment", value: { riskAcknowledged: true, acknowledgedAt: deps.clock.nowIso(), grant: required.value(settings) },
      } });
      const result = await set({ deps: toWriteServiceDeps(routeDeps), input: { ...input, key: required.key, value: required.value(settings) } });
      return { ...settings, canEdit: true, revisionSeq: result.revisionSeq };
    },
  });
}
