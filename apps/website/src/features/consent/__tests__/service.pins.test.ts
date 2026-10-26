/** @file Pin shared sampling selection, read-only responses and failure evidence before TW4. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { consentFixture } from './fixture.js';

test('readiness and preview select proposed, draft, published and legacy settings in order', async t => {
  const f = consentFixture({ t });
  const paths: string[] = [];
  f.ports.readLegacy = async () => ({ ...f.config, title: 'Legacy banner', placement: 'top-bar' });
  f.ports.renderPage = async ({ path }) => { paths.push(path); return { html: '<body></body>', ok: true, truncated: false }; };
  const legacy = await f.service.readiness({ principalId: 'owner' });
  assert.equal(legacy.placement, 'top-bar');
  assert.equal(legacy.enabled, true);
  assert.match((await f.service.preview({ principalId: 'owner' })).html, /Legacy banner/);
  assert.equal((await f.service.preview({ principalId: 'owner' })).revisionId, null);
  const published = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, title: 'Published banner', placement: 'bottom-left' }, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: published.revision.id, expectedPublishedId: null });
  // Isolate the published-only selection state through the existing typed store port.
  const publishedState = await f.store.read({});
  f.ports.store = { ...f.store, read: async () => ({ draft: null, published: publishedState.published }) };
  assert.equal((await f.service.readiness({ principalId: 'owner' })).placement, 'bottom-left');
  const publishedPreview = await f.service.preview({ principalId: 'owner' });
  assert.match(publishedPreview.html, /Published banner/);
  assert.equal(publishedPreview.revisionId, published.revision.id);
  f.ports.store = f.store;
  const draft = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, title: 'Draft banner', enabled: false, placement: 'bottom-right' }, expectedDraftId: published.revision.id });
  const draftReadiness = await f.service.readiness({ principalId: 'owner' });
  assert.equal(draftReadiness.placement, 'bottom-right');
  assert.equal(draftReadiness.enabled, true);
  const draftPreview = await f.service.preview({ principalId: 'owner' });
  assert.match(draftPreview.html, /Draft banner/);
  assert.equal(draftPreview.revisionId, draft.revision.id);
  const before = await f.store.read({});
  const proposed = { ...f.config, title: 'Proposed banner', placement: 'top-bar' };
  assert.equal((await f.service.readiness({ principalId: 'owner', path: '/privacy', config: proposed })).placement, 'top-bar');
  assert.match((await f.service.preview({ principalId: 'owner', config: proposed })).html, /Proposed banner/);
  assert.deepEqual(await f.store.read({}), before);
  assert.ok(paths.includes('/privacy'));
  for (const operation of [f.service.readiness, f.service.preview]) {
    await assert.rejects(operation({ principalId: 'owner', config: null }), { message: 'config must be a JSON object.' });
  }
});

test('readiness preserves receipt failure evidence, page status, metadata and render failure redaction', async t => {
  const f = consentFixture({ t });
  for (const receipts of [{ writable: true, count: 0 }, { writable: false, count: 3 }, { writable: true, count: null }]) {
    f.ports.receiptStorage = async () => receipts;
    const result = await f.service.readiness({ principalId: 'owner', config: f.config });
    assert.deepEqual(result.receipts, receipts);
    assert.equal(result.ready, receipts.writable && receipts.count !== null);
    assert.deepEqual(result.blockingProblems.map(problem => problem.code), result.ready ? [] : ['RECEIPT_STORAGE_UNAVAILABLE']);
  }
  f.ports.receiptStorage = async () => { throw new Error('private backend path'); };
  for (const page of [{ html: '<body></body>', ok: false, truncated: false }, { html: '', ok: true, truncated: true }, { html: '', ok: false, truncated: true }]) {
    f.ports.renderPage = async () => page;
    const result = await f.service.readiness({ principalId: 'owner', path: '/privacy', config: f.config });
    assert.deepEqual(result.receipts, { writable: false, count: null });
    assert.deepEqual(result.blockingProblems.map(problem => problem.code), ['RECEIPT_STORAGE_UNAVAILABLE', 'PAGE_UNAVAILABLE']);
    assert.equal(result.truncated, page.truncated);
    assert.equal(result.enabled, false);
    assert.equal(result.placement, 'bottom-right');
    assert.equal(result.regionMode, 'auto');
    assert.equal(result.delivery, 'live');
    assert.equal(result.staticSupported, false);
    assert.equal(result.sampleOnly, true);
    assert.deepEqual(result.sampledPaths, ['/privacy']);
    assert.equal(result.limitations.length, 1);
    await assert.rejects(f.service.preview({ principalId: 'owner', config: f.config }), { message: 'Preview requires one complete rendered page of at most 1 MB.' });
  }
  f.ports.renderPage = async () => { throw new Error('private renderer path'); };
  await assert.rejects(f.service.preview({ principalId: 'owner', config: f.config }), { message: 'private renderer path' });
  const failed = await f.service.readiness({ principalId: 'owner', path: '/privacy', config: f.config });
  assert.deepEqual(failed.blockingProblems.map(problem => problem.code), ['RECEIPT_STORAGE_UNAVAILABLE', 'RENDER_FAILED']);
  assert.deepEqual(failed.detected, []);
  assert.equal(failed.ready, false);
  assert.equal(failed.truncated, false);
  assert.deepEqual(failed.sampledPaths, ['/privacy']);
  assert.deepEqual(failed.limitations, ['Rendered evidence unavailable.']);
  assert.deepEqual(failed.categories.map(category => [category.id, category.required, category.editable]), [
    ['necessary', true, false], ['functional', false, false], ['analytics', false, false], ['marketing', false, false],
  ]);
  assert.ok(!JSON.stringify(failed).includes('private'));
});
