/**
 * @file The composed `web_fetch_page` render launcher in `tool-catalog-manifest.ts` when no browser can
 * start: the catalog asks Playwright for Chromium with the production container's launch options
 * (sandbox off, the public-render proxy and flags kept), then system Chrome with the same options, and a
 * double failure surfaces as "browser unavailable", which permits exactly one guarded non-rendered fetch.
 * Only the third-party `playwright` module is replaced, so the launch can fail deterministically.
 */
import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createContributionRegistry, type ToolContributor, type DerivedToolContributor } from '@jini-ai/core';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import type { AssistantSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import type { HttpRequest } from '#src/platform/http/ports';

const launches: Record<string, unknown>[] = [];
mock.module('playwright', { namedExports: { chromium: { launch: async (options: Record<string, unknown>) => {
  launches.push(options);
  throw new Error(`no browser binary (${launches.length})`);
} } } });
const { installFirstPartyToolContributors } = await import('../tool-catalog-manifest.js');

const PAGE = '<!doctype html><html><head><title>Bakery</title></head><body><p>Rye on Fridays</p><div id="app"></div>'
  + '<script>document.getElementById("app").textContent = "rendered only";</script></body></html>';

test('when neither Chromium nor Chrome launches, render falls back to one guarded raw fetch after two unsandboxed launch attempts', async () => {
  const sent: { maxRedirects: number | undefined; url: string }[] = [];
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions }, { createHttpClient: ({ policy }) => ({ send: async (request: HttpRequest) => {
    sent.push({ maxRedirects: policy.maxRedirects, url: request.url });
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, bodyText: PAGE, finalUrl: request.url };
  } }) });
  const contributor = contributions.contributors.list({}).find(item => item.domain === 'web');
  assert.ok(contributor, 'precondition: the catalog composes the web domain');
  const tool = contributor.build({ workspaceId: 'no-browser-site', authorize: async () => ({ allowed: true, reason: 'matched' }) } as never, {} as never)[0]!;

  const result = await tool.handler({ executionId: 'render-2', principal: { id: 'owner' }, run: { id: 'chat' }, input: { url: 'https://bakery.example/menu', render: true, format: 'text' }, signal: new AbortController().signal }) as { content: string; note?: string };

  assert.equal(result.note, 'Browser unavailable; returned a guarded non-rendered fetch. JavaScript was not executed.');
  assert.match(result.content, /Rye on Fridays/);
  assert.doesNotMatch(result.content, /rendered only/);
  // The fallback is the policy client that follows redirects, never the browser's no-redirect client.
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, 'https://bakery.example/menu');
  assert.notEqual(sent[0]!.maxRedirects, 0);
  assert.equal(launches.length, 2);
  for (const options of launches) {
    assert.equal(options.chromiumSandbox, false);
    assert.equal(options.headless, true);
    assert.ok(Array.isArray(options.args) && options.args.includes('--proxy-server=http://127.0.0.1:9'), `public-render proxy kept: ${JSON.stringify(options.args)}`);
  }
  assert.equal(launches[0]!.channel, undefined);
  assert.equal(launches[1]!.channel, 'chrome');
});
