import type { Response } from "express";

import type { AuthorizeFn } from "#src/core/commands/command";
import type { PrincipalRecord } from "#src/identity/index";
import { getAuthedPrincipal } from "../../middleware/dev-auth";
import {
  WidgetAreaConflictError,
  WidgetAreaNotFoundError,
  WidgetConfigValidationError,
  WidgetEmbedGuardrailError,
  WidgetForbiddenError,
  WidgetInstanceNotFoundError,
  WidgetReferencedError,
  WidgetTypeUnregisteredError,
  WidgetVersionConflictError,
} from "#src/widgets/errors";
import { WidgetEmbedReorderCountMismatchError } from "#src/widgets/embed-service";
import type { WidgetAreaEntry, WidgetInstanceEntry, WidgetRegionBindingRow } from "#src/widgets/types";

/**
 * @file Response DTOs + typed-error -> HTTP mapping for the admin `widgets` HTTP surface
 * (SPEC-043, ADR-047). Mirrors `server/http/admin/menus.ts`'s split: HTTP-facing serialization +
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
 * `routes/admin/menus/create.ts`'s inline `authorize()`+403 pattern rather than inventing a new one.
 * Returns the authed principal on success, or `null` after already writing the 403 response.
 */
export async function requireWidgetsPermissionOrRespond(
  authorize: AuthorizeFn,
  workspaceId: string,
  permission: string,
  res: Response
): Promise<PrincipalRecord | null> {
  const principal = getAuthedPrincipal(res);
  const authResult = await authorize({ principalId: principal.id, permission, workspaceId, entityType: "widget" });
  if (!authResult.allowed) {
    res.status(403).json({
      error: `principal '${principal.id}' is not authorized for '${permission}' (${authResult.reason})`,
      code: "FORBIDDEN",
      details: { permission, reason: authResult.reason },
    });
    return null;
  }
  return principal;
}

export function toAdminWidgetResponse(instance: WidgetInstanceEntry): { widget: WidgetInstanceEntry } {
  return { widget: instance };
}

export function toAdminWidgetAreaResponse(area: WidgetAreaEntry): { area: WidgetAreaEntry } {
  return { area };
}

export function toAdminWidgetRegionResponse(binding: WidgetRegionBindingRow & { placementCount: number }) {
  return { region: binding };
}

/**
 * REQ-34's where-used projection now lives in the widgets domain (`widgets/where-used.ts`) — it is
 * a response shaper, not transport, and hosting it here was this domain's only import edge into the
 * composition root. Re-exported so every existing consumer of this module's surface keeps its
 * import site; new callers should prefer the domain module directly.
 */
export { toWhereUsedResponse, type WhereUsedReference, type WhereUsedResponse } from "#src/widgets/where-used";

export interface WidgetErrorResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Pure typed-error -> `{status, body}` mapping, mirroring the `{error, code, ...}` envelope shape
 * `routes/admin/menus/create.ts` and every other admin route in this codebase already establish.
 * `mapWidgetErrorToResponse` below is the usual way to consume this (send it straight to `res`);
 * exported separately for the rare caller (`agent-tools.ts`'s `widgets.create` — Fable adversarial-
 * review fix, 2026-07-21, Finding D) that needs to merge extra fields into the body before sending,
 * since a `Response` can only be finalized once.
 */
export function widgetErrorToResponse(err: unknown): WidgetErrorResponse {
  if (err instanceof WidgetConfigValidationError) {
    return { status: 400, body: { error: err.message, code: "WIDGETS_CONFIG_VALIDATION_ERROR", details: { fieldErrors: err.fieldErrors } } };
  }
  if (err instanceof WidgetTypeUnregisteredError) {
    return { status: 400, body: { error: err.message, code: "WIDGETS_TYPE_UNREGISTERED", details: { widgetType: err.widgetType } } };
  }
  if (err instanceof WidgetEmbedReorderCountMismatchError) {
    return {
      status: 400,
      body: { error: err.message, code: "WIDGETS_EMBED_REORDER_COUNT_MISMATCH", details: { expectedCount: err.expectedCount, actualCount: err.actualCount } },
    };
  }
  if (err instanceof WidgetEmbedGuardrailError) {
    return { status: 400, body: { error: err.message, code: "WIDGETS_EMBED_GUARDRAIL_VIOLATION", details: { reason: err.reason } } };
  }
  if (err instanceof WidgetVersionConflictError) {
    return { status: 409, body: { error: err.message, code: "WIDGETS_VERSION_CONFLICT", details: { currentVersion: err.currentVersion } } };
  }
  if (err instanceof WidgetAreaConflictError) {
    return { status: 409, body: { error: err.message, code: "WIDGETS_AREA_CONFLICT", details: { currentVersion: err.currentVersion } } };
  }
  if (err instanceof WidgetReferencedError) {
    return { status: 409, body: { error: err.message, code: "WIDGETS_REFERENCED", details: { referencingLocations: err.referencingLocations } } };
  }
  if (err instanceof WidgetInstanceNotFoundError) {
    return { status: 404, body: { error: err.message, code: "WIDGETS_INSTANCE_NOT_FOUND" } };
  }
  if (err instanceof WidgetAreaNotFoundError) {
    return { status: 404, body: { error: err.message, code: "WIDGETS_AREA_NOT_FOUND" } };
  }
  if (err instanceof WidgetForbiddenError) {
    // `WidgetForbiddenError` (thrown by `requireWidgetPermission` inside the domain functions
    // themselves — REQ-40's "same gate for human and AI-originated calls") carries only a message,
    // not a structured permission field; extracted here so this 403's body shape matches every
    // other admin route's `{ error, code, details: { permission, reason } }` convention
    // (`routes/admin/menus/create.ts`) rather than diverging just because the check happened one
    // layer down. Falls back to an empty string if the message shape ever changes upstream —
    // still a valid 403, just without the extracted detail.
    const match = /lacks permission '([^']+)' \(([^)]+)\)/.exec(err.message);
    return {
      status: 403,
      body: { error: err.message, code: "FORBIDDEN", details: { permission: match?.[1] ?? "", reason: match?.[2] ?? "" } },
    };
  }
  return { status: 500, body: { error: "internal error" } };
}

/**
 * Maps every typed `widgets`/`embed-service` domain error to its HTTP response. Falls through to a
 * generic 500 for anything unrecognized — callers still wrap this in their own try/catch, this
 * function never throws.
 */
export function mapWidgetErrorToResponse(err: unknown, res: Response): void {
  const { status, body } = widgetErrorToResponse(err);
  res.status(status).json(body);
}
