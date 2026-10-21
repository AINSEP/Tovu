/** @file Consent 1b: immutable drafts, publication, readiness and fail-closed deployment decisions. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sql } from 'kysely';
import { contentKernel } from '#src/platform/db/content-kernel';
import { createSiteConsentStore } from '../revisions.repo.js';
import { SiteConsentConflict } from '../revisions.js';
import { parseConsentConfig, consentConfigProblems } from '../validation.js';
import { consentFixture } from './fixture.js';
import { SITE_CONSENT_DEFAULTS } from '../config.js';

test('draft saves preserve published enforcement; stale editors and stale publication are refused', async t => {
  const f = consentFixture({ t });
  const first = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  assert.equal((await f.service.read({ principalId: 'owner' })).effective.enabled, false);
  await f.service.publish({ principalId: 'owner', draftId: first.revision.id, expectedPublishedId: null });
  const next = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, enabled: false }, expectedDraftId: first.revision.id });
  assert.equal((await f.service.read({ principalId: 'owner' })).effective.enabled, true);
  await assert.rejects(f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: first.revision.id }), SiteConsentConflict);
  await assert.rejects(f.service.publish({ principalId: 'owner', draftId: first.revision.id, expectedPublishedId: null }), SiteConsentConflict);
  await assert.rejects(f.service.publish({ principalId: 'owner', draftId: next.revision.id, expectedPublishedId: null }), SiteConsentConflict);
  const reopened = createSiteConsentStore({ kernel: contentKernel(f.db), workspaceId: 'ws' });
  assert.equal((await reopened.read({})).published?.id, first.revision.id);
  const rows = await contentKernel(f.db).query<{ n: number }>(sql`SELECT count(*) AS n FROM site_consent_revisions`);
  assert.equal(rows[0]?.n, 2);
  assert.deepEqual(await createSiteConsentStore({ kernel: contentKernel(f.db), workspaceId: 'other' }).read({}), { draft: null, published: null });
});

test('dry run reuses the engine categories and gate without saving receipts, scripts or settings', async t => {
  const f = consentFixture({ t });
  const before = await f.store.read({});
  const result = await f.service.readiness({ principalId: 'owner', config: f.config });
  assert.equal(result.ready, true);
  assert.deepEqual(result.categories.map(item => item.id), ['necessary', 'functional', 'analytics', 'marketing']);
  assert.ok(result.detected.some(item => item.category === 'marketing' && item.source === 'https://tracker.example/pixel.js'));
  assert.ok(result.detected.some(item => item.category === 'functional' && item.tag === 'script'));
  assert.ok(!JSON.stringify(result).includes('secret=redact'));
  assert.deepEqual(await f.store.read({}), before);
  f.ports.renderPage = async () => ({ html: '', ok: true, truncated: true });
  assert.equal((await f.service.readiness({ principalId: 'owner', config: f.config })).ready, false);
  f.ports.renderPage = async () => { throw new Error('private file path'); };
  const failed = await f.service.readiness({ principalId: 'owner', config: f.config });
  assert.equal(failed.ready, false);
  assert.ok(!JSON.stringify(failed).includes('private file path'));
});

test('invalid customization remains a draft and cannot replace the valid published policy', async t => {
  const f = consentFixture({ t });
  const valid = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: valid.revision.id, expectedPublishedId: null });
  const invalid = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, customCss: '#jini-consent button:first-child { display:none }' }, expectedDraftId: valid.revision.id });
  assert.ok(invalid.blockingProblems.length > 0);
  await assert.rejects(f.service.publish({ principalId: 'owner', draftId: invalid.revision.id, expectedPublishedId: valid.revision.id }));
  assert.equal((await f.store.read({})).published?.id, valid.revision.id);
  f.ports.privacyPageExists = async () => false;
  const missing = await f.service.readiness({ principalId: 'owner', config: f.config });
  assert.ok(missing.blockingProblems.some(problem => problem.code === 'PRIVACY_PAGE_MISSING'));
});

test('every service operation authorizes before reading state or performing effects', async t => {
  const f = consentFixture({ t }); f.deny();
  f.ports.store = undefined;
  for (const call of [
    () => f.service.read({ principalId: 'bare' }),
    () => f.service.readiness({ principalId: 'bare' }),
    () => f.service.preview({ principalId: 'bare' }),
    () => f.service.saveDraft({ principalId: 'bare', config: f.config, expectedDraftId: null }),
    () => f.service.publish({ principalId: 'bare', draftId: 'x', expectedPublishedId: null }),
    () => f.service.deploymentCheck({ principalId: 'bare', permission: 'system.publish' }),
  ]) await assert.rejects(call, /not authorized/);
  assert.deepEqual(await f.store.read({}), { draft: null, published: null });
});

test('deployment refuses enabled, incomplete and unavailable consent, with two actionable choices', async t => {
  const f = consentFixture({ t });
  assert.equal(await f.service.deploymentCheck({ principalId: 'owner', permission: 'system.publish' }), null);
  f.ports.readLegacy = async () => ({ ...f.config, privacyPolicyUrl: '' });
  assert.ok((await f.service.deploymentCheck({ principalId: 'owner', permission: 'system.publish' }))?.blockingProblems.some(problem => problem.code === 'PRIVACY_LINK_REQUIRED'));
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const blocked = await f.service.deploymentCheck({ principalId: 'owner', permission: 'system.publish' });
  assert.equal(blocked?.code, 'CONSENT_REVIEW_REQUIRED');
  assert.deepEqual(blocked?.choices.map(choice => choice.id), ['fix-now', 'publish-without-banner']);
  f.ports.store = undefined;
  assert.equal((await f.service.deploymentCheck({ principalId: 'owner', permission: 'system.publish' }))?.blockingProblems[0]?.code, 'CONSENT_UNAVAILABLE');
});

for (const patch of [ { enabled: 'yes' }, { categories: ['necessary'] }, { customCss: 'x'.repeat(16385) }, { appearance: [] }, { title: '' }, { message: 'x'.repeat(601) }, { policyVersion: '' }, { policyVersion: 'x'.repeat(65) }, { placement: 'center-modal' }, { regionMode: 'guess' } ]) {
  test(`strict configuration rejects ${Object.keys(patch)[0]}`, () => {
    assert.throws(() => parseConsentConfig({ value: { ...consentFixtureDefaults, ...patch } }));
  });
}
const consentFixtureDefaults = { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: '/privacy' };

for (const field of Object.keys(SITE_CONSENT_DEFAULTS)) {
  test(`full configuration requires an explicit ${field}`, () => {
    const incomplete: Record<string, unknown> = { ...consentFixtureDefaults };
    delete incomplete[field];
    assert.throws(() => parseConsentConfig({ value: incomplete }), new RegExp(`Invalid consent field: ${field}`));
  });
}

test('a copy-only save cannot silently disable consent or move a draft head', async t => {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const before = await f.store.read({});
  await assert.rejects(f.service.saveDraft({ principalId: 'owner', config: { title: 'Edited title' }, expectedDraftId: saved.revision.id }), /Invalid consent field: enabled/);
  assert.deepEqual(await f.store.read({}), before);
});

test('persisted policies missing enabled are rejected by reads, publication and deployment', async t => {
  const f = consentFixture({ t });
  const { enabled: _enabled, ...incomplete } = f.config;
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await contentKernel(f.db).execute(sql`UPDATE site_consent_revisions SET config_json = ${JSON.stringify(incomplete)} WHERE id = ${saved.revision.id}`);
  await assert.rejects(f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null }), /Invalid consent field: enabled/);
  await f.store.publish({ draftId: saved.revision.id, expectedPublishedId: null });
  await assert.rejects(f.service.read({ principalId: 'owner' }), /Invalid consent field: enabled/);
  assert.equal((await f.service.deploymentCheck({ principalId: 'owner', permission: 'system.publish' }))?.blockingProblems[0]?.code, 'CONSENT_UNAVAILABLE');
});

test('readiness requires writable receipt storage and reports its count without leaking storage errors', async t => {
  const f = consentFixture({ t });
  f.ports.receiptStorage = async () => ({ writable: true, count: 7 });
  const healthy = await f.service.readiness({ principalId: 'owner', config: f.config });
  assert.equal(healthy.ready, true);
  assert.deepEqual(healthy.receipts, { writable: true, count: 7 });
  f.ports.receiptStorage = async () => ({ writable: false, count: 7 });
  const denied = await f.service.readiness({ principalId: 'owner', config: f.config });
  assert.equal(denied.ready, false);
  assert.ok(denied.blockingProblems.some(problem => problem.code === 'RECEIPT_STORAGE_UNAVAILABLE'));
  f.ports.receiptStorage = async () => ({ writable: true, count: null });
  assert.equal((await f.service.readiness({ principalId: 'owner', config: f.config })).ready, false);
  f.ports.receiptStorage = async () => { throw new Error('private receipt directory'); };
  const failed = await f.service.readiness({ principalId: 'owner', config: f.config });
  assert.equal(failed.ready, false);
  assert.deepEqual(failed.receipts, { writable: false, count: null });
  assert.ok(failed.blockingProblems.some(problem => problem.code === 'RECEIPT_STORAGE_UNAVAILABLE'));
  assert.ok(!JSON.stringify(failed).includes('private receipt directory'));
  f.ports.renderPage = async () => { throw new Error('render failed'); };
  assert.deepEqual((await f.service.readiness({ principalId: 'owner', config: f.config })).receipts, { writable: false, count: null });
});

test('Jini validators reject credential links, untrusted auto mode and unreadable custom colors', () => {
  const config = parseConsentConfig({ value: { ...consentFixtureDefaults, privacyPolicyUrl: 'https://user:pass@example.com/privacy', regionMode: 'auto', appearance: { backgroundColor: '#fff', textColor: '#fff' } } });
  const codes = consentConfigProblems({ config, trustedRegion: false }).map(problem => problem.code);
  assert.ok(codes.includes('PRIVACY_LINK_REQUIRED')); assert.ok(codes.includes('TRUSTED_REGION_REQUIRED')); assert.ok(codes.includes('contrast'));
});

test('SQL-only schema has exact columns and failed duplicate saves cannot move either head', async t => {
  const f = consentFixture({ t }); const kernel = contentKernel(f.db);
  const revisions = await kernel.query<{ name: string }>(sql`PRAGMA table_info(site_consent_revisions)`);
  const heads = await kernel.query<{ name: string }>(sql`PRAGMA table_info(site_consent_heads)`);
  assert.deepEqual(revisions.map(row => row.name).sort(), ['actor_id', 'config_json', 'created_at', 'id', 'workspace_id']);
  assert.deepEqual(heads.map(row => row.name).sort(), ['draft_id', 'published_id', 'workspace_id']);
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await assert.rejects(f.store.saveDraft({ revision: { ...saved.revision, config: { ...f.config, enabled: false } }, expectedDraftId: saved.revision.id }));
  assert.deepEqual((await f.store.read({})).draft?.config, f.config);
  const raced = await Promise.allSettled([
    f.service.saveDraft({ principalId: 'owner', config: { ...f.config, title: 'A' }, expectedDraftId: saved.revision.id }),
    f.service.saveDraft({ principalId: 'owner', config: { ...f.config, title: 'B' }, expectedDraftId: saved.revision.id }),
  ]);
  assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(raced.filter(result => result.status === 'rejected').length, 1);
});

test('preview is read-only and local paths cannot address APIs, traverse or escape the site', async t => {
  const f = consentFixture({ t });
  const preview = await f.service.preview({ principalId: 'owner', config: f.config });
  assert.match(preview.html, /jini-consent/); assert.equal(preview.sandbox, '');
  assert.deepEqual(await f.store.read({}), { draft: null, published: null });
  for (const path of ['https://attacker.example', '//attacker.example', '/api/admin/v1/settings', '/%2e%2e/admin', '/a/../admin']) await assert.rejects(f.service.readiness({ principalId: 'owner', path }));
  f.ports.renderPage = async () => ({ html: '', ok: false, truncated: false });
  await assert.rejects(f.service.preview({ principalId: 'owner' }));
});

test('the editor offers automatic region mode only when an operator configured a trusted region header', async t => {
  const f = consentFixture({ t });
  assert.deepEqual((await f.service.read({ principalId: 'owner' })).editor.regionModes, ['opt-in', 'opt-out']);
  f.ports.trustedRegion = true;
  assert.deepEqual((await f.service.read({ principalId: 'owner' })).editor.regionModes, ['opt-in', 'opt-out', 'auto']);
});

test('readiness never invents a placement: a policy without one is refused, a named one is reported', async t => {
  const f = consentFixture({ t });
  const { placement: _placement, ...withoutPlacement } = f.config;
  f.ports.readLegacy = async () => withoutPlacement as typeof f.config;
  await assert.rejects(f.service.readiness({ principalId: 'owner' }), { message: 'Invalid consent field: placement.' });
  f.ports.readLegacy = async () => ({ ...f.config, placement: 'top-bar' });
  assert.equal((await f.service.readiness({ principalId: 'owner' })).placement, 'top-bar');
});

test('preview refuses to return HTML when the engine gate cannot process the page', async t => {
  const f = consentFixture({ t });
  f.ports.consentGate = () => { throw new Error('cannot normalize'); };
  await assert.rejects(f.service.preview({ principalId: 'owner', config: f.config }), { message: 'The consent engine could not safely render the preview.' });
  const readiness = await f.service.readiness({ principalId: 'owner', config: f.config });
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockingProblems.some(problem => problem.code === 'GATE_FAILED'));
});

test('the store refuses a head that points at a missing or oversized revision, and an oversized draft', async t => {
  const f = consentFixture({ t });
  const kernel = contentKernel(f.db);
  await kernel.execute(sql`INSERT INTO site_consent_heads (workspace_id, draft_id, published_id) VALUES (${'ws'}, ${'ghost'}, NULL)`);
  await assert.rejects(f.store.read({}), { message: 'Stored consent revision is unavailable.' });
  await kernel.execute(sql`INSERT INTO site_consent_revisions (workspace_id, id, config_json, actor_id, created_at) VALUES (${'ws'}, ${'ghost'}, ${JSON.stringify({ title: 'x'.repeat(32_768) })}, ${'owner'}, ${'2026-10-20T12:00:00.000Z'})`);
  await assert.rejects(f.store.read({}), { message: 'Stored consent revision is unavailable.' });
  const other = createSiteConsentStore({ kernel, workspaceId: 'other' });
  await assert.rejects(other.saveDraft({ revision: { id: 'big', config: { ...f.config, message: 'x'.repeat(32_768) }, actorId: 'owner', createdAt: '2026-10-20T12:00:00.000Z' }, expectedDraftId: null }), { message: 'Consent configuration exceeds 32 KiB.' });
  assert.deepEqual(await other.read({}), { draft: null, published: null });
});
