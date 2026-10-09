// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { type Locator } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { ABOUT_TARGET } from "../site-assistant-fixtures.js";
import { mockAssistantTurn } from "../site-assistant-fixtures.js";
import { openChatPanel } from "../site-assistant-fixtures.js";
import { openSitePage } from "../site-assistant-fixtures.js";
import { sendVisitorMessage } from "../site-assistant-fixtures.js";
import { THEMES_TARGET } from "../site-assistant-fixtures.js";
import { readPersistedState } from "../site-assistant-fixtures.js";
import path from "node:path";

// Public-widget pins exercise anonymous visitors; setup writes use a separate admin context.
test.use({ storageState: { cookies: [], origins: [] } });

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from site-assistant-highlight.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: site-assistant-highlight", () => {
/**
 * @file SPEC-046 §4 AC2/AC4/AC7 — the highlight visual treatment, against the REAL `widget.css`
 * `@keyframes` timeline on a REAL themed page, over its full ~20s lifecycle.
 *
 * Isolated into its own file, sibling to `site-assistant-navigation.spec.ts` and
 * `site-assistant-persistence.spec.ts`: every test here either waits out or budgets for the full
 * pulse→hold→fade cycle (`widget.css`'s `.tovu-site-assistant__highlight` animation shorthand: a 1.2s
 * pulse, then nothing until the fade starts at the 18s mark and completes at 20s), so this file runs
 * an order of magnitude slower per test than its siblings. Keeping it separate means a failure here
 * does not stall the fast persistence/navigation feedback loop, and a change to this file's timeout
 * needs does not touch `playwright.site-assistant.config.ts`'s shared 45s default.
 *
 * ## What each AC needs that no cheaper test gives it
 *
 * `highlight.test.ts` (unit) proves `findTargetElement`/`applyHighlight`/`clearHighlight` against a
 * jsdom document with no real CSS engine — jsdom does not run `@keyframes` or compute `animationName`
 * at all, so it cannot prove the pulse actually plays, that the fade actually reaches zero opacity, or
 * that a real host page's own reduced-motion reset interacts with this widget's CSS the way the code
 * comments say it does. Those are exactly AC2, AC4, and AC7's subject matter, and all three are
 * properties of a real browser's rendering and animation pipeline running the real built CSS — nothing
 * short of that is evidence here.
 *
 * ## AC4 is a regression guard, not a formality
 *
 * `e5a1dbd` fixed a real, live-measured bug: the shipped `tovu-official` theme carries its own
 * `@media (prefers-reduced-motion: reduce) { * { animation: none !important } }` accessibility reset,
 * which (per CSS's `!important`-outranks-specificity rule) silently beat `widget.css`'s own
 * reduced-motion override when that override had no `!important` of its own — `animationName` computed
 * as `"none"`, and the outline never faded, sitting at full opacity until `highlight.ts`'s 21s JS
 * fallback timer force-removed it with a visible pop. That theme reset is still live on every rendered
 * page today (confirmed in the served HTML). The AC4 test below is proven to catch a reintroduction of
 * that exact bug — see its own comment for the revert-rebuild-observe procedure and the failure
 * signature that produced.
 */

const HIGHLIGHT_CLASS = "tovu-site-assistant__highlight";
const PULSE_ANIMATION_NAME = "tovu-site-assistant-highlight-pulse";
const FADE_ANIMATION_NAME = "tovu-site-assistant-highlight-fade";
/** `widget.css`: pulse 0.6s×2 then a fade starting at 18s and completing at 20s (`forwards`, so the
 *  faded-out end state holds rather than snapping back). This is the wall-clock length of the whole
 *  animation from class-add to the `animationend` that `highlight.ts#handleAnimationEnd` treats as
 *  authoritative cleanup — see that file's own doc for why a fallback timer exists but is not this. */
const FADE_COMPLETE_MS = 20_000;
/** Polling budget; the measured cleanup time below must still precede the 21s fallback. */
const FADE_WAIT_TIMEOUT_MS = 24_000;

/** Picks out the About page's own `<h1 class="entry-title">` (`render.ts#entryContent`) by ARIA role
 *  and accessible name — the widget's own target-resolution heuristic (`highlight.ts#findTargetElement`)
 *  independently arrives at the same element by matching trimmed text content, so this locator and the
 *  widget's internal one are deliberately built two different ways rather than sharing a selector. */
function aboutHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: ABOUT_TARGET.title, exact: true });
}

/** Force the target below the viewport so a skipped scroll cannot pass. */
async function putHeadingOffscreen(page: Page, heading: Locator): Promise<void> {
  await heading.evaluate((el) => {
    const spacer = document.createElement("div");
    spacer.style.height = "200vh";
    el.before(spacer);
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  const viewport = await page.evaluate(() => window.innerHeight);
  expect((await heading.boundingBox())!.y).toBeGreaterThan(viewport);
}

async function expectHeadingInViewport(heading: Locator): Promise<void> {
  await expect.poll(() => heading.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  })).toBe(true);
}

/** Plain-object copy of `getBoundingClientRect()` — the live `DOMRect` does not survive
 *  `Locator.evaluate`'s structured-clone boundary with its own prototype, and only these four fields
 *  are what AC7 is actually about (a reflow moves position and/or size; it does not merely change some
 *  other unrelated property `DOMRect` also exposes). */
async function rectOf(locator: Locator): Promise<{ top: number; left: number; width: number; height: number }> {
  // Document-relative, not viewport-relative: a highlight scrolls its target into view (AC2/AC4),
  // and a scroll moves every viewport rect without any reflow. Snapped to Chromium's 1/64px layout
  // unit so the two float subtractions cannot differ in their last bits; a border still shows.
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const doc = document.documentElement.getBoundingClientRect();
    const snap = (value: number) => Math.round(value * 64) / 64;
    return { top: snap(r.top - doc.top), left: snap(r.left - doc.left), width: r.width, height: r.height };
  });
}

/** Sends a visitor turn whose only client directive is a standalone `highlight` of `ABOUT_TARGET`, on
 *  a page where that target already exists — `SiteAssistantWidget.tsx#handleMessagesChange` runs a
 *  standalone (non-navigate) directive against the CURRENT page synchronously, so no queue/reload is
 *  needed to observe it, unlike `site-assistant-persistence.spec.ts`'s bundled-with-navigate case. */
async function triggerHighlight(page: Page): Promise<void> {
  await mockAssistantTurn(page, {
    text: "Here it is.",
    directives: [{ type: "highlight", target: ABOUT_TARGET }],
  });
  await openChatPanel(page);
  await sendVisitorMessage(page, "Show me the About section.");
  await page.waitForSelector(`.${HIGHLIGHT_CLASS}`, { state: "visible" });
}

test.describe("SPEC-046 AC2 — highlight pulses, holds, fades, and leaves no residue", () => {
  test("the pulse actually runs, then the outline fades to nothing over the real ~20s timeline", async ({ page }) => {
    // Genuinely temporal, not a convenience shortcut: the property under test IS the wall-clock
    // duration of a CSS animation. Config default (45s) has ~20s of headroom above what this test
    // itself needs; setting it explicitly here documents that the number is chosen, not inherited.
    test.setTimeout(60_000);

    await page.addInitScript((highlightClass) => {
      const samples: Array<{ ms: number; alpha: number; width: number }> = [];
      const record = { samples, completedMs: 0 };
      (window as unknown as { highlightTimeline: typeof record }).highlightTimeline = record;
      const observer = new MutationObserver(() => {
        const target = document.querySelector(`.${highlightClass}`);
        if (!target) return;
        observer.disconnect();
        const start = performance.now();
        function sample() {
          const ms = performance.now() - start;
          if (!target!.classList.contains(highlightClass)) {
            record.completedMs = ms;
            return;
          }
          const style = getComputedStyle(target!);
          const components = style.outlineColor.match(/[\d.]+/g)?.map(Number) ?? [];
          samples.push({ ms, alpha: components.length === 4 ? components[3]! : 1, width: parseFloat(style.outlineWidth) });
          if (ms < 24_000) requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      observer.observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
    }, HIGHLIGHT_CLASS);

    await openSitePage(page, ABOUT_TARGET.path);
    const heading = aboutHeading(page);
    await putHeadingOffscreen(page, heading);
    await triggerHighlight(page);
    await expectHeadingInViewport(heading);
    await expect(heading).toHaveClass(new RegExp(HIGHLIGHT_CLASS));

    // Measured, not assumed: `getComputedStyle` reads what the browser's cascade actually resolved
    // for this element, which is the only way to know `widget.css`'s un-important reduced-motion-free
    // rule actually won here (this test runs in a DEFAULT context — no reduced-motion override — so
    // the full two-animation shorthand should apply undisturbed). Checking for BOTH names, not just
    // "not none", is what proves the pulse specifically is present and not merely the fade running
    // alone (which is what AC4's reduced-motion variant looks like, and which this test must be able
    // to tell apart from).
    const animationName = await heading.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toContain(PULSE_ANIMATION_NAME);
    expect(animationName).toContain(FADE_ANIMATION_NAME);

    // Waits for the real `animationend` → `clearHighlight()` chain (`highlight.ts`), not a fixed
    // sleep — this is a genuine condition (the class is present now, and the assertion is "eventually
    // becomes absent"), so `waitForFunction` is the correct anti-flake tool even though satisfying it
    // takes ~20 real seconds.
    await page.waitForFunction(
      (cls) => document.querySelector(`.${cls}`) === null,
      HIGHLIGHT_CLASS,
      { timeout: FADE_WAIT_TIMEOUT_MS },
    );
    await page.waitForFunction(() => (window as unknown as { highlightTimeline: { completedMs: number } }).highlightTimeline.completedMs > 0);
    const timeline = await page.evaluate(() => (window as unknown as {
      highlightTimeline: { samples: Array<{ ms: number; alpha: number; width: number }>; completedMs: number };
    }).highlightTimeline);
    const pulse = timeline.samples.filter((sample) => sample.ms < 1_200);
    expect(pulse.length).toBeGreaterThan(5);
    expect(Math.min(...pulse.map((sample) => sample.alpha))).toBeLessThan(0.7);
    expect(Math.max(...pulse.map((sample) => sample.alpha))).toBeGreaterThan(0.8);
    const hold = timeline.samples.filter((sample) => sample.ms >= 5_000 && sample.ms <= 17_000);
    expect(hold.length).toBeGreaterThan(5);
    expect(hold.every((sample) => sample.alpha > 0.8 && sample.width > 0)).toBe(true);
    const fade = timeline.samples.filter((sample) => sample.ms >= 18_000 && sample.ms < FADE_COMPLETE_MS);
    expect(fade.length).toBeGreaterThan(5);
    expect(fade[0]!.alpha).toBeGreaterThan(0.8);
    expect(fade.at(-1)!.alpha).toBeLessThan(0.2);
    expect(timeline.completedMs).toBeGreaterThanOrEqual(FADE_COMPLETE_MS - 300);
    expect(timeline.completedMs).toBeLessThan(20_800);

    // No residue: not just "the class is gone" (which `waitForFunction` above already established)
    // but that the resolved style is back to a plain, unhighlighted heading — `animation-fill-mode:
    // forwards` on the fade could in principle hold a faded-but-nonzero outline indefinitely if the
    // class removal and the visual end-state ever drifted apart; checking the COMPUTED outline (not
    // just class membership) is what rules that out.
    await expect(heading).not.toHaveClass(new RegExp(HIGHLIGHT_CLASS));
    const outlineStyle = await heading.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outlineStyle).toBe("none");
  });
});

test.describe("SPEC-046 AC4 — reduced motion: no pulse, no smooth scroll, the fade still runs", () => {
  test("no pulse, no smooth scroll, still highlighted, and the fade runs on the same timeline", async ({ page }) => {
    test.setTimeout(60_000);

    // `page.emulateMedia`, not `test.use({ reducedMotion: "reduce" })`. Measured on this exact stack
    // (Playwright 1.61.1 + bundled Chromium), in isolation against a bare `data:` URL with no app
    // code involved — three forms, three results:
    //
    //   test.use({ reducedMotion: "reduce" })                  -> matchMedia .matches === false  ✗
    //   test.use({ contextOptions: { reducedMotion: "reduce" }}) -> matchMedia .matches === true   ✓
    //   page.emulateMedia({ reducedMotion: "reduce" })          -> matchMedia .matches === true   ✓
    //
    // So the top-level `reducedMotion` test option is the broken one specifically: it reads back as
    // `"reduce"` on the fixture while never reaching the page. `contextOptions` works and would be a
    // legitimate alternative here; `emulateMedia` is preferred only because it puts the emulation on
    // the same line as the test that depends on it, where a reader cannot miss it. That is a
    // readability preference, not a workaround for a second broken API — do not "fix" this by
    // reaching for the top-level option, which is the one that silently does nothing.
    //
    // The assertion a few lines below exists regardless of which of these is used: AC4 passes
    // vacuously under a context that never actually set the preference, which is precisely how the
    // `e5a1dbd` bug survived until someone checked.
    await page.emulateMedia({ reducedMotion: "reduce" });

    // Records every `scrollIntoView` call's `behavior` before the widget bundle (or anything else on
    // the page) can call it — an init script runs before any page script, which `page.evaluate` after
    // the fact cannot guarantee, since the scroll this test cares about already happened by then.
    await page.addInitScript(() => {
      (window as unknown as { __scrollCalls: ScrollIntoViewOptions[] }).__scrollCalls = [];
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function patched(this: Element, options?: boolean | ScrollIntoViewOptions) {
        (window as unknown as { __scrollCalls: unknown[] }).__scrollCalls.push(options as ScrollIntoViewOptions);
        return original.call(this, options as ScrollIntoViewOptions);
      };
    });

    await openSitePage(page, ABOUT_TARGET.path);

    // The load-bearing assertion this whole describe block exists for: skipping this check would let
    // the test pass vacuously against `widget.css`'s NON-reduced-motion rule if `emulateMedia` above
    // ever silently stopped taking effect (exactly the failure mode just measured against `test.use`
    // one layer up) — this is what makes "the page really is running under reduced motion" observed
    // and asserted, never assumed from either API's documented contract.
    const reducedMotionActuallySet = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(reducedMotionActuallySet).toBe(true);

    const heading = aboutHeading(page);
    await putHeadingOffscreen(page, heading);
    await triggerHighlight(page);
    await expectHeadingInViewport(heading);
    await expect(heading).toHaveClass(new RegExp(HIGHLIGHT_CLASS));

    // No pulse: exactly the fade name, nothing else. `e5a1dbd`'s bug made this compute as `"none"`
    // (the theme's own reset winning); a correct build makes it exactly the fade, never the pulse.
    const animationName = await heading.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe(FADE_ANIMATION_NAME);

    // No smooth scroll: `highlight.ts#scrollToElement` is the only caller of `scrollIntoView` in this
    // bundle, and its `behavior` argument is a direct `matchMedia` branch — "auto" here is what proves
    // that branch actually took the reduced-motion path, not merely that scrolling happened at all.
    const scrollCalls = await page.evaluate(() => (window as unknown as { __scrollCalls: ScrollIntoViewOptions[] }).__scrollCalls);
    expect(scrollCalls.length).toBeGreaterThan(0);
    expect(scrollCalls.at(-1)?.behavior).toBe("auto");

    // Still highlighted (SPEC-046 §4: reduced motion removes the PULSE, not the highlight itself) —
    // a real outline, not just the class name, since the class alone does not prove the CSS resolved.
    const outlineStyleWhileHighlighted = await heading.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outlineStyleWhileHighlighted).toBe("solid");

    // The fade still runs on the SAME timeline as the non-reduced-motion case (`widget.css`'s
    // reduced-motion rule keeps the identical `18s`/`2s` numbers, only drops the pulse layer) — same
    // real-condition wait as AC2, not a shorter one, because reduced motion changing the fade duration
    // would itself be a spec violation this test should be able to catch.
    await page.waitForFunction(
      (cls) => document.querySelector(`.${cls}`) === null,
      HIGHLIGHT_CLASS,
      { timeout: FADE_WAIT_TIMEOUT_MS },
    );
    const outlineStyleAfterFade = await heading.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outlineStyleAfterFade).toBe("none");
  });
});

test.describe("SPEC-046 AC7 — highlighting a target never reflows the page", () => {
  test("the target's and its next sibling's geometry are byte-for-byte identical before and after", async ({ page }) => {
    await openSitePage(page, ABOUT_TARGET.path);

    // The element immediately following the highlight target is the one most exposed to a
    // regression, since `outline`/`box-shadow` painting outside the box (the correct implementation)
    // affects nothing about it, while a `border` (the thing `widget.css`'s own header says this
    // deliberately avoids) would push it downward the moment the highlight applied. Located by
    // document order, not a class: the shipped starter theme renders the page through its "content"
    // slot (`renderPostDetailHeader`'s `.post-meta`), not `entryContent`'s fallback `.entry-meta`.
    const heading = aboutHeading(page);
    const sibling = heading.locator("xpath=following::*[1]");
    await expect(sibling).toBeVisible();

    // Lets any web-font swap / late layout settle happen BEFORE the baseline measurement, so a false
    // "reflow" is not attributed to the highlight when it was actually font loading finishing on its
    // own timeline — this is a stabilization wait for a real condition (`document.fonts.ready`), not a
    // fixed sleep.
    await page.evaluate(() => document.fonts.ready);
    // Same reason, second condition: the starter theme's article enters with a kUInetic
    // `fade-up … distance:18px` transform, and a rect taken mid-animation drifted ~3px "up" once
    // it finished, which read as a reflow. Await the target's (and its ancestors') own running,
    // finite animations; a paused `on:enter` reveal or an infinite loop would never settle.
    await heading.evaluate(async (el) => {
      const settling: Promise<unknown>[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        for (const animation of node.getAnimations()) {
          if (animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().endTime)) settling.push(animation.finished.catch(() => undefined));
        }
      }
      await Promise.all(settling);
    });

    const headingBefore = await rectOf(heading);
    const siblingBefore = await rectOf(sibling);

    await triggerHighlight(page);
    await expect(heading).toHaveClass(new RegExp(HIGHLIGHT_CLASS));

    const headingAfter = await rectOf(heading);
    const siblingAfter = await rectOf(sibling);

    // `toEqual`, not a tolerance-based comparison: `outline`/`box-shadow`-only styling (widget.css's
    // §8 header explains why `border` is disallowed here) has zero effect on the box model by
    // definition, so ANY numeric drift at all — not just a visible one — is evidence of the wrong CSS
    // property being used, which is exactly the regression AC7 exists to catch.
    expect(headingAfter).toEqual(headingBefore);
    expect(siblingAfter).toEqual(siblingBefore);
  });
});
});

// Migrated from site-assistant-limits.spec.ts; original pin intent and why comments follow.
// This pin exhausts the real per-IP limiter and must begin with an untouched process counter.
test.describe("Bug pin: site-assistant-limits", { tag: "@isolated-site" }, () => {
/**
 * @file SPEC-046 AC6/REQ-7 — the 11th `POST /api/site-assistant/chat` request within 5 minutes from
 * one IP gets a real 429, and the WIDGET surfaces it as a readable message rather than hanging.
 *
 * ## Why this file mocks nothing
 *
 * Every sibling `site-assistant-*.spec.ts` file intercepts the chat route in the browser and replays
 * server-authored SSE bytes (`site-assistant-fixtures.ts`'s header explains why that split is sound
 * evidence rather than a shortcut). This file is the one exception, and it can afford to be one:
 * `handleChat` (`src/server/modules/site-assistant.ts`) checks, in order, (1) `public_enabled` → 404,
 * (2) message validation, (3) **the rate limiter** (`SITE_ASSISTANT_PER_IP` — `rate-limit.ts`, 10
 * req / 300s / IP), (4) the cli-mode branch, (5) `GEMINI_API_KEY` → 503 `NOT_CONFIGURED`. The limit
 * check runs BEFORE the key check, and this suite's `webServer.command`
 * (`playwright.site-assistant.config.ts`) never sets `GEMINI_API_KEY` — so with no key configured,
 * requests 1-10 each clear the limiter and fail late and cheaply with a real `503 NOT_CONFIGURED`,
 * and request 11 never reaches that branch at all: it is refused earlier, with a real
 * `429 RATE_LIMIT_EXCEEDED` from the real limiter. That is genuine end-to-end evidence of REQ-7, not
 * a simulation — no route, tool, or provider call is stubbed anywhere in this file.
 *
 * ## Why this is one serial describe, and why the config sets `retries: 0`
 *
 * `SITE_ASSISTANT_PER_IP` is a process-lifetime, in-memory, fixed-window counter keyed by
 * `resolveClientIp(req)` — the raw socket peer address, because this suite's server has no
 * `trustedProxies` configured, so an `X-Forwarded-For` header is ignored outright (`rate-limit.ts`'s
 * own doc). There is no way for this test to present as a second IP. That means the WHOLE SUITE RUN
 * shares one ten-request budget for this route, not one budget per test. The single test below
 * establishes its ten accepted requests before driving the widget's eleventh request. A future
 * reader adding a second endpoint-touching test to this file (even in a different `describe`) would
 * silently steal from or pad out this budget. `playwright.site-assistant.config.ts` sets `retries: 0`
 * for the identical reason (see that file's own comment on it): a retry of a test in this file would
 * replay against an already-spent budget and report a confident, wrong failure on a run that actually
 * passed the first time.
 *
 * Measured live before writing the assertions below (2026-08-04, against this suite's own hermetic
 * server on a scratch port): burning 9 requests with Node's `fetch` returned `503` for all nine; a
 * 10th also returned `503`; an 11th issued from inside a real Chromium page (`page.evaluate`, same
 * `localhost` origin) returned a real `429` with `retryAfterSeconds` populated. That confirms the
 * `request`-fixture path (phase one below) and the real-browser path (phase two) land on the same
 * socket-peer-keyed bucket on this host — the property this file's two-phase design depends on.
 */

const CHAT_PATH = "/api/site-assistant/chat";

test.describe("SPEC-046 AC6/REQ-7 — real per-IP rate limiting on the public chat endpoint", () => {
  test.describe.configure({ mode: "serial" });

  test("requests 1-10 clear the limiter, then the widget's 11th request is readable and leaves the composer usable", async ({ page, request }) => {
    for (let i = 1; i <= 10; i += 1) {
      const response = await request.post(CHAT_PATH, { data: { message: `budget probe ${i}` } });
      // The claim this test exists to establish: none of the first ten trips the limiter. Everything
      // past this line (the 503 shape) is incidental to THIS environment's missing API key, not REQ-7.
      expect(response.status(), `request ${i} of 10 was rate-limited early`).not.toBe(429);
      // 503 NOT_CONFIGURED, not 200: this suite's server has no `GEMINI_API_KEY` (see this file's
      // header), so a request that clears the limiter fails one branch later instead. Asserted so a
      // future change that quietly adds a key to this suite's environment fails here loudly — with a
      // clear "the fixture assumption changed" signal — rather than making the next test's "11th"
      // claim silently false by letting a real model call consume more of the budget than expected.
      expect(response.status()).toBe(503);
      const body = (await response.json()) as { code?: string };
      expect(body.code).toBe("NOT_CONFIGURED");
    }
    await openSitePage(page, "/");
    await openChatPanel(page);

    // This test established all ten accepted requests before exercising the boundary.
    const responsePromise = page.waitForResponse((response) => response.url().endsWith(CHAT_PATH));
    await sendVisitorMessage(page, "one too many");
    const response = await responsePromise;

    expect(response.status()).toBe(429);
    // REQ-7's contract includes telling a legitimately-throttled caller when to come back, not just
    // refusing them silently — the route sets this on every 429 (`site-assistant.ts`).
    const retryAfter = response.headers()["retry-after"];
    expect(retryAfter).toMatch(/^[1-9]\d*$/);
    const delay = Number(retryAfter);
    expect(delay).toBeLessThanOrEqual(300);
    const body = await response.json();
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.details.retryAfterSeconds).toBe(delay);

    // The transport's `!response.ok` branch (`site-assistant-transport.ts`) reads `body.error` off
    // the failed fetch and calls `handlers.onError` with it, which is what `ChatPane` renders here —
    // this proves that plumbing actually renders a visitor-legible message, not just that the route
    // itself replies with the right JSON (already covered above without a browser at all).
    // Jini c293ad8b (durable runs) moved run failures off the pane banner and onto the failed
    // assistant message: `useRunStream`'s onError records a `run_terminal` status whose label
    // `MessageRow` renders once as `.jini-message-error`.
    const errorBanner = page.locator(".tovu-site-assistant .jini-message-error");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toHaveText("too many messages from this address — please wait before trying again");

    // "Not hanging" (AC6) has two independent parts, and neither is provable by re-reading the
    // composer's OWN text box: `Composer.tsx`'s `pane.send()` clears the draft on submit
    // (`composer.reset()`), so an empty, disabled send button right after sending is normal and
    // proves nothing either way. What actually proves the run finished is `ChatPane.tsx`'s
    // `disabled={disabled || unavailable || pane.conversation.isStreaming}` clearing — so:
    //
    // (1) the composer's trailing button is not in its stop-mode variant, which only renders while
    // `conversation.isStreaming` (`Composer.tsx`'s `running` prop — see that component for why this
    // used to be a separate `.jini-chat-pane__cancel` control instead of the send button itself).
    await expect(page.locator(".tovu-site-assistant .jini-composer-send--stop")).toHaveCount(0);
    // (2) typing fresh text makes the send button enabled again — if the run were still marked
    // streaming, `Composer`'s `disabled` prop would keep it disabled regardless of draft content.
    await page.locator(".tovu-site-assistant .jini-composer-input").fill("are you still there?");
    await expect(page.locator(".tovu-site-assistant .jini-composer-send")).toBeEnabled();
  });
});
});

// Migrated from site-assistant-navigation.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: site-assistant-navigation", () => {
/**
 * @file SPEC-046 AC1 + D-1 + the infinite-navigation-loop regression, against the REAL built
 * `apps/site-chat` bundle on a REAL themed page served by the REAL Tovu server.
 *
 * See `site-assistant-fixtures.ts` for why replaying the server's own SSE framing in the browser is
 * evidence rather than a shortcut (short version: commit `7de3297` owns the server half of that same
 * wire at byte level; these specs own the client half).
 *
 * ## The last test in this file is the reason the file exists
 *
 * `07a9e38` fixed a severe bug that 62 green unit tests, a clean typecheck, and the jsdom bundle-mount
 * guard all missed: after a successful "take me there", the destination page's rehydrated transcript
 * still ended in the message carrying that already-executed `auto: true` navigate directive, and
 * `processedMessageIdsRef` started empty on every fresh component instance — so `ChatPane`'s
 * mount-time `onMessagesChange` replayed it, navigating the visitor right back to the page they were
 * already on, forever. Measured live at the time: **11 navigations to the same destination in 6
 * seconds, uncapped**, with `sessionStorage` carrying the poisoned state forward so the site stayed
 * unusable for that visitor.
 *
 * The jsdom guard added alongside that fix proves the narrower claim "a rehydrated directive does not
 * fire once." It cannot prove the absence of a LOOP, because a loop is a property of repeated real
 * navigations between real documents — which is exactly what jsdom does not have. That is what the
 * final test here measures, and it is why the assertion counts navigations over a window rather than
 * checking a URL once.
 */

const ASSISTANT_MESSAGE = "The About page explains it.";

test.describe("SPEC-046 AC1/D-1 — navigating a visitor's browser", () => {
  test("an auto:true navigate directive moves the visitor to the resolved path, in the same tab, with the pane still open and the transcript intact", async ({
    page,
  }) => {
    await mockAssistantTurn(page, {
      text: ASSISTANT_MESSAGE,
      // D-1's auto branch: in production this flag is computed server-side from the visitor's own
      // message BEFORE any tool runs (`site-assistant.ts`'s `autoNavigateAllowed`), never supplied by
      // the model — so a fixture setting it is reproducing a server decision, not granting the client
      // a power it does not have.
      directives: [{ type: "navigate", target: ABOUT_TARGET, auto: true }],
    });

    await openSitePage(page, "/");
    await openChatPanel(page);
    await sendVisitorMessage(page, "Take me to the About page.");

    await page.waitForURL(`**${ABOUT_TARGET.path}`);

    // D-2 (same tab): one page in the context, not a second one opened alongside.
    expect(page.context().pages()).toHaveLength(1);

    // REQ-1: the widget must not slam shut on arrival, and the conversation must still be there.
    // Both come from the persisted envelope being rehydrated by the DESTINATION page's own mount.
    await page.waitForSelector(".tovu-site-assistant .chat-fab", { state: "visible" });
    await expect(page.locator(".tovu-site-assistant__panel")).toBeVisible();
    await expect(page.locator(".tovu-site-assistant .jini-message-list").getByText(ASSISTANT_MESSAGE)).toBeVisible();

    const persisted = await readPersistedState(page);
    expect(persisted?.open).toBe(true);
    // The visitor's own turn plus the assistant's reply — the flush happens synchronously in
    // `handleMessagesChange` before `location.assign`, not via the persistence effect, precisely so
    // it is guaranteed to land before the browser tears the old page down.
    expect(persisted?.messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "user", content: "Take me to the About page." },
      { role: "assistant", content: ASSISTANT_MESSAGE },
    ]);
    const messages = page.locator(".tovu-site-assistant .jini-message-list .jini-message");
    await expect(messages).toHaveCount(2);
    await expect(messages.nth(0)).toHaveClass(/jini-message-user/);
    await expect(messages.nth(0).locator(".jini-message-content")).toHaveText("Take me to the About page.");
    await expect(messages.nth(1)).toHaveClass(/jini-message-assistant/);
    await expect(messages.nth(1).locator(".jini-message-content")).toHaveText(ASSISTANT_MESSAGE);
  });

  test("an auto:false navigate directive proposes instead of navigating, and only the visitor's own click moves them", async ({
    page,
  }) => {
    await mockAssistantTurn(page, {
      text: "I can take you there if you like.",
      directives: [
        { type: "navigate", target: THEMES_TARGET, auto: false },
        { type: "highlight", target: THEMES_TARGET },
      ],
    });

    await openSitePage(page, "/");
    await openChatPanel(page);
    const startingUrl = page.url();
    await sendVisitorMessage(page, "Where do you explain themes?");

    const proposal = page.locator(".tovu-site-assistant__proposal");
    await expect(proposal).toBeVisible();
    // The label renders the SERVER-resolved title, which is the visible half of REQ-6: the widget was
    // handed `{slug, title, path}` and displays what it was given. Nothing client-side turns a slug
    // into either a path or a human-readable name.
    await expect(proposal.locator(".tovu-site-assistant__proposal-label")).toHaveText(`Go to “${THEMES_TARGET.title}”?`);

    // D-1's whole point: proposing must not navigate. Asserted after the proposal has rendered, so
    // this is "the directive was processed and chose not to navigate," not "nothing happened yet."
    expect(page.url()).toBe(startingUrl);

    await proposal.locator(".tovu-site-assistant__proposal-go").click();
    await page.waitForURL(`**${THEMES_TARGET.path}`);
    await page.waitForSelector(".tovu-site-assistant .chat-fab", { state: "visible" });
    // Acted on and gone — a proposal that survived into the destination page would re-offer a
    // navigation the visitor already took.
    await expect(page.locator(".tovu-site-assistant__proposal")).toHaveCount(0);
    const highlighted = page.locator(".tovu-site-assistant__highlight");
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted).toHaveText(THEMES_TARGET.title);
    expect(await page.evaluate(() => sessionStorage.getItem("tovu.site-assistant.action-queue.v1"))).toBeNull();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tovu-site-assistant .chat-fab", { state: "visible" });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(highlighted).toHaveCount(0);
  });

  /**
   * The `07a9e38` regression. Reproduces the bug's actual state directly — a persisted transcript
   * whose LAST message is a settled assistant turn carrying an already-executed `auto: true` navigate
   * directive for the page being loaded — rather than reaching it through a live model call, which is
   * how it was originally found. That is deliberate: seeding the poisoned state is deterministic,
   * costs no quota, and reproduces the identical condition (`SiteAssistantWidget.tsx`'s own doc
   * describes this exact shape as what "a successful 'take me there' leaves behind").
   *
   * The assertion is a navigation COUNT over a window, not a single URL check, because the URL is
   * unchanged in both the healthy and the broken case — the loop navigated the visitor back to the
   * same page they were already on. A URL assertion would have passed against the bug.
   *
   * **Verified to actually catch the regression, not merely to pass**: `07a9e38`'s one-line fix was
   * temporarily reverted (`processedMessageIdsRef` back to an empty `Set`), the bundle rebuilt, and
   * this test re-run — it failed loudly, and slightly earlier than the count assertion, with
   * `8 × waiting for "http://localhost:4997/about" navigation to finish` while the page never
   * settled. That is the loop itself, observed. The fix was then restored and this test re-run green.
   */
  test("a rehydrated, already-executed navigate directive does not re-fire on mount (no infinite navigation loop)", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ target, key }) => {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            open: true,
            messages: [
              { id: "seeded-user-1", role: "user", content: "Take me to the About page." },
              {
                id: "seeded-assistant-1",
                role: "assistant",
                content: "Here it is.",
                // Terminal (`@jini-ai/chat/core`'s `isTerminalRunStatus`), which is what makes
                // `handleMessagesChange` willing to act on this message's directives at all. A
                // non-terminal status here would make the test pass for the wrong reason.
                runStatus: "succeeded",
                events: [
                  {
                    kind: "ext",
                    name: "client_directive",
                    data: { kind: "page_action", action: { type: "navigate", target, auto: true } },
                  },
                ],
              },
            ],
          }),
        );
      },
      { target: ABOUT_TARGET, key: "tovu.site-assistant.transcript.v1" },
    );

    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    await openSitePage(page, ABOUT_TARGET.path);

    // ~2.5s against a bug measured at ~11 navigations in 6s: comfortably several loop iterations, so
    // a regression fails here loudly rather than intermittently. Genuinely temporal — there is no
    // event to wait for, because the property being proven is that nothing further happens.
    await page.waitForTimeout(2_500);

    // Exactly one: the `goto` itself. Anything above that is the loop.
    expect(navigations).toBe(1);
    expect(new URL(page.url()).pathname).toBe(ABOUT_TARGET.path);
    // Still a working widget on a working page, not a survivor of a partially-torn-down document.
    await expect(page.locator(".tovu-site-assistant__panel")).toBeVisible();
  });
});
});

// Migrated from site-assistant-persistence.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: site-assistant-persistence", () => {
/**
 * @file SPEC-046 REQ-1/REQ-2 and AC3 — what survives a page load, what must NOT survive it, and what
 * happens when the session store contains something the widget did not write.
 *
 * These are browser-only properties by construction. `session-store.ts`'s own unit tests prove the
 * module in isolation against a fake `SessionStore`, and the jsdom bundle-mount guard
 * (`check-bundle-mounts.mjs`) proves the built bundle drains a seeded key without throwing. Neither
 * can prove the thing a visitor actually experiences, which needs two real document lifetimes with a
 * real `sessionStorage` between them: that the transcript comes back, that the pane does not slam
 * shut on arrival, and — the single-shot property REQ-2 exists for — that a queued action fires on
 * the destination page exactly ONCE and never again on any subsequent load.
 *
 * The last two tests seed storage the widget did not write. That is not a hostile-input exercise for
 * its own sake: `sessionStorage` genuinely outlives a deploy, so a visitor mid-session when a new
 * bundle ships is reading yesterday's entry with today's code. REQ-1's fail-soft rehydrate exists for
 * that ordinary case, and "one bad entry costs at most this session's transcript, never a broken
 * widget" is only checkable against a real bundle on a real page.
 */

const TRANSCRIPT_KEY = "tovu.site-assistant.transcript.v1";
const ACTION_QUEUE_KEY = "tovu.site-assistant.action-queue.v1";
const HIGHLIGHT_CLASS = "tovu-site-assistant__highlight";

test.describe("SPEC-046 REQ-1 — the transcript survives a page load", () => {
  test("a reply and the pane's open state both come back after a plain reload", async ({ page }) => {
    const reply = "Tovu is a CMS you actually own.";
    await mockAssistantTurn(page, { text: reply });

    await openSitePage(page, "/about");
    await openChatPanel(page);
    await expect(page.locator(".tovu-site-assistant .jini-chat-pane__suggestion")).toHaveCount(0);
    await sendVisitorMessage(page, "What is this site about?");
    await expect(page.locator(".tovu-site-assistant .jini-message-list").getByText(reply)).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tovu-site-assistant .chat-fab", { state: "visible" });

    // Rehydrated into a genuinely new document, not restored from an in-memory React state that
    // happened to survive — `page.reload()` tears the whole page down, so anything visible here came
    // back through `loadSiteAssistantState` and `ChatPane`'s mount-time `initialMessages`.
    await expect(page.locator(".tovu-site-assistant__panel")).toBeVisible();
    await expect(page.locator(".tovu-site-assistant .jini-message-list").getByText(reply)).toBeVisible();
  });

  test("'New thread' clears the PERSISTED copy, so a reload does not rehydrate the discarded conversation", async ({
    page,
  }) => {
    const reply = "Themes are data, not code.";
    await mockAssistantTurn(page, { text: reply });

    await openSitePage(page, "/about");
    await openChatPanel(page);
    await sendVisitorMessage(page, "How do themes work?");
    await expect(page.locator(".tovu-site-assistant .jini-message-list").getByText(reply)).toBeVisible();

    // Two-step confirm (`SiteAssistantHeader.tsx`) — the widget deliberately does not wire a single
    // click straight to an unrecoverable reset, so the test must click through both steps rather
    // than assume one. The confirm step renders Cancel FIRST in the DOM (deliberately autoFocus'd —
    // see that file's own comment on defaulting focus to the safe choice), so a bare `.first()` here
    // clicks Cancel, not the discard action — verified live: it left the message on screen. The
    // discard button is targeted by its own accessible name instead.
    await page.locator(".tovu-site-assistant .jini-chat-pane__new-thread").click();
    await page
      .locator(".tovu-site-assistant .tovu-site-assistant__reset-confirm")
      .getByRole("button", { name: "Discard chat?" })
      .click();
    await expect(page.locator(".tovu-site-assistant .jini-message-list").getByText(reply)).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tovu-site-assistant .chat-fab", { state: "visible" });

    // The regression this guards: clearing only in-memory state would look identical up to here and
    // then bring the whole discarded thread back on the next load.
    await expect(page.locator(".tovu-site-assistant .jini-message-list").getByText(reply)).toHaveCount(0);
    const persisted = await readPersistedState(page);
    expect(persisted?.messages ?? []).toHaveLength(0);
  });
});

test.describe("SPEC-046 REQ-2/AC3 — a queued action fires once on the destination and never again", () => {
  test("a highlight bundled with an auto-navigate runs on arrival, and a reload does not re-fire it", async ({
    page,
  }) => {
    await mockAssistantTurn(page, {
      text: "Taking you there.",
      // One turn resolving both a navigation and a highlight — `splitPageActions` separates them, and
      // the widget enqueues the highlight for the DESTINATION before calling `location.assign`. This
      // is the only shape that makes REQ-2's queue load-bearing: the highlight target does not exist
      // on the page the visitor is leaving.
      directives: [
        { type: "navigate", target: ABOUT_TARGET, auto: true },
        { type: "highlight", target: ABOUT_TARGET },
      ],
    });

    await openSitePage(page, "/");
    await openChatPanel(page);
    await sendVisitorMessage(page, "Take me to the About page.");

    await page.waitForURL(`**${ABOUT_TARGET.path}`);
    const highlighted = page.locator(`.${HIGHLIGHT_CLASS}`);
    await expect(highlighted).toHaveCount(1);
    // Found by title text, not by a server-supplied selector (`highlight.ts`'s title-search
    // heuristic) — so this also proves the heuristic actually resolves against the shipped
    // `tovu-official` theme's real markup (`<h1 class="entry-title">`), not just in principle.
    await expect(highlighted).toHaveText(ABOUT_TARGET.title);

    // Drained-before-returned (`drainQueuedAction`): the entry is deleted at read time, not after a
    // caller finishes executing it, so nothing can re-read it on a later mount.
    expect(await page.evaluate((key) => sessionStorage.getItem(key), ACTION_QUEUE_KEY)).toBeNull();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".tovu-site-assistant .chat-fab", { state: "visible" });
    // Deliberately a settle window rather than an immediate check: `main.tsx` executes a drained
    // action inside `requestAnimationFrame`, so an instant assertion would pass even against a queue
    // that was about to re-fire one frame later.
    await page.waitForTimeout(1_000);
    await expect(page.locator(`.${HIGHLIGHT_CLASS}`)).toHaveCount(0);
  });
});

test.describe("SPEC-046 REQ-1 — a session store the widget did not write", () => {
  test("a corrupt transcript entry degrades to an empty conversation instead of a broken widget", async ({ page }) => {
    await page.addInitScript((key) => sessionStorage.setItem(key, "{ this is not json"), TRANSCRIPT_KEY);

    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await openSitePage(page, "/about");
    await openChatPanel(page);

    // Mounted and usable — the composer being present is the difference between "fail-soft" and
    // "rendered something but the widget is dead."
    await expect(page.locator(".tovu-site-assistant .jini-composer-input")).toBeVisible();
    // `.jini-message`, not `[data-role]`: `MessageRow.tsx` (`@jini-ai/chat/react`) has never rendered
    // a `data-role` attribute — each row's class is `jini-message jini-message-user` or `jini-message
    // jini-message-assistant`, both matched by `.jini-message` alone. `[data-role]` matches nothing on
    // this page regardless of whether the corrupt entry was cleared, so it would pass even against a
    // widget that rendered messages — verified against the real bundle's DOM before writing this.
    await expect(page.locator(".tovu-site-assistant .jini-message-list").locator(".jini-message")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);

    // The corrupt entry was cleared and replaced by the empty default, not partially recovered.
    // `open: true` here is this test's own click, written back by the persistence effect.
    const persisted = await readPersistedState(page);
    expect(persisted).toEqual({ open: true, messages: [] });
  });

  test("a corrupt action-queue entry is dropped without executing anything", async ({ page }) => {
    await page.addInitScript((key) => sessionStorage.setItem(key, '{"type":"highlight","target":'), ACTION_QUEUE_KEY);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await openSitePage(page, "/about");
    await page.waitForTimeout(1_000);

    expect(pageErrors).toEqual([]);
    await expect(page.locator(`.${HIGHLIGHT_CLASS}`)).toHaveCount(0);
    // Deleted before the parse was ever attempted, so a malformed entry cannot poison later mounts
    // either — the property `drainQueuedAction`'s ordering exists to guarantee.
    expect(await page.evaluate((key) => sessionStorage.getItem(key), ACTION_QUEUE_KEY)).toBeNull();
  });
});
});

// Migrated from site-chat-fab-presence.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: site-chat-fab-presence", () => {
/**
 * @file The public site-chat FAB is present, visible, clickable and looks right on every themed page
 * that ships it — and the markup that mounts it is real markup, not text inside an HTML comment.
 *
 * ## The regression this file exists for (2026-09-29)
 *
 * The FAB silently vanished from `/`, `/about` and blog posts. Theme commit `d2b0f234a` put a comment
 * in tovu-theme's `<head>` that named `</body>` literally, and `render.ts#injectSiteAssistantIntoStaticPage`
 * spliced the mount div + `<script>` before the FIRST `</body>` match — inside that comment. Only the
 * `<head>` stylesheet survived, so nothing errored, nothing logged, and every unit test stayed green.
 * Fixed in `1a42dbe02` (render: skip commented matches) and `64c609f06` (theme: comment no longer names
 * the tag). `render.test.ts` pins the splice rule against a synthetic comment; this file pins the
 * outcome a visitor sees on the real server with the real shipped theme, which is the layer that lost it.
 *
 * Three independent checks per page, cheapest first, so a failure names what broke:
 * 1. Served HTML: the mount node and script tag sit outside every comment and before the real `</body>`.
 * 2. Browser: `.chat-fab` inside `#tovu-site-assistant-root` is visible, in the bottom-right corner of
 *    the viewport, and opens the panel when clicked.
 * 3. Visual: a screenshot of the bottom-right corner region against a committed baseline.
 *
 * Runs under `playwright.site-chat-fab.config.ts`, whose `globalSetup` flips the real
 * `site.assistant.public_enabled` switch (the widget is not rendered at all while it is off) and
 * activates `tovu-theme`, the theme `sites/tovu-dev` ships — the in-memory default `tovu-starter`
 * never had the offending comment, which is why the existing site-assistant suite could not see this.
 */

/** The pages the owner reported the FAB missing from, each rendered by a different static template:
 *  `index.html`, `about.html`, `posts-default.html` (seeded post from `seed.ts`). */
const PAGES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "blog-post", path: "/how-themes-work" },
] as const;

const MOUNT_ID = "tovu-site-assistant-root";
const SCRIPT_SRC = "/site-chat/site-assistant.js";
/** Size of the square corner region screenshotted — the 56px FAB at 24px insets plus margin. */
const CORNER_SIZE = 120;
/** Hides everything but `#${MOUNT_ID}` during the corner capture. Anchored to this file's directory:
 *  a relative `stylePath` resolves against however the suite was invoked. */
const CORNER_SCREENSHOT_CSS = path.resolve(import.meta.dirname, "../site-chat-fab-presence.screenshot.css");

/** Half-open `[start, end)` ranges of every `<!-- ... -->` in `html`; an unterminated comment runs to
 *  the end, as the HTML parser treats it. */
function commentRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let start = html.indexOf("<!--"); start !== -1; start = html.indexOf("<!--", start)) {
    const close = html.indexOf("-->", start + 4);
    const end = close === -1 ? html.length : close + 3;
    ranges.push([start, end]);
    start = end;
  }
  return ranges;
}

function isCommented(ranges: Array<[number, number]>, index: number): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/** Every index of `needle` in `html` that is outside a comment. */
function uncommentedIndexes(html: string, needle: string): number[] {
  const ranges = commentRanges(html);
  const found: number[] = [];
  for (let at = html.indexOf(needle); at !== -1; at = html.indexOf(needle, at + 1)) {
    if (!isCommented(ranges, at)) found.push(at);
  }
  return found;
}

async function openAndWaitForMount(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // Not `waitForSelector(".chat-fab")` alone: when the bug recurs there is no FAB and no error, so a
  // bare timeout would say nothing. The assertions below say which layer is missing.
  await expect(page.locator(`#${MOUNT_ID}`), "mount node is in the DOM (not swallowed by a comment)").toHaveCount(1);
}

test.describe("site-chat FAB is present on every public page that ships it", () => {
  for (const { name, path } of PAGES) {
    test(`${name} (${path}): served HTML mounts the assistant outside comments, before the real </body>`, async ({
      request,
    }) => {
      const response = await request.get(path);
      expect(response.status(), `${path} renders`).toBe(200);
      const html = await response.text();
      // Guard the guard: on the in-memory default theme this whole file passes without ever touching
      // the templates that lost the FAB.
      expect(html, `${path} is rendered by tovu-theme`).toContain("/theme-assets/tovu-theme/");
      // A fresh site seeds only tovu-starter. Prove the pin's explicit theme copy is served,
      // rather than accepting an asset URL whose files were never installed in this site.
      const stylesheet = await request.get("/theme-assets/tovu-theme/css/theme.css");
      expect(stylesheet.status(), "the installed tovu-theme stylesheet is served").toBe(200);
      expect(stylesheet.headers()["content-type"]?.split(";")[0]).toBe("text/css");

      const mounts = uncommentedIndexes(html, `id="${MOUNT_ID}"`);
      const scripts = uncommentedIndexes(html, `src="${SCRIPT_SRC}"`);
      const bodyCloses = uncommentedIndexes(html.toLowerCase(), "</body>");
      expect(mounts, `uncommented #${MOUNT_ID} in ${path}`).toHaveLength(1);
      expect(scripts, `uncommented ${SCRIPT_SRC} script in ${path}`).toHaveLength(1);
      expect(bodyCloses.length, `uncommented </body> in ${path}`).toBeGreaterThan(0);
      const realBodyClose = bodyCloses[bodyCloses.length - 1]!;
      expect(mounts[0]!, "mount node precedes the real </body>").toBeLessThan(realBodyClose);
      expect(scripts[0]!, "script tag precedes the real </body>").toBeLessThan(realBodyClose);
    });

    test(`${name} (${path}): the FAB is visible in the bottom-right corner and opens the panel`, async ({ page }) => {
      await openAndWaitForMount(page, path);
      const fab = page.locator(`#${MOUNT_ID} .chat-fab`);
      await expect(fab).toBeVisible();
      await expect(fab).toBeInViewport();

      // Derived from the live viewport, never a literal: the config's declared height loses to the
      // Desktop Chrome device preset (see playwright_config_viewport_override).
      const viewport = page.viewportSize()!;
      const box = (await fab.boundingBox())!;
      expect(box.x + box.width, "FAB hugs the right edge").toBeGreaterThan(viewport.width - CORNER_SIZE);
      expect(box.y + box.height, "FAB hugs the bottom edge").toBeGreaterThan(viewport.height - CORNER_SIZE);
      expect(box.width, "FAB is the designed circle, not a bare unstyled button").toBeGreaterThanOrEqual(40);

      await fab.click();
      await expect(page.locator(".tovu-site-assistant__panel")).toBeVisible();
    });

    test(`${name} (${path}): the bottom-right corner matches the FAB baseline`, async ({ page }) => {
      // Reduced motion before navigation: tovu-theme's kUInetic entrances and cloak key off it, so the
      // page content behind the corner is at rest rather than mid-animation.
      await page.emulateMedia({ reducedMotion: "reduce" });
      // No wait on the FAB first: this check must fail on its own pixels when the FAB is missing, not
      // stop at the same precondition the test above already owns. `toHaveScreenshot` retries until
      // the capture matches or its timeout ends, which covers the deferred bundle mounting.
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const viewport = page.viewportSize()!;
      // Everything except the widget is hidden for the capture, so page copy, imagery and late-loading
      // fonts behind the corner cannot move the diff — only the FAB itself (or its absence) can. Not
      // `mask`: a mask box is painted OVER the page, and `<main>`'s box covers the fixed FAB too.
      await expect(page).toHaveScreenshot(`fab-corner-${name}.png`, {
        clip: { x: viewport.width - CORNER_SIZE, y: viewport.height - CORNER_SIZE, width: CORNER_SIZE, height: CORNER_SIZE },
        animations: "disabled",
        caret: "hide",
        stylePath: CORNER_SCREENSHOT_CSS,
      });
    });
  }
});
});
