// Moved from core's apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-cloudflare-pages.unit.test.ts (types stripped): vendor tests live with
// the vendor plugin; the host kits and fixtures it drives are still core's real ones, imported by path.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { loadDeployTargetRegistryFromSource } from '../../../../apps/website/src/features/deployments/deploy-targets/registry.ts';
import { createDeployHostKit } from '../../../../apps/website/src/features/deployments/deploy-targets/host-kit.ts';

/** Package-level compatibility. Protocol/limits/domain lifecycle cases now live next to their
 * implementation in content/agent-plugins/cloudflare/{lib,targets}/__tests__ and root test discovery
 * includes them. The superseded unsafe metadata-only domain path must never be callable. */
const packageRoot = path.resolve(import.meta.dirname, '..');

test('renamed Cloudflare package loads both targets, preserving the Pages target and vendor credential', async () => {
  const registry = await loadDeployTargetRegistryFromSource({ pluginId: 'cloudflare', packageRoot });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(target => target.descriptor.id), ['cloudflare-workers', 'cloudflare-pages']);
  const pages = registry.get('cloudflare-pages');
  assert.equal(pages.pluginId, 'cloudflare');
  assert.equal(pages.descriptor.credential?.vendorId, 'cloudflare');
  assert.deepEqual(pages.descriptor.env, { tokenVars: ['CLOUDFLARE_TOKEN', 'CLOUDFLARE_API_TOKEN'], fields: { accountId: 'CLOUDFLARE_ACCOUNT_ID' } });
  assert.equal(registry.get('cloudflare-workers')?.module.defaultForNewDestination, true);
});

test('both installed module contracts refuse model-provided domain approval before any request', async () => {
  const registry = await loadDeployTargetRegistryFromSource({ pluginId: 'cloudflare', packageRoot });
  const kit = createDeployHostKit({ fetchFn: async () => assert.fail('unconfirmed execution must never call HTTP') });
  for (const loaded of registry.list()) {
    const target = loaded.module.create({ credential: { token: 'token', accountId: 'account' }, config: { customDomain: 'example.com' }, kit });
    await assert.rejects(target.publish({ projectName: 'demo', files: [], metadata: { confirmed: true } }), /CLOUDFLARE_DOMAIN_CONFIRMATION_REQUIRED.*example.com/);
  }
});
