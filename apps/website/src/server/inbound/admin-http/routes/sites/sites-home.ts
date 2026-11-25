/**
 * The sites-settings save route (`PUT .../system/sites/config`) and the Node directory probe the
 * settings rules inspect folders through.
 *
 * K1 (RT-K1-adm-sites-2): the settings read and the home choice are Jini specs
 * (`@jini-ai/cms/admin-http/routes/sites/sites-home`, mounted by `runtime/composition/modules/sites.ts`).
 * The save is the same family's `sitesConfigSaveRoute`, mounted here with two opt-ins: the deployment gate answers
 * after the workspace 404 and before the session read (`afterWorkspace`), and an unexpected failure answers
 * "Could not read sites settings." before authorization and "Could not save sites settings." after it
 * (`failureByPhase`). This file keeps the host values: the enablement flag, the Node folder probe and the
 * platform's settings-patch rules.
 */
import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";
import { rejectRoute } from "@jini-ai/core/errors/route-refusal";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { UUID } from "@jini-ai/core/primitives";
import { DirectoryUserConfigRefusal, validateDirectoryUserConfig } from "@jini-ai/platform/fs";
import { SITES_SETTINGS_DISABLED_MESSAGE, sitesConfigSaveRoute, type SitesDirectoryProbe } from "@jini-ai/cms/admin-http/routes/sites/sites-home";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "../../admin-json-route-ports.js";
import type { SitesWorkspace } from "#src/platform/site-dir/index";

/** What the settings routes read. */
export type SitesSettingsDeps = { workspaceId: UUID; authorize: AuthorizeFn; isSiteSwitcherEnabled: () => boolean };

/** Folder inspection over `node:fs`. Only "not found" is an answer; any other stat failure (EACCES,
 * an I/O error) propagates, so it is a correlated 500 and never a public validation message.
 * @complexity O(1) stat probes. */
export const nodeSitesDirectoryProbe: SitesDirectoryProbe = {
  isAbsolute: ({ directory }) => path.isAbsolute(directory),
  kind: ({ directory }) => {
    try {
      return fs.statSync(directory).isDirectory() ? "directory" : "other";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return "missing";
    }
  },
  parentExists: ({ directory }) => fs.existsSync(path.dirname(directory)),
};

/** The platform's refusal for a malformed settings patch is a flat 400 with its own message, wherever in the save it is thrown
 * (the patch rules, or the write re-checking the folders). Anything else is unexpected and passes through.
 * @complexity O(1) beyond `run`. */
function asRouteRefusal<T>({ run }: { run: () => T }, _optional: Record<string, never> = {}): T {
  try { return run(); } catch (error) {
    if (error instanceof DirectoryUserConfigRefusal) rejectRoute({ status: 400, error: error.message });
    throw error;
  }
}

/** `PUT .../system/sites/config` — save the sites settings: mounts Jini's spec over this host's workspace, folder probe and patch rules.
 * @complexity O(1) setup; per request as the spec. */
export function registerSitesConfigSaveRoute({ app, deps, workspace }: { app: Express; deps: SitesSettingsDeps; workspace: SitesWorkspace }, _options = {}): void {
  // `authorize` is read per request so a later reassignment of `deps.authorize` is honoured.
  const portDeps: AdminJsonRoutePortDeps = { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
  const failure = (message: string) => ({ operation: "routes/sites/sites-home", code: "INTERNAL_ERROR", message });
  mountAdminJsonRoute(
    {
      app, spec: sitesConfigSaveRoute,
      deps: {
        ...portDeps,
        directories: nodeSitesDirectoryProbe,
        validatePatch: ({ value }) => asRouteRefusal({ run: () => validateDirectoryUserConfig({ value }) }),
        // The spec hands back the very patch `validatePatch` returned, so it is the platform's own type again here.
        workspace: { updateConfig: ({ patch }) => asRouteRefusal({ run: () => workspace.updateConfig({ patch: patch as Parameters<SitesWorkspace["updateConfig"]>[0]["patch"] }) }) },
      },
    },
    {
      authorization: "guarded",
      afterWorkspace: () => (deps.isSiteSwitcherEnabled() ? undefined : { status: 403, body: { error: SITES_SETTINGS_DISABLED_MESSAGE } }),
      failureByPhase: { beforeAuthorize: failure("Could not read sites settings."), afterAuthorize: failure("Could not save sites settings.") },
    },
  );
}
