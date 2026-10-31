// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { type Locator } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { PIN_VISITOR_CREDENTIAL, PIN_VISITOR_CREDENTIAL_PATH, pinAdminApi } from "../support/bug-pin-fixtures.js";
import { ABOUT_TARGET } from "../site-assistant-fixtures.js";
import { mockAssistantTurn } from "../site-assistant-fixtures.js";
import { openChatPanel } from "../site-assistant-fixtures.js";
import { openSitePage } from "../site-assistant-fixtures.js";
import { sendVisitorMessage } from "../site-assistant-fixtures.js";
import { THEMES_TARGET } from "../site-assistant-fixtures.js";
import { readPersistedState } from "../site-assistant-fixtures.js";
import { controlEdgeContrast, parseComputedColor } from "../support/css-contrast.js";
import path from "node:path";

// Public-widget pins exercise anonymous visitors; setup writes use a separate admin context.
test.use({ storageState: { cookies: [], origins: [] } });

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

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

  test("requests 1-10 clear the limiter, then the widget's 11th request is readable and leaves the composer usable", async ({ page, request, playwright, journeySite }) => {
    // 3167afa9b: the widget only renders with a saved visitor key + model, which the pin fixture
    // saves. Remove the key for requests 1-10 so they still fail at the real "not configured" gate
    // (no provider call), then restore it so the page renders the widget for the 11th.
    const admin = await pinAdminApi({ playwright, site: journeySite });
    try {
      const removed = await admin.delete(PIN_VISITOR_CREDENTIAL_PATH);
      expect(removed.ok(), `remove visitor key: ${await removed.text()}`).toBe(true);
      for (let i = 1; i <= 10; i += 1) {
        const response = await request.post(CHAT_PATH, { data: { message: `budget probe ${i}` } });
        // The claim this test exists to establish: none of the first ten trips the limiter. Everything
        // past this line (the 503 shape) is incidental to THIS environment's missing API key, not REQ-7.
        expect(response.status(), `request ${i} of 10 was rate-limited early`).not.toBe(429);
        // 503 NOT_CONFIGURED, not 200: the visitor key was removed above (and the env-key fallback is
        // gone since 3167afa9b), so a request that clears the limiter fails one branch later instead. Asserted so a
        // future change that quietly adds a key to this suite's environment fails here loudly — with a
        // clear "the fixture assumption changed" signal — rather than making the next test's "11th"
        // claim silently false by letting a real model call consume more of the budget than expected.
        expect(response.status()).toBe(503);
        const body = (await response.json()) as { code?: string };
        expect(body.code).toBe("NOT_CONFIGURED");
      }
      const restored = await admin.put(PIN_VISITOR_CREDENTIAL_PATH, { data: PIN_VISITOR_CREDENTIAL });
      expect(restored.ok(), `restore visitor key: ${await restored.text()}`).toBe(true);
    } finally { await admin.dispose(); }
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
    // 3167afa9b moved visitor errors to fixed public copy plus a correlatable error id (`public-errors.ts`).
    await expect(errorBanner).toHaveText(/^Couldn't get an answer: Too many messages\. Please wait before trying again\. \(error [0-9a-f-]{36}\)\. Try again\.$/);

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
    // 956bbe98b brought back two localized example prompts (`useSiteAssistantSurface`) for an empty thread.
    await expect(page.locator(".tovu-site-assistant .jini-chat-pane__suggestion")).toHaveCount(2);
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
      // 956bbe98b moved the header onto Jini's `EmbedChatHeader`, which owns the confirm container.
      .locator(".tovu-site-assistant .jini-chat-embed__reset-confirm")
      // 956bbe98b: "Discard chat?" is now the question; the action button is "Discard chat".
      .getByRole("button", { name: "Discard chat", exact: true })
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

  test("a corrupt legacy action-queue entry is ignored without executing anything", async ({ page }) => {
    await page.addInitScript((key) => sessionStorage.setItem(key, '{"type":"highlight","target":'), ACTION_QUEUE_KEY);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await openSitePage(page, "/about");
    await page.waitForTimeout(1_000);

    expect(pageErrors).toEqual([]);
    await expect(page.locator(`.${HIGHLIGHT_CLASS}`)).toHaveCount(0);
    // Deleted before the parse was ever attempted, so a malformed entry cannot poison later mounts
    // either — the property `drainQueuedAction`'s ordering exists to guarantee.
    expect(await page.evaluate((key) => sessionStorage.getItem(key), ACTION_QUEUE_KEY)).not.toBeNull();
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
// The lazy loader (`site-chat-markup.ts`) replaced the eager bundle tag; it loads the widget on demand.
const SCRIPT_SRC = "/site-chat/site-assistant-loader.js";
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
      // Before activation the visible FAB is the lazy loader's bubble, a sibling of the mount node.
      const fab = page.locator("[data-jini-chat-loader]");
      await expect(fab).toBeVisible();
      await expect(fab).toBeInViewport();

      // Derived from the live viewport, never a literal: the config's declared height loses to the
      // Desktop Chrome device preset (see playwright_config_viewport_override).
      const viewport = page.viewportSize()!;
      const box = (await fab.boundingBox())!;
      expect(box.x + box.width, "FAB hugs the right edge").toBeGreaterThan(viewport.width - CORNER_SIZE);
      expect(box.y + box.height, "FAB hugs the bottom edge").toBeGreaterThan(viewport.height - CORNER_SIZE);
      expect(box.width, "FAB is the designed circle, not a bare unstyled button").toBeGreaterThanOrEqual(40);

      await openChatPanel(page);
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

test.describe('front: built lazy widget regressions', () => {
  test.use({ pinVisitorWidget: 'react' });
  test('opens from the loader before React exists, and resumes without stealing page focus', async ({ page }) => {
    await openSitePage(page, ABOUT_TARGET.path);
    const loader = page.locator('[data-jini-chat-loader]');
    // This journey specifically requires the real three-bundle build, rather than the eager proxy.
    await expect(loader).toBeVisible();
    await expect(page.locator('.tovu-site-assistant .chat-fab')).toHaveCount(0);
    await openChatPanel(page);
    await expect(page.locator('.tovu-site-assistant__panel')).toBeVisible();
    await expect(loader).toBeHidden();
    await expect(page.locator('.jini-composer-input')).toBeFocused();
    await page.addInitScript(() => {
      // Focus the real page link before the resumed widget mounts. Its bundle remains untouched.
      document.addEventListener('DOMContentLoaded', () => document.querySelector<HTMLAnchorElement>('a[href]')?.focus(), { once: true });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.tovu-site-assistant__panel')).toBeVisible();
    await expect(page.locator('.jini-composer-input')).not.toBeFocused();
    expect(await page.evaluate(() => !!document.activeElement?.closest('a[href]'))).toBe(true);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.locator('.jini-composer-input').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  });
});

test.describe('front: vanilla mobile accessibility', () => {
  // configurePin supplies the real session Cookie (Secure cookies are omitted by APIRequestContext
  // on HTTP loopback), selects this widget, and resets/deletes this test's settings with its site.
  test.use({ pinVisitorWidget: 'vanilla' });
  test('renders 16px inputs and contrasting controls; page Escape leaves the resumed panel open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openSitePage(page, ABOUT_TARGET.path);
    await page.locator('[data-jini-chat-loader][data-loader-ready="true"]').click();
    const panel = page.getByRole('dialog', { name: 'Ask this site' });
    await expect(panel).toBeVisible();
    const input = panel.getByRole('textbox');
    expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    // Read computed colours in the page; measure in Node (`css-contrast.ts`), alpha included.
    const { surface, controls } = await panel.evaluate(element => ({
      surface: getComputedStyle(element).backgroundColor,
      controls: Array.from(element.querySelectorAll('textarea, button:not(:disabled)')).filter(control => !control.closest('[hidden]')).map(control => ({
        className: `${control.tagName.toLowerCase()}.${control.className}`,
        border: getComputedStyle(control).borderTopColor,
        background: getComputedStyle(control).backgroundColor,
      })),
    }));
    // WCAG 1.4.11 needs no boundary on a text-labelled control, so a borderless one (the pill
    // suggestions, 956bbe98b) is not border-measured; every drawn border, even a faint one, is.
    const ratios = controls.filter(({ border }) => parseComputedColor(border)[3] > 0).map(({ className, border, background }) => ({
      ratio: controlEdgeContrast({ surface, border, background }),
      label: `${className} border ${border} fill ${background} on ${surface}`,
    }));
    expect(ratios.length).toBeGreaterThan(1);
    for (const { ratio, label } of ratios) expect(ratio, label).toBeGreaterThanOrEqual(3);
    const pageLink = page.locator('a[href]').filter({ visible: true }).first();
    await pageLink.focus();
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
    await expect(pageLink).toBeFocused();
  });
});
