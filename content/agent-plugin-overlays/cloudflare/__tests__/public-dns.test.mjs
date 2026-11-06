import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readBundledPublicDnsResolverUrl, createPublicDnsResolver } from "../../../../apps/website/src/server/runtime/composition/domain-dns-adapters.ts";
import path from 'node:path';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';
import { processComposedBundledSourceRoot } from '../../../../apps/website/src/features/agent-plugins/__tests__/fixtures/bundled-source-root.ts';

// cloudflare ships from @jini-ai/agent-plugins/cloudflare: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: 'cloudflare' });

test("Cloudflare owns the diagnostic DNS URL as data available before activation", async () => {
  const declaration = JSON.parse(readFileSync(path.join(PLUGIN_DIR, "plugin.json"), "utf8")).extensions.jini.publicDnsResolver;
  assert.deepEqual(declaration, { url: "https://cloudflare-dns.com/dns-query", format: "dns-json" });
  // Exactly one shipped plugin may declare it: read the whole bundle the build composes.
  const url = readBundledPublicDnsResolverUrl({ sourceRoot: await processComposedBundledSourceRoot() });
  assert.equal(url, declaration.url);
  const requests = [];
  const resolver = createPublicDnsResolver({ url, client: { send: async request => { requests.push(request); return { status: 200, bodyText: '{"Status":3}', headers: {} }; } } });
  assert.deepEqual(await resolver.query({ domain: "example.com", type: "A" }), { type: "A", status: "not-found", records: [] });
  assert.equal(requests[0].url, "https://cloudflare-dns.com/dns-query?name=example.com&type=A");
});
