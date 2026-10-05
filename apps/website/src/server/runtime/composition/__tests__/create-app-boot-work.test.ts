import assert from "node:assert/strict";
import { test } from "node:test";

import { createApp, createRouteDeps } from "../app.js";
import { createServingApp } from "../serving-app.js";

/**
 * @file `createApp()` starts the BYOK tool surface's installed-extension pass (Agent Plugins,
 * Agent Skills, enabled plugin-capability tools) and returns before it finishes. Nothing could
 * await it, so whoever closed the store right after composing an app (the `*.unrun.*` site boot
 * helper's teardown) closed it under that pass's reads, and every teardown logged
 * "[assistant-byok] plugin capability tools could not be registered … The database connection is
 * not open". `onBootWork` hands that pass to the caller.
 */

test("createApp hands onBootWork the installed-extension pass, which settles only after it has read the plugin catalog", async () => {
  const deps = createRouteDeps();
  let releaseDiscovery!: () => void;
  const discoveryGate = new Promise<void>((resolve) => (releaseDiscovery = resolve));
  let discoveryCalls = 0;
  deps.discoverPlugins = async () => {
    discoveryCalls += 1;
    await discoveryGate;
    return [];
  };
  const work: Promise<void>[] = [];

  createApp(deps, { onBootWork: (pending) => work.push(pending) });

  assert.equal(work.length, 1);
  const [pass] = work;
  assert.ok(pass);
  let settled = false;
  const settling = pass.then(() => (settled = true));
  // The pass registers agent plugins and skills (disk reads) before it reaches the capability
  // tools' plugin discovery, so wait for that call rather than a fixed number of ticks.
  for (let waited = 0; discoveryCalls === 0 && waited < 5000; waited += 10) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(discoveryCalls >= 1, "the pass never reached plugin discovery");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, "the pass settled before the plugin catalog was read");

  releaseDiscovery();
  await settling;
  assert.equal(settled, true);
});

test("createApp without onBootWork still composes (every existing caller)", () => {
  assert.equal(typeof createApp(createRouteDeps()), "function");
});

test("createServingApp returns that same pass as bootWork, so a serving process can await it before closing the store", async () => {
  const deps = createRouteDeps();
  let releaseDiscovery!: () => void;
  const discoveryGate = new Promise<void>((resolve) => (releaseDiscovery = resolve));
  deps.discoverPlugins = async () => {
    await discoveryGate;
    return [];
  };

  const { bootWork, outboxDrainer, trashSweeper } = createServingApp(deps);
  try {
    assert.equal(bootWork.length, 1);
    let settled = false;
    const settling = bootWork[0]!.then(() => (settled = true));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, "bootWork settled before the plugin catalog was read");

    releaseDiscovery();
    await settling;
    assert.equal(settled, true);
  } finally {
    releaseDiscovery();
    await outboxDrainer.stop();
    await trashSweeper.stop({});
  }
});
