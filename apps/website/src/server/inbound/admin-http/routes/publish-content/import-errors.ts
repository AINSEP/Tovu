import { adminFailureResponse, type AdminFailurePorts } from "#src/server/inbound/shared/admin-failure";
import { ForbiddenError, PlanStaleError } from "#src/contracts/core/gated-mutations/gateway";
import { PluginHookFailedError } from "@jini-ai/plugins/host";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "@jini-ai/core/gated-mutations";
import { RestorePointUnavailableError } from "@jini-ai/cms/publish/content/execute-import";
import { PublishContentBundleNotFoundError } from "@jini-ai/cms/publish/content/gated-hooks";
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
  body: { error: string; code: string; pluginId?: string; errorId?: string };
}

/**
 * Maps a gateway/import error to its HTTP status and stable `code`, keeping a recognised error's own
 * message. Disk-budget refusals delegate to the shared admin handler (507). Anything unrecognised
 * is a 500 `INTERNAL_ERROR` with fixed text: its message can quote a
 * path, SQL or a credential (the same reason a plugin refusal's is redacted, `pluginHookFailedBody`),
 * so the full error goes to the server log instead.
 *
 * @complexity O(1).
 */
export function importErrorResponse({ err }: { err: unknown }, options: AdminFailurePorts = {}): ImportErrorResponse {
  return knownImportErrorResponse({ err }) ?? adminFailureResponse({ error: err, tracker: options.tracker }, IMPORT_FAILURE);
}

/** The redacted-500 options for an unrecognised import error; the import specs' mounts answer with the same. */
export const IMPORT_FAILURE = {
  operation: "routes/publish-content/import-errors",
  message: "The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem.",
} as const;

/** The typed arms of {@link importErrorResponse}; `undefined` for anything it would answer as the redacted 500.
 * @complexity O(1). */
export function knownImportErrorResponse({ err }: { err: unknown }, _optional: Record<string, never> = {}): ImportErrorResponse | undefined {
  if (err instanceof ForbiddenError) return { status: 403, body: { error: err.message, code: err.reasonCode } };
  if (err instanceof PlanStaleError) return { status: 409, body: { error: err.message, code: "PLAN_STALE" } };
  if (err instanceof TokenExpiredError) return { status: 409, body: { error: err.message, code: "TOKEN_EXPIRED" } };
  if (err instanceof TokenAlreadyRedeemedError) return { status: 409, body: { error: err.message, code: "TOKEN_ALREADY_REDEEMED" } };
  if (err instanceof RestorePointUnavailableError) return { status: 409, body: { error: err.message, code: "RESTORE_POINT_UNAVAILABLE" } };
  if (err instanceof PublishContentBundleNotFoundError) return { status: 404, body: { error: err.message, code: "BUNDLE_NOT_FOUND" } };
  // Same envelope as the posts routes' `sendPluginHookFailedError`, so a client tells a plugin's
  // refusal apart from any other internal error — and the same fixed text, never the plugin's own.
  if (err instanceof PluginHookFailedError) return { status: 500, body: pluginHookFailedBody(err) };
  return undefined;
}
