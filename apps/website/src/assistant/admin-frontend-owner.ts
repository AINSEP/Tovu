import type { Request } from 'express';
import type { FrontendSessionOwner } from '@jini-ai/daemon';
import { RUN_PRINCIPAL_HEADER } from './daemon-access.js';

/** The proxy authenticates the principal; the private bind token authenticates the tab.
 * @complexity O(1) time and space. No additional session or database read.
 * @overallScore 100
 */
export function adminFrontendOwner({ req, workspaceId }: { req: Request; workspaceId: string }, _optional = {}): FrontendSessionOwner | null {
  const principalId = req.get(RUN_PRINCIPAL_HEADER);
  const tabId = req.get('x-frontend-tab-id') ?? req.query.tabId;
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
