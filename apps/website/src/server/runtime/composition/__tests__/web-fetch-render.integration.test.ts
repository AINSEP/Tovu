/**
 * @file The composed `web_fetch_page` render path in `tool-catalog-manifest.ts`: `render: true` launches a
 * real headless Chromium through the catalog's own browser pool (unsandboxed, as the production container
 * permits), and every request the browser makes leaves through the guarded client built for the fetch
 * policy with redirects disabled. The guarded client here is an injected in-memory site, so no public
 * network is touched; the browser itself is real, which is the behaviour these lines own.
 */
import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createContributionRegistry, type ToolContributor, type DerivedToolContributor } from '@jini-ai/core';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import type { AssistantSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import type { HttpRequest } from '#src/platform/http/ports';
import { installFirstPartyToolContributors } from '../tool-catalog-manifest.js';

const SHELL = '<!doctype html><html><head><title>Bakery</title></head><body><div id="app"></div>'
  + '<script>document.getElementById("app").textContent = "Sourdough baked " + (6 * 7) + " minutes";</script></body></html>';

test('web_fetch_page with render: true runs the page script in a real browser, fetched only through the no-redirect guarded client', { timeout: 60_000 }, async () => {
  const sent: { maxRedirects: number | undefined; url: string }[] = [];
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions }, { createHttpClient: ({ policy }) => ({ send: async (request: HttpRequest) => {
    sent.push({ maxRedirects: policy.maxRedirects, url: request.url });
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, bodyText: SHELL, finalUrl: request.url };
  } }) });
  const contributor = contributions.contributors.list({}).find(item => item.domain === 'web');
  assert.ok(contributor, 'precondition: the catalog composes the web domain');
  const tool = contributor.build({ workspaceId: 'render-site', authorize: async () => ({ allowed: true, reason: 'matched' }) } as never, {} as never)[0]!;

  const result = await tool.handler({ executionId: 'render-1', principal: { id: 'owner' }, run: { id: 'chat' }, input: { url: 'https://bakery.example/menu', render: true, format: 'text' }, signal: new AbortController().signal }) as { content: string; rendered?: boolean; title?: string };

  // The text exists only after the inline script runs, so a raw (non-rendered) read cannot produce it.
  assert.match(result.content, /Sourdough baked 42 minutes/);
  assert.equal(result.rendered, true);
  assert.deepEqual(sent.filter(entry => entry.url === 'https://bakery.example/menu'), [{ maxRedirects: 0, url: 'https://bakery.example/menu' }]);
  assert.ok(sent.every(entry => entry.maxRedirects === 0), `every browser request uses the no-redirect client: ${JSON.stringify(sent)}`);
});
