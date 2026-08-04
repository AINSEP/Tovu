import { test, expect } from "@playwright/test";

import {
  ABOUT_TARGET,
  THEMES_TARGET,
  mockAssistantTurn,
  openChatPanel,
  openSitePage,
  readPersistedState,
  sendVisitorMessage,
} from "./site-assistant-fixtures";

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
    expect(persisted?.messages.length).toBeGreaterThanOrEqual(2);
  });

  test("an auto:false navigate directive proposes instead of navigating, and only the visitor's own click moves them", async ({
    page,
  }) => {
    await mockAssistantTurn(page, {
      text: "I can take you there if you like.",
      directives: [{ type: "navigate", target: THEMES_TARGET, auto: false }],
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
