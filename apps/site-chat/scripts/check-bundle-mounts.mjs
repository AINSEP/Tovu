#!/usr/bin/env node
/**
 * @file Post-build regression check (ADR-054): actually EXECUTES the built `dist/site-assistant.js`
 * in a real DOM (jsdom) and asserts it mounts, rather than only checking that the build succeeded.
 *
 * The generic execute-and-assert harness (fresh DOM per scenario, error capture, settle wait,
 * mount assertion, CLI) lives in `@jini-ai/devops/checks/node`, together with its why-comments
 * (why execute instead of grep, why a fresh DOM per scenario, navigation as a signal, the
 * `requestAnimationFrame`/`scrollIntoView`/`matchMedia` stubs, the 150 ms settle). This file owns
 * what is specific to this widget: its mount id, page content, storage keys, bundle path, the jsdom
 * binding, and the scenarios below.
 *
 * Not a substitute for the manual Playwright-against-a-real-page check the original load-crash bugs
 * were found with — jsdom is not a real browser and this never opens the chat pane or exercises the
 * network transport.
 *
 * ## SPEC-046 REQ-1/REQ-2 — the poisoned-`sessionStorage` scenarios
 *
 * `session-store.ts` (formerly two files, `transcript-storage.ts` + `action-queue.ts`, collapsed per
 * SPEC-046 Task 1) reads real browser `sessionStorage` during the widget's very first render/mount,
 * and promises a specific thing under corruption: a bad entry clears itself and the widget still
 * mounts. That promise is exactly the kind the devops harness's header warns can compile clean, typecheck
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
 * gap, not evidence of a real bug, and the devops harness stubs it for exactly that reason (the same
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
import { checkBundleMounts as runBundleChecks, fail, isEntryPoint, runBundleCheckCli } from "@jini-ai/devops/checks/node";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BUNDLE_PATH = path.resolve(__dirname, "../dist/site-assistant.js");
export const MOUNT_ID = "tovu-site-assistant-root";
export const TRANSCRIPT_STORAGE_KEY = "tovu.site-assistant.transcript.v1";
export const ACTION_QUEUE_STORAGE_KEY = "tovu.site-assistant.action-queue.v1";
/** The page URL every scenario runs at. */
const PAGE_URL = "http://localhost/welcome";

/** Present on every scenario's page, alongside the mount div — mirrors a real entry-detail page
 *  (`render.ts`'s `entryContent`: `<article class="entry"><h1 class="entry-title">…`) closely enough
 *  for `findTargetElement`'s exact-text heading search to find it, so the highlight/scroll_to
 *  scenarios below have a real target to resolve against without needing a second HTML fixture. */
export const PAGE_CONTENT_HTML = `<article class="entry"><h1 class="entry-title">Example Published Post</h1><p>Some body text.</p></article>`;

/**
 * The jsdom binding for the devops harness: a NEW `JSDOM` per call (the bundle self-mounts on
 * evaluation, so every scenario needs its own), scripts run only through the harness's `eval`,
 * jsdom's own error reports (`jsdomError`, incl. its "Not implemented: navigation") forwarded, and
 * `window.close()` as disposal so a scenario's pending timers die with it.
 */
export function createJsdom({ html, url }, _options = {}) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  return {
    window: dom.window,
    onConsoleError: (listener) => dom.virtualConsole.on("jsdomError", listener),
    dispose: () => dom.window.close(),
  };
}

export const scenarios = [
  { name: "clean sessionStorage" },
  {
    name: "poisoned transcript entry (REQ-1 fail-soft rehydrate)",
    seed: ({ storage }, _options = {}) => storage.setItem(TRANSCRIPT_STORAGE_KEY, "{not valid json, this is deliberately corrupt"),
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
    verify: ({ storage }, _options = {}) => {
      const value = storage.getItem(TRANSCRIPT_STORAGE_KEY);
      if (value === null) return; // effect has not (yet) re-persisted — also a valid post-clear state.
      if (value.startsWith("{not valid json")) {
        fail({ message: "poisoned transcript entry: the corrupt value must not survive verbatim" });
      }
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        fail({ message: `poisoned transcript entry: whatever replaced the corrupt entry is not valid JSON: ${value}` });
      }
      if (parsed.open !== false || !Array.isArray(parsed.messages) || parsed.messages.length !== 0) {
        fail({ message: `poisoned transcript entry: replaced with an unexpected, non-empty value: ${value}` });
      }
    },
  },
  {
    name: "wrong-shaped transcript entry (valid JSON, invalid ChatMessage shape)",
    seed: ({ storage }, _options = {}) => storage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify({ open: true, messages: [{ oops: "no id/role/content" }] })),
    // Same drift guard as the poisoned-JSON scenario above: without asserting the seeded entry was
    // consumed/replaced, a `TRANSCRIPT_STORAGE_KEY` version bump in `session-store.ts` left
    // un-mirrored here would seed a key the running bundle never even reads, and this scenario would
    // still pass on "still mounts" alone — vacuously, since the wrong-shaped entry it meant to
    // exercise was never actually read by `loadPersistedState`.
    verify: ({ storage }, _options = {}) => {
      const value = storage.getItem(TRANSCRIPT_STORAGE_KEY);
      if (value === null) return; // effect has not (yet) re-persisted — also a valid post-clear state.
      if (value.includes('"oops"')) {
        fail({ message: "wrong-shaped transcript entry: the invalid ChatMessage entry must not survive verbatim" });
      }
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        fail({ message: `wrong-shaped transcript entry: whatever replaced the invalid entry is not valid JSON: ${value}` });
      }
      if (parsed.open !== false || !Array.isArray(parsed.messages) || parsed.messages.length !== 0) {
        fail({ message: `wrong-shaped transcript entry: replaced with an unexpected, non-empty value: ${value}` });
      }
    },
  },
  {
    name: 'retired action queue never executes',
    seed: ({ storage }, _options = {}) => storage.setItem(ACTION_QUEUE_STORAGE_KEY, JSON.stringify({ type: 'highlight', target: { slug: 'example', title: 'Example Published Post', path: '/example' } })),
    verify: ({ document, navigationAttempts }, _options = {}) => {
      const heading = document.querySelector('.entry-title');
      if (heading?.__jiniScrollIntoViewCalls) fail({ message: 'retired queue scrolled a target' });
      if (heading?.style.outline || heading?.classList.contains('tovu-site-assistant__highlight')) fail({ message: 'retired queue highlighted a target' });
      if (navigationAttempts.length) fail({ message: 'retired queue navigated' });
    },
  },
  {
    // Regression test for a REAL infinite-navigation-loop bug found live during SPEC-046
    // verification (2026-08-04), not a hypothetical: a persisted `TRANSCRIPT_STORAGE_KEY` whose LAST
    // message is a settled assistant turn carrying an `auto: true` navigate `client_directive` (i.e.
    // "take me there" already fired once) was replayed on EVERY subsequent mount, because
    // `SiteAssistantWidget.tsx`'s `processedMessageIdsRef` started as an empty `Set` — `ChatPane`'s
    // own `onMessagesChange` fires once on mount with the rehydrated `conversation.messages`
    // (`useChatPane.hooks.ts`), so an empty ref treated that already-executed message as brand new
    // and called `window.location.assign` again, landing back on a page whose persisted transcript
    // STILL ends in that same message — an unbounded loop. Measured live in a real browser: 11
    // navigations to the same destination in 6 seconds, uncapped. Fixed by seeding
    // `processedMessageIdsRef` with every id already present in `initialState.messages` at
    // construction (SiteAssistantWidget.tsx) — this scenario is what proves that fix and prevents a
    // regression back to the empty-`Set` version.
    //
    // One `eval` of the bundle is exactly one mount, which is sufficient to reproduce/guard this:
    // the bug is "does THIS mount re-fire an already-executed directive," not "does a second real
    // navigation occur" — jsdom cannot carry out a real navigation anyway (see the
    // `jsdomError` forwarding in `createJsdom` above and the devops harness's `navigationAttempts`), so the guard is "zero navigation
    // ATTEMPTS," which is exactly as strong a signal as "zero real navigations" would be here.
    name: "a rehydrated message whose directive already executed must not re-fire navigation on mount (SPEC-046 regression)",
    seed: ({ storage }, _options = {}) =>
      storage.setItem(
        TRANSCRIPT_STORAGE_KEY,
        JSON.stringify({
          open: true,
          messages: [
            { id: "u1", role: "user", content: "take me to the about page" },
            {
              id: "a1",
              role: "assistant",
              content: "Here you go.",
              runStatus: "succeeded",
              events: [
                {
                  kind: "ext",
                  name: "client_directive",
                  data: { kind: "page_action", action: { type: "navigate", target: { slug: "about", title: "About", path: "/about" }, auto: true } },
                },
              ],
            },
          ],
        }),
      ),
    verify: ({ navigationAttempts }, _options = {}) => {
      if (navigationAttempts.length > 0) {
        fail(
          { message: `rehydrated navigate directive re-fired on mount — ${navigationAttempts.length} navigation attempt(s) detected: ${JSON.stringify(navigationAttempts)}. ` +
            "This is the exact shape of the live infinite-reload bug: an already-executed auto-navigate directive in the persisted transcript's last message must not run again just because a fresh component instance mounted." },
        );
      }
    },
  },
];

/** Run every scenario against one bundle, in order, in this widget's page; the first failure throws. */
export async function checkBundleMounts({ bundleSource }, options = {}) {
  await runBundleChecks(
    { bundleSource, scenarios, createDom: createJsdom, mountId: MOUNT_ID, pageHtml: PAGE_CONTENT_HTML, url: PAGE_URL },
    { log: console.log, label: "check-bundle-mounts", ...options },
  );
}

/**
 * The CLI: read the built bundle and run every scenario, reporting a failure on stderr with exit
 * status 1. Ports default to the real file system, console and process; a test injects fakes.
 * @returns the exit status it reported (0 when every scenario passed).
 */
export async function main(
  { bundlePath = BUNDLE_PATH } = {},
  { readText = (file) => readFileSync(file, "utf8"), check = checkBundleMounts, error = console.error, exit = process.exit } = {},
) {
  return runBundleCheckCli({ bundlePath, readText, check, error, exit }, { label: "check-bundle-mounts" });
}

// An optional first argument names another bundle file (the tests point it at a missing one).
if (isEntryPoint({ moduleUrl: import.meta.url, argv1: process.argv[1] })) await main({ bundlePath: process.argv[2] });
