import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { JSDOM } from "jsdom";

import { applyHighlight, clearHighlight, findTargetElement, scrollToElement } from "../highlight";

/**
 * SPEC-046 §4. `highlight.ts` reads the bare globals `document`/`window`/`setTimeout` (the same way
 * `main.tsx`/`SiteAssistantWidget.tsx` read the browser session store directly) rather than taking them as
 * parameters — it is a DOM side-effect module by nature, not a pure function. Each test installs a
 * fresh `JSDOM` onto `globalThis` and tears it down afterward, matching
 * `check-bundle-mounts.mjs`'s "fresh JSDOM per scenario" pattern for the same reason: `current`
 * (`highlight.ts`'s module-level highlighted-element tracker) must not leak state or a stale
 * `setTimeout` handle across tests.
 */

let dom: JSDOM;
const installedGlobals = ["window", "document", "Element", "Event", "getComputedStyle"] as const;
const savedGlobals: Partial<Record<(typeof installedGlobals)[number], unknown>> = {};
/** Untyped view of `globalThis` for this file's temporary jsdom installation only — see the
 *  `describe` block's own doc for why this module patches bare globals rather than taking them as
 *  parameters. */
const untypedGlobal = globalThis as unknown as Record<string, unknown>;

beforeEach(() => {
  dom = new JSDOM(
    `<!doctype html><html><body>
      <div class="tovu-site-assistant"><h1>Ask this site</h1></div>
      <main>
        <h1 class="entry-title">Hello World</h1>
        <p>Some body text.</p>
      </main>
    </body></html>`,
    { url: "http://localhost/hello-world" },
  );
  for (const key of installedGlobals) {
    savedGlobals[key] = untypedGlobal[key];
    untypedGlobal[key] = (dom.window as unknown as Record<string, unknown>)[key];
  }
  // jsdom implements neither `scrollIntoView` nor `matchMedia` — stubbed per SPEC-046's own
  // acceptance-criteria note that this is a layout-free DOM, not a real browser.
  dom.window.Element.prototype.scrollIntoView = () => {};
  dom.window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  clearHighlight();
  for (const key of installedGlobals) untypedGlobal[key] = savedGlobals[key];
  dom.window.close();
});

describe("findTargetElement", () => {
  it("finds the exact-text-match heading", () => {
    const found = findTargetElement("Hello World");
    assert.equal(found?.tagName, "H1");
    assert.equal(found?.className, "entry-title");
  });

  it("falls back to a case-insensitive match", () => {
    const found = findTargetElement("HELLO WORLD");
    assert.equal(found?.className, "entry-title");
  });

  it("returns null when nothing matches", () => {
    assert.equal(findTargetElement("No Such Title"), null);
  });

  it("returns null for an empty or whitespace-only title", () => {
    assert.equal(findTargetElement(""), null);
    assert.equal(findTargetElement("   "), null);
  });

  it("never returns an element inside the widget's own pane (SPEC-046 §4)", () => {
    // The widget's own heading text ("Ask this site") must never be a valid highlight target, even
    // if a post happened to be titled that.
    assert.equal(findTargetElement("Ask this site"), null);
  });

  it("accepts an explicit root, scoping the search below it", () => {
    const main = document.querySelector("main");
    assert.ok(main);
    const inside = main.querySelector(".entry-title");
    const outside = document.createElement("h2");
    outside.textContent = "Hello World";
    document.body.prepend(outside);
    assert.equal(findTargetElement("Hello World", main), inside);
    outside.textContent = "Outside only";
    assert.equal(findTargetElement("Outside only", main), null);
  });
  it("prefers an exact title-class match over an earlier case-insensitive heading", () => {
    const heading = document.querySelector(".entry-title")!;
    heading.textContent = "HELLO WORLD";
    const exact = document.createElement("div");
    exact.className = "custom-title";
    exact.textContent = "Hello World";
    document.querySelector("main")!.append(exact);
    assert.equal(findTargetElement("Hello World"), exact);
  });

});

describe("applyHighlight / clearHighlight", () => {
  it("adds the highlight class to the target element", () => {
    const el = document.querySelector(".entry-title") as Element;
    applyHighlight(el);
    assert.ok(el.classList.contains("tovu-site-assistant__highlight"));
  });

  it("clearHighlight removes the class and is idempotent", () => {
    const el = document.querySelector(".entry-title") as Element;
    applyHighlight(el);
    clearHighlight();
    assert.ok(!el.classList.contains("tovu-site-assistant__highlight"));
    assert.doesNotThrow(() => clearHighlight());
  });

  it("only one element is highlighted at a time — a second apply clears the first", () => {
    const first = document.querySelector(".entry-title") as Element;
    const second = document.querySelector("p") as Element;
    applyHighlight(first);
    applyHighlight(second);
    assert.ok(!first.classList.contains("tovu-site-assistant__highlight"));
    assert.ok(second.classList.contains("tovu-site-assistant__highlight"));
  });

  it("re-applying to the already-highlighted element is a no-op, not a restart", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const el = document.querySelector(".entry-title") as Element;
    const observer = new dom.window.MutationObserver(() => {});
    try {
      applyHighlight(el);
      t.mock.timers.tick(10_000);
      observer.observe(el, { attributes: true, attributeFilter: ["class"] });
      applyHighlight(el);
      assert.deepEqual(observer.takeRecords(), [], "redundant apply must not remove/re-add the class");
      assert.ok(el.classList.contains("tovu-site-assistant__highlight"), "still highlighted after a redundant apply");
      t.mock.timers.tick(10_999);
      assert.ok(el.classList.contains("tovu-site-assistant__highlight"));
      t.mock.timers.tick(1);
      assert.ok(!el.classList.contains("tovu-site-assistant__highlight"), "expires at the original deadline");
    } finally {
      observer.disconnect();
      clearHighlight();
    }
  });

  it("clears at the 21s fallback deadline when no animationend arrives", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const el = document.querySelector(".entry-title")!;
    try {
      applyHighlight(el);
      t.mock.timers.tick(20_999);
      assert.ok(el.classList.contains("tovu-site-assistant__highlight"));
      t.mock.timers.tick(1);
      assert.ok(!el.classList.contains("tovu-site-assistant__highlight"));
    } finally { clearHighlight(); }
  });

  it("cancels the old fallback so it cannot clear a newer highlight", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const first = document.querySelector(".entry-title")!;
    const second = document.querySelector("p")!;
    try {
      applyHighlight(first);
      t.mock.timers.tick(10_000);
      applyHighlight(second);
      t.mock.timers.tick(11_000);
      assert.ok(!first.classList.contains("tovu-site-assistant__highlight"));
      assert.ok(second.classList.contains("tovu-site-assistant__highlight"), "old deadline must not clear the new target");
      t.mock.timers.tick(10_000);
      assert.ok(!second.classList.contains("tovu-site-assistant__highlight"));
    } finally { clearHighlight(); }
  });

  it("clears on the FADE animation's animationend, ignoring an earlier pulse animationend", () => {
    const el = document.querySelector(".entry-title") as Element;
    applyHighlight(el);

    const pulseEnd = new dom.window.Event("animationend") as AnimationEvent & { animationName?: string };
    Object.defineProperty(pulseEnd, "animationName", { value: "tovu-site-assistant-highlight-pulse" });
    el.dispatchEvent(pulseEnd);
    assert.ok(el.classList.contains("tovu-site-assistant__highlight"), "the pulse ending must not clear the highlight");

    const fadeEnd = new dom.window.Event("animationend") as AnimationEvent & { animationName?: string };
    Object.defineProperty(fadeEnd, "animationName", { value: "tovu-site-assistant-highlight-fade" });
    el.dispatchEvent(fadeEnd);
    assert.ok(!el.classList.contains("tovu-site-assistant__highlight"), "the fade ending must clear the highlight");
  });
});

describe("scrollToElement", () => {
  it("scrolls smoothly when the visitor has no reduced-motion preference", () => {
    const el = document.querySelector(".entry-title") as Element;
    let seenOptions: ScrollIntoViewOptions | undefined;
    el.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
      seenOptions = options as ScrollIntoViewOptions;
    };
    scrollToElement(el);
    assert.equal(seenOptions?.behavior, "smooth");
  });

  it("scrolls without smooth animation under prefers-reduced-motion: reduce", () => {
    dom.window.matchMedia = ((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    const el = document.querySelector(".entry-title") as Element;
    let seenOptions: ScrollIntoViewOptions | undefined;
    el.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
      seenOptions = options as ScrollIntoViewOptions;
    };
    scrollToElement(el);
    assert.equal(seenOptions?.behavior, "auto");
  });
});
