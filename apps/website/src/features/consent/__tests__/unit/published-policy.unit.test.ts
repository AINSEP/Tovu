/** Public context reads immutable publication rows without loading author drafts. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteConsentStore } from '@jini-ai/cookie-consent/site/revisions.repo';
import type { RawBuilder } from 'kysely';
import { SITE_CONSENT_DEFAULTS } from '@jini-ai/cookie-consent/site/config';

const published = { id: 'published-1', config: { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: '/privacy' }, actorId: 'owner', createdAt: '2026-11-05T00:00:00.000Z' };

test('public store reads only published head and publication row, never the draft row', async () => {
  const queries: string[] = [];
  const kernel = { query: async (query: { toOperationNode(): unknown }) => {
    const node = JSON.stringify(query.toOperationNode());
    queries.push(node);
    if (node.includes('site_consent_heads')) return [{ draft_id: 'private-draft', published_id: published.id }];
    assert.ok(node.includes(published.id));
    assert.ok(!node.includes('private-draft'));
    return [{ id: published.id, config_json: JSON.stringify(published.config), actor_id: published.actorId, created_at: published.createdAt }];
  } };
  const store = createSiteConsentStore({ tables: { revisions: "site_consent_revisions", heads: "site_consent_heads" }, workspaceId: 'site-public', kernel: kernel as never });
  assert.deepEqual(await store.readPublished({}), published);
  assert.equal(queries.length, 2);
  assert.ok(!queries[0]!.includes('draft_id'));
  assert.ok(queries.every(query => query.includes('site-public')));
});

test('a site without a published head performs no revision read', async () => {
  let reads = 0;
  const store = createSiteConsentStore({ tables: { revisions: "site_consent_revisions", heads: "site_consent_heads" }, workspaceId: 'empty', kernel: { query: async () => { reads++; return []; } } as never });
  assert.equal(await store.readPublished({}), null);
  assert.equal(reads, 1);
});


test('public consent ignores draft content during concurrent publish', async t => {
  const { sql } = await import('kysely');
  const { openContentDb } = await import('#src/platform/db/sqlite/content-db');
  const { contentKernel } = await import('#src/platform/db/content-kernel');
  const { closeSqliteConnection } = await import('#src/platform/db/kernel/drivers/sqlite');
  const db = openContentDb(':memory:');
  t.after(() => closeSqliteConnection({ source: db }));
  const kernel = contentKernel({ store: db });
  const store = createSiteConsentStore({ tables: { revisions: "site_consent_revisions", heads: "site_consent_heads" }, workspaceId: 'public-test', kernel });
  await store.saveDraft({ revision: published, expectedDraftId: null });
  await store.publish({ draftId: published.id, expectedPublishedId: null });
  await store.saveDraft({ revision: { ...published, id: 'published-2' }, expectedDraftId: published.id });
  await store.saveDraft({ revision: { ...published, id: 'unreviewed-draft' }, expectedDraftId: 'published-2' });
  await kernel.execute(sql`UPDATE site_consent_revisions SET config_json = ${'private malformed draft'} WHERE workspace_id = ${'public-test'} AND id = ${'unreviewed-draft'}`);
  const query = kernel.query.bind(kernel);
  t.mock.method(kernel, 'query', async <Row>(statement: RawBuilder<Row>) => {
    const rows = await query<Row>(statement);
    if (JSON.stringify(statement.toOperationNode()).includes('site_consent_heads')) {
      await kernel.execute(sql`UPDATE site_consent_heads SET published_id = ${'published-2'} WHERE workspace_id = ${'public-test'}`);
    }
    return rows;
  });
  assert.deepEqual(await store.readPublished({}), published);
  await assert.rejects(store.read({}), SyntaxError);
});
