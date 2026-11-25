import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "@jini-ai/core/gated-mutations";
import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import { checkHeldBackTheme, listHeldBackThemes, restoreHeldBackTheme, type ExplainThemeTree } from "#src/features/theme/held-back-themes";
import { chosenThemeHeldBack, HeldBackThemeError } from "#src/features/theme/held-back-choice";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import {
  heldBackApprovalRoute, heldBackCheckRoute, heldBackListRoute, heldBackRestoreRoute,
  type HeldBackFailureDeps, type HeldBackGatewayFailure, type HeldBackServiceFailure,
} from "@jini-ai/cms/admin-http/routes/themes/held-back";
import { gatedPrincipalKindFor, type OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { adminRequestFactsFor } from "#src/server/inbound/admin-http/admin-request-facts";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { confirm, execute, ForbiddenError, PlanStaleError, plan } from "#src/contracts/core/gated-mutations/gateway";
import type { GatedMutationHooks } from "@jini-ai/core/gated-mutations";

import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { buildHeldBackRestoreHooks, HELD_BACK_READ_PERMISSION, HELD_BACK_RESTORE_DOMAIN, HELD_BACK_RESTORE_PERMISSION, type HeldBackRestoreScope } from "#src/features/theme/held-back-gated-hooks";
import type { RouteDeps } from "#src/server/routes/types";

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

/** The held-back service's refusal, read off the thrown error (the status and body rules are the Jini spec's). */
function heldBackFailure({ err }: { err: unknown }): HeldBackServiceFailure | undefined {
  return err instanceof HeldBackThemeError ? { code: err.code, message: err.message, problems: err.problems } : undefined;
}

/** The approval gateway's refusals (same mapping as the other gated routes), or `undefined`. */
function gatewayFailure({ err }: { err: unknown }): HeldBackGatewayFailure | undefined {
  if (!(err instanceof Error)) return undefined;
  if (err instanceof ForbiddenError) return { status: 403, code: err.reasonCode, message: err.message };
  if (err instanceof PlanStaleError) return { status: 409, code: "PLAN_STALE", message: err.message };
  if (err instanceof TokenExpiredError) return { status: 409, code: "TOKEN_EXPIRED", message: err.message };
  if (err instanceof TokenAlreadyRedeemedError) return { status: 409, code: "TOKEN_ALREADY_REDEEMED", message: err.message };
  return undefined;
}

const failures: HeldBackFailureDeps = { heldBackFailure, gatewayFailure };

/** The gateway's view of who is asking: id plus actor class (an agent may never confirm). */
function actor(context: OperatorPrincipalRecord): { principalId: string; principalKind: ReturnType<typeof gatedPrincipalKindFor> } {
  return { principalId: context.id, principalKind: gatedPrincipalKindFor(adminRequestFactsFor({ context }).credentialKind) };
}

/** Hooks for one theme at one version; `restore` defaults to a tripwire because plan() never restores. */
function restoreHooks(required: { deps: HeldBackRouteDeps; scope: Omit<HeldBackRestoreScope, "workspaceId" | "siteDir">; restore?: () => unknown }): GatedMutationHooks<unknown, unknown> {
  const { deps, scope } = required;
  const restore = required.restore ?? (() => { throw new Error("held-back plan hooks never restore"); });
  return buildHeldBackRestoreHooks({ scope: { workspaceId: deps.workspaceId, siteDir: deps.siteBinding.dir, ...scope }, restore }) as GatedMutationHooks<unknown, unknown>;
}

const checkRoute = heldBackCheckRoute<OperatorPrincipalRecord>();
const approvalRoute = heldBackApprovalRoute<OperatorPrincipalRecord>();
const restoreRoute = heldBackRestoreRoute<OperatorPrincipalRecord>();

/** These routes never consulted a publishing grant: RBAC answers directly, and an unexpected failure names its step. */
const mountOptions = (step: string): AdminJsonRouteMountOptions => ({ authorization: "direct", failure: { operation: `routes/themes/held-back/${step}`, code: "INTERNAL_ERROR" } });

/**
 * Registers the four held-back routes: the specs are Jini's (`@jini-ai/cms/admin-http/routes/themes/held-back`);
 * this binds the held-back check, the plan -> confirm -> execute gateway, the theme move and the
 * preview refresh as their injected ops. Reading (list, check) is `theme.set`, the themes list's
 * own read gate; approving and restoring create live theme source, so they are `theme.edit` (as
 * Duplicate is). Restore never activates the theme — the screen's Activate button stays a separate,
 * deliberate step.
 * @complexity O(1) registration.
 */
export function registerAdminHeldBackThemeRoutes(required: { errors: RouteErrorPorts; app: Express; deps: HeldBackRouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const { siteBinding, themesDir, themes, explainThemeTree } = deps;
  const gateway = deps.gatedMutations.gatewayDeps;
  mountAdminJsonRoute({ errors: required.errors, app, spec: heldBackListRoute, deps: { ...deps, ...failures, listHeldBack: async () => {
    const active = (await deps.presentationRepo.findByWorkspaceId({ workspaceId: deps.workspaceId }))?.activeThemeId ?? null;
    return { themes: listHeldBackThemes({ siteDir: siteBinding.dir, themesDir }), chosenThemeHeldBack: chosenThemeHeldBack({ siteDir: siteBinding.dir, activeThemeId: active }) };
  } } }, mountOptions("list"));
  mountAdminJsonRoute({ errors: required.errors, app, spec: checkRoute, deps: { ...deps, ...failures,
    checkTheme: ({ themeId }) => ({ ...checkHeldBackTheme({ siteDir: siteBinding.dir, themesDir, themeId, explainThemeTree }) }),
    planRestore: ({ principal, themeId, digest }) => plan({ deps: gateway, ...actor(principal), hooks: restoreHooks({ deps, scope: { themeId, digest } }) }),
  } }, mountOptions("check"));
  mountAdminJsonRoute({ errors: required.errors, app, spec: approvalRoute, deps: { ...deps, ...failures,
    confirmRestore: ({ principal, planId, planHash }) => {
      const hooks = buildConfirmOnlyHooks({ domain: HELD_BACK_RESTORE_DOMAIN, readPermission: HELD_BACK_READ_PERMISSION, mutatePermission: HELD_BACK_RESTORE_PERMISSION, scopeId: deps.workspaceId });
      return confirm({ deps: gateway, ...actor(principal), hooks, planId, planHash });
    },
  } }, mountOptions("approval"));
  mountAdminJsonRoute({ errors: required.errors, app, spec: restoreRoute, deps: { ...deps, ...failures,
    restoreTheme: ({ principal, themeId, approvedDigest, confirmationToken }) => {
      const restore = () => restoreHeldBackTheme({ siteDir: siteBinding.dir, themesDir, themes, themeId, approvedDigest, explainThemeTree });
      return execute({ deps: gateway, ...actor(principal), hooks: restoreHooks({ deps, scope: { themeId, digest: approvedDigest }, restore }), confirmationToken });
    },
    refreshPreviews: () => requestThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath }),
  } }, mountOptions("restore"));
}
