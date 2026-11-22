import { adminFailureResponse, type AdminFailurePorts } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";

import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

import type { PublishContentRouteDeps } from "./deps.js";

/**
 * @file The request preamble and body readers every publish-content route file in this folder
 * shares: the authenticated-principal-plus-permission gate, the typed-error to HTTP mapping, and
 * the `overwriteEntityKeys` reader. One copy, so a route cannot drift from the others on the exact
 * 403 body or on the 1000-entry cap. The mount-path 404 lives in `shared/route-guards.ts`.
 */

/** The status-and-body pair a refusal or a mapped error answers with. */
export interface RouteRefusal {
  status: number;
  body: Record<string, unknown>;
}

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

/** A request body as a field bag; an absent body reads as empty. @complexity O(1). */
export function bodyRecord({ body }: { body: unknown }, _options: Record<string, never> = {}): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

/** A typed store/transport error class and the status/code it answers with. */
export type MappedErrorClass = readonly [errorClass: abstract new (...args: never[]) => Error, status: number, code: string];

/**
 * Maps a typed error to its status and `{error, code}` body, keeping the typed error's own message.
 * Anything not in `table` is a 500 with fixed text: a raw driver error's message is never echoed.
 * @complexity O(t) in the table length.
 */
export function mappedErrorResponse({ err, table }: { err: unknown; table: readonly MappedErrorClass[] }, options: AdminFailurePorts & {
  message?: string; method?: string; route?: string; discloseDetails?: boolean;
} = {}): RouteRefusal {
  for (const [errorClass, status, code] of table) {
    if (err instanceof errorClass) return { status, body: { error: err.message, code } };
  }
  return adminFailureResponse({ error: err, tracker: options.tracker }, {
    operation: "routes/publish-content/route-helpers", message: options.message,
    method: options.method, route: options.route, discloseDetails: options.discloseDetails,
  });
}

/** Sends a {@link RouteRefusal}. @complexity O(1). */
export function sendRefusal({ res, refusal }: { res: Response; refusal: RouteRefusal }, _optional: Record<string, never> = {}): void {
  res.status(refusal.status).json(refusal.body);
}

/** Distinguishes "the body carried a malformed set of ticks" (a 400) from "the body carried none"
 *  (`null`, force nothing) — two outcomes a bare `null` return could not tell apart. */
export const INVALID_OVERWRITE_KEYS = Symbol("invalid-overwrite-keys");

/**
 * publish-overwrite-live-plan §4/S6 and §4/S7 — reads `overwriteEntityKeys` off a request body: the
 * `entityKey()` strings (planner.ts) the operator ticked "overwrite on live" for. Absent/`null`
 * means "force nothing", the pre-S6 default every existing caller keeps getting. Bounded at 1000
 * entries, matching the plan's own cap — this ceremony never has a legitimate use for more than
 * that in one bundle. The destination (`import.ts`) and the relay (`peer-transport.ts`) used to
 * repeat this reader under a one-reader-per-route-file convention; it is shared now so the two
 * caps cannot drift apart.
 * @complexity O(n) in the submitted key count.
 */
export function readOverwriteEntityKeys({ overwriteEntityKeys }: { overwriteEntityKeys: unknown }, _options: Record<string, never> = {}): readonly string[] | null | typeof INVALID_OVERWRITE_KEYS {
  if (overwriteEntityKeys === undefined || overwriteEntityKeys === null) return null;
  if (!Array.isArray(overwriteEntityKeys)) return INVALID_OVERWRITE_KEYS;
  if (overwriteEntityKeys.length > 1000) return INVALID_OVERWRITE_KEYS;
  if (!overwriteEntityKeys.every((key): key is string => typeof key === "string")) return INVALID_OVERWRITE_KEYS;
  return overwriteEntityKeys;
}

/** Returned by {@link acceptOverwriteEntityKeys} when it has already sent a 400 or 403. */
export const OVERWRITE_REFUSED = Symbol("overwrite-refused");

/** A route's own "who may tick overwrite" rule; on `false` it has already sent its 403. */
export type OverwriteRule = (required: { res: Response; overwriteEntityKeys: readonly string[] | null }, optional?: Record<string, never>) => boolean;

/**
 * Reads `overwriteEntityKeys` and applies the route's own "who may tick overwrite" rule.
 * @returns the ticks (`null` = force nothing), or {@link OVERWRITE_REFUSED} once the 400 (malformed)
 *   or the rule's own 403 has been sent.
 * @complexity O(n) in the submitted key count.
 */
export function acceptOverwriteEntityKeys({ res, raw, mayOverwrite }: { res: Response; raw: unknown; mayOverwrite: OverwriteRule }, _options: Record<string, never> = {}): readonly string[] | null | typeof OVERWRITE_REFUSED {
  const keys = readOverwriteEntityKeys({ overwriteEntityKeys: raw });
  if (keys === INVALID_OVERWRITE_KEYS) {
    res.status(400).json({ error: "'overwriteEntityKeys' must be an array of strings", code: "VALIDATION_ERROR" });
    return OVERWRITE_REFUSED;
  }
  return mayOverwrite({ res, overwriteEntityKeys: keys }) ? keys : OVERWRITE_REFUSED;
}
