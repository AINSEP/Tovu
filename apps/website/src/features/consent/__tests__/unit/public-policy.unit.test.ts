import assert from 'node:assert/strict';
import test from 'node:test';
import { SITE_CONSENT_DEFAULTS } from '../../config.js';

const published = { id: 'published-1', config: { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: '/privacy' }, actorId: 'owner', createdAt: '2026-11-05T00:00:00.000Z' };

test('public policy context cannot call the draft-reading store method', async t => {
  t.mock.module(import.meta.resolve('#src/server/inbound/public-http/routes/site/pages'), { namedExports: { isStaticExportRequest: () => false } });
  const { readSiteConsentPolicy } = await import('#src/server/inbound/public-http/middleware/site-consent');
  let publishedReads = 0;
  const config = await readSiteConsentPolicy({ deps: {
    siteConsentReady: Promise.resolve(), consentStore: {
      read: async () => assert.fail('public context must not read drafts'),
      readPublished: async () => { publishedReads++; return published; },
    },
  } as never }, { cssBlocks: false });
  assert.equal(config.enabled, true);
  assert.equal(config.policyVersion, `${published.config.policyVersion}:${published.id}`);
  assert.equal(publishedReads, 1);
});
