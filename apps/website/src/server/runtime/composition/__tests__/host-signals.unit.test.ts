import assert from 'node:assert/strict';
import test from 'node:test';
import { createContributionRegistry, type ToolContributor, type DerivedToolContributor } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { resolveHostSignals } from '../host-signals.js';
import { installFirstPartyToolContributors } from '../tool-catalog-manifest.js';

test('composition resolves process.env at call time when no env is injected', async t => {
  const before = process.env.FLY_APP_NAME;
  t.after(() => { if (before === undefined) delete process.env.FLY_APP_NAME; else process.env.FLY_APP_NAME = before; });
  delete process.env.FLY_APP_NAME;
  assert.equal(resolveHostSignals().hosted, false);
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const contributor = contributions.contributors.list({}).find(candidate => candidate.domain === 'plugins-install');
  assert.ok(contributor);
  let previews = 0;
  const [registration] = contributor.build(portFake<AssistantToolRegistryDeps>({
    workspaceId: 'ws-1', authorize: async () => ({ allowed: true, reason: 'matched' }),
    pluginInstaller: {
      preview: async () => { previews++; throw new Error('hosted installs must refuse before preview'); },
      install: async () => { throw new Error('hosted installs must refuse before installation'); },
    },
  }), portFake<AssistantSurfaceDeps>({}));
  assert.ok(registration);
  process.env.FLY_APP_NAME = 'hosted-site';
  assert.equal(resolveHostSignals().hosted, true);
  const result = await registration.handler({ executionId: 'e1', principal: { id: 'principal-1' }, run: { id: 'r1' },
    input: { source: { kind: 'folder', path: '/tmp/faq-blocks' } }, signal: new AbortController().signal,
  }, {}) as { reason: string };
  assert.equal(result.reason, 'PLUGIN_LOCAL_INSTALL_DISABLED');
  assert.equal(previews, 0);
});
