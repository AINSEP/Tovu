import { getEffective } from "../../../../features/settings/settings";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { SettingsRouteRegistrar } from "./deps";
import { CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION, resolveUserLayerReadTarget } from "./shared";

/**
 * GET the effective value of every setting registered in a namespace
 * (SPEC-007 api.spec.md `SETTINGS_GET_EFFECTIVE`, tasks.md T039).
 *
 * Path deviation: see `register-definitions.ts`'s header — this route
 * follows the codebase's established `/api/admin/v1/workspaces/:workspaceId/...`
 * mount convention rather than api.spec.md's literal (workspace-less) path.
 *
 * `getEffective`/`resolveDefinition` (`features/settings/settings.ts`) are
 * pure reads with no `authorize()` call of their own (unlike `write-service.ts`),
 * so this route does the explicit authorize-then-call dance itself, mirroring
 * `presentation/get.ts`.
 *
 * Query contract deviation (disclosed): api.spec.md §4 documents `workspaceId?`
 * as a request param, but it is NOT honored — the workspace always comes from the
 * authorized `deps.workspaceId`. `principalId` naming another principal requires
 * `settings.user.read`, which is what the Settings admin screen's target-principal
 * selector (`apps/admin/src/sections/Settings.tsx`, AC-23) gates itself on too.
 *
 * Enumerates every active key in the requested namespace across both the
 * platform partition (`workspaceId=null`, core/theme owners) and this
 * workspace's own site-owned partition — matches `resolveDefinitionRaw`'s own
 * fallback order (`settings.ts`), since `SettingsRepoPort.listActiveDefinitions`
 * only takes one exact `workspaceId` per call.
 */
export const registerAdminSettingsGetEffectiveRoute: SettingsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/settings/effective", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "settings.read",
        workspaceId: deps.workspaceId,
        entityType: "setting-value",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'settings.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "settings.read", reason: authResult.reason },
        });
        return;
      }

      const namespace = String(req.query.namespace ?? "");
      if (!namespace) {
        res.status(400).json({ error: "'namespace' query param is required", code: "VALIDATION_ERROR" });
        return;
      }
      // `authorize()` above was checked against `deps.workspaceId` and `principal.id` — never let
      // the actual read target a different workspace or principal than what was authorized.
      // The `:workspaceId` path param is already pinned to `deps.workspaceId` above; a
      // `workspaceId` query param is ignored rather than trusted (ADR-007).
      const workspaceId = deps.workspaceId;
      // Bug found while wiring up the settings-dialog Language tab's Spanish
      // locale (2026-07-31): every settings-dialog tab adapter
      // (`apps/admin/src/lib/ledger-slice.ts`'s `loadNamespaceValues`) calls
      // this route with NO `principalId` query param at all -- it just wants
      // "my own effective settings". Omitting the param used to resolve to
      // `requestedPrincipalId: undefined`, which `resolveUserLayerReadTarget`
      // returns as-is (`undefined` = "skip the user layer entirely" per that
      // function's own contract, correct for `get-raw.ts`'s multi-principal
      // ledger inspector). Fed into `getEffective`, that made its
      // `scopeContext.principalId` check (`settings.ts`'s
      // `if (workspaceId && principalId)`) always false, so a self-read could
      // NEVER see its own `scope=user` value -- it silently fell through to
      // workspace/global/default every time, on every reload, for every
      // `scope=user` setting (Notifications, Appearance, Language) -- the
      // save always worked; only reading it back was broken. Defaulting to
      // `principal.id` here (this route only, not the shared helper or
      // `get-raw.ts`) is exactly the self-read case `resolveUserLayerReadTarget`
      // already treats as free (no `settings.user.read` check, matches
      // `settings-read-scoping.test.ts`'s "F2 control: reading your OWN user
      // layer via ?principalId=<self>" case) and mirrors `write-service.ts`'s
      // own default-to-self (`input.principalId ?? input.callerPrincipalId`)
      // for the exact same "no explicit principal named" input shape.
      const readTarget = await resolveUserLayerReadTarget(deps, {
        requestedPrincipalId: req.query.principalId ? String(req.query.principalId) : principal.id,
        callerPrincipalId: principal.id,
      });
      if (!readTarget.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized to read another principal's user-layer value (${readTarget.reason})`,
          code: "FORBIDDEN",
          details: { permission: CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION, reason: readTarget.reason },
        });
        return;
      }
      const principalId = readTarget.principalId;

      const [platformDefs, siteDefs] = await Promise.all([
        deps.settingsRepo.listActiveDefinitions({ workspaceId: null }),
        deps.settingsRepo.listActiveDefinitions({ workspaceId }),
      ]);
      const keys = new Set(
        [...platformDefs, ...siteDefs].filter((d) => d.namespace === namespace).map((d) => d.key)
      );

      const data: Array<{ key: string; value: unknown; sourceLayer: string; defVersion: number }> = [];
      for (const key of keys) {
        const resolved = await getEffective(
          { repo: deps.settingsRepo },
          { namespace, key, scopeContext: { workspaceId, principalId } }
        );
        if (resolved) {
          data.push({
            key,
            value: resolved.value,
            sourceLayer: resolved.sourceLayer,
            defVersion: resolved.defVersion,
          });
        }
      }

      res.json({ data });
    } catch (err) {
      void err;
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
