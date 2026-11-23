import { adminFailureResponse, type AdminFailurePorts } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";

import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { PrincipalRecord } from "@jini-ai/user-management";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "../dev-auth.js";
import { PluginHookFailedError } from "@jini-ai/plugins/host";
import { pluginHookFailedBody } from "./plugin-hook-error.js";
import { widgetDomainErrorToResponse, type WidgetErrorResponse } from "@jini-ai/cms/admin-http/http/widgets";

/**
 * @file Response DTOs + typed-error -> HTTP mapping for the admin `widgets` HTTP surface
 * (SPEC-043, ADR-047). Mirrors `apps/website/src/server/inbound/admin-http/http/menus.ts`'s split: HTTP-facing serialization +
 * error mapping only — no widgets business logic lives here (that stays in `widgets/*.ts`).
 *
 * Every admin `widgets` route (`server/routes/admin/widgets/*.ts`) is a `RouteRegistrar`
 * (`server/routes/types.ts`) — no widened deps type is needed the way `MenuRouteDeps` needed one,
 * since every dependency a widgets route needs (`entryRepo`, `contentTypeRepo`, `entryRefsRepo`,
 * `widgetBindingRepo`, `clock`, `idGen`, `outbox`, `authorize`) already lives directly on the base
 * `RouteDeps` (added by this same dispatch).
 */

/**
 * REQ-40/41: every widget read/mutation is gated behind its `widgets.*` permission. Most routes
 * get this gate for free from the domain function they call (`createWidgetInstance` et al. call
 * `requireWidgetPermission` as their own first line — the SAME check applies whether the caller is
 * a human route or an AI tool route, per REQ-40's explicit requirement). A handful of routes have
 * no such domain-function wrapper to delegate to (`regions-list.ts`, `region-get.ts` read directly
 * off `widgetBindingRepo`/`entryRepo`, not through a `widgets.read`-checking service function) — this
 * helper is THIS package's own explicit gate for exactly those routes, mirroring
 * `apps/website/src/server/inbound/admin-http/routes/menus/create.ts`'s inline `authorize()`+403 pattern rather than inventing a new one.
 * Returns the authed principal on success, or `null` after already writing the 403 response.
 */
export async function requireWidgetsPermissionOrRespond({ authorize, workspaceId, permission, res }: { authorize: AuthorizeFn; workspaceId: string; permission: string; res: Response }, _optional = {}): Promise<PrincipalRecord | null> {
  const principal = getAuthedPrincipal(res);
  const params = { principalId: principal.id, permission, workspaceId, entityType: "widget" };
  return (await authorizeDirectOrRespond({ res, authorize, params })) ? principal : null;
}

// REQ-34 where-used response shaping belongs to Jini/packages/cms/src/widgets/where-used.ts; the
// response DTOs and the widgets domain's own error table live in `@jini-ai/cms/admin-http/http/widgets`.

/**
 * Pure typed-error -> `{status, body}` mapping, mirroring the `{error, code, ...}` envelope shape
 * `apps/website/src/server/inbound/admin-http/routes/menus/create.ts` and every other admin route in this codebase already establish.
 * `mapWidgetErrorToResponse` below is the usual way to consume this (send it straight to `res`);
 * exported separately for the rare caller (`agent-tools.ts`'s `widgets.create` — Fable adversarial-
 * review fix, 2026-07-21, Finding D) that needs to merge extra fields into the body before sending,
 * since a `Response` can only be finalized once.
 */
export function widgetErrorToResponse({ err }: { err: unknown }, options: AdminFailurePorts = {}): WidgetErrorResponse {
  const mapped = widgetDomainErrorToResponse({ err });
  if (mapped) return mapped;
  // A post/page save under an embed insert/remove/reorder or a widget tool route can be refused by
  // a plugin's beforeSave hook — the same fixed-text envelope the posts routes and agent tools give.
  if (err instanceof PluginHookFailedError) return { status: 500, body: { ...pluginHookFailedBody(err) } };
  return adminFailureResponse({ error: err, tracker: options.tracker }, { operation: "http/widgets" });
}

/**
 * Maps every typed `widgets`/`embed-service` domain error to its HTTP response. Falls through to a
 * generic 500 for anything unrecognized — callers still wrap this in their own try/catch, this
 * function never throws.
 */
export function mapWidgetErrorToResponse({ err, res }: { err: unknown; res: Response }, _optional = {}): void {
  const { status, body } = widgetErrorToResponse({ err }, { tracker: res.locals?.adminFailureTracker });
  res.status(status).json(body);
}
