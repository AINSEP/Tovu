/** @file Consent tests use the real SQL adapter and fresh ADR-066 schema, with effect ports controlled. */
import type { TestContext } from 'node:test';
import { openContentDb } from '#src/platform/db/sqlite/content-db';
import { contentKernel } from '#src/platform/db/content-kernel';
import { closeSqliteConnection } from '#src/platform/db/kernel/drivers/sqlite';
import { createSiteConsentStore } from '../revisions.repo.js';
import { createSiteConsentService, type ConsentServicePorts } from '../service.js';
import { SITE_CONSENT_DEFAULTS } from '../config.js';

export function consentFixture({ t }: { t: TestContext }, _options = {}) {
  const db = openContentDb(':memory:');
  t.after(() => closeSqliteConnection(db));
  const store = createSiteConsentStore({ kernel: contentKernel(db), workspaceId: 'ws' });
  let allowed = true;
  let count = 0;
  const calls: string[] = [];
  const config = { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: '/privacy' };
  const ports: ConsentServicePorts = {
    workspaceId: 'ws', store, ready: Promise.resolve(),
    authorize: async ({ permission }) => { calls.push(permission); return { allowed, reason: allowed ? 'matched' : 'insufficient_permission' }; },
    clock: { nowIso: () => '2026-10-20T12:00:00.000Z' }, ids: { newId: () => `revision-${++count}` },
    trustedRegion: false, readLegacy: async () => ({ ...SITE_CONSENT_DEFAULTS, enabled: false }), privacyPageExists: async () => true,
    renderPage: async () => ({ html: '<!doctype html><html><head></head><body><script src="https://tracker.example/pixel.js?secret=redact"></script><script>window.optional=1</script><button onclick="window.clicked=1">Click</button></body></html>', ok: true, truncated: false }),
    necessaryScripts: async () => [],
    receiptStorage: async () => ({ writable: true, count: 0 }),
  };
  const service = createSiteConsentService({ ports });
  return { db, store, ports, service, config, calls, deny: () => { allowed = false; } };
}
