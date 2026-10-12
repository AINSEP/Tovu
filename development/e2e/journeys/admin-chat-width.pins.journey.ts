// @unrun: owner-requested edit-only dispatch, 2026-10-10. Browser execution is held.
import { randomUUID } from "node:crypto";
import { expect, test } from "./_fixtures.js";
import { createAdminChatDriver } from "../support/admin-chat-driver.js";
import {
  assistantJourneyApi,
  captureAssistantArtifacts,
  cleanupAssistantArtifacts,
  journeyJson,
} from "../support/assistant-journey-state.js";

/**
 * Owner's 2026-10-10 regression: assistant prose inherited the shared 80% bubble cap
 * and stopped short of the tool-call rows. Removing assistant.css's assistant-only
 * `max-width: none` must fail the >=95% rendered-width assertion (F1.5).
 * Long user prose also distinguishes a retained bubble cap from an uncapped short
 * message that happens to fit (F4.3). Persistence, dock, Markdown and CSS stay real;
 * saving a completed transcript through the app API requires no model invocation.
 */
const USER_TEXT = "Please explain how the assistant reply should fill the available chat row. "
  + "Include several sentences and a short list so that I can read the explanation comfortably on a desktop or phone. "
  + "This user message is deliberately long enough to reach the bubble limit, so removing that limit cannot pass unnoticed.";
const ASSISTANT_TEXT = "Assistant replies should use the full available width of the conversation row. "
  + "Several sentences should wrap naturally against the same right edge as the other assistant content. "
  + "The reply should remain comfortable to read when the dock becomes a narrow sheet on a phone.\n\n"
  + "- Keep the explanation wide enough to use the available conversation space.\n"
  + "- Preserve the smaller user bubble so the two speakers remain easy to distinguish.\n"
  + "- Wrap this list within the dock without making the conversation scroll horizontally.\n\n"
  + "The final paragraph should follow the same width as the explanation and list above. "
  + "A large blank strip on the right would waste space and make every sentence wrap earlier than necessary.";

for (const viewport of [
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
]) {
  test.describe(`Bug pin: admin chat reply width (${viewport.name})`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
    });

    test("assistant fills >=95% of the row, user stays <=90%, side padding is even and <=24px, and the list never scrolls sideways", async ({ page }) => {
      const runStarts: string[] = [];
      page.on("request", (request) => {
        if (request.method() === "POST" && new URL(request.url()).pathname === "/api/runs") {
          runStarts.push(request.url());
        }
      });
      await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
      const api = assistantJourneyApi({ page });
      const before = await captureAssistantArtifacts({ api });
      const chat = createAdminChatDriver({ page });

      try {
        // New uses the real switcher/API and records this selection for reload.
        await chat.open();
        const conversationId = await chat.newConversation();
        const messages = [
          { id: randomUUID(), role: "user", content: USER_TEXT, createdAt: Date.UTC(2026, 9, 10) },
          { id: randomUUID(), role: "assistant", content: ASSISTANT_TEXT, runStatus: "succeeded", createdAt: Date.UTC(2026, 9, 10) + 1 },
        ];
        for (const message of messages) {
          await journeyJson({ api, method: "PUT",
            url: `/api/assistant/chats/${encodeURIComponent(conversationId)}/messages/${message.id}`, data: message });
        }
        const saved = await journeyJson<{ messages: Array<{ id: string; role: string; content: string }> }>({
          api, url: `/api/assistant/chats/${encodeURIComponent(conversationId)}/messages`,
        });
        expect(saved.messages.map(({ id, role, content }) => ({ id, role, content })))
          .toEqual(messages.map(({ id, role, content }) => ({ id, role, content })));

        // Load the transcript from persistence through the production hook, not injected DOM.
        await page.reload({ waitUntil: "domcontentloaded" });
        await chat.open();
        await expect.poll(() => chat.currentConversationId()).toBe(conversationId);
        await expect(chat.ui.messages).toHaveCount(2);
        await expect(chat.ui.userMessages).toContainText(USER_TEXT);
        await expect(chat.ui.assistantMessages).toContainText("Assistant replies should use the full available width");
        await expect(chat.ui.assistantMessages.getByRole("listitem")).toHaveCount(3);
        await expect(chat.ui.assistantMessages).toBeVisible();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));

        const list = chat.ui.root.locator('[data-agent-element="chat-transcript"]');
        await expect(list).toBeVisible();
        const layout = await list.evaluate((element, ids) => {
          const style = getComputedStyle(element);
          const paddingRight = Number.parseFloat(style.paddingRight);
          const paddingLeft = Number.parseFloat(style.paddingLeft);
          const innerWidth = element.clientWidth - paddingLeft - paddingRight;
          // Content bubbles have no ARIA/test hook. Measure the exact CSS target inside
          // identity-selected rows; row width alone would miss the original bubble cap.
          const contentWidth = (id: string) => {
            const row = Array.from(element.querySelectorAll<HTMLElement>("[data-message-id]"))
              .find((candidate) => candidate.dataset.messageId === id);
            const content = row?.querySelector<HTMLElement>(".jini-message-content");
            if (!content) throw new Error(`No rendered content for message ${id}`);
            return content.getBoundingClientRect().width;
          };
          return { innerWidth, paddingLeft, paddingRight, assistantWidth: contentWidth(ids.assistant),
            userWidth: contentWidth(ids.user), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        }, { user: messages[0]!.id, assistant: messages[1]!.id });

        expect(layout.innerWidth, "the transcript must have measurable inner width").toBeGreaterThan(0);
        expect(layout.userWidth, "the user bubble must be rendered").toBeGreaterThan(0);
        expect.soft(layout.assistantWidth / layout.innerWidth, "assistant content uses at least 95% of the list's inner width")
          .toBeGreaterThanOrEqual(0.95);
        // Jini's chat-pane styles cap the user's bubble at 88% and pad the list 22px a side (16px on
        // phones); those are the intended design. The bug was the assistant reply inheriting the cap
        // and stopping short of the tool rows, and extra space on the right only.
        expect.soft(layout.userWidth / layout.innerWidth, "user content retains its bubble cap")
          .toBeLessThanOrEqual(0.9);
        expect.soft(layout.paddingRight, "list right padding is at most 24px").toBeLessThanOrEqual(24);
        expect.soft(Math.abs(layout.paddingRight - layout.paddingLeft), "list side padding is even").toBeLessThanOrEqual(1);
        expect.soft(layout.scrollWidth, "the list has no horizontal scroll").toBeLessThanOrEqual(layout.clientWidth);
        // Visual baseline (owner, 2026-10-10: "you're also taking visual screenshots of it as a
        // baseline"). The first run with --update-snapshots writes it; later runs fail on a visual
        // change to the transcript. Anything that varies run to run (times, cost/duration footers)
        // is masked, not compared.
        await expect(list).toHaveScreenshot(`admin-chat-width-${viewport.name}.png`, {
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.01,
          mask: [list.locator("time"), list.locator(".jini-message-meta, .jini-run-footer, [class*=usage], [class*=timestamp]")],
        });
        expect(runStarts, "seeding and reading a completed conversation must start no model run").toEqual([]);
      } finally {
        // Reuse the assistant journey teardown: unmount debounced browser saves before
        // deletion, then verify every created chat is gone, even after a failed assertion.
        await page.goto("/api/assistant/chats", { waitUntil: "domcontentloaded" });
        await cleanupAssistantArtifacts({ api, before });
      }
    });
  });
}
