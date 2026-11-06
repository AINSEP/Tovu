import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAgentPluginMcpConfig } from '../../mcp-metadata.js';
import { parseHostSignalDeclaration } from '../../host-signals.js';
import { readInstalledAgentPluginIdentity, readPluginMaturity, readProviderPluginLink } from '../../identity.js';
import { parseSupersedes } from '../../supersession.js';

const schema = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const signal = { env: 'EXAMPLE_HOST', facts: { hosted: true, trustProxyHops: 1 } };
const extension = { id: 'publisher/example', provides: ['example'], maturity: 'untested', providerPlugin: 'example-provider',
  hostSignals: [signal], deploymentAdvice: 'Use example production mode.', supersedes: { packages: ['old-example'] },
  mcpServers: { example: { authMode: 'oauth', defaultTools: { allow: ['inspect', 'create'], write: ['create'], read: ['inspect'] } } } };

test('portable manifest readers preserve identity, host signals, supersession and MCP grants', async () => {
  const manifest = { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'example', version: '1.0.0', extensions: { jini: extension, tovu: { id: 'old/wrong', maturity: 'soon' } } };
  assert.deepEqual(parseHostSignalDeclaration({ manifest }), { signals: [signal], deploymentAdvice: extension.deploymentAdvice });
  assert.deepEqual(parseSupersedes({ manifestText: JSON.stringify(manifest) }), { packages: ['old-example'], contributions: [] });
  assert.equal(readPluginMaturity({ manifest }), 'untested');
  assert.equal(readProviderPluginLink({ manifest }), 'example-provider');
  const identity = await readInstalledAgentPluginIdentity({ plugin: { pluginId: 'example', packageRoot: '/example' } }, { readText: async () => JSON.stringify(manifest) });
  assert.equal(identity.id, 'publisher/example');
  assert.deepEqual(identity.provides, ['example']);
  const parsed = parseAgentPluginMcpConfig({ value: { $schema: schema, mcpServers: { example: { type: 'streamable-http', url: 'https://example.test/mcp' } } } }, { pluginManifest: manifest });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.config.servers.example, { type: 'streamable-http', url: 'https://example.test/mcp', authMode: 'oauth',
    defaultTools: { allow: ['inspect', 'create'], write: ['create'], read: ['inspect'] } });
});

test('older manifest and MCP entry metadata normalize without operator action', () => {
  const parsed = parseAgentPluginMcpConfig({ value: { $schema: schema, mcpServers: { example: { type: 'streamable-http', url: 'https://example.test/mcp',
    tovuAuthMode: 'oauth', tovuDefaultTools: { allow: ['inspect'], write: [], read: ['inspect'] } } } } });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.config.servers.example, { type: 'streamable-http', url: 'https://example.test/mcp', authMode: 'oauth',
    defaultTools: { allow: ['inspect'], write: [], read: [] } });
  assert.ok(parsed.warnings?.some(warning => warning.includes('2027-05-06')), 'legacy compatibility is observable by the host');
});
