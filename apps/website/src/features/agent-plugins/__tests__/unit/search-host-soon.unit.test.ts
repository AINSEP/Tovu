import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installAgentPlugin } from '../../lifecycle.js';
import { resolveAgentPluginLayout } from '../../layout.js';
import { buildAgentPluginSearchRegistrations } from '../../tool-registrations.js';

/** Installs a plugin that declares no maturity of its own, then runs the assistant's search tool. */
async function searchInstalled(pluginId: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'tovu-search-soon-'));
  try {
    const layout = resolveAgentPluginLayout({ siteDir: root });
    const archive = Buffer.from(JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: pluginId, version: '1.0.0', description: 'Does a thing.' }));
    await installAgentPlugin({ layout, workspaceId: 'workspace-1', archive, expectedSha256: createHash('sha256').update(archive).digest('hex'), archiveReader: {
      async *entries() { yield { kind: 'file' as const, entryPath: 'plugin.json', declaredSize: archive.length, executable: false, async *openReadStream() { yield archive; } }; },
    } });
    const [registration] = buildAgentPluginSearchRegistrations({ workspaceId: 'workspace-1', agentPluginLayout: layout,
      authorize: async () => ({ allowed: true, reason: 'matched' }) } as never);
    const page = await registration!.handler({ input: {}, principal: { id: 'admin-1' } } as never) as { matches: { pluginId: string; maturity?: string }[] };
    return page.matches.find(match => match.pluginId === pluginId);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('a Soon plugin is not offered for enable', async () => {
  assert.equal((await searchInstalled('stripe'))?.maturity, 'soon');
});

test('a plugin that is not on the host Soon list carries no maturity', async () => {
  const match = await searchInstalled('plain-example');
  assert.ok(match);
  assert.equal(match.maturity, undefined);
});
