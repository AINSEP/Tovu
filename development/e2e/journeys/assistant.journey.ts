// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { Page, Request, Route } from "@playwright/test";
import { buildConfirmationSurface, buildFormSurface } from "@jini-ai/ui/mcp-ui/surfaces";

import { expect, test, uniq } from "./_fixtures.js";
import { createAdminChatDriver } from "../support/admin-chat-driver.js";

/**
 * Admin assistant dock journeys (SCOPE.md W9, stubbed-run slice). No model runs: `POST /api/runs`
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
 * Stream shape: the client opens `EventSource(/api/runs/<id>/events)` and listens to the named
 * events `agent` / `end` (`apps/admin/src/lib/assistant-transport.ts`). Each `agent` frame's data is
 * a wire envelope whose `payload` goes through `translateRunAgentPayload`
 * (`apps/website/src/contracts/core/assistant-run-events.ts`); an `mcp-ui` payload's `resource` must
 * be the bare `{type:"resource", resource:{uri,mimeType,text}}` the surface builders return.
 *
 * A card stays pending only while the run is streaming. A finite SSE body with no `end` frame makes
 * EventSource reconnect and replay, so the body starts with `retry: 3600000` and the run-status GET
 * is stubbed to `running` (the transport asks it on a dropped stream and ends the run on a 404).
 */
const RUN_ID = "journey-run-1";

type Payload = Record<string, unknown>;

function frame(event: "agent" | "end", payload: Payload, eventId: number): string {
  const data = {
    runId: RUN_ID,
    eventId: String(eventId),
    opaqueCursor: String(eventId),
    protocolVersion: 1,
    ts: new Date(0).toISOString(),
    kind: event,
    payload,
    durability: "durable",
  };
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

interface RunStub {
  runStarts: Request[];
  toolCalls: Array<{ toolName: string; params: Record<string, unknown> }>;
}

/**
 * Stubs one pending run whose stream replays `payloads` and never ends, plus the mcp-ui decision
 * endpoint answering `toolCallStatus`.
 */
async function stubPendingRun(page: Page, payloads: Payload[], toolCallStatus: 202 | 409 | 500): Promise<RunStub> {
  const stub: RunStub = { runStarts: [], toolCalls: [] };
  await page.route(
    (url) => url.pathname.endsWith("/api/runs"),
    async (route: Route) => {
      if (route.request().method() !== "POST") return route.continue();
      stub.runStarts.push(route.request());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: { id: RUN_ID, state: "running" } }) });
    },
  );
  await page.route(`**/api/runs/${RUN_ID}/events`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "retry: 3600000\n\n" + payloads.map((p, i) => frame("agent", p, i + 1)).join(""),
    }),
  );
  await page.route(`**/api/runs/${RUN_ID}`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: { id: RUN_ID, state: "running" } }) })
      : route.continue(),
  );
  await page.route("**/api/admin/v1/mcp-ui/tool-calls", async (route) => {
    stub.toolCalls.push(route.request().postDataJSON());
    const body =
      toolCallStatus === 202
        ? { delivered: true }
        : toolCallStatus === 409
          ? { error: "that dialog is no longer waiting for an answer", code: "SURFACE_NOT_PENDING", reason: "unknown-or-closed" }
          : { error: "internal error", code: "INTERNAL_ERROR" };
    await route.fulfill({ status: toolCallStatus, contentType: "application/json", body: JSON.stringify(body) });
  });
  return stub;
}

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
    const stub = await stubPendingRun(page, askChoicePayloads(), 202);
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.send({ text: "Help me choose" });
    await expect(page.frameLocator('iframe[title^="ui://tovu/ask-choice/"]').locator("h1.mcpui-title")).toHaveText("Pick a plan");
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
    const stub = await stubPendingRun(page, askChoicePayloads(), 409);
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.send({ text: "Help me choose" });
    await expect(page.frameLocator('iframe[title^="ui://tovu/ask-choice/"]').locator("h1.mcpui-title")).toBeVisible();
    const draft = uniq("late answer");
    const textarea = chat.ui.composer;
    await chat.send({ text: draft }, { submission: "enter" });
    await expect(chat.ui.paneErrors).toHaveText(
      "That question is no longer waiting for an answer, so your message was not sent.",
    );
    await expect(textarea).toHaveValue(draft);
    expect(stub.toolCalls).toHaveLength(1);
    expect(stub.runStarts).toHaveLength(1);
  });

  test("a failed delivery (500) says so and keeps the draft for a retry", { tag: ["@unrun"] }, async ({ page }) => {
    const stub = await stubPendingRun(page, askChoicePayloads(), 500);
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.send({ text: "Help me choose" });
    await expect(page.frameLocator('iframe[title^="ui://tovu/ask-choice/"]').locator("h1.mcpui-title")).toBeVisible();
    const textarea = chat.ui.composer;
    await chat.send({ text: "retry me" }, { submission: "enter" });
    await expect(chat.ui.paneErrors).toHaveText("Your answer could not be delivered. Try sending it again.");
    await expect(textarea).toHaveValue("retry me");
    expect(stub.runStarts).toHaveLength(1);
  });

  test("ask_choice card baseline", { tag: ["@unrun"] }, async ({ page }) => {
    await stubPendingRun(page, askChoicePayloads(), 202);
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.send({ text: "Help me choose" });
    await expect(page.frameLocator('iframe[title^="ui://tovu/ask-choice/"]').locator("h1.mcpui-title")).toBeVisible();
    await expect(chat.ui.dock).toHaveScreenshot("dock-ask-choice-card.png");
  });
});

test.describe("assistant confirm card", () => {
  test("typing while a CONFIRM card is pending queues the message instead of posting it as a typed answer", { tag: ["@unrun"] }, async ({ page }) => {
    const stub = await stubPendingRun(page, confirmPayloads(), 202);
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.send({ text: "Help me choose" });
    const card = page.frameLocator('iframe[title^="ui://tovu/content-post-delete/"]');
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
    const stub = await stubPendingRun(page, confirmPayloads(), 202);
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.send({ text: "Help me choose" });
    const confirm = page.frameLocator('iframe[title^="ui://tovu/content-post-delete/"]').locator('[data-mcpui-action="confirm"]');
    await expect(confirm).toBeEnabled({ timeout: 5_000 }); // disabled for its first 1500 ms (CONFIRM_DWELL_MS)
    await confirm.dblclick();
    await expect.poll(() => stub.toolCalls.length).toBe(1);
    expect(stub.toolCalls[0]).toMatchObject({ toolName: "content_post_delete", params: { __exchangeId: "ex-1", decision: "confirm" } });
  });

  test("the approval countdown ticks under a fake clock and the card closes as expired at the deadline", { tag: ["@unrun"] }, async ({ page }) => {
    const start = new Date("2026-10-04T12:00:00Z");
    await page.clock.install({ time: start });
    const stub = await stubPendingRun(page, confirmPayloads(start.getTime() + 120_000), 202);
    const chat = createAdminChatDriver({ page }, { adminPath: "/admin/posts" });
    await chat.open({ navigate: true });
    await chat.send({ text: "Help me choose" });
    const timer = page.locator("p.mcpui-surface-expiry[role=timer]");
    await expect(timer).toHaveText(/^Expires in (2:00|1:59)$/);
    await expect(chat.ui.dock).toHaveScreenshot("dock-confirm-card-countdown.png", { mask: [timer] });

    await page.clock.fastForward(61_000);
    await expect(timer).toHaveText(/^Expires in 0:5[89]$/);

    await page.clock.fastForward(60_000);
    await expect(timer).toHaveCount(0);
    const closed = page.locator(".mcpui-surface-card-closed[role=status]");
    await expect(closed).toContainText("This question expired");
    await expect(page.locator('iframe[title^="ui://tovu/content-post-delete/"]'), "an expired card shows no live form").toHaveCount(0);
    await expect(chat.ui.dock).toHaveScreenshot("dock-confirm-card-expired.png");
    expect(stub.toolCalls, "expiry must not auto-confirm").toEqual([]);
  });
});
