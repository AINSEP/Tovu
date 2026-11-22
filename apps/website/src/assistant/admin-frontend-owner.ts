import type { FrontendSessionOwner } from '@jini-ai/daemon';
import type { FrontendHookInput } from '@jini-ai/daemon/http';
import { readRequestFacts } from '@jini-ai/core/contracts/site/request-facts';
import { RUN_PRINCIPAL_HEADER } from './daemon-access.js';

/** The proxy authenticates the principal; the private bind token authenticates the tab.
 * The `tabId` query value is the admin app's own parsed query (the request facts), not a re-parse of the URL: a repeated, bracketed or very late `tabId` is refused, as it always was.
 * @complexity O(1) time and space. No additional session or database read.
 * @overallScore 100
 */
export function adminFrontendOwner({ request, locals, workspaceId }: FrontendHookInput & { workspaceId: string }, _optional = {}): FrontendSessionOwner | null {
  const principalId = request.headers.get(RUN_PRINCIPAL_HEADER);
  const tabId = request.headers.get('x-frontend-tab-id') ?? readRequestFacts({ locals }).query.tabId;
  if (!principalId || typeof tabId !== 'string' || !tabId || tabId.length > 128) return null;
  return { workspaceId, principalId, tabId };
}

/** Run-start context has already had its principal replaced by the authenticated proxy.
 * @complexity O(context bytes) time and space for the existing JSON envelope.
 * @overallScore 100
 */
export function adminFrontendRunOwner({ contextRef, workspaceId }: { contextRef: string; workspaceId: string }, _optional = {}): FrontendSessionOwner | undefined {
  let context: { principalId?: unknown; frontendTabId?: unknown } | null;
  try { context = JSON.parse(contextRef); } catch { return undefined; }
  if (typeof context?.principalId !== 'string' || typeof context?.frontendTabId !== 'string') return undefined;
  return { workspaceId, principalId: context.principalId, tabId: context.frontendTabId };
}
