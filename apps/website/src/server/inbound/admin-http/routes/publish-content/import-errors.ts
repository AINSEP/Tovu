import { adminFailureResponse, type BoundFailurePorts } from "#src/server/inbound/shared/admin-failure";
import { ForbiddenError, PlanStaleError } from "#src/contracts/core/gated-mutations/gateway";
import { PluginHookFailedError } from "@jini-ai/plugins/host";
import { knownImportErrorResponse as knownCmsImportErrorResponse, type ImportErrorHost, type ImportErrorResponse } from "@jini-ai/cms/admin-http/routes/publish-content/import-errors";
import { pluginHookFailedBody } from "#src/server/inbound/admin-http/http/plugin-hook-error";

/**
 * @file The one error-to-HTTP mapping the publish-content import routes (`import.ts`: plan,
 * confirm, execute, run status) answer a thrown error with. Its own module so every arm is pinned
 * directly: several of these errors (an expired confirmation token, a vanished bundle) need a
 * clock or a store race to reach through a real ceremony.
 */

/**
 * Maps a gateway/import error to its HTTP status and stable `code`, keeping a recognised error's own
 * message. Disk-budget refusals delegate to the shared admin handler (507). Anything unrecognised
 * is a 500 `INTERNAL_ERROR` with fixed text: its message can quote a
 * path, SQL or a credential (the same reason a plugin refusal's is redacted, `pluginHookFailedBody`),
 * so the full error goes to the server log instead.
 *
 * @complexity O(1).
 */
export function importErrorResponse({ err }: { err: unknown }, options: BoundFailurePorts): ImportErrorResponse {
  return knownImportErrorResponse({ err }) ?? adminFailureResponse({ error: err, tracker: options.tracker, reporter: options.reporter }, IMPORT_FAILURE);
}

/** The redacted-500 options for an unrecognised import error; the import specs' mounts answer with the same. */
export const IMPORT_FAILURE = {
  operation: "routes/publish-content/import-errors",
  message: "The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem.",
} as const;

/** The host's gateway classes and plugin envelope, as the CMS mapping's ports. */
const IMPORT_ERROR_HOST: ImportErrorHost = {
  readForbiddenReason: ({ error }) => (error instanceof ForbiddenError ? { message: error.message, reasonCode: error.reasonCode } : undefined),
  isStalePlan: ({ error }) => error instanceof PlanStaleError,
  pluginHookBody: ({ error }) => (error instanceof PluginHookFailedError ? pluginHookFailedBody(error) : undefined),
};

/** The typed arms of {@link importErrorResponse}; `undefined` for anything it would answer as the redacted 500.
 * @complexity O(1). */
export function knownImportErrorResponse({ err }: { err: unknown }, _optional: Record<string, never> = {}): ImportErrorResponse | undefined {
  return knownCmsImportErrorResponse({ err, host: IMPORT_ERROR_HOST });
}
