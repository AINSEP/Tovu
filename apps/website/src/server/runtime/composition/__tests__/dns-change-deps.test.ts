import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createDnsChangeDepsFactory } from "../dns-change-deps.js";
import { fakeAuthoritative } from "#src/features/domain-dns/__tests__/dns-fakes";

/**
 * @file The DNS change deps factory: one shared resolver and `manual`-default registry, a
 * workspace-scoped binding store only where a content database exists, and the Tovu HTTP client
 * adapted to the provider context's object-shaped `send`.
 */

const AT = "2026-10-21T12:00:00.000Z";
const authorize = async () => ({ allowed: true, reason: "matched" as const });

test("with a content kernel: shared registry/resolver, a workspace-scoped store, and an adapted HTTP client", async () => {
  const sent: unknown[] = [];
  const resolver = fakeAuthoritative({ zones: {} });
  const create = createDnsChangeDepsFactory({ httpClient: { send: async request => { sent.push(request); return { status: 204, headers: {}, bodyText: "" } as never; } } }, { resolver, now: () => 42 });
  const kernel = freshSqliteContentKernel();
  try {
    await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('ws', 'W', 'ws', ${AT})`);
    const first = create({ workspaceId: "ws", authorize, contentKernel: kernel } as never);
    const second = create({ workspaceId: "other", authorize } as never);
    assert.equal(first.registry, second.registry, "one registry per process");
    assert.equal(first.resolver, resolver);
    assert.equal(first.registry.getDefault()?.id, "manual");
    assert.deepEqual([first.workspaceId, first.now(), first.context.workspaceId, first.context.mode, first.context.credentials, first.context.now()], ["ws", 42, "ws", "live", {}, 42]);
    assert.equal(second.bindings, undefined, "no content database, no binding store");
    const request = { method: "GET", url: "https://dns.test/", headers: {} };
    await first.context.httpClient.send({ request } as never);
    assert.deepEqual(sent, [request]);
    await first.bindings!.put({ binding: { hostname: "example.com", providerId: "manual", zone: "example.com", requirements: [], status: "pending", delegation: null, attempt: 0, startedAt: AT, nextCheckAt: null, lastCheckedAt: null, lastResult: null }, now: AT });
    assert.deepEqual(await kernel.query(sql`SELECT workspace_id, hostname FROM domain_binding`), [{ workspace_id: "ws", hostname: "example.com" }]);
  } finally {
    await kernel.close();
  }
});

test("defaults: the node:dns resolver and the wall clock", () => {
  const deps = createDnsChangeDepsFactory({ httpClient: { send: async () => { throw new Error("unused"); } } })({ workspaceId: "ws", authorize } as never);
  assert.equal(typeof deps.resolver.queryNs, "function");
  assert.ok(Math.abs(deps.now() - Date.now()) < 5_000);
});
