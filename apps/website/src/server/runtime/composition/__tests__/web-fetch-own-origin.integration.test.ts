import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createContributionRegistry, type ToolContributor, type DerivedToolContributor } from '@jini-ai/core';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { createHttpClient } from '#src/platform/http/client';
import type { HttpRequest, PinnedPeer } from '#src/platform/http/ports';
import { installFirstPartyToolContributors } from '../tool-catalog-manifest.js';

test('web_fetch_page reads the configured local site and refuses other local origins across site bindings', async () => {
  const sent: { request: HttpRequest; peer: PinnedPeer }[] = [];
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions }, { createHttpClient: policy => createHttpClient({ policy, transport: { requestPinned: async (request, peer) => {
    sent.push({ request, peer });
    return { status: 200, headers: { 'content-type': 'text/plain' }, bodyText: 'Welcome to our pastry counter' };
  } } }, { dns: { resolve: async () => ['127.0.0.1'] } }) });
  const contributor = contributions.contributors.list({}).find(item => item.domain === 'web')!;
  for (const port of [43127, 43128]) {
    const deps = { workspaceId: `site-${port}`, derivedPublicOrigin: `http://localhost:${port}`, authorize: async () => ({ allowed: true, reason: 'matched' }) };
    const tool = contributor.build(deps as never, {} as never)[0]!;
    const call = (url: string) => tool.handler({ executionId: 'own-page', principal: { id: 'owner' }, run: { id: 'chat' }, input: { url }, signal: new AbortController().signal });
    const result = await call(`http://localhost:${port}/visit-us`) as { content: string };
    assert.equal(result.content, 'Welcome to our pastry counter');
    assert.equal(sent.at(-1)!.peer.port, port);
    const count = sent.length;
    for (const url of [`http://localhost:${port === 43127 ? 43128 : 43127}/`, `https://localhost:${port}/`, `http://127.0.0.1:${port}/`, 'http://10.0.0.1/', 'http://169.254.169.254/']) {
      await assert.rejects(call(url), /rejected/);
    }
    assert.equal(sent.length, count);
  }
});
