import type { Express, Response } from "express";
import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { checkHeldBackTheme, listHeldBackThemes, restoreHeldBackTheme } from "#src/features/theme/held-back-themes";
import { chosenThemeHeldBack, HeldBackThemeError, type HeldBackErrorCode } from "#src/features/theme/held-back-choice";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { gatedPrincipalKindFor, getAuthedCredentialKind, getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { confirm, execute, ForbiddenError, PlanStaleError, plan } from "#src/contracts/core/gated-mutations/gateway";
import type { GatedMutationHooks } from "@jini-ai/core/gated-mutations";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "#src/contracts/core/gated-mutations/token";
import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { buildHeldBackRestoreHooks, HELD_BACK_READ_PERMISSION, HELD_BACK_RESTORE_DOMAIN, HELD_BACK_RESTORE_PERMISSION, type HeldBackRestoreScope } from "#src/features/theme/held-back-gated-hooks";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import type { RouteDeps } from "#src/server/routes/types";
import { bodyRecord } from "@jini-ai/cms/admin-http/routes/themes/explore-shared";

/**
 * @file The Themes screen's "Held back on import" section: list the themes site import left in
 * `.import-quarantine/`, re-check one, and restore one the owner approved. Held-back ids carry a
 * slash (`static/foo`), so they travel in the body; the path is `held-back-themes`, not
 * `themes/...`, because `GET themes/:themeId` is registered earlier and would swallow it.
 *
 * Restore is the shared plan -> confirm -> execute ceremony: a passing `/check` returns a plan,
 * the approval card's click posts it to `/restore/approval` (which mints a single-use token only
 * for an explicit `"approve"`), and `/restore` redeems that token. The digest the check returned
 * still travels with the restore, but only as the version check — it is no longer the approval.
 */

/** Only what these three routes read — never the whole `RouteDeps` locator. */
export type HeldBackRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "themes" | "themesDir" | "siteBinding" | "presentationRepo" | "gatedMutations">;

const BASE = "/api/admin/v1/workspaces/:workspaceId/held-back-themes";

const HELD_BACK_STATUS: Record<HeldBackErrorCode, number> = {
  INVALID_ID: 400,
  APPROVAL_REQUIRED: 400,
  HELD_BACK_NOT_FOUND: 404,
  CHECK_FAILED: 409,
  CHANGED_SINCE_CHECK: 409,
  NAME_TAKEN: 409,
  LIVE_FOLDER_UNSAFE: 409,
};

/** The approval gateway's refusals (same mapping as the other gated routes), or `null`. */
function gatewayFailure(error: unknown): { status: number; code: string } | null {
  if (error instanceof ForbiddenError) return { status: 403, code: error.reasonCode };
  if (error instanceof PlanStaleError) return { status: 409, code: "PLAN_STALE" };
  if (error instanceof TokenExpiredError) return { status: 409, code: "TOKEN_EXPIRED" };
  if (error instanceof TokenAlreadyRedeemedError) return { status: 409, code: "TOKEN_ALREADY_REDEEMED" };
  return null;
}

/** Map a service or approval refusal to its status; anything else is unexpected and gets an ERR- reference. */
function sendHeldBackFailure(required: { res: Response; error: unknown; operation: string }): void {
  const { res, error } = required;
  if (error instanceof HeldBackThemeError) {
    const problems = error.code === "CHECK_FAILED" ? { problems: error.problems } : {};
    res.status(HELD_BACK_STATUS[error.code]).json({ code: error.code, error: error.message, ...problems });
    return;
  }
  const refused = gatewayFailure(error);
  if (refused && error instanceof Error) { res.status(refused.status).json({ code: refused.code, error: error.message }); return; }
  sendAdminFailure({ res, error }, { operation: required.operation, code: "INTERNAL_ERROR" });
}

/** Workspace guard + principal + one permission; `false` when a response was already sent. */
async function allowed(required: { req: Parameters<typeof rejectForeignWorkspace>[0]["req"]; res: Response; deps: HeldBackRouteDeps; permission: string }): Promise<boolean> {
  const { req, res, deps, permission } = required;
  if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return false;
  const params = { principalId: getAuthedPrincipal(res).id, permission, workspaceId: deps.workspaceId, entityType: "theme" };
  return authorizeDirectOrRespond({ res, authorize: deps.authorize, params });
}

/** The gateway's view of who is asking: id plus actor class (an agent may never confirm). */
function actor(res: Response): { principalId: string; principalKind: ReturnType<typeof gatedPrincipalKindFor> } {
  return { principalId: getAuthedPrincipal(res).id, principalKind: gatedPrincipalKindFor(getAuthedCredentialKind(res)) };
}

function stringField(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? (body[key] as string) : "";
}

const approvalRequired = () => new HeldBackThemeError({ code: "APPROVAL_REQUIRED", message: "Approve restoring this theme on the approval card first." });

/** Hooks for one theme at one version; `restore` defaults to a tripwire because plan() never restores. */
function restoreHooks(required: { deps: HeldBackRouteDeps; scope: Omit<HeldBackRestoreScope, "workspaceId" | "siteDir">; restore?: () => unknown }): GatedMutationHooks<unknown, unknown> {
  const { deps, scope } = required;
  const restore = required.restore ?? (() => { throw new Error("held-back plan hooks never restore"); });
  return buildHeldBackRestoreHooks({ scope: { workspaceId: deps.workspaceId, siteDir: deps.siteBinding.dir, ...scope }, restore }) as GatedMutationHooks<unknown, unknown>;
}

/** `/check`: the fresh re-check, plus — only when it passes — the plan the approval card confirms. */
function registerCheckRoute({ app, deps }: { app: Express; deps: HeldBackRouteDeps }): void {
  app.post(BASE + "/check", async (req, res) => {
    try {
      if (!(await allowed({ req, res, deps, permission: HELD_BACK_READ_PERMISSION }))) return;
      const themeId = String(bodyRecord({ body: req.body }).themeId ?? "");
      const check = checkHeldBackTheme({ siteDir: deps.siteBinding.dir, themesDir: deps.themesDir, themeId });
      const planned = check.passes && check.digest
        ? await plan({ deps: deps.gatedMutations.gatewayDeps, ...actor(res), hooks: restoreHooks({ deps, scope: { themeId: check.themeId, digest: check.digest } }) })
        : null;
      res.json({ ...check, approval: planned ? { planId: planned.planId, planHash: planned.planHash } : null });
    } catch (error) { sendHeldBackFailure({ res, error, operation: "routes/themes/held-back/check" }); }
  });
}

/**
 * `/restore/approval`: the approval card's answer. Only an explicit `"approve"` mints a token —
 * a decline, or any other value, mints nothing, so there is nothing a later restore could redeem.
 */
function registerApprovalRoute({ app, deps }: { app: Express; deps: HeldBackRouteDeps }): void {
  app.post(BASE + "/restore/approval", async (req, res) => {
    try {
      if (!(await allowed({ req, res, deps, permission: HELD_BACK_RESTORE_PERMISSION }))) return;
      const body = bodyRecord({ body: req.body });
      if (body.decision !== "approve") { res.json({ approved: false }); return; }
      const planId = stringField(body, "planId");
      const planHash = stringField(body, "planHash");
      if (!planId || !planHash) throw approvalRequired();
      const hooks = buildConfirmOnlyHooks({ domain: HELD_BACK_RESTORE_DOMAIN, readPermission: HELD_BACK_READ_PERMISSION, mutatePermission: HELD_BACK_RESTORE_PERMISSION, scopeId: deps.workspaceId });
      const record = await confirm({ deps: deps.gatedMutations.gatewayDeps, ...actor(res), hooks, planId, planHash });
      res.json({ approved: true, confirmationToken: record.confirmationToken });
    } catch (error) { sendHeldBackFailure({ res, error, operation: "routes/themes/held-back/approval" }); }
  });
}

/**
 * `/restore`: redeems the approval, then moves the theme. The gateway re-authorizes, checks the
 * token is unspent and was confirmed by this actor in this workspace, and re-derives the plan for
 * this theme at the echoed digest; the move itself then re-checks the files against that digest.
 * The token is spent before the move, so a move refused for changed files needs a fresh approval.
 */
function registerRestoreRoute({ app, deps }: { app: Express; deps: HeldBackRouteDeps }): void {
  app.post(BASE + "/restore", async (req, res) => {
    try {
      if (!(await allowed({ req, res, deps, permission: HELD_BACK_RESTORE_PERMISSION }))) return;
      const body = bodyRecord({ body: req.body });
      const themeId = String(body.themeId ?? "");
      const approvedDigest = stringField(body, "approvedDigest");
      const confirmationToken = stringField(body, "confirmationToken");
      if (!approvedDigest || !confirmationToken) throw approvalRequired();
      const restore = () => restoreHeldBackTheme({ siteDir: deps.siteBinding.dir, themesDir: deps.themesDir, themes: deps.themes, themeId, approvedDigest });
      const result = await execute({ deps: deps.gatedMutations.gatewayDeps, ...actor(res), hooks: restoreHooks({ deps, scope: { themeId, digest: approvedDigest }, restore }), confirmationToken });
      requestThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath });
      res.status(201).json(result);
    } catch (error) { sendHeldBackFailure({ res, error, operation: "routes/themes/held-back/restore" }); }
  });
}

/**
 * Registers the four held-back routes. Reading (list, check) is `theme.set`, the themes list's own
 * read gate; approving and restoring create live theme source, so they are `theme.edit` (as
 * Duplicate is). Restore never activates the theme — the screen's Activate button stays a separate,
 * deliberate step.
 * @complexity O(1) registration.
 */
export function registerAdminHeldBackThemeRoutes(required: { app: Express; deps: HeldBackRouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;

  app.get(BASE, async (req, res) => {
    try {
      if (!(await allowed({ req, res, deps, permission: HELD_BACK_READ_PERMISSION }))) return;
      const active = (await deps.presentationRepo.findByWorkspaceId({ workspaceId: deps.workspaceId }))?.activeThemeId ?? null;
      res.json({
        themes: listHeldBackThemes({ siteDir: deps.siteBinding.dir, themesDir: deps.themesDir }),
        chosenThemeHeldBack: chosenThemeHeldBack({ siteDir: deps.siteBinding.dir, activeThemeId: active }),
      });
    } catch (error) { sendHeldBackFailure({ res, error, operation: "routes/themes/held-back/list" }); }
  });
  registerCheckRoute({ app, deps });
  registerApprovalRoute({ app, deps });
  registerRestoreRoute({ app, deps });
}
