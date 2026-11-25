import assert from 'node:assert/strict';
import test from 'node:test';
import type { CommentRepoPort, CommentsSettings } from '@jini-ai/cms/comments';
import { createBuiltinCommentsProvider } from '@jini-ai/cms/comments/site/builtin-provider';
import type { CommentsProviderRegistry } from '@jini-ai/core/contracts/site/comments-providers';
import { renderCommentsMarkers } from '@jini-ai/cms/comments/site/public-markers';

const entry = { id: 'e', slug: 'post', title: 'Post', canonicalUrl: '/post', status: 'published' };
// The built-in provider's own unit tests live with it in Jini; this composition test only needs a provider that renders a thread.
function fixture() {
  const settings: CommentsSettings = { enabled: true, requireModeration: true, maxDepth: 5, closeAfterDays: null, spamAutoRejectScore: .5, maxPerIpPerHour: 20 };
  const provider = createBuiltinCommentsProvider({ siteId: 's', ready: Promise.resolve(), getSettings: async () => settings,
    repo: { listModerationQueue: async () => ({ items: [], nextCursor: null }) } as unknown as CommentRepoPort,
    ingress: { submit: async () => ({ ok: false, reason: 'honeypot-tripped' }) },
    writes: { applyModeration: async () => ({ ok: true }), purge: async () => ({ ok: true }) } });
  return { provider };
}

test('theme markers resolve once, preserve wrappers and remove draft/unavailable threads', async () => {
  const f = fixture(); let resolutions = 0;
  const providers = { active: async () => { resolutions++; return { providerId: 'built-in', revision: 0, adapter: f.provider }; } } as unknown as CommentsProviderRegistry;
  const html = `<div class="thread" data-embed-config='{"type":"comments"}'>fallback</div><div data-embed-config='{"type":"menu","id":"main"}'>menu</div>`;
  const args = { html, siteId: 's', entry, providers };
  assert.equal(await renderCommentsMarkers({ ...args, html: 'no marker' }), 'no marker');
  assert.equal(resolutions, 0);
  const result = await renderCommentsMarkers(args, { cursor: 'next' });
  assert.match(result, /class="thread"/); assert.match(result, /<section id="comments"/); assert.match(result, /"type":"menu"/);
  assert.equal(resolutions, 1);
  assert.ok(!(await renderCommentsMarkers({ ...args, entry: { ...entry, status: 'draft' } })).includes('<section'));
  assert.ok(!(await renderCommentsMarkers({ ...args, providers: undefined })).includes('<section'));
  providers.active = async () => ({ providerId: null, revision: 1, adapter: undefined });
  assert.ok(!(await renderCommentsMarkers(args)).includes('<section'));
});
