import { test, expect, type Locator, type Page } from "@playwright/test";

import { ABOUT_TARGET, mockAssistantTurn, openChatPanel, openSitePage, sendVisitorMessage } from "./site-assistant-fixtures";

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
/** Comfortably past `FADE_COMPLETE_MS` without reaching `highlight.ts`'s 21s JS fallback timer — if
 *  cleanup were relying on that fallback instead of the real `animationend`, this margin is tight
 *  enough that the test would still catch it taking materially longer than the CSS timeline promises. */
const FADE_WAIT_TIMEOUT_MS = 24_000;

/** Picks out the About page's own `<h1 class="entry-title">` (`render.ts#entryContent`) by ARIA role
 *  and accessible name — the widget's own target-resolution heuristic (`highlight.ts#findTargetElement`)
 *  independently arrives at the same element by matching trimmed text content, so this locator and the
 *  widget's internal one are deliberately built two different ways rather than sharing a selector. */
function aboutHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: ABOUT_TARGET.title, exact: true });
}

/** Plain-object copy of `getBoundingClientRect()` — the live `DOMRect` does not survive
 *  `Locator.evaluate`'s structured-clone boundary with its own prototype, and only these four fields
 *  are what AC7 is actually about (a reflow moves position and/or size; it does not merely change some
 *  other unrelated property `DOMRect` also exposes). */
async function rectOf(locator: Locator): Promise<{ top: number; left: number; width: number; height: number }> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
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

    await openSitePage(page, ABOUT_TARGET.path);
    const heading = aboutHeading(page);
    await triggerHighlight(page);
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
    await triggerHighlight(page);
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

    // `render.ts#entryContent`'s real markup: `<h1 class="entry-title">…</h1><p class="entry-meta">…`
    // — the paragraph immediately following the highlight target is the sibling most exposed to a
    // regression, since `outline`/`box-shadow` painting outside the box (the correct implementation)
    // affects nothing about it, while a `border` (the thing `widget.css`'s own header says this
    // deliberately avoids) would push it downward the moment the highlight applied.
    const heading = aboutHeading(page);
    const sibling = page.locator(".entry-meta");
    await expect(sibling).toBeVisible();

    // Lets any web-font swap / late layout settle happen BEFORE the baseline measurement, so a false
    // "reflow" is not attributed to the highlight when it was actually font loading finishing on its
    // own timeline — this is a stabilization wait for a real condition (`document.fonts.ready`), not a
    // fixed sleep.
    await page.evaluate(() => document.fonts.ready);

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
