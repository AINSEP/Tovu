import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { dispatchHttpRequest } from '#src/server/__tests__/helpers/in-process-http';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { harness, owner } from '#src/features/agent-plugins/__tests__/fixtures/plugin-exports';
import type { TovuAgentPluginLifecycle } from '#src/features/agent-plugins/lifecycle';
import { registerPluginExportFilesRoute } from '../../export-files.js';

for (const scenario of ['catalog-error', 'read-error', 'duplicate-owner', 'missing-component', 'no-assets', 'disabled'] as const) {
  test(`export file ${scenario} is a private, uncached 404`, async () => {
    let reads = 0;
    const source = harness().source;
    const app = express();
    registerPluginExportFilesRoute({ errors: createRouteIncidentReporter().errors, app, deps: { workspaceId: 'ws', clock: { nowMs: () => 0 }, agentPluginLifecycle: portFake<TovuAgentPluginLifecycle>({}) } }, {
      source: { ...source,
        list: async () => {
          if (scenario === 'catalog-error') throw new Error('/private/package/path');
          if (scenario === 'duplicate-owner') return [owner, owner];
          return [{ ...owner, enabled: scenario !== 'disabled', exports: scenario === 'no-assets' ? { button: { ...owner.exports.button!, assets: undefined } } : owner.exports }];
        },
        readAsset: async () => { reads++; throw new Error('/private/asset/path'); },
      }, limiter: { check: async () => ({ allowed: true }) },
    });
    const response = await dispatchHttpRequest({ app, method: 'get', url: `/api/agent-plugin-exports/v1/demo/${scenario === 'missing-component' ? 'absent' : 'button'}/components/mark.png` });
    assert.deepEqual({ statusCode: response.status, jsonBody: response.body }, { statusCode: 404, jsonBody: 'Not found' });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(reads, scenario === 'read-error' ? 1 : 0);
  });
}

test('a declared script is served as JavaScript; an undeclared or remote one is not', async () => {
  const entry = { ...owner.exports.button!, scripts: ['components/widget.js', 'https://assets.vendor.test/loader.js'] };
  const source = harness().source;
  const app = express();
  registerPluginExportFilesRoute({ errors: createRouteIncidentReporter().errors, app, deps: { workspaceId: 'ws', clock: { nowMs: () => 0 }, agentPluginLifecycle: portFake<TovuAgentPluginLifecycle>({}) } }, {
    source: { ...source, list: async () => [{ ...owner, exports: { button: entry } }], readAsset: async () => 'console.log(1)' }, limiter: { check: async () => ({ allowed: true }) },
  });
  const request = async (path: string) => {
    const response = await dispatchHttpRequest({ app, method: 'get', url: `/api/agent-plugin-exports/v1/demo/button/${path}` });
    return { status: response.status, type: response.headers['content-type'], body: response.body };
  };
  assert.deepEqual(await request('components/widget.js'), { status: 200, type: 'text/javascript; charset=utf-8', body: 'console.log(1)' });
  assert.equal((await request('components/other.js')).status, 404);
  assert.equal((await request('https://assets.vendor.test/loader.js')).status, 404);
});
