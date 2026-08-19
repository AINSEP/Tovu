import { test, expect } from "@playwright/test";

import {
  ABOUT_TARGET,
  mockAssistantTurn,
  openChatPanel,
  openSitePage,
  readPersistedState,
  sendVisitorMessage,
} from "./site-assistant-fixtures.js";

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
