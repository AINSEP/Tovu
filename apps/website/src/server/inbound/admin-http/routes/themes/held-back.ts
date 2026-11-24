import type { Express } from "express";
import { defineJsonRoute, ok, type JsonRouteAuthorize } from "@jini-ai/core/contracts/server";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "@jini-ai/core/gated-mutations";
import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import { checkHeldBackTheme, listHeldBackThemes, restoreHeldBackTheme, type ExplainThemeTree } from "#src/features/theme/held-back-themes";
import { chosenThemeHeldBack, HeldBackThemeError, type HeldBackErrorCode } from "#src/features/theme/held-back-choice";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { gatedPrincipalKindFor, type OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { adminRequestFactsFor } from "#src/server/inbound/admin-http/admin-request-facts";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { confirm, execute, ForbiddenError, PlanStaleError, plan } from "#src/contracts/core/gated-mutations/gateway";
import type { GatedMutationHooks } from "@jini-ai/core/gated-mutations";

import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { buildHeldBackRestoreHooks, HELD_BACK_READ_PERMISSION, HELD_BACK_RESTORE_DOMAIN, HELD_BACK_RESTORE_PERMISSION, type HeldBackRestoreScope } from "#src/features/theme/held-back-gated-hooks";
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
export type HeldBackRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "themes" | "themesDir" | "siteBinding" | "presentationRepo" | "gatedMutations"> & {
  /** Site import's placement check, bound by the composition (the theme feature may not import site-backup). */
  explainThemeTree: ExplainThemeTree;
};

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

/** A service or approval refusal as the route's own response, or the error unchanged (it then gets an ERR- reference). */
function refusalFor(error: unknown): unknown {
  if (error instanceof HeldBackThemeError) {
    const problems = error.code === "CHECK_FAILED" ? { problems: error.problems } : {};
    return new RouteRefusalError({ status: HELD_BACK_STATUS[error.code], body: { code: error.code, error: error.message, ...problems } });
  }
  const refused = gatewayFailure(error);
  if (refused && error instanceof Error) return new RouteRefusalError({ status: refused.status, body: { code: refused.code, error: error.message } });
  return error;
}

/** Runs one route's work; a known refusal leaves as its response, anything else as the original error. */
async function refusing<T>(run: () => Promise<T> | T): Promise<T> {
  try { return await run(); } catch (error) { throw refusalFor(error); }
}

/** One permission on the owner's `theme` entity, answered directly from RBAC (never a publishing grant).
 * A route without an authorizer is a wiring bug, so it fails closed. */
async function permit(authorize: JsonRouteAuthorize | undefined, permission: string): Promise<void> {
  if (!authorize) throw new Error("held-back route has no authorizer");
  await authorize({ permission, entityType: "theme" });
}

/** The gateway's view of who is asking: id plus actor class (an agent may never confirm). */
function actor(context: OperatorPrincipalRecord | undefined): { principalId: string; principalKind: ReturnType<typeof gatedPrincipalKindFor> } {
  if (!context) throw new Error("getAuthedPrincipal: no principal on res.locals — requireAdminSession must run before this route");
  return { principalId: context.id, principalKind: gatedPrincipalKindFor(adminRequestFactsFor({ context }).credentialKind) };
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

type Principal = OperatorPrincipalRecord;

/** The themes list: what site import left in `.import-quarantine/`, plus the notice when the chosen theme is among it. */
const listRoute = defineJsonRoute<undefined, unknown, HeldBackRouteDeps, Principal>({
  method: "get",
  path: BASE,
  parse: () => ok({ value: undefined }),
  handle: ({ deps, authorize }) => refusing(async () => {
    await permit(authorize, HELD_BACK_READ_PERMISSION);
    const active = (await deps.presentationRepo.findByWorkspaceId({ workspaceId: deps.workspaceId }))?.activeThemeId ?? null;
    return ok({ value: {
      themes: listHeldBackThemes({ siteDir: deps.siteBinding.dir, themesDir: deps.themesDir }),
      chosenThemeHeldBack: chosenThemeHeldBack({ siteDir: deps.siteBinding.dir, activeThemeId: active }),
    } });
  }),
});

/** `/check`: the fresh re-check, plus — only when it passes — the plan the approval card confirms. */
const checkRoute = defineJsonRoute<{ themeId: string }, unknown, HeldBackRouteDeps, Principal>({
  method: "post",
  path: BASE + "/check",
  parse: (raw) => ok({ value: { themeId: String(bodyRecord({ body: raw.body }).themeId ?? "") } }),
  handle: ({ input, deps, context, authorize }) => refusing(async () => {
    await permit(authorize, HELD_BACK_READ_PERMISSION);
    const check = checkHeldBackTheme({ siteDir: deps.siteBinding.dir, themesDir: deps.themesDir, themeId: input.themeId, explainThemeTree: deps.explainThemeTree });
    const planned = check.passes && check.digest
      ? await plan({ deps: deps.gatedMutations.gatewayDeps, ...actor(context), hooks: restoreHooks({ deps, scope: { themeId: check.themeId, digest: check.digest } }) })
      : null;
    return ok({ value: { ...check, approval: planned ? { planId: planned.planId, planHash: planned.planHash } : null } });
  }),
});

/**
 * `/restore/approval`: the approval card's answer. Only an explicit `"approve"` mints a token —
 * a decline, or any other value, mints nothing, so there is nothing a later restore could redeem.
 */
const approvalRoute = defineJsonRoute<{ decision: unknown; planId: string; planHash: string }, unknown, HeldBackRouteDeps, Principal>({
  method: "post",
  path: BASE + "/restore/approval",
  parse: (raw) => {
    const body = bodyRecord({ body: raw.body });
    return ok({ value: { decision: body.decision, planId: stringField(body, "planId"), planHash: stringField(body, "planHash") } });
  },
  handle: ({ input, deps, context, authorize }) => refusing(async () => {
    await permit(authorize, HELD_BACK_RESTORE_PERMISSION);
    if (input.decision !== "approve") return ok({ value: { approved: false } });
    const { planId, planHash } = input;
    if (!planId || !planHash) throw approvalRequired();
    const hooks = buildConfirmOnlyHooks({ domain: HELD_BACK_RESTORE_DOMAIN, readPermission: HELD_BACK_READ_PERMISSION, mutatePermission: HELD_BACK_RESTORE_PERMISSION, scopeId: deps.workspaceId });
    const record = await confirm({ deps: deps.gatedMutations.gatewayDeps, ...actor(context), hooks, planId, planHash });
    return ok({ value: { approved: true, confirmationToken: record.confirmationToken } });
  }),
});

/**
 * `/restore`: redeems the approval, then moves the theme. The gateway re-authorizes, checks the
 * token is unspent and was confirmed by this actor in this workspace, and re-derives the plan for
 * this theme at the echoed digest; the move itself then re-checks the files against that digest.
 * The token is spent before the move, so a move refused for changed files needs a fresh approval.
 */
const restoreRoute = defineJsonRoute<{ themeId: string; approvedDigest: string; confirmationToken: string }, unknown, HeldBackRouteDeps, Principal>({
  method: "post",
  path: BASE + "/restore",
  parse: (raw) => {
    const body = bodyRecord({ body: raw.body });
    return ok({ value: { themeId: String(body.themeId ?? ""), approvedDigest: stringField(body, "approvedDigest"), confirmationToken: stringField(body, "confirmationToken") } });
  },
  handle: ({ input, deps, context, authorize }) => refusing(async () => {
    await permit(authorize, HELD_BACK_RESTORE_PERMISSION);
    const { themeId, approvedDigest, confirmationToken } = input;
    if (!approvedDigest || !confirmationToken) throw approvalRequired();
    const restore = () => restoreHeldBackTheme({ siteDir: deps.siteBinding.dir, themesDir: deps.themesDir, themes: deps.themes, themeId, approvedDigest, explainThemeTree: deps.explainThemeTree });
    const result = await execute({ deps: deps.gatedMutations.gatewayDeps, ...actor(context), hooks: restoreHooks({ deps, scope: { themeId, digest: approvedDigest }, restore }), confirmationToken });
    requestThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath });
    return ok({ value: result });
  }),
}, { successStatus: 201 });

/** These routes never consulted a publishing grant: RBAC answers directly, and an unexpected failure names its step. */
const mountOptions = (step: string): AdminJsonRouteMountOptions => ({ authorization: "direct", failure: { operation: `routes/themes/held-back/${step}`, code: "INTERNAL_ERROR" } });

/**
 * Registers the four held-back routes. Reading (list, check) is `theme.set`, the themes list's own
 * read gate; approving and restoring create live theme source, so they are `theme.edit` (as
 * Duplicate is). Restore never activates the theme — the screen's Activate button stays a separate,
 * deliberate step.
 * @complexity O(1) registration.
 */
export function registerAdminHeldBackThemeRoutes(required: { app: Express; deps: HeldBackRouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  mountAdminJsonRoute({ app, spec: listRoute, deps }, mountOptions("list"));
  mountAdminJsonRoute({ app, spec: checkRoute, deps }, mountOptions("check"));
  mountAdminJsonRoute({ app, spec: approvalRoute, deps }, mountOptions("approval"));
  mountAdminJsonRoute({ app, spec: restoreRoute, deps }, mountOptions("restore"));
}
