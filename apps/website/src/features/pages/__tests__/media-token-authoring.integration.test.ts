import { bindPagesToolHost } from "#src/features/pages/tool-host";
import { createPageHtmlStatements } from "#src/features/pages/html-document-store.sqlite";
import { restoredEntryRefs } from "@jini-ai/cms/pages/html-inverse";
import { warnUnindexedEntryRef } from "#src/contracts/core/entry-refs/unindexed-ref-warning";
import { pageHtmlChangeTestDeps } from "./page-html-change-test-deps.js";
import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolInputError } from '@jini-ai/core';
import { freshSqliteContentKernel } from '../../../platform/db/kernel/__tests__/dialect-matrix.js';
import { postRepoFor } from '../../post/repo.js';
import { SqlPagesHtmlDocumentStore } from "@jini-ai/cms/pages/html-document-store";
import { buildPagesRegistrations } from "@jini-ai/cms/pages/tool-registrations";

test('page writers refuse unresolved Media widget tokens before saving a broken visitor photo', async t => {
  const kernel = freshSqliteContentKernel();
  t.after(() => kernel.close());
  const clock = { nowMs: () => Date.parse('2026-11-02T00:00:00Z') };
  const original = '<section data-agent-element="photo"><p>Visit us</p></section>';
  await kernel.run(q => q.insertInto('posts').values({ id: 'visit', workspace_id: 'site', title: 'Visit', slug: 'visit-us', kind: 'page', body_format: 'html', body_html: original, body_json: null, status: 'published', updated_at: '2026-11-02T00:00:00Z', version: 1, ext: '{}' }).execute());
  const tools = buildPagesRegistrations({ deps: { workspaceId: 'site', authorize: async () => ({ allowed: true as const, reason: 'matched' as const }), postRepo: postRepoFor(kernel, { mediaAccessEvidence: createMediaAccessEvidence() }), ...pageHtmlChangeTestDeps(), pagesHtmlStore: scope => new SqlPagesHtmlDocumentStore({ scope, deps: { statements: createPageHtmlStatements({ kernel }), clock, reportUnindexedRef: warnUnindexedEntryRef, restoredEntryRefs: (required: Omit<Parameters<typeof restoredEntryRefs>[0], "report">) => restoredEntryRefs({ ...required, report: warnUnindexedEntryRef })} }) }, host: bindPagesToolHost({}) });
  for (const name of ['pages_write_html', 'pages_write_region']) {
    const tool = tools.find(entry => entry.descriptor.id === name)!;
    for (const photo of ['<img src="{{media:pastry-counter-3}}">', '<img src="&#123;{media:pastry-counter-3}}">', '<template><img src="{{media:pastry-counter-3}}"></template>', '<p>{{media:pastry-counter-3}}</p>']) {
      const html = `<section data-agent-element="photo">${photo}</section>`;
      await assert.rejects(tool.handler({ executionId: 'photo', principal: { id: 'owner' }, run: { id: 'chat' }, input: { id: 'visit', expectedVersion: 1, ...(name === 'pages_write_region' ? { regionId: 'photo' } : {}), html }, signal: new AbortController().signal }, {}), error => {
        assert.ok(error instanceof ToolInputError);
        assert.match(error.message, /Media widget HTML mode only/);
        assert.match(error.message, /media.*slug/i);
        assert.match(error.message, /data-embed-config/);
        return true;
      });
    }
    const row = await kernel.run(q => q.selectFrom('posts').select(['body_html', 'version']).where('id', '=', 'visit').executeTakeFirstOrThrow());
    assert.equal(row.body_html, original);
    assert.equal(row.version, 1);
  }
  const widgetHtml = `<section data-agent-element="photo"><div data-embed-config='${JSON.stringify({ type: 'media', content: { mode: 'html', html: '<img src="{{media:pastry-counter-3}}">' } })}'></div></section>`;
  await tools.find(entry => entry.descriptor.id === 'pages_write_html')!.handler({ executionId: 'photo-valid', principal: { id: 'owner' }, run: { id: 'chat' }, input: { id: 'visit', expectedVersion: 1, html: widgetHtml }, signal: new AbortController().signal }, {});
  assert.equal((await kernel.run(q => q.selectFrom('posts').select('body_html').where('id', '=', 'visit').executeTakeFirstOrThrow())).body_html, widgetHtml);
});
