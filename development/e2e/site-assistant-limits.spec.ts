import { test, expect } from "@playwright/test";

import { openChatPanel, openSitePage, sendVisitorMessage } from "./site-assistant-fixtures";

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
 * shares one ten-request budget for this route, not one budget per test — two independent tests that
 * each "burn 10 requests" would collide on the same counter, and whichever ran second would observe a
 * budget already partly spent by the first. So everything that touches this endpoint lives in a
 * single serial `describe` below, in one fixed order, rather than as separate tests, and a future
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

  test("requests 1-10 in the window are not rate-limited (establishes the 11th as a real boundary, not an eventual one)", async ({
    request,
  }) => {
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
  });

  test("the 11th request, driven through the real widget in a real browser, surfaces a readable error and leaves the composer usable", async ({
    page,
  }) => {
    await openSitePage(page, "/");
    await openChatPanel(page);

    // This IS the 11th request against the budget the previous test spent down to 10/10 — the whole
    // point of the serial ordering documented in this file's header.
    const responsePromise = page.waitForResponse((response) => response.url().endsWith(CHAT_PATH));
    await sendVisitorMessage(page, "one too many");
    const response = await responsePromise;

    expect(response.status()).toBe(429);
    // REQ-7's contract includes telling a legitimately-throttled caller when to come back, not just
    // refusing them silently — the route sets this on every 429 (`site-assistant.ts`).
    expect(response.headers()["retry-after"]).toBeTruthy();

    // The transport's `!response.ok` branch (`site-assistant-transport.ts`) reads `body.error` off
    // the failed fetch and calls `handlers.onError` with it, which is what `ChatPane` renders here —
    // this proves that plumbing actually renders a visitor-legible message, not just that the route
    // itself replies with the right JSON (already covered above without a browser at all).
    const errorBanner = page.locator(".tovu-site-assistant .jini-chat-pane__error");
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
