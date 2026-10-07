// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { buildConfirmationSurface, buildFormSurface } from "@jini-ai/ui/mcp-ui/surfaces";

import { uniq } from "./_fixtures.js";
import { expect, test } from "../support/assistant-journey-fixtures.js";
import { CODEX_JOURNEY, LIVE_ANSWER_TIMEOUT_MS } from "../support/assistant-journey-state.js";
import { stubPendingRun, type Payload } from "../support/assistant-run-stub.js";
import { createAdminChatDriver } from "../support/admin-chat-driver.js";

/**
 * Admin assistant dock journeys (SCOPE.md W9, stubbed-run slice). By default, no model runs: `POST /api/runs`
 * and its SSE stream are fulfilled by the test, following the recipe in
 * `ADS-memory/.local-artifacts/e2e-research/2026-10-04-admin-dock-research.md` and the proven stub
 * in `admin-composer-agent-plugin-chip.spec.ts`.
 *
 * Covered:
 *  - ask_choice typed answer (92310fef7): typing while the question card is open posts ONE
 *    `__typedAnswer`, never a second run; a stale card (409) shows the notice, keeps the draft and
 *    starts no run; a delivery failure says so and keeps the draft.
 *  - typing while a CONFIRM card (not a question) is pending QUEUES the message behind the run and
 *    posts nothing to the question endpoint (Jini 5e4ee497 fixed the misroute tonight).
 *  - the approval countdown under `page.clock`, and the expired card.
 *
 * Opt in to a live Local CLI reply with TOVU_E2E_ASSISTANT_AGENT=codex-cli. The other six
 * tests skip because their scripted transport/error/clock conditions require the stub.
 *
 * Stream shape: the client opens `EventSource(/api/runs/<id>/events)` and listens to the named
 * events `agent` / `end` (`apps/admin/src/lib/assistant-transport.ts`). Each `agent` frame's data is
 * a wire envelope whose `payload` goes through `translateRunAgentPayload`
 * (`apps/website/src/contracts/core/assistant-run-events.ts`); an `mcp-ui` payload's `resource` must
 * be the bare `{type:"resource", resource:{uri,mimeType,text}}` the surface builders return.
 *
 * A card stays pending only while the run is streaming. A finite SSE body with no `end` frame makes
 * EventSource reconnect and replay, so the body starts with `retry: 3600000` and the run-status GET
 * is stubbed to `running` for status readers. The current durable transport polls `POST /recover`
 * and renders its saved checkpoint: SSE alone no longer renders a pending card. The stub echoes
 * the request's durable binding and returns the same running checkpoint after a dropped stream
 * (a real recovery 404 would end the subscription).
 */
// In live mode, leave time for a genuine CLI turn; the default journey budget stays unchanged.
if (CODEX_JOURNEY) test.setTimeout(6 * 60_000);

function askChoicePayloads(): Payload[] {
  const resource = buildFormSurface({
    uri: "ui://tovu/ask-choice/admin/1",
    title: "Pick a plan",
    submitLabel: "Submit",
    toolName: "assistant_ask_choice",
    fields: [{ kind: "enum", name: "choice", label: "Plan", presentation: "radio", options: [{ value: "basic", label: "Basic" }, { value: "pro", label: "Pro" }] }],
    cancel: { label: "Cancel" },
  });
  return [
    { type: "text_delta", delta: "Which plan do you want?" },
    { type: "tool_use", id: "ask-1", name: "assistant_ask_choice", input: { title: "Pick a plan" } },
    { type: "mcp-ui", resource },
  ];
}

function confirmPayloads(expiresAtMs?: number): Payload[] {
  const resource = buildConfirmationSurface({
    uri: "ui://tovu/content-post-delete/post-1/1",
    title: "Delete post?",
    description: "This moves the post to the trash.",
    danger: true,
    confirm: { label: "Delete post", toolName: "content_post_delete", params: { __exchangeId: "ex-1", decision: "confirm" } },
    cancel: { label: "Cancel", toolName: "content_post_delete", params: { __exchangeId: "ex-1", decision: "cancel" } },
    ...(expiresAtMs === undefined ? {} : { expiresAtMs }),
  });
  return [
    { type: "text_delta", delta: "I will delete the post once you confirm." },
    { type: "tool_use", id: "del-1", name: "content_post_delete", input: { id: "post-1" } },
    { type: "mcp-ui", resource },
  ];
}

test.describe("assistant ask_choice typed answer", () => {
  test("typing while the question card is open delivers one typed answer and starts no second run", { tag: ["@unrun"] }, async ({ page }) => {
    test.skip(CODEX_JOURNEY, "Requires a scripted pending card, delivery status, or fake clock; live Codex cannot guarantee these conditions.");
    const stub = await stubPendingRun({ page, payloads: askChoicePayloads(), toolCallStatus: 202 });
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.newConversation();
    await chat.send({ text: "Help me choose" });
    await expect(page.frameLocator('[data-mcpui-host][aria-label^="ui://tovu/ask-choice/"] iframe').locator("h1.mcpui-title")).toHaveText("Pick a plan");
    // While streaming, Send turns into Stop run, so Enter is the only send path.
    await expect(chat.ui.stop).toBeVisible();

    const textarea = chat.ui.composer;
    await chat.send({ text: "  Something in between, please  " }, { submission: "enter" });
    await chat.send({}, { submission: "enter" }); // a second Enter on the now-empty composer must not resend
    await expect(textarea).toHaveValue("");
    await expect.poll(() => stub.toolCalls.length).toBe(1);
    expect(stub.toolCalls[0]).toEqual({ toolName: "assistant_ask_choice", params: { __typedAnswer: "Something in between, please" } });
    expect(stub.runStarts, "a typed answer must never start a second run").toHaveLength(1);
    await expect(chat.ui.paneErrors).toHaveCount(0);
  });

  test("a stale question (409) shows the notice, keeps the draft and starts no run", { tag: ["@unrun"] }, async ({ page }) => {
    test.skip(CODEX_JOURNEY, "Requires a scripted pending card, delivery status, or fake clock; live Codex cannot guarantee these conditions.");
    const stub = await stubPendingRun({ page, payloads: askChoicePayloads(), toolCallStatus: 409 });
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.newConversation();
    await chat.send({ text: "Help me choose" });
    await expect(page.frameLocator('[data-mcpui-host][aria-label^="ui://tovu/ask-choice/"] iframe').locator("h1.mcpui-title")).toBeVisible();
    const draft = uniq("late answer");
    const textarea = chat.ui.composer;
    await chat.send({ text: draft }, { submission: "enter" });
    await expect(chat.ui.paneErrors).toContainText(
      "That question is no longer waiting for an answer, so your message was not sent.",
    );
    // The notice carries the held answer's explicit way out (assistant-dock-i18n.ts); it is offered, not taken.
    await expect(chat.ui.paneErrors.getByRole("button", { name: "Send as a new message" })).toBeVisible();
    await expect(textarea).toHaveValue(draft);
    expect(stub.toolCalls).toHaveLength(1);
    expect(stub.runStarts).toHaveLength(1);
  });

  test("a failed delivery (500) says so and keeps the draft for a retry", { tag: ["@unrun"] }, async ({ page }) => {
    test.skip(CODEX_JOURNEY, "Requires a scripted pending card, delivery status, or fake clock; live Codex cannot guarantee these conditions.");
    const stub = await stubPendingRun({ page, payloads: askChoicePayloads(), toolCallStatus: 500 });
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.newConversation();
    await chat.send({ text: "Help me choose" });
    await expect(page.frameLocator('[data-mcpui-host][aria-label^="ui://tovu/ask-choice/"] iframe').locator("h1.mcpui-title")).toBeVisible();
    const textarea = chat.ui.composer;
    await chat.send({ text: "retry me" }, { submission: "enter" });
    await expect(chat.ui.paneErrors).toHaveText("Your answer could not be delivered. Try sending it again.");
    await expect(textarea).toHaveValue("retry me");
    expect(stub.runStarts).toHaveLength(1);
  });

  test("ask_choice card baseline", { tag: ["@unrun"] }, async ({ page }) => {
    if (CODEX_JOURNEY) {
      const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts", answerTimeoutMs: LIVE_ANSWER_TIMEOUT_MS });
      await chat.open({ navigate: true });
      await chat.newConversation();
      await chat.send({ text: "Reply with a brief greeting. Do not call tools or create or change posts, media, or sites." });
      await chat.waitForAnswer({ outcome: "succeeded" });
      await expect(chat.ui.assistantMessages.last().locator(".jini-message-content").last(), "A real Codex assistant reply appears").toHaveText(/\S/);
      await expect(chat.ui.assistantMessages.last()).toBeVisible();
      await expect(chat.ui.errors).toHaveCount(0);
      await expect(chat.ui.messageErrors).toHaveCount(0);
      return;
    }
    await stubPendingRun({ page, payloads: askChoicePayloads(), toolCallStatus: 202 });
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.newConversation();
    await chat.send({ text: "Help me choose" });
    await expect(page.frameLocator('[data-mcpui-host][aria-label^="ui://tovu/ask-choice/"] iframe').locator("h1.mcpui-title")).toBeVisible();
    await expect(chat.ui.dock).toHaveScreenshot("dock-ask-choice-card.png");
  });
});

test.describe("assistant confirm card", () => {
  test("typing while a CONFIRM card is pending queues the message instead of posting it as a typed answer", { tag: ["@unrun"] }, async ({ page }) => {
    test.skip(CODEX_JOURNEY, "Requires a scripted pending card, delivery status, or fake clock; live Codex cannot guarantee these conditions.");
    const stub = await stubPendingRun({ page, payloads: confirmPayloads(), toolCallStatus: 202 });
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.newConversation();
    await chat.send({ text: "Help me choose" });
    const card = page.frameLocator('[data-mcpui-host][aria-label^="ui://tovu/content-post-delete/"] iframe');
    await expect(card.locator('[data-mcpui-action="confirm"]')).toBeVisible();

    await chat.send({ text: "actually, also rename it" }, { submission: "enter" });
    const queued = page.getByTestId("chat-pane-queued");
    await expect(queued).toContainText("actually, also rename it");
    await expect(chat.ui.paneErrors, "no 'no longer waiting' notice for a confirm card").toHaveCount(0);
    expect(stub.toolCalls, "nothing may be posted to the question endpoint for a confirm card").toEqual([]);
    expect(stub.runStarts, "the queued message waits for the run; it does not start a second one").toHaveLength(1);

    await queued.getByRole("button").click(); // cancel the queued message
    await expect(queued).toHaveCount(0);
  });

  test("confirm sends exactly one decision for the right tool", { tag: ["@unrun"] }, async ({ page }) => {
    test.skip(CODEX_JOURNEY, "Requires a scripted pending card, delivery status, or fake clock; live Codex cannot guarantee these conditions.");
    const stub = await stubPendingRun({ page, payloads: confirmPayloads(), toolCallStatus: 202 });
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.newConversation();
    await chat.send({ text: "Help me choose" });
    const confirm = page.frameLocator('[data-mcpui-host][aria-label^="ui://tovu/content-post-delete/"] iframe').locator('[data-mcpui-action="confirm"]');
    await expect(confirm).toBeEnabled({ timeout: 5_000 }); // disabled for its first 1500 ms (CONFIRM_DWELL_MS)
    await confirm.dblclick();
    await expect.poll(() => stub.toolCalls.length).toBe(1);
    expect(stub.toolCalls[0]).toMatchObject({ toolName: "content_post_delete", params: { __exchangeId: "ex-1", decision: "confirm" } });
  });

  test("the approval countdown ticks under a fake clock and the card closes as expired at the deadline", { tag: ["@unrun"] }, async ({ page }) => {
    test.skip(CODEX_JOURNEY, "Requires a scripted confirmation deadline under page.clock; live Codex has no deterministic deadline.");
    const start = new Date("2026-10-04T12:00:00Z");
    await page.clock.install({ time: start });
    const stub = await stubPendingRun({ page, payloads: confirmPayloads(start.getTime() + 120_000), toolCallStatus: 202 });
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.newConversation();
    await chat.send({ text: "Help me choose" });
    const timer = page.locator("p.mcpui-surface-expiry[role=timer]");
    // install() lets fake time flow at wall speed, so page load under machine load eats an unknown
    // slice of the 2:00 window. Pause once the card shows, then move time by exact amounts.
    await expect(timer).toHaveText(/^Expires in (2:00|1:\d\d)$/);
    const pausedAt = (await page.evaluate(() => Date.now())) + 1_000;
    await page.clock.pauseAt(pausedAt);
    await expect(chat.ui.dock).toHaveScreenshot("dock-confirm-card-countdown.png", { mask: [timer] });

    await page.clock.fastForward(start.getTime() + 120_000 - pausedAt - 59_000);
    await expect(timer).toHaveText(/^Expires in 0:5[89]$/);

    await page.clock.fastForward(60_000);
    await expect(timer).toHaveCount(0);
    const closed = page.locator(".mcpui-surface-card-closed[role=status]");
    await expect(closed).toContainText("This question expired");
    await expect(page.locator('[data-mcpui-host][aria-label^="ui://tovu/content-post-delete/"] iframe'), "an expired card shows no live form").toHaveCount(0);
    await expect(chat.ui.dock).toHaveScreenshot("dock-confirm-card-expired.png");
    expect(stub.toolCalls, "expiry must not auto-confirm").toEqual([]);
  });
});
