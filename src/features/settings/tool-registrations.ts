/**
 * @file Settings' half of ADR-049 Decision 4 (SPEC-007): maps the wireable subset of
 * `agent-tools.ts`'s seven catalog entries onto the three read tools, as `ToolRegistration`s.
 * Reads only — nothing here mutates. See `features/settings/agent-tools.ts`'s own file header for
 * why every write entry is documented but deliberately never wired
 * ({@link UNWIRED_SETTINGS_TOOL_IDS}).
 *
 * Authorization shape: `getEffective`/`resolveDefinition` (`settings.ts`) and a direct
 * `settingsRepo.listActiveDefinitions`/`getGlobalValue`/`getWorkspaceValue`/`getUserValue` read
 * carry no `authorize()` call of their own — the admin routes gate inline
 * (`routes/admin/settings/get-effective.ts`, `get-raw.ts`, `list-definitions.ts`) — so every
 * handler here calls the kit's `requireToolPermission` itself, mirroring those routes' identical
 * checks. `resolveOwnOrOtherPrincipalRead` below deliberately duplicates (rather than imports)
 * `routes/admin/settings/shared.ts`'s `resolveUserLayerReadTarget` — this file is domain-owned
 * wiring, and importing logic from the HTTP admin layer would invert this codebase's ports/adapters
 * direction (features must not depend on server/routes); the two are kept behaviorally identical by
 * inspection, the same discipline `resolveUserLayerReadTarget`'s own header already asks of its two
 * route callers.
 */
import {
  buildDomainRegistrations,
  indexCatalogById,
  optionalString,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "../../assistant/tool-registration-kit";
import type { JsonValue } from "../../core/ports";
import type { RouteDeps } from "../../server/routes/types";
import { getSettingsAgentToolCatalog } from "./agent-tools";
import { getEffective, resolveDefinition } from "./settings";
import type { SettingValueRecord } from "./types";

const CATALOG_BY_ID = indexCatalogById(getSettingsAgentToolCatalog());

/** Permission gating a read that names a DIFFERENT principal than the caller — mirrors
 * `routes/admin/settings/shared.ts`'s `CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION` (kept as a literal
 * here per this file's header; the two are data, not logic, so duplication carries no drift risk
 * beyond a string comparison). */
const CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION = "settings.user.read";

/**
 * Decides which principal's user layer a settings read tool may target — the tool-wiring twin of
 * `routes/admin/settings/shared.ts`'s `resolveUserLayerReadTarget` (see this file's header for why
 * it is duplicated rather than imported).
 *
 * @throws {ForbiddenError} (`core/commands`, via `requireToolPermission`) If `requestedPrincipalId`
 * names a different principal than the caller and the caller lacks `settings.user.read`.
 * @returns The principal id to read (`undefined` = skip the user layer entirely).
 * @complexity O(1); at most one `authorize()` call (none for a self-read or no-op read).
 * @overallScore 100
 */
async function resolveOwnOrOtherPrincipalRead(
  routeDeps: RouteDeps,
  required: { requestedPrincipalId: string | undefined; callerPrincipalId: string }
): Promise<string | undefined> {
  const { requestedPrincipalId, callerPrincipalId } = required;
  if (!requestedPrincipalId || requestedPrincipalId === callerPrincipalId) return requestedPrincipalId;

  await requireToolPermission(routeDeps, {
    principalId: callerPrincipalId,
    permission: CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION,
    entityType: "setting-value",
  });
  return requestedPrincipalId;
}

function layerValueOf(record: SettingValueRecord | null): JsonValue | null {
  return record && record.state === "set" ? record.valueJson : null;
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration — and note that the four excluded writes appear NOWHERE here, which is
 * itself the strongest of the guards: an unclassified id cannot be wired at all.
 */
export const settingsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> settingsRepo.listActiveDefinitions() x2 (platform + this workspace): reads only.
  ["settings_list_definitions", "none"],
  // -> settingsRepo.listActiveDefinitions() x2 + getEffective() per key: reads only, no write path.
  ["settings_get_effective", "none"],
  // -> resolveDefinition() + settingsRepo.getGlobalValue/getWorkspaceValue/getUserValue: reads only.
  ["settings_get_raw", "none"],
]);

/** Settings catalog entries this pass does not wire, and why — see `features/settings/agent-tools.ts`'s own per-entry comments for the full reasoning. */
const UNWIRED_SETTINGS_TOOL_IDS = new Set([
  // EXCLUDED BY DESIGN: generic "set any setting key" — the human admin UI is itself an uncurated
  // free-text/raw-JSON editor, not a fixed named list (see agent-tools.ts file header).
  "settings_set",
  "settings_clear",
  // EXCLUDED BY DESIGN: bulk variant — clears every value in an operator-named namespace at a
  // scope in one call, irreversible.
  "settings_reset",
  // EXCLUDED BY DESIGN: schema-level, not value-level — can rename/retype/deprecate/tombstone the
  // definition a key resolves through, reinterpreting every existing stored value for that key
  // platform-wide. Closest analogue is `database_execute_migrate_forward`'s exclusion.
  "settings_register_definitions",
]);

export function buildSettingsRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    settings_list_definitions: async (ctx) => {
      requireNoInput(ctx.input);
      await routeDeps.settingsReady;
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "settings.read.definitions", entityType: "setting-definition" });

      const [platformDefs, siteDefs] = await Promise.all([
        routeDeps.settingsRepo.listActiveDefinitions({ workspaceId: null }),
        routeDeps.settingsRepo.listActiveDefinitions({ workspaceId: routeDeps.workspaceId }),
      ]);

      const data = [...platformDefs, ...siteDefs]
        .map((def) => ({ namespace: def.namespace, key: def.key, ownerKind: def.ownerKind, scopes: def.scopes, status: def.status, version: def.version }))
        .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key));

      return { data };
    },

    settings_get_effective: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const namespace = requireString(input, "namespace");
      await routeDeps.settingsReady;
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "settings.read", entityType: "setting-value" });

      const workspaceId = routeDeps.workspaceId;
      const principalId = await resolveOwnOrOtherPrincipalRead(routeDeps, {
        requestedPrincipalId: optionalString(input, "principalId"),
        callerPrincipalId: ctx.principal.id,
      });

      const [platformDefs, siteDefs] = await Promise.all([
        routeDeps.settingsRepo.listActiveDefinitions({ workspaceId: null }),
        routeDeps.settingsRepo.listActiveDefinitions({ workspaceId }),
      ]);
      const keys = new Set([...platformDefs, ...siteDefs].filter((d) => d.namespace === namespace).map((d) => d.key));

      const data: Array<{ key: string; value: unknown; sourceLayer: string; defVersion: number }> = [];
      for (const key of keys) {
        const resolved = await getEffective({ repo: routeDeps.settingsRepo }, { namespace, key, scopeContext: { workspaceId, principalId } });
        if (resolved) data.push({ key, value: resolved.value, sourceLayer: resolved.sourceLayer, defVersion: resolved.defVersion });
      }

      return { data };
    },

    settings_get_raw: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const namespace = requireString(input, "namespace");
      const key = requireString(input, "key");
      await routeDeps.settingsReady;
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "settings.read.raw", entityType: "setting-value" });

      const workspaceId = routeDeps.workspaceId;
      const principalId = await resolveOwnOrOtherPrincipalRead(routeDeps, {
        requestedPrincipalId: optionalString(input, "principalId"),
        callerPrincipalId: ctx.principal.id,
      });

      const definition = await resolveDefinition({ repo: routeDeps.settingsRepo }, { namespace, key, workspaceId });
      if (!definition) throw new Error(`definition '${namespace}.${key}' was not found`);

      const [globalValue, workspaceValue, userValue] = await Promise.all([
        routeDeps.settingsRepo.getGlobalValue(definition.settingId),
        routeDeps.settingsRepo.getWorkspaceValue({ workspaceId, settingId: definition.settingId }),
        principalId ? routeDeps.settingsRepo.getUserValue({ workspaceId, principalId, settingId: definition.settingId }) : Promise.resolve(null),
      ]);

      return {
        key: `${namespace}.${key}`,
        global: layerValueOf(globalValue),
        workspace: layerValueOf(workspaceValue),
        user: layerValueOf(userValue),
        default: definition.defaultValue,
      };
    },
  };

  return buildDomainRegistrations({
    domain: "settings",
    catalogModule: "features/settings/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: settingsDerivedRisk,
    unwiredToolIds: UNWIRED_SETTINGS_TOOL_IDS,
  });
}
