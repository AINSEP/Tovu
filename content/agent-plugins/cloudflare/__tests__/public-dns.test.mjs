import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readBundledPublicDnsResolverUrl, createPublicDnsResolver } from "../../../../apps/website/src/server/runtime/composition/domain-dns-adapters.ts";

test("Cloudflare owns the diagnostic DNS URL as data available before activation", async () => {
  const declaration = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8")).extensions.tovu.publicDnsResolver;
  assert.deepEqual(declaration, { url: "https://cloudflare-dns.com/dns-query", format: "dns-json" });
  const url = readBundledPublicDnsResolverUrl({ sourceRoot: fileURLToPath(new URL("../../", import.meta.url)) });
  assert.equal(url, declaration.url);
  const requests = [];
  const resolver = createPublicDnsResolver({ url, client: { send: async request => { requests.push(request); return { status: 200, bodyText: '{"Status":3}', headers: {} }; } } });
  assert.deepEqual(await resolver.query({ domain: "example.com", type: "A" }), { type: "A", status: "not-found", records: [] });
  assert.equal(requests[0].url, "https://cloudflare-dns.com/dns-query?name=example.com&type=A");
});
