import type { SiteScopeKey } from "@tovu/contracts/site-scope-key";
import assert from "node:assert/strict";
import test from "node:test";
import { createScopeControl, requireScopeKey, type ControlledScope } from "../agent-daemon-scope-control.js";

function harness() {
  const created: { siteId: string; env: NodeJS.ProcessEnv }[] = [];
  const disposed: string[] = [];
  const tables = { scopes: new Map<SiteScopeKey, Promise<ControlledScope>>(), scopeEnvironments: new Map<SiteScopeKey, string>(), scopedExchanges: new Map<SiteScopeKey, () => boolean>() };
  const control = createScopeControl({ tables, hold: () => () => {}, listenerUrl: () => "http://127.0.0.1:7700", pid: 42, isExiting: () => false,
    createScope: async input => {
      created.push(input);
      return { hasExchanges: () => false, dispose: async () => { disposed.push(String(input.env.TOVU_SITE_DIR)); } };
    } }, {});
  // Every local site is `workspace-local`; the desktop's per-directory scope key tells them apart.
  const register = (dir: string) => control({ operation: "register", siteId: "workspace-local", scopeKey: `key-${dir}`, token: `rpc-${dir}`,
    env: { TOVU_SITE_DIR: `/sites/${dir}`, TOVU_AGENT_DAEMON_TOKEN: `proxy-${dir}` } });
  return { control, register, created, disposed, tables };
}

test("two sites sharing one workspace id each get their own scope, and withdrawing one keeps the other", async () => {
  const h = harness();
  const first = await h.register("bigger-tax");
  const second = await h.register("story-squid");
  assert.equal(first.url, "http://127.0.0.1:7700/s/key-bigger-tax");
  assert.equal(second.url, "http://127.0.0.1:7700/s/key-story-squid");
  assert.deepEqual(h.created.map(input => input.siteId), ["workspace-local", "workspace-local"], "each scope keeps its real workspace id");
  assert.equal(h.created[1]!.env.JINI_AGENT_DAEMON_URL, second.url);

  await h.control({ operation: "withdraw", siteId: "workspace-local", scopeKey: "key-bigger-tax" });
  assert.deepEqual(h.disposed, ["/sites/bigger-tax"]);
  assert.equal(h.tables.scopes.has("key-story-squid" as SiteScopeKey), true, "the other site's scope stays mounted");
  assert.deepEqual(await h.register("story-squid"), second);
  assert.equal(h.created.length, 2, "re-registering the surviving site reuses its scope");
});

test("a shared-host registration without a scope key is refused in plain words", async () => {
  const h = harness();
  await assert.rejects(h.control({ operation: "register", siteId: "workspace-local", token: "rpc", env: { TOVU_SITE_DIR: "/sites/a" } }),
    /scope key/);
});


test("site idle shutdown cannot be sent to the shared daemon's scope control", async () => {
  const h = harness();
  await assert.rejects(h.control({ operation: "stopIfIdle" }), /site server/);
  assert.equal(h.created.length, 0);
  assert.equal(h.disposed.length, 0);
});

test('standalone scope identity requires its site directory before it can be registered', () => {
  for (const scopeKey of [undefined, '']) assert.throws(() => requireScopeKey({ scopeKey }), /site scope key/);
  assert.equal(requireScopeKey({ scopeKey: '/sites/a' }), '/sites/a');
});

test("parent-only lifecycle notices are refused by shared scope control without touching any scope", async () => {
  const h = harness();
  await assert.rejects(h.control({ operation: "parking", pid: 7 }), /parent supervisor/);
  await assert.rejects(h.control({ operation: "unavailable", pid: 7 }), /parent supervisor/);
  assert.equal(h.created.length, 0);
});

test("a ready probe replies with the listener url and pid without registering anything", async () => {
  const h = harness();
  assert.deepEqual(await h.control({ operation: "ready" }), { url: "http://127.0.0.1:7700", pid: 42 });
  assert.equal(h.created.length, 0);
  assert.equal(h.tables.scopes.size, 0);
});

test("a stopping daemon refuses every control request, even a ready probe", async () => {
  const tables = { scopes: new Map<SiteScopeKey, Promise<ControlledScope>>(), scopeEnvironments: new Map<SiteScopeKey, string>(), scopedExchanges: new Map<SiteScopeKey, () => boolean>() };
  let created = 0;
  const control = createScopeControl({ tables, hold: () => () => {}, listenerUrl: () => "http://127.0.0.1:7700", pid: 42, isExiting: () => true,
    createScope: async () => { created += 1; return { hasExchanges: () => false, dispose: async () => {} }; } }, {});
  await assert.rejects(control({ operation: "ready" }), /daemon is stopping/);
  await assert.rejects(control({ operation: "register", siteId: "workspace-local", scopeKey: "key-a", token: "rpc-a", env: { TOVU_SITE_DIR: "/sites/a" } }), /daemon is stopping/);
  assert.equal(created, 0);
});

test("re-registering a live scope key with a different token is refused as a rebinding", async () => {
  const h = harness();
  await h.register("a");
  await assert.rejects(h.control({ operation: "register", siteId: "workspace-local", scopeKey: "key-a", token: "rpc-other",
    env: { TOVU_SITE_DIR: "/sites/a", TOVU_AGENT_DAEMON_TOKEN: "proxy-a" } }), /site scope already bound/);
  assert.equal(h.created.length, 1, "the live scope is not replaced");
});

test("a failed scope boot is forgotten and releases its hold, so the next registration boots afresh", async () => {
  const tables = { scopes: new Map<SiteScopeKey, Promise<ControlledScope>>(), scopeEnvironments: new Map<SiteScopeKey, string>(), scopedExchanges: new Map<SiteScopeKey, () => boolean>() };
  let attempts = 0;
  let releases = 0;
  const hasExchanges = () => true;
  const control = createScopeControl({ tables, hold: () => () => { releases += 1; }, listenerUrl: () => "http://127.0.0.1:7700", pid: 42, isExiting: () => false,
    createScope: async () => { attempts += 1; if (attempts === 1) throw new Error("boot failed"); return { hasExchanges, dispose: async () => {} }; } }, {});
  const request = { operation: "register", siteId: "workspace-local", scopeKey: "key-a", token: "rpc-a", env: { TOVU_SITE_DIR: "/sites/a" } };
  await assert.rejects(control(request), /boot failed/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tables.scopes.has("key-a" as SiteScopeKey), false);
  assert.equal(tables.scopeEnvironments.has("key-a" as SiteScopeKey), false);
  assert.equal(releases, 1);
  assert.deepEqual(await control(request), { url: "http://127.0.0.1:7700/s/key-a", pid: 42 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(tables.scopedExchanges.get("key-a" as SiteScopeKey), hasExchanges);
  assert.equal(releases, 2);
});
