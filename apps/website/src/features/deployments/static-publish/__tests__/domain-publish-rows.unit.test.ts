import assert from 'node:assert/strict';
import test from 'node:test';
import { domainPublishRows } from '../domain-publish-rows.js';
import type { DeployTargetInspection } from '../../deploy-targets/types.js';

const route = { id: 'route-1', pattern: '*byho.io/*', script: 'legacy' };
const inspection: DeployTargetInspection = {
  resourceName: 'byho-io', targetId: 'cloudflare-workers',
  hostingChanges: [{ action: 'update', targetId: 'cloudflare-workers', resourceName: 'byho-io' }],
  domains: {
    inventoryStatus: 'complete', fingerprint: 'f', message: 'Review every change.',
    // Per-host views may repeat a shared change; only the de-duplicated plan list is shown.
    hostnames: [
      { hostname: 'byho.io', status: 'changes-required', routes: [route], changes: [{ reason: 'per-host view only' }] },
      { hostname: 'www.byho.io', status: 'configured', summary: 'Worker: byho-io, production, enabled', changes: [{ reason: 'per-host view only' }] },
    ],
    changes: [
      { method: 'DELETE', path: '/zones/z/dns_records/rec-1', reason: 'Replace A record rec-1 for byho.io.' },
      { method: 'PUT', path: '/accounts/a/workers/domains', body: { hostname: 'byho.io', service: 'byho-io' } },
    ],
  },
};

test('domain card rows read as a change list: target, project, each hostname and each change on its own row', () => {
  assert.deepEqual(domainPublishRows({ inspection, projectName: 'byho-io', target: 'cloudflare-workers' }), [
    { label: 'Project', value: 'byho-io' },
    { label: 'Target', value: 'cloudflare-workers' },
    { label: 'Hosting', value: 'action: update, targetId: cloudflare-workers, resourceName: byho-io' },
    { label: 'Now on byho.io', value: 'changes required' },
    { label: 'Now on www.byho.io', value: 'Worker: byho-io, production, enabled' },
    { label: 'Will change', value: 'Replace A record rec-1 for byho.io.' },
    // No plugin reason: every field is still shown, as plain text rather than a JSON dump.
    { label: 'Will change', value: 'method: PUT, path: /accounts/a/workers/domains, body: (hostname: byho.io, service: byho-io)' },
  ]);
});

test('domain card rows never contain raw JSON', () => {
  for (const row of domainPublishRows({ inspection, projectName: 'p', target: 't' })) assert.doesNotMatch(row.value, /[{}"]/);
});

test('domain card rows include the form-submission consequence, a host without a status, and say when no domain changes run', () => {
  const rows = domainPublishRows({ projectName: 'p', target: 't', inspection: {
    resourceName: 'r', targetId: 't', hostingChanges: [],
    domains: { inventoryStatus: 'complete', message: 'm', changes: [], hostnames: [{ hostname: 'example.com' }] },
    formSubmissions: { status: 'on', forms: 2, message: 'Two forms will be received here.', changes: [] },
  } });
  assert.deepEqual(rows.slice(2), [
    { label: 'Now on example.com', value: 'unknown' },
    { label: 'Will change', value: 'No domain changes.' },
    { label: 'Form submissions', value: 'Two forms will be received here.' },
  ]);
});

test('domain card rows without a domain plan, with unnamed hosts, nested arrays/nulls and blank reasons still show every field', () => {
  assert.deepEqual(domainPublishRows({ projectName: 'p', target: 't', inspection: { resourceName: 'r', targetId: 't', hostingChanges: [{ steps: ['create site', 3, null, { reason: 'Upload files.' }] }] } }), [
    { label: 'Project', value: 'p' }, { label: 'Target', value: 't' },
    { label: 'Hosting', value: 'steps: (create site; 3; null; Upload files.)' },
    { label: 'Will change', value: 'No domain changes.' },
  ]);
  const rows = domainPublishRows({ projectName: 'p', target: 't', inspection: {
    resourceName: 'r', targetId: 't', hostingChanges: [],
    domains: { inventoryStatus: 'complete', message: 'm',
      hostnames: [{ status: 'pending-validation', summary: '   ' }],
      changes: [{ reason: '  ', step: 2, extra: null }] },
  } });
  assert.deepEqual(rows.slice(2), [
    { label: 'Now on hostname', value: 'pending validation' },
    { label: 'Will change', value: 'reason:   , step: 2, extra: null' },
  ]);
});
