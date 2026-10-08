/** Tovu bindings for the Jini comments owner; request/auth/cache behavior stays with its ports. */
import { createHttpCommentsApi, createHttpCommentsSession, type CommentsTransportPort } from '@jini-ai/admin/comments/adapters/http';
import { COMMENTS_QUEUE_RESOURCE, type AdminCommentsPort, type CommentsEventsPort, type CommentsSessionPort, type CommentsTranslator } from '@jini-ai/admin/comments';
import { hasPermission, interpolate } from '@jini-ai/ui/panel-kit';
import { t as translateComments } from '../../features/comments/comments-i18n';
import { translateAdminNavLabel } from '../../lib/admin-nav-i18n';
import { serverLabel } from '../../components/status-labels';
import { WORKSPACE_ID } from '../../lib/api';
import { contentRefreshApplies, subscribeToContentRefresh } from '../../lib/content-refresh-bus';
import { mediaTransport } from './media-ports';

export interface CommentsHostPorts {
  commentsApi: AdminCommentsPort;
  commentsSession: CommentsSessionPort;
  commentsEvents?: CommentsEventsPort;
}

export const commentsEvents: CommentsEventsPort = {
  subscribe({ onRefresh }, _optional: Record<string, never> = {}) {
    // Settings intentionally never subscribe: advancing an uncontrolled form's diff baseline
    // on somebody else's write can silently revert it. Jini retains its one-shot seed guard.
    return subscribeToContentRefresh(scope => { if (contentRefreshApplies(scope, COMMENTS_QUEUE_RESOURCE)) onRefresh(); });
  },
};
/** Bind workspace routes to the existing HTTP adapters; the host transport owns authentication.
 * @returns The API, session and queue refresh ports. @example createCommentsHostPorts({ transport: mediaTransport })
 */
export function createCommentsHostPorts({ transport }: { transport: CommentsTransportPort }, { workspaceId = WORKSPACE_ID }: { workspaceId?: string } = {}): CommentsHostPorts {
  return {
    commentsApi: createHttpCommentsApi({ transport, basePath: `/workspaces/${workspaceId}/comments` }),
    commentsSession: createHttpCommentsSession({ transport, path: '/auth/me' }),
    commentsEvents,
  };
}
export const commentsHostPorts = createCommentsHostPorts({ transport: mediaTransport });

/** Bind existing copy owners to one locale; keep protocol labels out of feature dictionaries.
 * @param required Current admin locale.
 * @returns A pure translator accepting the module's optional template variables.
 * @example createCommentsTranslator({ locale: 'es' })('Comments')
 */
export function createCommentsTranslator({ locale }: { locale: string }, _optional: Record<string, never> = {}): CommentsTranslator {
  return (key, vars) => {
    let template: string;
    if (key === 'People' || key === 'Comments' || key === 'Settings') {
      template = translateAdminNavLabel({ locale, key });
    } else if (key === 'pending' || key === 'approved' || key === 'spam' || key === 'trash') {
      template = serverLabel(key, locale);
    } else {
      template = translateComments({ locale, key });
    }
    return vars ? interpolate({ template, vars }) : template;
  };
}

/** Expand wildcards through the existing permission owner before Jini's explicit page gate.
 * This affects UI affordances only; the server still authorizes each request.
 * @returns Explicit comments grants. @example commentsSessionGrants({ permissions: ['*'] })
 */
export function commentsSessionGrants({ permissions }: { permissions: readonly string[] }, _optional: Record<string, never> = {}): string[] {
  return ['comments.read', 'comments.moderate', 'comments.delete', 'comments.delete.force', 'comments.configure']
    .filter(permission => hasPermission({ permissions, permission }));
}
