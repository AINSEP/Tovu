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
 *
 * ## SPEC-046 REQ-1/REQ-2 — the poisoned-`sessionStorage` scenarios
 *
 * `transcript-storage.ts` and `action-queue.ts` both read real browser `sessionStorage` during the
 * widget's very first render/mount, and both promise a specific thing under corruption: a bad entry
 * clears itself and the widget still mounts. That promise is exactly the kind this file's header
 * warns can compile clean, typecheck clean, and still break in a real environment — so it gets the
 * same execute-and-assert treatment as the base "does it mount at all" case, not a unit test alone
 * (`../src/__tests__/transcript-storage.test.ts` and `action-queue.test.ts` already prove the pure
 * storage functions in isolation; this proves the WIRED widget survives the same poison).
 *
 * `TRANSCRIPT_STORAGE_KEY`/`ACTION_QUEUE_STORAGE_KEY` below are literal strings duplicated from
 * `../src/transcript-storage.ts`/`../src/action-queue.ts` rather than imported — same tradeoff this
 * file's own `MOUNT_ID` already makes against `main.tsx`'s copy: this script runs the BUILT artifact,
 * not the TypeScript source, so there is no shared runtime module to import from either side.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.resolve(__dirname, "../dist/site-assistant.js");
const MOUNT_ID = "tovu-site-assistant-root";
const TRANSCRIPT_STORAGE_KEY = "tovu.site-assistant.transcript.v1";
const ACTION_QUEUE_STORAGE_KEY = "tovu.site-assistant.action-queue.v1";

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

/**
 * Runs the built bundle once, in a fresh DOM, with `sessionStorage` pre-seeded per `scenario.seed`.
 * A fresh `JSDOM` instance per scenario is required, not incidental: the bundle self-mounts via an
 * IIFE the moment it is evaluated (`main.tsx`'s `mount()`), so replaying it against an already-mounted
 * window would either double-mount or hit the "someone else already owns this DOM" branch instead of
 * exercising the seeded-`sessionStorage` mount path this function actually wants to test.
 *
 * @complexity O(1) DOM/eval work per call; the caller decides how many scenarios to run.
 * @overallScore 100
 */
async function runScenario(scenario) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="${MOUNT_ID}"></div></body></html>`, {
    // Mirrors what `render.ts` actually injects: the mount div present ahead of the script, same as a
    // real themed page — `main.tsx`'s `mount()` looks for this id before falling back to creating one,
    // so this exercises the same path a real page takes, not the defensive fallback.
    url: "http://localhost/welcome",
    runScripts: "outside-only",
  });

  scenario.seed?.(dom.window.sessionStorage);

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
      `[${scenario.name}] the bundle threw during execution — it would have crashed on load in a real browser:\n` +
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
      `[${scenario.name}] the bundle threw after mounting (a post-mount effect or async error):\n` +
        caughtErrors.map((e) => `  - ${e?.stack ?? e}`).join("\n"),
    );
  }

  const mountEl = dom.window.document.getElementById(MOUNT_ID);
  if (!mountEl) {
    fail(`[${scenario.name}] #${MOUNT_ID} is missing from the DOM after evaluating the bundle`);
  }
  if (mountEl.children.length === 0) {
    fail(`[${scenario.name}] #${MOUNT_ID} has no children after evaluating the bundle — React never mounted into it`);
  }

  scenario.verify?.(dom.window.sessionStorage);

  console.log(
    `[check-bundle-mounts] OK [${scenario.name}] — bundle executed cleanly and mounted ${mountEl.children.length} child element(s) into #${MOUNT_ID}.`,
  );
}

const scenarios = [
  { name: "clean sessionStorage" },
  {
    name: "poisoned transcript entry (REQ-1 fail-soft rehydrate)",
    seed: (storage) => storage.setItem(TRANSCRIPT_STORAGE_KEY, "{not valid json, this is deliberately corrupt"),
    verify: (storage) => {
      // Fail-soft rehydrate clears the corrupt key rather than leaving it behind for the next mount
      // to trip over again — see `transcript-storage.ts#loadPersistedState`.
      if (storage.getItem(TRANSCRIPT_STORAGE_KEY) !== null) {
        fail("poisoned transcript entry: the corrupt key should have been cleared by loadPersistedState, but is still present");
      }
    },
  },
  {
    name: "wrong-shaped transcript entry (valid JSON, invalid ChatMessage shape)",
    seed: (storage) => storage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify({ open: true, messages: [{ oops: "no id/role/content" }] })),
  },
  {
    name: "poisoned action-queue entry (REQ-2 drain must not throw)",
    seed: (storage) => storage.setItem(ACTION_QUEUE_STORAGE_KEY, "{also deliberately corrupt"),
    verify: (storage) => {
      if (storage.getItem(ACTION_QUEUE_STORAGE_KEY) !== null) {
        fail("poisoned action-queue entry: drainQueuedAction should have deleted the entry before attempting to parse it");
      }
    },
  },
  {
    name: "a real queued action is drained exactly once on mount",
    seed: (storage) => storage.setItem(ACTION_QUEUE_STORAGE_KEY, JSON.stringify({ kind: "example" })),
    verify: (storage) => {
      if (storage.getItem(ACTION_QUEUE_STORAGE_KEY) !== null) {
        fail("queued action: the entry should have been drained (deleted) by main.tsx's mount-time drainQueuedAction call");
      }
    },
  },
];

for (const scenario of scenarios) {
  await runScenario(scenario);
}
