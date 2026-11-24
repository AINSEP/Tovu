import type { Express, Response } from "express";
import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { checkHeldBackTheme, listHeldBackThemes, restoreHeldBackTheme } from "#src/features/theme/held-back-themes";
import { chosenThemeHeldBack, HeldBackThemeError, type HeldBackErrorCode } from "#src/features/theme/held-back-choice";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import type { RouteDeps } from "#src/server/routes/types";
import { bodyRecord } from "./explore.js";

/**
 * @file The Themes screen's "Held back on import" section: list the themes site import left in
 * `.import-quarantine/`, re-check one, and restore one the owner approved. Held-back ids carry a
 * slash (`static/foo`), so they travel in the body; the path is `held-back-themes`, not
 * `themes/...`, because `GET themes/:themeId` is registered earlier and would swallow it.
 */

/** Only what these three routes read — never the whole `RouteDeps` locator. */
export type HeldBackRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "themes" | "themesDir" | "siteBinding" | "presentationRepo">;

const BASE = "/api/admin/v1/workspaces/:workspaceId/held-back-themes";

const HELD_BACK_STATUS: Record<HeldBackErrorCode, number> = {
  INVALID_ID: 400,
  APPROVAL_REQUIRED: 400,
  HELD_BACK_NOT_FOUND: 404,
  CHECK_FAILED: 409,
  CHANGED_SINCE_CHECK: 409,
  NAME_TAKEN: 409,
};

/** Map a service refusal to its status; anything else is unexpected and gets an ERR- reference. */
function sendHeldBackFailure(required: { res: Response; error: unknown; operation: string }): void {
  const { res, error } = required;
  if (error instanceof HeldBackThemeError) {
    const problems = error.code === "CHECK_FAILED" ? { problems: error.problems } : {};
    res.status(HELD_BACK_STATUS[error.code]).json({ code: error.code, error: error.message, ...problems });
    return;
  }
  sendAdminFailure({ res, error }, { operation: required.operation, code: "INTERNAL_ERROR" });
}

/** Workspace guard + principal + one permission; `false` when a response was already sent. */
async function allowed(required: { req: Parameters<typeof rejectForeignWorkspace>[0]["req"]; res: Response; deps: HeldBackRouteDeps; permission: string }): Promise<boolean> {
  const { req, res, deps, permission } = required;
  if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return false;
  const params = { principalId: getAuthedPrincipal(res).id, permission, workspaceId: deps.workspaceId, entityType: "theme" };
  return authorizeDirectOrRespond({ res, authorize: deps.authorize, params });
}

/**
 * Registers the three held-back routes. Reading (list, check) is `theme.set`, the themes list's own
 * read gate; restoring creates live theme source, so it is `theme.edit` (as Duplicate is). Restore
 * never activates the theme — the screen's Activate button stays a separate, deliberate step.
 * @complexity O(1) registration.
 */
export function registerAdminHeldBackThemeRoutes(required: { app: Express; deps: HeldBackRouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const siteDir = () => deps.siteBinding.dir;

  app.get(BASE, async (req, res) => {
    try {
      if (!(await allowed({ req, res, deps, permission: "theme.set" }))) return;
      const active = (await deps.presentationRepo.findByWorkspaceId({ workspaceId: deps.workspaceId }))?.activeThemeId ?? null;
      res.json({
        themes: listHeldBackThemes({ siteDir: siteDir(), themesDir: deps.themesDir }),
        chosenThemeHeldBack: chosenThemeHeldBack({ siteDir: siteDir(), activeThemeId: active }),
      });
    } catch (error) { sendHeldBackFailure({ res, error, operation: "routes/themes/held-back/list" }); }
  });

  app.post(BASE + "/check", async (req, res) => {
    try {
      if (!(await allowed({ req, res, deps, permission: "theme.set" }))) return;
      const themeId = String(bodyRecord({ body: req.body }).themeId ?? "");
      res.json(checkHeldBackTheme({ siteDir: siteDir(), themesDir: deps.themesDir, themeId }));
    } catch (error) { sendHeldBackFailure({ res, error, operation: "routes/themes/held-back/check" }); }
  });

  app.post(BASE + "/restore", async (req, res) => {
    try {
      if (!(await allowed({ req, res, deps, permission: "theme.edit" }))) return;
      const body = bodyRecord({ body: req.body });
      const approvedDigest = typeof body.approvedDigest === "string" ? body.approvedDigest : "";
      const result = restoreHeldBackTheme({ siteDir: siteDir(), themesDir: deps.themesDir, themes: deps.themes, themeId: String(body.themeId ?? ""), approvedDigest });
      requestThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath });
      res.status(201).json(result);
    } catch (error) { sendHeldBackFailure({ res, error, operation: "routes/themes/held-back/restore" }); }
  });
}
