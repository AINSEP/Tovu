import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { harness, owner } from '#src/features/agent-plugins/__tests__/fixtures/plugin-exports';
import type { TovuAgentPluginLifecycle } from '#src/features/agent-plugins/lifecycle';
import { registerPluginExportFilesRoute } from '../../export-files.js';

for (const scenario of ['catalog-error', 'read-error', 'duplicate-owner', 'missing-component', 'no-assets', 'disabled'] as const) {
  test(`export file ${scenario} is a private, uncached 404`, async () => {
    let reads = 0;
    const source = harness().source;
    const app = express();
    registerPluginExportFilesRoute({ app, deps: { workspaceId: 'ws', clock: { nowMs: () => 0 }, agentPluginLifecycle: portFake<TovuAgentPluginLifecycle>({}) } }, {
      source: { ...source,
        list: async () => {
          if (scenario === 'catalog-error') throw new Error('/private/package/path');
          if (scenario === 'duplicate-owner') return [owner, owner];
          return [{ ...owner, enabled: scenario !== 'disabled', exports: scenario === 'no-assets' ? { button: { ...owner.exports.button!, assets: undefined } } : owner.exports }];
        },
        readAsset: async () => { reads++; throw new Error('/private/asset/path'); },
      }, limiter: { check: async () => ({ allowed: true }) },
    });
    const { res, capture } = createCapturingResponse();
    const headers: Record<string, string> = {};
    Object.assign(res, { set: (value: Record<string, string>) => { Object.assign(headers, value); return res; },
      type: () => res, send: (body: unknown) => { capture.jsonBody = body; return res; } });
    await extractRouteHandler(app, 'get', '/api/agent-plugin-exports/v1/:pluginId/:component/*')({
      params: { pluginId: 'demo', component: scenario === 'missing-component' ? 'absent' : 'button', 0: 'components/mark.png' },
      headers: {}, socket: { remoteAddress: '203.0.113.1' },
    }, res);
    assert.deepEqual(capture, { statusCode: 404, jsonBody: 'Not found' });
    assert.deepEqual(headers, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    assert.equal(reads, scenario === 'read-error' ? 1 : 0);
  });
}
