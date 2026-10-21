/** Tovu adapter for the CMS comments engine. The engine keeps storage, spam and audit ownership. */
import type { CommentsProviderAdapter, CommentsProviderDefinition, CommentThreadRendererPort } from '@jini-ai/capability-providers/comments';
import type { CommentRepoPort, CommentIngressPolicy, CommentWriteService, CommentsSettings, CommentRecord } from '@jini-ai/cms/comments';
import { ToolInputError } from '@jini-ai/core';
import { escapeHtml } from '#src/platform/html/escape';

export const BUILTIN_COMMENTS_DEFINITION: CommentsProviderDefinition = {
  id: 'built-in', label: 'Built-in', kind: 'stored', consentCategory: 'functional', implementation: 'adapter',
  csp: { scriptSrc: [], frameSrc: [], connectSrc: [], styleSrc: [] }, settingsSchema: [],
};
export interface BuiltinCommentsDeps {
  siteId: string;
  repo: CommentRepoPort;
  ingress: CommentIngressPolicy;
  writes: CommentWriteService;
  getSettings: (required: { siteId: string }, optional?: Record<string, never>) => Promise<CommentsSettings>;
  ready: Promise<void>;
}

/** Public fields only, escaped at the HTML sink. Depth is bounded even for legacy malformed rows. */
function commentHtml({ row, maxDepth }: { row: CommentRecord; maxDepth: number }, _options = {}) {
  const depth = Math.min(Math.max(0, row.depth), maxDepth);
  return `<li id="comment-${escapeHtml(row.id)}" data-comment-depth="${depth}"><article><header>${escapeHtml(row.authorName)}</header><p>${escapeHtml(row.bodyText)}</p></article></li>`;
}

/** Native form: no scripts, no private values, existing website honeypot retained. */
function submissionForm({ entryId, path }: { entryId: string; path: string }, _options = {}) {
  return `<p id="comment-pending" role="status">Submitted comments are held for review when moderation is enabled.</p><p id="comment-error">If your comment was not accepted, check the form and try again.</p>
<form method="post" action="/api/site/comments"><input type="hidden" name="entryId" value="${escapeHtml(entryId)}"><input type="hidden" name="returnTo" value="${escapeHtml(path)}">
<label>Name <input name="authorName" required maxlength="200" autocomplete="name"></label><label>Email (private, optional) <input name="authorEmail" type="email" maxlength="320" autocomplete="email"></label>
<label hidden>Leave empty <input name="website" tabindex="-1" autocomplete="off"></label><label>Comment <textarea name="body" required maxlength="10000"></textarea></label><button type="submit">Submit comment</button></form>`;
}

/** Bounds redirects and pagination to the entry's local URL. */
function entryPath({ canonicalUrl }: { canonicalUrl: string }, _options = {}) {
  const url = new URL(canonicalUrl, 'https://comments.invalid');
  return url.pathname.startsWith('//') ? '/' : url.pathname;
}

/** One entry-scoped database page (201 rows at most), with no thread recursion or page cache.
 * Every response re-reads selection/settings/approved rows, so moderation and disable are immediately visible.
 * @complexity O(p) rendering and one bounded query for p <= 200 comments. */
export function createBuiltinCommentsProvider(deps: BuiltinCommentsDeps, _options = {}): CommentsProviderAdapter & { kind: 'stored' } {
  const assertSite = ({ siteId }: { siteId: string }, _options = {}) => {
    if (siteId !== deps.siteId) throw new Error('Comments site mismatch');
  };
  const assertEnabled = async ({ siteId }: { siteId: string }, _options = {}) => {
    assertSite({ siteId });
    await deps.ready;
    if (!(await deps.getSettings({ siteId })).enabled) throw new ToolInputError({ message: 'Comments are disabled. Enable them in comments settings first.' });
  };
  const renderer: CommentThreadRendererPort = { async renderThread({ siteId, entry }, optional = {}) {
    assertSite({ siteId });
    await deps.ready;
    const settings = await deps.getSettings({ siteId });
    if (!settings.enabled) return { html: '' };
    const page = await deps.repo.listModerationQueue({ workspaceId: siteId, entryId: entry.id, status: 'approved', limit: 200, cursor: optional.cursor });
    const path = entryPath({ canonicalUrl: entry.canonicalUrl });
    const maxDepth = Math.min(20, Math.max(0, settings.maxDepth));
    const rows = page.items.filter(row => row.status === 'approved' && row.entryId === entry.id && row.workspaceId === siteId);
    const more = page.nextCursor ? `<a rel="next" href="${escapeHtml(`${path}?commentCursor=${encodeURIComponent(page.nextCursor)}#comments`)}">More comments</a>` : '';
    return { html: `<section id="comments" aria-label="Comments"><h2>Comments</h2><ol>${rows.map(row => commentHtml({ row, maxDepth })).join('')}</ol>${more}${submissionForm({ entryId: entry.id, path })}</section>` };
  } };
  return { kind: 'stored', renderer,
    submission: { async submit(input) {
      assertSite(input);
      await deps.ready;
      const { siteId, authorIpHash, honeypotValue, ...fields } = input;
      const result = await deps.ingress.submit({ ...fields, workspaceId: siteId, authorPrincipalId: null, ingressContext: { authorIpHash, honeypotValue } });
      return result.ok ? { ok: true, id: result.comment.id, status: result.comment.status } : result;
    } },
    moderation: {
      async listQueue({ siteId, ...input }) { assertSite({ siteId }); await deps.ready; return deps.repo.listModerationQueue({ ...input, workspaceId: siteId }); },
      async get({ siteId, id }) { assertSite({ siteId }); await deps.ready; return deps.repo.findById({ workspaceId: siteId, id }); },
      async apply({ siteId, action, ...input }) {
        await assertEnabled({ siteId });
        const statuses = { approve: 'approved', mark_spam: 'spam', trash: 'trash', restore: 'approved' } as const;
        return deps.writes.applyModeration({ ...input, action, workspaceId: siteId, toStatus: statuses[action] });
      },
      async purge({ siteId, ...input }) { await assertEnabled({ siteId }); return deps.writes.purge({ ...input, workspaceId: siteId }); },
    },
  };
}
