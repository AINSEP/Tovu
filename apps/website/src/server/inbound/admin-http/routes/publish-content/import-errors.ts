import { ForbiddenError, PlanStaleError } from "#src/contracts/core/gated-mutations/gateway";
import { PluginHookFailedError } from "#src/contracts/core/plugin-hook-failed-error";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "#src/contracts/core/gated-mutations/token";
import { RestorePointUnavailableError } from "#src/features/publish-content/execute-import";
import { PublishContentBundleNotFoundError } from "#src/features/publish-content/gated-hooks";
import { pluginHookFailedBody } from "#src/server/inbound/admin-http/http/plugin-hook-error";

/**
 * @file The one error-to-HTTP mapping the publish-content import routes (`import.ts`: plan,
 * confirm, execute, run status) answer a thrown error with. Its own module so every arm is pinned
 * directly: several of these errors (an expired confirmation token, a vanished bundle) need a
 * clock or a store race to reach through a real ceremony.
 */

/** The status and JSON body an import route sends for a thrown error. */
export interface ImportErrorResponse {
  status: number;
  body: { error: string; code: string; pluginId?: string };
}

/**
 * Maps a gateway/import error to its HTTP status and stable `code`, keeping a recognised error's own
 * message. Anything unrecognised is a 500 `INTERNAL_ERROR` with fixed text: its message can quote a
 * path, SQL or a credential (the same reason a plugin refusal's is redacted, `pluginHookFailedBody`),
 * so the full error goes to the server log instead.
 *
 * @complexity O(1).
 */
export function importErrorResponse(err: unknown): ImportErrorResponse {
  const error = err instanceof Error ? err.message : "internal error";
  if (err instanceof ForbiddenError) return { status: 403, body: { error, code: err.reasonCode } };
  if (err instanceof PlanStaleError) return { status: 409, body: { error, code: "PLAN_STALE" } };
  if (err instanceof TokenExpiredError) return { status: 409, body: { error, code: "TOKEN_EXPIRED" } };
  if (err instanceof TokenAlreadyRedeemedError) return { status: 409, body: { error, code: "TOKEN_ALREADY_REDEEMED" } };
  if (err instanceof RestorePointUnavailableError) return { status: 409, body: { error, code: "RESTORE_POINT_UNAVAILABLE" } };
  if (err instanceof PublishContentBundleNotFoundError) return { status: 404, body: { error, code: "BUNDLE_NOT_FOUND" } };
  // Same envelope as the posts routes' `sendPluginHookFailedError`, so a client tells a plugin's
  // refusal apart from any other internal error — and the same fixed text, never the plugin's own.
  if (err instanceof PluginHookFailedError) return { status: 500, body: pluginHookFailedBody(err) };
  // eslint-disable-next-line no-console
  console.error("[publish-content] import failed:", err);
  return { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } };
}
