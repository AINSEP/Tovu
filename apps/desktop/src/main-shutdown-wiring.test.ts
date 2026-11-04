/**
 * @file Static-analysis tests for the Electron entry's (`src/main/index.ts`, formerly `main.ts`)
 * shutdown wiring (D-09) — that `before-quit` waits for every tracked teardown and holds a repeat
 * quit during its drain. The window side (a `closed` teardown is TRACKED, the crash-safety row
 * outlives the child, an old window's close cannot drop a replacement entry, a Stop that cannot
 * confirm exit keeps its row) is tested through the real module in
 * `src/main/windows/site-window.test.ts`. The `before-quit` handler has no module yet, so it is
 * still run here as a cut-out with injected fakes.
 *
 * Source text, for the reason `main-speech-wiring.test.ts` documents at length: `main.ts`
 * requires `"electron"` at module scope, so `require`-ing it under plain `node --test` crashes
 * before proving anything. The drain's own behaviour is covered where it lives
 * (`shutdown-tracker.test.ts`); what only this file can check is that `main.ts` uses it, and in
 * the one arrangement where the use is correct.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import os from "node:os";
import { createShutdownTracker, decideBeforeQuit } from "@jini-ai/desktop-host/shutdown";
import { handleStop } from "./project-ipc.ts";
import { createKeyedSerializer } from "./keyed-serializer.ts";
import { sitesFilePath, trackSite } from "./tracked-sites.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = fs.readFileSync(path.join(__dirname, "main", "index.ts"), "utf8");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => { resolve = res; });
  return { promise, resolve };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Just the `app.on("before-quit", ...)` handler, up to its closing `});`. Anchored at a line start:
 *  a doc comment earlier in main.ts mentions `app.on("before-quit")` in prose. */
function beforeQuitHandler() {
  const start = source.indexOf('\napp.on("before-quit", ');
  assert.notEqual(start, -1, 'expected an app.on("before-quit", ...) handler in main.ts');
  const end = source.indexOf("\n});", start);
  assert.notEqual(end, -1, "could not find the end of the before-quit handler");
  return source.slice(start, end);
}

test("before-quit waits on in-flight teardowns, not only on openSites", async () => {
  // The defect: the `closed` handler empties `openSites` synchronously and only then begins
  // stopping the child, so closing the last window made this read "nothing to drain" while a
  // `detached` tovu serve was still alive — and it outlives the app.
  const quit = source.slice(source.indexOf('app.on("before-quit"'));
  assert.match(quit, /pendingTeardowns\.size === 0/, "before-quit must see that a teardown is still running");
  assert.match(quit, /pendingTeardowns\.drain\(\)/, "before-quit must actually wait for those teardowns");
  assert.doesNotMatch(
    quit.slice(0, quit.indexOf("\n}")),
    /if \(openSites\.size === 0 \|\| shuttingDown\) return;/,
    "openSites.size alone is the condition that let the app quit mid-teardown",
  );

  const teardown = deferred();
  const productDisposal = deferred();
  const shutdownOrder: string[] = [];
  const pendingTeardowns = createShutdownTracker({});
  pendingTeardowns.track({ promise: teardown.promise });
  let onQuit!: (event: { preventDefault: () => void }) => void;
  let prevented = 0;
  let finalQuits = 0;
  vm.runInNewContext(`${beforeQuitHandler()}\n});`, {
    app: {
      on: (_event: string, listener: typeof onQuit) => { onQuit = listener; },
      quit: () => { shutdownOrder.push("quit"); finalQuits++; },
      exit: () => { assert.fail("the pending teardown must settle before the deadline"); },
    },
    productState: { disposers: [() => { shutdownOrder.push("product-listeners"); }, () => { shutdownOrder.push("product-memory"); }],
      product: { dispose: () => { shutdownOrder.push("product"); return productDisposal.promise; } } },
    siteThemePreviews: { dispose: () => { shutdownOrder.push("previews"); } },
    desktopAgentRuntime: { dispose: async () => { shutdownOrder.push("runtime"); } },
    desktopMcpHttp: { close: async () => { shutdownOrder.push("mcp"); } },
    desktopAgentService: { shutdown: async () => { shutdownOrder.push("agent-service"); } },
    siteDiscovery: { abortAll: () => {} },
    quitPhase: "idle", openSites: new Map(), pendingTeardowns,
    decideBeforeQuit, finalQuitHeldForUpdate: () => false,
    setTimeout, clearTimeout, QUIT_DEADLINE_MS: 30_000,
  });
  onQuit({ preventDefault: () => { prevented++; } });
  try {
    await flush();
    assert.equal(prevented, 1);
    assert.equal(finalQuits, 0, "app.quit() must await a tracked teardown even with no open windows");
    assert.deepEqual(shutdownOrder, ["product-listeners", "product-memory", "product", "runtime", "mcp", "previews", "agent-service"]);
    teardown.resolve();
    await flush();
    assert.equal(finalQuits, 0, "app.quit() must also await product telemetry after the site teardown finishes");
  } finally {
    teardown.resolve();
    productDisposal.resolve();
    await pendingTeardowns.drain();
    await flush();
  }
  assert.equal(finalQuits, 1);
  assert.deepEqual(shutdownOrder, ["product-listeners", "product-memory", "product", "runtime", "mcp", "previews", "agent-service", "quit"]);
});

test("Quit during a card Stop waits for its tracked teardown after openSites becomes empty", async (t) => {
  // `project-ipc.ts`'s deps bag is built by `buildProjectDeps` (5bf4fd314 moved it out of an inline
  // `const projectDeps = {`); its body runs to the first top-level `}`. A missing anchor fails here
  // rather than matching against an empty slice.
  const depsStart = source.indexOf("\nfunction buildProjectDeps(");
  assert.ok(depsStart >= 0, "src/main/index.ts must build project-ipc's deps in buildProjectDeps");
  assert.match(source.slice(depsStart, source.indexOf("\n}\n", depsStart)), /\n\s*pendingTeardowns,/,
    "card Stop must receive the same tracker before-quit drains");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-card-stop-quit-"));
  const projectsPath = sitesFilePath(root);
  trackSite(projectsPath, root);
  const stop = deferred();
  const pendingTeardowns = createShutdownTracker({});
  const openSites = new Map([[root, { server: { port: 4321, pid: 123, stop: () => stop.promise } }]]);
  let closedRows = 0;
  const stopping = handleStop(root, {
    projectsPath, registryPath: root, repoRoot: root, serializer: createKeyedSerializer(),
    openSites, pendingTeardowns, readSiteName: () => "alpha", readPreviewVersion: () => null,
    recordSiteClosed: () => { closedRows++; },
  });
  let onQuit!: (event: { preventDefault: () => void }) => void;
  let finalQuits = 0;
  let prevented = 0;
  const shutdownOrder: string[] = [];
  vm.runInNewContext(`${beforeQuitHandler()}\n});`, {
    app: {
      on: (_event: string, listener: typeof onQuit) => { onQuit = listener; },
      quit: () => { shutdownOrder.push("quit"); finalQuits++; },
      exit: () => assert.fail("Stop must settle before the quit deadline"),
    },
    siteThemePreviews: { dispose: () => {} }, desktopAgentRuntime: { dispose: async () => {} },
    desktopMcpHttp: { close: async () => {} }, desktopAgentService: { shutdown: async () => {} },
    productState: { disposers: [() => { shutdownOrder.push("product-listeners"); }],
      product: { dispose: async () => { shutdownOrder.push("product"); } } },
    siteDiscovery: { abortAll: () => {} },
    quitPhase: "idle", openSites, pendingTeardowns, decideBeforeQuit,
    finalQuitHeldForUpdate: () => false, setTimeout, clearTimeout, QUIT_DEADLINE_MS: 30_000,
  });
  try {
    await flush();
    assert.equal(openSites.size, 0);
    assert.equal(pendingTeardowns.size, 1);
    onQuit({ preventDefault: () => { prevented++; } });
    await flush();
    onQuit({ preventDefault: () => { prevented++; } });
    assert.equal(prevented, 2);
    assert.equal(finalQuits, 0, "Quit must not outrun the card's pending Stop");
    assert.equal(closedRows, 0, "the recovery row must outlive the child");
    assert.deepEqual(shutdownOrder, ["product-listeners", "product"], "repeated quits dispose product telemetry once");
  } finally {
    stop.resolve();
    await stopping;
    await pendingTeardowns.drain();
    await flush();
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(finalQuits, 1);
  assert.equal(closedRows, 1);
  assert.deepEqual(shutdownOrder, ["product-listeners", "product", "quit"]);
});

test("a quit attempt during the drain is held until the drain completes, not let through", () => {
  // The second Cmd+Q: it re-entered before-quit with the drain already running, and the old
  // `|| shuttingDown) return;` let it through without preventDefault(), so Electron exited before the
  // parallel server.stop() calls finished and stranded detached tovu serve children.
  const handler = beforeQuitHandler();
  assert.doesNotMatch(handler, /\|\| shuttingDown\) return;/, "a guard that returns mid-drain lets a second quit exit Electron");
  const decide = handler.indexOf("decideBeforeQuit({ phase: quitPhase,");
  // The proceed branch may itself hold the final quit for an update install (main-updater-wiring.test.ts);
  // the preventDefault this test is about is the unconditional one after it.
  const proceed = handler.indexOf('if (action === "proceed") {');
  const prevent = handler.indexOf("\n  event.preventDefault();");
  const hold = handler.indexOf('if (action === "hold") return;');
  assert.notEqual(decide, -1, "before-quit must ask decideBeforeQuit with the current quitPhase");
  assert.ok(decide < proceed && proceed < prevent && prevent < hold, "a held attempt must be preventDefault()ed before it returns");
  assert.match(handler, /quitPhase = "draining";/);
  assert.match(
    handler,
    /\.finally\(\(\) => \{\s*clearTimeout\(drainDeadline\);\s*quitPhase = "drained";\s*app\.quit\(\);\s*\}\)/,
    "the drain's own closing app.quit() must be the one decideBeforeQuit lets through",
  );
});

test("the drain arms the force-exit deadline itself, so a held quit cannot outlive a hung drain", () => {
  // Holding a second Cmd+Q removed its accidental escape from a hung drain (endSiteSession's loopback
  // logout has no timeout of its own). quit-signals.ts arms its deadline only for a signal.
  const handler = beforeQuitHandler();
  const draining = handler.indexOf('quitPhase = "draining";');
  assert.notEqual(draining, -1, "expected before-quit to enter the draining phase");
  assert.match(handler.slice(draining), /const drainDeadline = setTimeout\(\(\) => app\.exit\(1\), QUIT_DEADLINE_MS\);\s*drainDeadline\.unref\(\);/);
  assert.match(source, /deadlineMs: QUIT_DEADLINE_MS,/, "a signal and a Cmd+Q must get the same bound");
});
