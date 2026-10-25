import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createAutomaticAgentPluginUse, parseAgentPluginManifest } from '@jini-ai/agent-plugins/lifecycle';
import { rankInstalledAgentPlugins, type AgentPluginSearchCandidate } from '../../lifecycle.js';
import { formatPluginToolPointer } from '../../bundled-catalog.js';

const bundledRoot = path.resolve(import.meta.dirname, '../../../../../../../content/agent-plugins');

// Read every shipped manifest: hand-picked synthetic metadata missed the shared site/deploy words.
async function bundledCandidates(): Promise<AgentPluginSearchCandidate[]> {
  const entries = await readdir(bundledRoot, { withFileTypes: true });
  // Deleted packages can leave empty folders behind on disk (git does not track them).
  const packages = entries.filter(entry => entry.isDirectory() && existsSync(path.join(bundledRoot, entry.name, 'plugin.json')));
  return Promise.all(packages.map(async entry => {
    const parsed = parseAgentPluginManifest({ value: JSON.parse(await readFile(path.join(bundledRoot, entry.name, 'plugin.json'), 'utf8')) });
    assert.ok(parsed.ok, `Invalid bundled manifest: ${entry.name}`);
    const manifest = parsed.manifest;
    return { pluginId: manifest.name, id: manifest.id, provides: manifest.provides,
      description: manifest.description, keywords: manifest.keywords ?? [],
      enabled: true, skills: [], mcpServerIds: [] };
  }));
}

for (const [query, expected] of [
  ['Design a new theme for this site', ['tovu-theme', 'ui-ux-design']],
  ["Design a new theme for this site — just tell me which plugins you'd load, don't change anything.", ['tovu-theme', 'ui-ux-design']],
  ['Deploy this site to Vercel', ['vercel']],
  // d6b319cea added dedicated WordPress guidance alongside the import owner.
  ['Import my old WordPress site', ['site-import', 'wordpress']],
  ["what's 2+2", []],
  ['Design a theme inspired by Vercel', ['tovu-theme', 'ui-ux-design']],
] as const) {
  test(`Auto suggests only relevant bundled plugins: ${query}`, async () => {
    const candidates = await bundledCandidates();
    const rank = ({ query, candidates, limit }: { query: string; candidates: readonly AgentPluginSearchCandidate[]; limit: number }) =>
      rankInstalledAgentPlugins(query, candidates, limit, { automatic: true });
    assert.deepEqual(rank({ query, candidates, limit: 12 }).map(plugin => plugin.pluginId).sort(), [...expected].sort());
    const loaded: string[] = [];
    const controller = createAutomaticAgentPluginUse({ mode: 'auto', ports: {
      formatPluginToolPointer,
      list: async () => candidates, rank,
      resolve: async ({ pluginId }) => { loaded.push(pluginId); return { ok: true, promptPrefix: `Guidance: ${pluginId}` }; },
      ask: async () => { throw new Error('Auto must not ask'); },
      saveAuto: async () => {}, publish: async () => {},
    } });
    // Auto discloses relevant plugins in a note; guidance loads only on demand or at the write backstop.
    const note = await controller.prepare({ query });
    assert.deepEqual([...note.matchAll(/\(([^()\s]+)\) — /g)].map(match => match[1]).sort(), [...expected].sort());
    assert.deepEqual(loaded, []);
  });
}
