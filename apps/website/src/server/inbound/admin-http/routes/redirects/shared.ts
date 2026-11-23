import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";

import { matchRedirectError, type RedirectErrorMapping } from "@jini-ai/cms/admin-http/routes/redirects/shared";

/**
 * @file Express answer for the `redirects` admin write-error mapping.
 *
 * The mapping table itself (`REDIRECT_WRITE_ERROR_MAPPINGS`) lives with the Jini route specs; this
 * host half writes a matched mapping onto `res` and hands anything unmatched to the shared admin
 * failure lifecycle. Its caller is the still hand-written `create.ts`.
 */

/**
 * Writes the first matching mapping's status/code, or a generic 500 if none match.
 *
 * @complexity O(n) in the mapping table length, which is a small fixed list per caller.
 */
export function respondToRedirectError({ res, err, mappings }: { res: Response; err: unknown; mappings: readonly RedirectErrorMapping[] }, _options: Record<string, never> = {}): void {
  const refusal = matchRedirectError({ err, mappings });
  if (refusal) {
    res.status(refusal.status).json({ error: refusal.error, code: refusal.code });
    return;
  }
  sendAdminFailure({ res, error: err }, { operation: "routes/redirects/shared", code: "INTERNAL_ERROR" });
}
