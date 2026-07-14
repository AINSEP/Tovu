import type { JsonValue, UUID } from "../../core/ports";
import type { SettingOwnerKind, SettingValueSchema } from "./types";
import { renameDefinition, retypeDefinition, deprecateDefinition, tombstoneDefinition } from "./write-service";
import type { SettingsWriteServiceDeps } from "./write-service";

/**
 * @file `SETTINGS_REGISTER_DEFINITIONS` per-op dispatch (ADR-042 item 2).
 *
 * The route handler's inline `switch (op)` was the highest-complexity function in the
 * codebase (cyclomatic 20 / cognitive 57) because four of its five branches were the same
 * shape: parse the raw request item, call one write-service function, record `applied`.
 * This table is that shape, written once per op; the route becomes a lookup + call.
 *
 * `register` is deliberately NOT here — it batches every item into a single
 * `registerDefinitions()` call (one shared `authorize()` check for the whole batch) instead
 * of running one write per item, so it stays a route-level special case alongside the
 * `default: unknown op` branch.
 */

/** The raw request-body shape for a non-`register` op item, already namespace/key/workspace-normalized. */
export interface DefinitionOpRequestItem {
  namespace: string;
  key: string;
  ownerKind: SettingOwnerKind;
  workspaceId: UUID | null;
  newNamespace?: string;
  newKey?: string;
  schemaJson?: SettingValueSchema;
  defaultJson?: JsonValue | null;
  coercionJson?: string | { tag?: string };
}

export interface DefinitionOpContext {
  deps: SettingsWriteServiceDeps;
  callerPrincipalId: UUID;
  authWorkspaceId: UUID;
}

export type DefinitionOpHandler = (ctx: DefinitionOpContext, item: DefinitionOpRequestItem) => Promise<void>;

/** `coercionJson` may arrive as a bare coercer tag string or `{tag}`; defaults to the identity coercer. */
function resolveCoercionTag(coercionJson: string | { tag?: string } | undefined): string {
  return typeof coercionJson === "string" ? coercionJson : (coercionJson?.tag ?? "identity");
}

export const NON_REGISTER_DEFINITION_OPS: Record<string, DefinitionOpHandler> = {
  rename: async (ctx, item) => {
    await renameDefinition({
      deps: ctx.deps,
      input: {
        namespace: item.namespace,
        key: item.key,
        workspaceId: item.workspaceId,
        newNamespace: item.newNamespace ?? "",
        newKey: item.newKey ?? "",
        callerPrincipalId: ctx.callerPrincipalId,
        authWorkspaceId: ctx.authWorkspaceId,
      },
    });
  },
  retype: async (ctx, item) => {
    await retypeDefinition({
      deps: ctx.deps,
      input: {
        namespace: item.namespace,
        key: item.key,
        workspaceId: item.workspaceId,
        schema: item.schemaJson as SettingValueSchema,
        defaultValue: item.defaultJson ?? null,
        coercionTag: resolveCoercionTag(item.coercionJson),
        newNamespace: item.newNamespace,
        newKey: item.newKey,
        callerPrincipalId: ctx.callerPrincipalId,
        authWorkspaceId: ctx.authWorkspaceId,
      },
    });
  },
  deprecate: async (ctx, item) => {
    await deprecateDefinition({
      deps: ctx.deps,
      input: {
        namespace: item.namespace,
        key: item.key,
        workspaceId: item.workspaceId,
        callerPrincipalId: ctx.callerPrincipalId,
        authWorkspaceId: ctx.authWorkspaceId,
      },
    });
  },
  tombstone: async (ctx, item) => {
    await tombstoneDefinition({
      deps: ctx.deps,
      input: {
        namespace: item.namespace,
        key: item.key,
        workspaceId: item.workspaceId,
        callerPrincipalId: ctx.callerPrincipalId,
        authWorkspaceId: ctx.authWorkspaceId,
      },
    });
  },
};
