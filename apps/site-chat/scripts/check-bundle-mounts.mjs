#!/usr/bin/env node
/**
 * @file Post-build regression check (ADR-054): actually EXECUTES the built `dist/site-assistant.js`
 * in a real DOM (jsdom) and asserts it mounts, rather than only checking that the build succeeded.
 *
 * Why an execution smoke test, not a text/grep check: this repo shipped two builds in a row that
 * compiled cleanly, passed typecheck, and 200'd from the server, and both threw immediately on load
 * in a real browser (`process is not defined`, then a null-dispatcher crash from two different React
 * instances getting bundled together). Neither would be caught by "does the build succeed" or a
 * narrow "no process.env.NODE_ENV string" grep — the second bug in particular has no fixed string
 * signature to search for, since it is about which MODULE INSTANCE resolved, not what text survived.
 * Running the artifact and checking it actually mounted is the one check general enough to catch
 * "the bundle throws on load" as a category, not just this specific incident's two causes.
 *
 * Not a substitute for the manual Playwright-against-a-real-page check this bug was found with —
 * jsdom is not a real browser and this never opens the chat pane or exercises the network transport.
 * It exists to fail CI/local builds loudly and immediately for the cheapest, most common failure mode
 * (the bundle can't even execute), so that class of regression does not have to wait for someone to
 * manually drive a browser again to be caught.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.resolve(__dirname, "../dist/site-assistant.js");
const MOUNT_ID = "tovu-site-assistant-root";

function fail(message) {
  console.error(`[check-bundle-mounts] FAIL: ${message}`);
  process.exit(1);
}

let bundleSource;
try {
  bundleSource = readFileSync(bundlePath, "utf8");
} catch (error) {
  fail(`could not read ${bundlePath} — did the build run first? (${error.message})`);
}

// Mirrors what `render.ts` actually injects: the mount div present ahead of the script, same as a
// real themed page — `main.tsx`'s `mount()` looks for this id before falling back to creating one,
// so this exercises the same path a real page takes, not the defensive fallback.
const dom = new JSDOM(`<!doctype html><html><body><div id="${MOUNT_ID}"></div></body></html>`, {
  url: "http://localhost/welcome",
  runScripts: "outside-only",
});

const caughtErrors = [];
dom.window.addEventListener("error", (event) => {
  caughtErrors.push(event.error ?? event.message);
});
dom.window.addEventListener("unhandledrejection", (event) => {
  caughtErrors.push(event.reason);
});

try {
  dom.window.eval(bundleSource);
} catch (error) {
  // A synchronous throw during evaluation (e.g. `ReferenceError: process is not defined` at the top
  // of the IIFE) never reaches the `error` event listener above — jsdom's `eval` re-throws it
  // directly. Caught here so the failure message below covers both this and the async path.
  caughtErrors.push(error);
}

if (caughtErrors.length > 0) {
  fail(
    `the bundle threw during execution — it would have crashed on load in a real browser:\n` +
      caughtErrors.map((e) => `  - ${e?.stack ?? e}`).join("\n"),
  );
}

// React 19's `createRoot(...).render(...)` schedules the initial commit through its own scheduler
// (message-channel/timeout-based), not synchronously within the `eval` call above — measured: without
// this wait, `#tovu-site-assistant-root` reads as childless even on a bundle that mounts correctly a
// moment later. A real macrotask tick, not a microtask (`Promise.resolve()`), is what the scheduler
// actually waits on.
await new Promise((resolve) => setTimeout(resolve, 100));

if (caughtErrors.length > 0) {
  fail(
    `the bundle threw after mounting (a post-mount effect or async error):\n` +
      caughtErrors.map((e) => `  - ${e?.stack ?? e}`).join("\n"),
  );
}

const mountEl = dom.window.document.getElementById(MOUNT_ID);
if (!mountEl) {
  fail(`#${MOUNT_ID} is missing from the DOM after evaluating the bundle`);
}
if (mountEl.children.length === 0) {
  fail(`#${MOUNT_ID} has no children after evaluating the bundle — React never mounted into it`);
}

console.log(`[check-bundle-mounts] OK — bundle executed cleanly and mounted ${mountEl.children.length} child element(s) into #${MOUNT_ID}.`);
