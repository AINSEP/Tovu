import { adminFailureResponse, type BoundFailurePorts } from "#src/server/inbound/shared/admin-failure";
import { knownMappedErrorResponse, type MappedErrorClass, type RouteRefusal } from "@jini-ai/cms/admin-http/routes/publish-content/route-helpers";
import type { Response } from "express";

import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

import type { PublishContentRouteDeps } from "./deps.js";

/**
 * @file The Express glue every publish-content route file in this folder shares: the
 * authenticated-principal-plus-permission gate, the typed-error to HTTP mapping, and the
 * `overwriteEntityKeys` 400/403 writes. The body reader (`bodyRecord`) and the `overwriteEntityKeys`
 * parser, with its 1000-entry cap, are Jini's (`@jini-ai/cms/admin-http/routes/publish-content/
 * transport-shared`, `.../import`), so this relay and the destination cannot drift apart on either. The mount-path 404 lives in `shared/route-guards.ts`.
 */

/**
 * Reads the authenticated principal and asks `authorize()` for `permission` in this workspace.
 * @returns the principal id, or `null` when the standard 403 has already been sent.
 * @complexity O(1) — one `authorize()` call.
 */
export async function authorizedPrincipalId(
  { res, deps, permission }: { res: Response; deps: Pick<PublishContentRouteDeps, "authorize" | "workspaceId">; permission: string }, _options: Record<string, never> = {}
): Promise<string | null> {
  const principal = getAuthedPrincipal(res);
  const allowed = await authorizeOrRespond({ res, authorize: deps.authorize, params: { principalId: principal.id, permission, workspaceId: deps.workspaceId } });
  return allowed ? principal.id : null;
}

/**
 * Maps a typed error to its status and `{error, code}` body, keeping the typed error's own message.
 * Anything not in `table` is a 500 with fixed text: a raw driver error's message is never echoed.
 * @complexity O(t) in the table length.
 */
export function mappedErrorResponse({ err, table }: { err: unknown; table: readonly MappedErrorClass[] }, options: BoundFailurePorts & {
  message?: string; method?: string; route?: string; discloseDetails?: boolean;
}): RouteRefusal {
  const known = knownMappedErrorResponse({ err, table });
  if (known) return known;
  return adminFailureResponse({ error: err, tracker: options.tracker, reporter: options.reporter }, {
    operation: "routes/publish-content/route-helpers", message: options.message,
    method: options.method, route: options.route, discloseDetails: options.discloseDetails,
  });
}

/** Sends a {@link RouteRefusal}. @complexity O(1). */
export function sendRefusal({ res, refusal }: { res: Response; refusal: RouteRefusal }, _optional: Record<string, never> = {}): void {
  res.status(refusal.status).json(refusal.body);
}
