import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { classifyChildExit, createApiRestarter, devRestartRefusal, handleDevRestartRequest, restoreDevSiteSelection, siteEnvForRestart, stopChildGroup } from "../dev.mjs";

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
    checkTarget: () => null,
    restoreSite: () => {},
    waitForReady: async () => true,
    markRunning: () => {},
    isShuttingDown: () => false,
    shutdown: () => {},
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
    ["planned", 2],
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

test("an occupied target keeps the old child and restores the persisted choice before stopping anything", async () => {
  const messages = [];
  const { deps, events } = fakeDeps({
    checkTarget: () => "Site is open in Desktop at https://localhost:53775/admin/.",
    restoreSite: ({ env }) => events.push(["restore", env.TOVU_SITE]),
    log: (message) => messages.push(message),
  });
  const restarter = createApiRestarter(deps);
  const original = restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.equal(restarter.current(), original);
  assert.deepEqual(events, [["start", 1, { TOVU_SITE: "alpha" }], ["restore", "alpha"]]);
  assert.ok(messages.includes("Site is open in Desktop at https://localhost:53775/admin/."));
});

test("a refused boot inside a live watcher restores the previous site and its persisted selection", async () => {
  const { deps, events } = fakeDeps({
    waitForReady: async ({ child }) => child.env.TOVU_SITE === "alpha",
    restoreSite: ({ env }) => events.push(["restore", env.TOVU_SITE]),
    markRunning: (child) => events.push(["running", child.id]),
  });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.deepEqual(events, [
    ["start", 1, { TOVU_SITE: "alpha" }], ["planned", 1], ["stop", 1], ["ports-free"],
    ["start", 2, { TOVU_SITE: "beta" }], ["planned", 2],
    ["restore", "alpha"], ["planned", 2], ["stop", 2], ["ports-free"],
    ["start", 3, { TOVU_SITE: "alpha" }], ["planned", 3], ["running", 3],
  ]);
  assert.equal(restarter.current().env.TOVU_SITE, "alpha");
});

test("the rollback baseline advances only after a successful boot", async () => {
  let target = "beta";
  const restored = [];
  const { deps } = fakeDeps({
    envForRestart: () => ({ TOVU_SITE: target }),
    waitForReady: async ({ child }) => child.env.TOVU_SITE !== "gamma",
    restoreSite: ({ env }) => restored.push(env.TOVU_SITE),
  });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("first"), true);
  target = "gamma";
  assert.equal(await restarter.restart("second"), false);
  assert.deepEqual(restored, ["beta"]);
  assert.equal(restarter.current().env.TOVU_SITE, "beta");
});

test("shutdown after a refused boot prevents rollback from starting another child", async () => {
  let stopped = false;
  const { deps, events } = fakeDeps({
    waitForReady: async () => { stopped = true; return false; },
    isShuttingDown: () => stopped,
  });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.equal(events.filter(([kind]) => kind === "start").length, 2);
});

test("a rollback persistence failure still restores the previous running API", async () => {
  const { deps } = fakeDeps({
    waitForReady: async ({ child }) => child.env.TOVU_SITE === "alpha",
    restoreSite: () => { throw new Error("disk unavailable"); },
  });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.equal(restarter.current().env.TOVU_SITE, "alpha");
});

test("an unreadable target leaves the old API running", async () => {
  const { deps, events } = fakeDeps({ checkTarget: () => { throw new Error("invalid running lock"); } });
  const restarter = createApiRestarter(deps);
  const original = restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.equal(restarter.current(), original);
  assert.equal(events.length, 1);
});

test("dev preflight observes the newly selected site and gives the existing Desktop URL", () => {
  const env = { TOVU_SITE: "beta" };
  assert.equal(devRestartRefusal({ repoRoot: "/repo", env }, { select: (input, options) => {
    assert.deepEqual(input, { repoRoot: "/repo" });
    assert.equal(options.env, env);
    return { running: { app: "Desktop", scheme: "https", port: 53775 } };
  } }), "tovu dev: switch refused; site is open in Desktop at https://localhost:53775/admin/. The current API is still running.");
  assert.equal(devRestartRefusal({ repoRoot: "/repo", env }, { select: () => ({ running: null }) }), null);
  assert.equal(devRestartRefusal({ repoRoot: "/repo", env }, { select: () => ({ running: { app: "Desktop", port: 0 } }) }),
    "tovu dev: switch refused; site is starting in Desktop. The current API is still running.");
});

test("same-site restart allows only a lease in this supervisor's API tree", async () => {
  const currentEnv = { TOVU_SITE: "alpha" };
  const running = { pid: 12, app: "Web", scheme: "http", port: 3000 };
  const select = (_input, { env }) => ({ dir: `/sites/${env.TOVU_SITE}`, running });
  const check = (env, apiPids) => devRestartRefusal({ repoRoot: "/repo", env, currentEnv, apiPids }, { select });
  assert.equal(check(currentEnv, [10, 11, 12]), null, 'the actual API is a grandchild of the watcher');
  const refusal = "tovu dev: switch refused; site is open in Web at http://localhost:3000/admin/. The current API is still running.";
  assert.equal(check(currentEnv, [10, 11]), refusal, 'matching site and port do not establish process ownership');
  assert.equal(check({ TOVU_SITE: "beta" }, [10, 11, 12]), refusal, 'an owned process does not bypass the current-site boundary');
  const { deps, events } = fakeDeps({
    envForRestart: () => currentEnv,
    checkTarget: async ({ env, currentEnv: previous, child }) => {
      assert.deepEqual(previous, currentEnv);
      assert.equal(child.id, 1);
      return check(env, [10, 11, 12]);
    },
  });
  const restarter = createApiRestarter(deps);
  restarter.start(currentEnv);
  assert.equal(await restarter.restart("provider-settings-live-apply"), true);
  assert.deepEqual(events.filter(([kind]) => kind === "stop" || kind === "start"), [
    ["start", 1, currentEnv], ["stop", 1], ["start", 2, currentEnv],
  ]);
});

test("supervisor refusal is acknowledged with its reason before any API is stopped", async () => {
  const reason = "Site is open in Desktop at https://localhost:53775/admin/.";
  const { deps, events } = fakeDeps({ checkTarget: async () => reason });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  const writes = [];
  const requestId = "11111111-1111-4111-8111-111111111111";
  assert.equal(await handleDevRestartRequest({ request: { reason: "provider-settings-live-apply", requestId },
    requestFile: "/tmp/request.json", restarter }, {
    writeText: input => writes.push(input),
    wait: () => assert.fail("a refusal must not schedule a restart"),
  }), false);
  assert.deepEqual(writes, [{ filePath: `/tmp/request.json.${requestId}.result`, content: JSON.stringify({ accepted: false, reason }) }]);
  assert.deepEqual(events, [["start", 1, { TOVU_SITE: "alpha" }]]);
});

test("supervisor acceptance gives the tool delivery time before stopping its API", async () => {
  const { deps, events } = fakeDeps();
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  const requestId = "11111111-1111-4111-8111-111111111111";
  assert.equal(await handleDevRestartRequest({ request: { reason: "provider-settings-live-apply", requestId },
    requestFile: "/tmp/request.json", restarter }, {
    writeText: ({ content }) => events.push(["ack", JSON.parse(content)]),
    wait: async ms => { assert.equal(ms, 3000); events.push(["delivery-grace"]); },
  }), true);
  assert.deepEqual(events.slice(0, 5), [
    ["start", 1, { TOVU_SITE: "alpha" }], ["ack", { accepted: true }], ["delivery-grace"], ["planned", 1], ["stop", 1],
  ]);
});

test("an unverifiable target and shutdown return refusal acknowledgements", async () => {
  for (const [overrides, reason] of [
    [{ checkTarget: () => { throw new Error("unreadable"); } }, "tovu dev: could not verify the target site; the current API is still running."],
    [{ isShuttingDown: () => true }, "The dev supervisor is shutting down."],
  ]) {
    const { deps, events } = fakeDeps(overrides);
    const restarter = createApiRestarter(deps);
    restarter.start({ TOVU_SITE: "alpha" });
    const decisions = [];
    assert.equal(await restarter.restart("provider-settings-live-apply", { onDecision: async decision => { decisions.push(decision); } }), false);
    assert.deepEqual(decisions, [{ accepted: false, reason }]);
    assert.equal(events.length, 1);
  }
});

test("invalid reply identifiers cannot select a write path or restart the API", async () => {
  assert.equal(await handleDevRestartRequest({ request: { reason: "restart", requestId: "../../elsewhere" },
    requestFile: "/tmp/request.json", restarter: { restart: () => assert.fail("must not restart") } }, {
    writeText: () => assert.fail("must not write"),
  }), false);
});

test("an acknowledgement write failure leaves the old API running", async () => {
  const { deps, events } = fakeDeps();
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  await assert.rejects(handleDevRestartRequest({
    request: { reason: "restart", requestId: "11111111-1111-4111-8111-111111111111" },
    requestFile: "/tmp/request.json", restarter,
  }, { writeText: () => { throw new Error("unavailable"); } }), { message: "unavailable" });
  assert.deepEqual(events, [["start", 1, { TOVU_SITE: "alpha" }]]);
});

test("rollback rewrites only the site selection using the current file, including on Windows", () => {
  const writes = [];
  const repoRoot = "C:\\work\\Tovu";
  const untouched = `OTHER=${["runtime", "fixture"].join("-")}\r\n`;
  restoreDevSiteSelection({ repoRoot, name: "alpha" }, {
    readText: () => `${untouched}TOVU_SITE=beta\r\n`,
    writeText: (input) => writes.push(input),
  });
  assert.deepEqual(writes, [{ filePath: path.join(repoRoot, ".env"), content: `${untouched}TOVU_SITE=alpha\n` }]);
});

test("rollback never treats an unreadable env file as empty", () => {
  assert.throws(() => restoreDevSiteSelection({ repoRoot: "/repo", name: "alpha" }, {
    readText: () => { throw Object.assign(new Error("unreadable"), { code: "EACCES" }); },
    writeText: () => assert.fail("must not overwrite unreadable settings"),
  }), { message: "unreadable" });
});

test("Windows restart stops the watcher and every descendant through the platform owner", async () => {
  const child = { pid: 10, exitCode: null, signalCode: null };
  let stopped = [];
  await stopChildGroup({ child }, { platform: "win32",
    snapshots: async () => [
      { pid: 10, ppid: 1, command: "launcher" }, { pid: 11, ppid: 10, command: "watcher" },
      { pid: 12, ppid: 11, command: "API" }, { pid: 99, ppid: 1, command: "unrelated" },
    ],
    stop: async (pids) => { stopped = pids; return { remainingPids: [] }; },
  });
  assert.deepEqual([...stopped].sort((a, b) => a - b), [10, 11, 12]);
});

test("a synchronous target spawn failure still boots the previous site", async () => {
  const started = [];
  const { deps } = fakeDeps({ startApi: (env) => {
    if (env.TOVU_SITE === "beta") throw new Error("spawn failed");
    started.push(env.TOVU_SITE);
    return { env };
  } });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.deepEqual(started, ["alpha", "alpha"]);
  assert.equal(restarter.current().env.TOVU_SITE, "alpha");
});

test("a failed rollback is bounded to one attempt and reports the failure", async () => {
  const messages = [];
  const { deps, events } = fakeDeps({ waitForReady: async () => false, log: (message) => messages.push(message) });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.equal(events.filter(([kind]) => kind === "start").length, 3);
  assert.ok(messages.includes("tovu dev: the previous site could not restart; inspect the API startup output."));
});

test("a busy API port never starts a second writing child", async () => {
  const { deps, events } = fakeDeps({ waitForPortsFree: async () => false });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.equal(events.filter(([kind]) => kind === "start").length, 1);
});

test("failed target and rollback readiness shut down the whole stack visibly", async () => {
  const shutdowns = [];
  const { deps, events } = fakeDeps({ waitForReady: async () => false, shutdown: code => shutdowns.push(code) });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.equal(events.filter(([kind]) => kind === "start").length, 3);
  assert.deepEqual(shutdowns, [1]);
});

test("ports remaining busy after recovery shut down instead of leaving only Vite alive", async () => {
  const shutdowns = [];
  const { deps, events } = fakeDeps({ waitForPortsFree: async () => false, shutdown: code => shutdowns.push(code) });
  const restarter = createApiRestarter(deps);
  restarter.start({ TOVU_SITE: "alpha" });
  assert.equal(await restarter.restart("switch"), false);
  assert.equal(events.filter(([kind]) => kind === "start").length, 1);
  assert.deepEqual(shutdowns, [1]);
});

test("joining restart requests each receive the shared precheck decision with one restart", async () => {
  for (const refusal of [null, "Site is open in Desktop."]) {
    let release;
    const decisions = [];
    const { deps, events } = fakeDeps({ checkTarget: () => new Promise(resolve => { release = resolve; }) });
    const restarter = createApiRestarter(deps);
    restarter.start({ TOVU_SITE: "alpha" });
    const first = restarter.restart("first", { onDecision: async value => { decisions.push(["first", value]); } });
    const second = restarter.restart("second", { onDecision: async value => { decisions.push(["second", value]); } });
    release(refusal);
    assert.deepEqual(await Promise.all([first, second]), [!refusal, !refusal]);
    const expected = refusal ? { accepted: false, reason: refusal } : { accepted: true };
    assert.deepEqual(decisions, [["first", expected], ["second", expected]]);
    assert.equal(events.filter(([kind]) => kind === "start").length, refusal ? 1 : 2);
  }
});
