import assert from "node:assert/strict";
import test from "node:test";

import { classifyChildExit, createApiRestarter, siteEnvForRestart } from "../dev.mjs";

/**
 * @file `dev.mjs` restart-on-request (owner decision OD-S1, 2026-10-05): the API-child restart state
 * machine with every effect injected, the `TOVU_SITE` a restarted child gets, and the proof that an
 * exit nobody asked for is still a crash (no silent restart-on-crash).
 */

function fakeDeps(overrides = {}) {
  const events = [];
  let nextId = 1;
  const deps = {
    startApi: (env) => {
      const child = { id: nextId++, env };
      events.push(["start", child.id, env]);
      return child;
    },
    stopChild: async (child) => void events.push(["stop", child.id]),
    markPlanned: (child) => void events.push(["planned", child.id]),
    waitForPortsFree: async () => void events.push(["ports-free"]),
    envForRestart: () => ({ TOVU_SITE: "beta" }),
    isShuttingDown: () => false,
    log: () => {},
    ...overrides,
  };
  return { deps, events };
}

test("restart marks the old child planned, stops it, waits for its ports, then starts a new one with the restart env", async () => {
  const { deps, events } = fakeDeps();
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch site to 'beta'"), true);
  assert.deepEqual(events, [
    ["start", 1, { TOVU_SITE: "alpha" }],
    ["planned", 1],
    ["stop", 1],
    ["ports-free"],
    ["start", 2, { TOVU_SITE: "beta" }],
  ]);
  assert.equal(restarter.current().id, 2);
});

test("two requests at once share one restart", async () => {
  const { deps, events } = fakeDeps();
  const restarter = createApiRestarter(deps);
  restarter.start({});
  await Promise.all([restarter.restart("a"), restarter.restart("b")]);
  assert.equal(events.filter(([kind]) => kind === "start").length, 2, "boot + exactly one restart");
});

test("a Ctrl-C during the restart wins: nothing new is started", async () => {
  let shuttingDown = false;
  const { deps, events } = fakeDeps({
    stopChild: async () => {
      shuttingDown = true;
    },
    isShuttingDown: () => shuttingDown,
  });
  const restarter = createApiRestarter(deps);
  restarter.start({});
  assert.equal(await restarter.restart("x"), false);
  assert.equal(events.filter(([kind]) => kind === "start").length, 1);
});

test("an unplanned exit is still a crash; a planned one is not; shutdown ignores both", () => {
  assert.equal(classifyChildExit({ shuttingDown: false, planned: false }), "crash");
  assert.equal(classifyChildExit({ shuttingDown: false, planned: true }), "planned");
  assert.equal(classifyChildExit({ shuttingDown: true, planned: false }), "ignore");
  assert.equal(classifyChildExit({ shuttingDown: true, planned: true }), "ignore");
});

test("the restarted child gets the TOVU_SITE the switch just wrote to .env", () => {
  assert.deepEqual(siteEnvForRestart({ shellSite: undefined, envFileText: "FOO=1\nTOVU_SITE=beta\n" }), { env: { TOVU_SITE: "beta" } });
  assert.deepEqual(siteEnvForRestart({ shellSite: undefined, envFileText: null }), { env: {} });
  assert.deepEqual(siteEnvForRestart({ shellSite: undefined, envFileText: "FOO=1\n" }), { env: {} });
});

test("a shell-exported TOVU_SITE wins and the warning says the switch is inert", () => {
  const result = siteEnvForRestart({ shellSite: "alpha", envFileText: "TOVU_SITE=beta\n" });
  assert.deepEqual(result.env, {});
  assert.match(result.warning, /TOVU_SITE=alpha is exported in your shell/);
});
