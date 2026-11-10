import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { freshSqliteContentKernel } from '../../../platform/db/kernel/__tests__/dialect-matrix.js';
import { postRepoFor } from '../../post/repo.js';
import { SqlPagesHtmlDocumentStore } from '../html-document-store.js';
import { buildPagesRegistrations } from '../tool-registrations.js';

test('H2: guidance points to plugin embeds, and owner-authorized page HTML is still saved unchanged', async t => {
  const kernel = freshSqliteContentKernel();
  t.after(() => kernel.close());
  const clock = { nowMs: () => Date.parse('2026-10-31T00:00:00Z') };
  await kernel.run(q => q.insertInto('posts').values({ id: 'booking', workspace_id: 'site', title: 'Book', slug: 'book', kind: 'page', body_format: 'html', body_html: '<section data-agent-element="booking"></section>', body_json: null, status: 'draft', updated_at: '2026-10-31T00:00:00Z', version: 1, ext: '{}' }).execute());
  const deps = { workspaceId: 'site', authorize: async () => ({ allowed: true as const, reason: 'matched' as const }), postRepo: postRepoFor(kernel), pagesHtmlStore: (scope: { workspaceId: string; postId: string }) => new SqlPagesHtmlDocumentStore(scope, { kernel, clock }) };
  const tools = buildPagesRegistrations(deps);
  const embed = '<div class="vendor-inline-widget" data-url="https://book.vendor.test/owner/meeting"></div><script async src="https://assets.vendor.test/widget.js"></script>';
  const context = (input: unknown) => ({ executionId: 'embed', principal: { id: 'owner' }, run: { id: 'chat' }, input, signal: new AbortController().signal });
  for (const name of ['pages_write_html', 'pages_write_region']) {
    const tool = tools.find(entry => entry.descriptor.id === name)!;
    assert.ok(tool.descriptor.description);
    assert.match(tool.descriptor.description, /no <script src>/i, 'raw external scripts stay out of the assistant page guidance');
    assert.match(tool.descriptor.description, /plugin's embed/, 'the model learns the supported path');
    assert.doesNotMatch(tool.descriptor.description, /calendly/i, 'no vendor belongs in core guidance');
    await tool.handler(context(name === 'pages_write_html' ? { id: 'booking', html: `<section data-agent-element="booking">${embed}</section>` } : { id: 'booking', regionId: 'booking', html: embed }), {});
    const saved = await kernel.run(q => q.selectFrom('posts').select(['body_html', 'body_format']).where('id', '=', 'booking').executeTakeFirstOrThrow());
    assert.equal(saved.body_format, 'html');
    assert.equal(saved.body_html, `<section data-agent-element="booking">${embed}</section>`);
  }
  const denied = buildPagesRegistrations({ ...deps, authorize: async () => ({ allowed: false, reason: 'insufficient_permission' }) });
  for (const name of ['pages_write_html', 'pages_write_region']) {
    await assert.rejects(denied.find(tool => tool.descriptor.id === name)!.handler(context({ id: 'booking', regionId: 'booking', html: '<p>unauthorized</p>' }), {}));
  }
  assert.equal((await kernel.run(q => q.selectFrom('posts').select('body_html').where('id', '=', 'booking').executeTakeFirstOrThrow())).body_html, `<section data-agent-element="booking">${embed}</section>`);
});
