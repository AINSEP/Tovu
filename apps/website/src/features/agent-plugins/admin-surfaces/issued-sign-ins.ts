import { createIssuedSignInCollector as createJiniIssuedSignInCollector, type IssuedSignInCollector } from "@jini-ai/agent-plugins/admin-surfaces/node";

import { isHostedSignInLinkPath } from "../../../contracts/core/hosted-sign-in-links.js";

/**
 * @file Tovu's binding of the issued sign-in collector (`@jini-ai/agent-plugins/admin-surfaces/node`).
 * The host's own sign-in link follows the site's scheme, so a plain-http link is admitted only on
 * Tovu's hosted sign-in path; provider URLs must be https.
 */

/** @complexity O(1) per record; collect adds O(1) around the run. */
export function createIssuedSignInCollector(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): IssuedSignInCollector {
  return createJiniIssuedSignInCollector({ admitHttp: ({ url }) => isHostedSignInLinkPath({ pathname: url.pathname }) });
}
