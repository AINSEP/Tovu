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
 * `session-store.ts` (formerly two files, `transcript-storage.ts` + `action-queue.ts`, collapsed per
 * SPEC-046 Task 1) reads real browser `sessionStorage` during the widget's very first render/mount,
 * and promises a specific thing under corruption: a bad entry clears itself and the widget still
 * mounts. That promise is exactly the kind this file's header warns can compile clean, typecheck
 * clean, and still break in a real environment — so it gets the same execute-and-assert treatment as
 * the base "does it mount at all" case, not a unit test alone (`../src/__tests__/session-store.test.ts`
 * already proves the pure storage functions in isolation; this proves the WIRED widget survives the
 * same poison).
 *
 * `TRANSCRIPT_STORAGE_KEY`/`ACTION_QUEUE_STORAGE_KEY` below are literal strings duplicated from
 * `../src/session-store.ts` rather than imported — same tradeoff this file's own `MOUNT_ID` already
 * makes against `main.tsx`'s copy: this script runs the BUILT artifact, not the TypeScript source, so
 * there is no shared runtime module to import from either side.
 *
 * ## SPEC-046 REQ-2/§4 — a real queued highlight/scroll_to action actually executes
 *
 * `main.tsx`'s drained-action path (`executeDrainedAction`) calls `requestAnimationFrame`, which
 * jsdom does not implement (measured: `'requestAnimationFrame' in window` is `false` on a fresh
 * `JSDOM` instance) — every real browser has supported it for over a decade, so this is a test-harness
 * gap, not evidence of a real bug, and `runScenario` stubs it below for exactly that reason (the same
 * treatment `scrollIntoView`/`matchMedia` already need — jsdom does no layout at all). Without the
 * stub, ANY scenario whose queued action actually resolves to a real `PageAction` would throw
 * `ReferenceError: requestAnimationFrame is not defined` inside the bundle — which is precisely the
 * "compiles clean, throws in a real environment" failure class this file exists to catch, so the stub
 * is required to let the highlight/scroll_to scenarios below exercise that code path at all, not to
 * hide a bug.
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
/** Present on every scenario's page, alongside the mount div — mirrors a real entry-detail page
 *  (`render.ts`'s `entryContent`: `<article class="entry"><h1 class="entry-title">…`) closely enough
 *  for `findTargetElement`'s exact-text heading search to find it, so the highlight/scroll_to
 *  scenarios below have a real target to resolve against without needing a second HTML fixture. */
const PAGE_CONTENT_HTML = `<article class="entry"><h1 class="entry-title">Example Published Post</h1><p>Some body text.</p></article>`;

async function runScenario(scenario) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="${MOUNT_ID}"></div>${PAGE_CONTENT_HTML}</body></html>`, {
    // Mirrors what `render.ts` actually injects: the mount div present ahead of the script, same as a
    // real themed page — `main.tsx`'s `mount()` looks for this id before falling back to creating one,
    // so this exercises the same path a real page takes, not the defensive fallback.
    url: "http://localhost/welcome",
    runScripts: "outside-only",
  });

  // See this file's header (SPEC-046 REQ-2/§4) for why these three are stubbed rather than left
  // absent: jsdom implements none of them, but every real browser does, so an absent stub would fail
  // scenarios that exercise real page-content DOM behavior for a jsdom limitation, not a real bug.
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
  dom.window.Element.prototype.scrollIntoView = function scrollIntoViewStub(options) {
    this.__tovuScrollIntoViewCalls = (this.__tovuScrollIntoViewCalls ?? 0) + 1;
    this.__tovuLastScrollIntoViewOptions = options;
  };
  dom.window.matchMedia = (query) => ({
    matches: false, // no scenario here exercises prefers-reduced-motion — highlight.test.ts covers that directly.
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
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
  // actually waits on. 150ms (not 100ms): `executeDrainedAction`'s `requestAnimationFrame` stub above
  // adds one more macrotask hop after the mount commit, for scenarios that queue a real page action.
  await new Promise((resolve) => setTimeout(resolve, 150));

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

  scenario.verify?.(dom.window.sessionStorage, dom.window.document);

  console.log(
    `[check-bundle-mounts] OK [${scenario.name}] — bundle executed cleanly and mounted ${mountEl.children.length} child element(s) into #${MOUNT_ID}.`,
  );
}

const scenarios = [
  { name: "clean sessionStorage" },
  {
    name: "poisoned transcript entry (REQ-1 fail-soft rehydrate)",
    seed: (storage) => storage.setItem(TRANSCRIPT_STORAGE_KEY, "{not valid json, this is deliberately corrupt"),
    // Fail-soft rehydrate (`loadPersistedState` inside `session-store.ts`) clears the corrupt key
    // synchronously, before first render, so the corrupt STRING itself must never survive. What the
    // key holds by the time this runs is a separate, timing-dependent question this assertion must
    // NOT depend on: `SiteAssistantWidget.tsx`'s own REQ-1 persistence effect legitimately re-writes
    // the (now-empty) `{ open: false, messages: [] }` state back on mount, same as it would after any
    // other state change — whether that effect has already fired by the time this callback runs is a
    // React-scheduler timing detail, not a REQ-1 contract. An earlier version of this assertion
    // required the key to be strictly `null`, which only ever passed by racing that effect; it
    // started failing deterministically once an unrelated bundle-size change shifted the timing —
    // see SPEC-046 Task 2's handoff notes. The real invariant: never the original corrupt bytes, and
    // whatever DOES replace them (nothing, or the freshly-persisted empty state) must be well-formed.
    verify: (storage) => {
      const value = storage.getItem(TRANSCRIPT_STORAGE_KEY);
      if (value === null) return; // effect has not (yet) re-persisted — also a valid post-clear state.
      if (value.startsWith("{not valid json")) {
        fail("poisoned transcript entry: the corrupt value must not survive verbatim");
      }
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        fail(`poisoned transcript entry: whatever replaced the corrupt entry is not valid JSON: ${value}`);
        return;
      }
      if (parsed.open !== false || !Array.isArray(parsed.messages) || parsed.messages.length !== 0) {
        fail(`poisoned transcript entry: replaced with an unexpected, non-empty value: ${value}`);
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
        fail("queued action: the entry should have been drained (deleted) by main.tsx's mount-time drainQueuedPageAction call");
      }
    },
  },
  {
    // SPEC-046 §4: a `highlight` action targeting the real published-entry heading seeded into every
    // scenario's page (`PAGE_CONTENT_HTML`) — proves the WIRED path (drain -> validate -> find target
    // -> scroll -> apply the CSS class), not just `highlight.ts`'s functions in isolation
    // (`../src/__tests__/highlight.test.ts` already proves those directly).
    name: "a queued highlight action finds its target and applies the highlight class (SPEC-046 §4)",
    seed: (storage) =>
      storage.setItem(
        ACTION_QUEUE_STORAGE_KEY,
        JSON.stringify({ type: "highlight", target: { slug: "example-published-post", title: "Example Published Post", path: "/example-published-post" } }),
      ),
    verify: (_storage, document) => {
      const heading = document.querySelector(".entry-title");
      if (!heading) fail("highlight action: the seeded page heading is missing — the scenario fixture itself is broken");
      if (!heading.classList.contains("tovu-site-assistant__highlight")) {
        fail("highlight action: the target heading never received the tovu-site-assistant__highlight class");
      }
      if ((heading.__tovuScrollIntoViewCalls ?? 0) !== 1) {
        fail(`highlight action: expected exactly one scrollIntoView call, got ${heading.__tovuScrollIntoViewCalls ?? 0}`);
      }
    },
  },
  {
    // Same target, `scroll_to` instead of `highlight` — must scroll WITHOUT applying the visual
    // highlight class (the two share target resolution but not the visual treatment; see `tools.ts`'s
    // own doc on why `scroll_to_entry` and `highlight_entry` are separate capabilities).
    name: "a queued scroll_to action scrolls to its target without highlighting it",
    seed: (storage) =>
      storage.setItem(
        ACTION_QUEUE_STORAGE_KEY,
        JSON.stringify({ type: "scroll_to", target: { slug: "example-published-post", title: "Example Published Post", path: "/example-published-post" } }),
      ),
    verify: (_storage, document) => {
      const heading = document.querySelector(".entry-title");
      if ((heading?.__tovuScrollIntoViewCalls ?? 0) !== 1) {
        fail(`scroll_to action: expected exactly one scrollIntoView call, got ${heading?.__tovuScrollIntoViewCalls ?? 0}`);
      }
      if (heading?.classList.contains("tovu-site-assistant__highlight")) {
        fail("scroll_to action: must never apply the highlight class — that is highlight_entry's job, not scroll_to_entry's");
      }
    },
  },
  {
    // Defensive-only path (`main.tsx#executeDrainedAction`'s own doc): `SiteAssistantWidget.tsx` never
    // actually enqueues a `navigate` action (there is nothing to "arrive and execute" for a navigation
    // that already happened), but a queued one must still degrade to a no-op rather than throw or
    // mis-execute as a scroll/highlight target.
    name: "a queued navigate action (defensive path) is drained without executing or throwing",
    seed: (storage) =>
      storage.setItem(
        ACTION_QUEUE_STORAGE_KEY,
        JSON.stringify({ type: "navigate", target: { slug: "example-published-post", title: "Example Published Post", path: "/example-published-post" }, auto: true }),
      ),
    verify: (storage, document) => {
      if (storage.getItem(ACTION_QUEUE_STORAGE_KEY) !== null) fail("navigate action: the entry should still have been drained (deleted)");
      const heading = document.querySelector(".entry-title");
      if (heading?.classList.contains("tovu-site-assistant__highlight")) fail("navigate action: must never be executed as a highlight/scroll_to target");
    },
  },
];

for (const scenario of scenarios) {
  await runScenario(scenario);
}
