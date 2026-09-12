/**
 * @file Coverage for `site-supervisor.js` — the owner of the `running -> exited` transition that
 * D-06 found had no owner at all.
 *
 * Every behavioural test here runs TWICE, against two stores built by `stores()`: the supervisor,
 * and a plain `Map` — the exact shape `main.js`'s `openSites` was before this module existed, with
 * nothing else about the test changed. The Map arm is not decoration: it is the paired baseline that
 * proves each assertion is about the supervisor's added behaviour and not about something the old
 * shape already did. If a "fix" here were vacuous, both arms would pass and the test would say so.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createSiteSupervisor } from "./site-supervisor.ts";

/** A `startTovuServer` handle stand-in with the replayable `onExit` the real one now returns. */
function fakeServer(port = 4321) {
  let exit = null;
  const waiting = [];
  return {
    port,
    pid: 4242,
    stop: async () => {},
    onExit(listener) {
      if (exit !== null) {
        listener(exit);
        return;
      }
      waiting.push(listener);
    },
    /** Drive the child's death from the test. */
    die(code = 1, signal = null) {
      exit = { code, signal };
      for (const listener of waiting.splice(0)) listener(exit);
    },
  };
}

/**
 * @returns the supervisor under test and the pre-fix baseline, each with the `onUnexpectedExit`
 *   calls it made. A `Map` has no such hook, so its list simply stays empty — which is the point.
 */
function stores() {
  const reported = [];
  return [
    { name: "supervisor", store: createSiteSupervisor({ onUnexpectedExit: (siteDir, exit) => reported.push({ siteDir, exit }) }), reported },
    { name: "plain Map (pre-fix baseline)", store: new Map(), reported: [] },
  ];
}

test("a crashed child stops being reported as live — the plain Map keeps it forever", () => {
  const outcomes = {};
  for (const { name, store } of stores()) {
    const server = fakeServer();
    store.set("/sites/a", { server });
    server.die(1, null);
    outcomes[name] = store.has("/sites/a");
  }

  assert.equal(outcomes.supervisor, false, "the supervisor drops a dead child");
  assert.equal(outcomes["plain Map (pre-fix baseline)"], true, "D-06: the old shape kept the corpse, which is why Start reused it");
});

test("an unexpected exit is reported exactly once, with its code and signal", () => {
  const [{ store, reported }] = stores();
  const server = fakeServer();
  store.set("/sites/a", { server });

  server.die(null, "SIGKILL");
  server.die(null, "SIGKILL");

  assert.deepEqual(reported, [{ siteDir: "/sites/a", exit: { code: null, signal: "SIGKILL" } }]);
});

test("a deliberate delete withdraws the watch — stopping a server is not a crash", () => {
  const [{ store, reported }] = stores();
  const server = fakeServer();
  store.set("/sites/a", { server });

  store.delete("/sites/a");
  // Exactly what `server.stop()` produces a moment later; the entry is already gone.
  server.die(null, "SIGTERM");

  assert.deepEqual(reported, []);
  assert.equal(store.lastExitOf("/sites/a"), null);
});

test("a replaced entry's old child dying never evicts the new one", () => {
  // The restart path: the site crashed, the operator pressed Start, a second child is live. The
  // FIRST child's listener can still fire (a late reap, a slow SIGKILL). Keyed on the site dir
  // alone it would delete the healthy replacement.
  const [{ store, reported }] = stores();
  const first = fakeServer(1111);
  const second = fakeServer(2222);
  store.set("/sites/a", { server: first });
  store.delete("/sites/a");
  store.set("/sites/a", { server: second });

  first.die(1, null);

  assert.equal(store.get("/sites/a").server.port, 2222);
  assert.deepEqual(reported, []);
});

test("lastExitOf explains a crash, and is cleared by both a restart and a delete", () => {
  const [{ store }] = stores();
  const first = fakeServer();
  store.set("/sites/a", { server: first });
  first.die(3, null);
  assert.deepEqual(store.lastExitOf("/sites/a"), { code: 3, signal: null });

  store.set("/sites/a", { server: fakeServer() });
  assert.equal(store.lastExitOf("/sites/a"), null, "a restarted site's old crash is not a current fact");

  const third = fakeServer();
  store.set("/sites/b", { server: third });
  third.die(3, null);
  store.delete("/sites/b");
  assert.equal(store.lastExitOf("/sites/b"), null, "a forgotten site's old crash is not a current fact");
});

test("an exit that already happened before the entry was stored is still seen", () => {
  // `startTovuServer`'s handle replays; the supervisor must not silently swallow that replay.
  const [{ store, reported }] = stores();
  const server = fakeServer();
  server.die(1, null);

  store.set("/sites/a", { server });

  assert.equal(store.has("/sites/a"), false);
  assert.deepEqual(reported, [{ siteDir: "/sites/a", exit: { code: 1, signal: null } }]);
});

test("the Map surface main.ts and project-ipc.ts already use behaves identically", () => {
  for (const { name, store } of stores()) {
    assert.equal(store.size, 0, name);
    store.set("/sites/a", { server: { port: 1 } });
    store.set("/sites/b", { server: { port: 2 } });
    assert.equal(store.size, 2, name);
    assert.equal(store.get("/sites/a").server.port, 1, name);
    assert.equal(store.has("/sites/zzz"), false, name);
    assert.deepEqual([...store.values()].map((entry) => entry.server.port), [1, 2], name);
    assert.equal(store.delete("/sites/a"), true, name);
    assert.equal(store.delete("/sites/a"), false, name);
    assert.equal(store.size, 1, name);
  }
});

test("a handle with no onExit is stored and simply not watched", () => {
  const [{ store, reported }] = stores();
  store.set("/sites/a", { server: { port: 4321 } });
  assert.equal(store.get("/sites/a").server.port, 4321);
  assert.deepEqual(reported, []);
});
