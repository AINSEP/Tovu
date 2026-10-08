import type { SettingsRouteRegistrar } from "./deps.js";
import { createTovuSettingsService, mountSettingsJsonRoute } from "./shared.js";

/**
 * GET active setting definitions, grouped by namespace (SPEC-007 api.spec.md
 * `SETTINGS_LIST_DEFINITIONS`, spec.md line ~21).
 *
 * Path deviation: see `register-definitions.ts`'s header — this route follows
 * the codebase's established `/api/admin/v1/workspaces/:workspaceId/...` mount
 * convention rather than api.spec.md's literal (workspace-less) path.
 *
 * Enumerates both the platform partition (`workspaceId=null`, core/theme
 * owners) and this workspace's own site-owned partition — the identical
 * two-call merge `get-effective.ts` already uses for the same reason
 * (`SettingsRepoPort.listActiveDefinitions` only takes one exact `workspaceId`
 * per call). `listActiveDefinitions` itself already filters to `active`/`alias`
 * status rows (see both repo adapters), matching this endpoint's "active
 * definitions" purpose. Sorted by `(namespace, key)` for a stable, grouped-by-
 * namespace listing — api.spec.md's `DefinitionsResponse` is a flat array, not
 * a nested-by-namespace structure, so ordering (not nesting) is what
 * "grouped by namespace" means here.
 */
export const registerAdminSettingsListDefinitionsRoute: SettingsRouteRegistrar = (app, deps) => {
  mountSettingsJsonRoute({ app, deps, method: "get", path: "/api/admin/v1/workspaces/:workspaceId/settings/definitions",
    handle: async ({ authorize }) => {
      await authorize({ permission: "settings.read.definitions", entityType: "setting-definition" });

      const definitions = await createTovuSettingsService({ deps }).listDefinitions({ workspaceId: deps.workspaceId });
      const data = definitions
        .map((def) => ({
          namespace: def.namespace,
          key: def.key,
          ownerKind: def.ownerKind,
          scopes: def.scopes,
          status: def.status,
          version: def.version,
        }))
        .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key));

      return { data };
    },
  });
};
