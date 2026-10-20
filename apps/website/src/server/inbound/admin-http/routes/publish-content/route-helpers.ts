import type { Response } from "express";

import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

import type { PublishContentRouteDeps } from "./deps.js";

/**
 * @file The request preamble and body readers every publish-content route file in this folder
 * shares: the mount-path 404, the authenticated-principal-plus-permission gate, the typed-error to
 * HTTP mapping, and the `overwriteEntityKeys` reader. One copy, so a route cannot drift from the
 * others on the exact 404/403 body or on the 1000-entry cap.
 */

/** The request shape these helpers read: only the matched route params. */
export interface RouteParamsRequest {
  params: Record<string, string | undefined>;
}

/** The status-and-body pair a refusal or a mapped error answers with. */
export interface RouteRefusal {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Reads a matched route param as a string. Express always fills a matched `:param`, so the `""`
 * fallback only matters to a caller that invokes a handler directly; it keeps such a call from
 * comparing against the literal string `"undefined"`.
 * @complexity O(1).
 */
export function routeParam(req: RouteParamsRequest, name: string): string {
  return String(req.params[name] ?? "");
}

/**
 * The mount-path guard: a request naming another workspace gets the 404 before anything else runs.
 * @returns `true` when the 404 has been sent and the handler must stop.
 * @complexity O(1).
 */
export function rejectForeignWorkspace(req: RouteParamsRequest, res: Response, workspaceId: string): boolean {
  if (routeParam(req, "workspaceId") === workspaceId) return false;
  res.status(404).json({ error: "workspace was not found" });
  return true;
}

/**
 * Reads the authenticated principal and asks `authorize()` for `permission` in this workspace.
 * @returns the principal id, or `null` when the standard 403 has already been sent.
 * @complexity O(1) — one `authorize()` call.
 */
export async function authorizedPrincipalId(
  res: Response,
  deps: Pick<PublishContentRouteDeps, "authorize" | "workspaceId">,
  permission: string
): Promise<string | null> {
  const principal = getAuthedPrincipal(res);
  const allowed = await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission, workspaceId: deps.workspaceId });
  return allowed ? principal.id : null;
}

/** A request body as a field bag; an absent body reads as empty. @complexity O(1). */
export function bodyRecord(body: unknown): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

/** A typed store/transport error class and the status/code it answers with. */
export type MappedErrorClass = readonly [errorClass: abstract new (...args: never[]) => Error, status: number, code: string];

/**
 * Maps a typed error to its status and `{error, code}` body, keeping the typed error's own message.
 * Anything not in `table` is a 500 with fixed text: a raw driver error's message is never echoed.
 * @complexity O(t) in the table length.
 */
export function mappedErrorResponse(err: unknown, table: readonly MappedErrorClass[]): RouteRefusal {
  for (const [errorClass, status, code] of table) {
    if (err instanceof errorClass) return { status, body: { error: err.message, code } };
  }
  return { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } };
}

/** Sends a {@link RouteRefusal}. @complexity O(1). */
export function sendRefusal(res: Response, refusal: RouteRefusal): void {
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
export function readOverwriteEntityKeys(overwriteEntityKeys: unknown): readonly string[] | null | typeof INVALID_OVERWRITE_KEYS {
  if (overwriteEntityKeys === undefined || overwriteEntityKeys === null) return null;
  if (!Array.isArray(overwriteEntityKeys)) return INVALID_OVERWRITE_KEYS;
  if (overwriteEntityKeys.length > 1000) return INVALID_OVERWRITE_KEYS;
  if (!overwriteEntityKeys.every((key): key is string => typeof key === "string")) return INVALID_OVERWRITE_KEYS;
  return overwriteEntityKeys;
}

/** Returned by {@link acceptOverwriteEntityKeys} when it has already sent a 400 or 403. */
export const OVERWRITE_REFUSED = Symbol("overwrite-refused");

/** A route's own "who may tick overwrite" rule; on `false` it has already sent its 403. */
export type OverwriteRule = (res: Response, overwriteEntityKeys: readonly string[] | null) => boolean;

/**
 * Reads `overwriteEntityKeys` and applies the route's own "who may tick overwrite" rule.
 * @returns the ticks (`null` = force nothing), or {@link OVERWRITE_REFUSED} once the 400 (malformed)
 *   or the rule's own 403 has been sent.
 * @complexity O(n) in the submitted key count.
 */
export function acceptOverwriteEntityKeys(res: Response, raw: unknown, mayOverwrite: OverwriteRule): readonly string[] | null | typeof OVERWRITE_REFUSED {
  const keys = readOverwriteEntityKeys(raw);
  if (keys === INVALID_OVERWRITE_KEYS) {
    res.status(400).json({ error: "'overwriteEntityKeys' must be an array of strings", code: "VALIDATION_ERROR" });
    return OVERWRITE_REFUSED;
  }
  return mayOverwrite(res, keys) ? keys : OVERWRITE_REFUSED;
}
