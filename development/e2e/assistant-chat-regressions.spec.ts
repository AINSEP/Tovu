// @unrun: authored under an edit-only dispatch; coordinator owns execution.
import path from "node:path";
import { test as base, expect, type Request } from "@playwright/test";
import { createAdminChatDriver, type AdminChatDriver } from "./support/admin-chat-driver.js";

/**
 * Real Local CLI regressions: Jini 3a9a086a (separate attachment batches), video classification,
 * Tovu 8a8e48b1f (remember the open conversation), and the durable-runs design at
 * ADS-memory/.local-artifacts/codex/2026-10-06-durable-runs/design/.
 *
 * Why live-only: harness/fake-model-server.ts exercises BYOK's provider HTTP protocol. The
 * current startByokRun serializes text history, not attachments, and reattachRun(byok:...) simply
 * calls onDone([]). site-assistant-fixtures.ts intercepts the public widget's unrelated endpoint.
 * assistant.journey.ts intercepts /api/runs in the browser, bypassing attachment claim, real run
 * admission, durable checkpoints and recovery. None can prove these bugs. What is missing is a
 * controllable Local CLI executor/provider stub behind the REAL daemon admission, attachment
 * claim and durable event/store paths, able to hold a text delta before releasing the terminal.
 *
 * Until that port exists, this suite starts its own seeded SQLite site, API/admin/daemon, using
 * Claude Code Local CLI and its existing machine login. TOVU_E2E_ADMIN_CHAT=1 opts in to charges.
 * The journeys globalSetup logs in once; no owner's site or password is used. No endpoint is mocked. The
 * reload prompt requests a long streamed answer between two markers. Tovu forbids the CLI's Bash
 * tool, so a shell `sleep` cannot hold a real assistant run. This is live timing, not deterministic
 * provider timing: the test fails if the provider finishes before reload; it never quietly tests
 * reload AFTER completion instead.
 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const VIDEO = path.join(import.meta.dirname, "fixtures/video/iris-ai-motion.mp4");
const START_MARKER = "CHAT_RELOAD_STARTED";
const END_MARKER = "CHAT_RELOAD_COMPLETE";

const test = base.extend<{ chat: AdminChatDriver }>({
  chat: async ({ page, baseURL }, use, testInfo) => {
    const site = testInfo.config.metadata.isolatedJourneySite;
    if (!site || site.runtime !== "local-cli" || site.database !== "sqlite" || baseURL !== site.adminURL) {
      throw new Error("Use playwright.assistant-chat-regressions.config.ts: these tests require its isolated Local CLI site");
    }
    const chat = createAdminChatDriver({ page }, { answerTimeoutMs: 180_000 });
    await chat.open();
    await chat.newConversation();
    // Observe, never intercept: a BYOK success must not masquerade as a Local CLI regression pass.
    const runStarts: string[] = [];
    const observeRun = (request: Request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/api/runs")) runStarts.push(request.url());
    };
    page.on("request", observeRun);
    try {
      await use(chat);
      expect(runStarts.length, "these regressions require Local CLI /api/runs, not BYOK").toBeGreaterThan(0);
    } finally {
      page.off("request", observeRun);
    }
  },
});

/** Reproduce (c) independently for both reload and follow-up tests; no test-order dependency. */
async function reloadStreamingAnswer({ chat }: { chat: AdminChatDriver }, _optional = {}): Promise<string> {
  const conversationId = (await chat.currentConversationId())!;
  await chat.send({ text:
    `This is a chat reload regression check. Begin your answer with the exact text ${START_MARKER}. ` +
    "Then write 100 numbered sentences about testing chat interfaces, each at least twelve words long. " +
    "Stream the entire answer without shortening the list. " +
    `Only after sentence 100, append the exact text ${END_MARKER}. Do not use tools or edit files.`,
  });
  await expect(chat.ui.assistantMessages.last()).toContainText(START_MARKER, { timeout: 120_000 });
  const before = (await chat.transcript()).filter((message) => message.role === "assistant").at(-1)!;
  expect(before.runStatus, "must reload during an active answer").toBe("running");
  expect(await chat.reloadMidAnswer()).toBe(conversationId);
  const answer = await chat.waitForAnswer({ outcome: "succeeded" });
  expect(answer.id, "recovery must finish the same answer bubble").toBe(before.id);
  expect(answer.content).toContain(START_MARKER);
  expect(answer.content).toContain(END_MARKER);
  expect(await chat.currentConversationId()).toBe(conversationId);
  await expect(chat.ui.stop).toHaveCount(0);
  await expect(chat.ui.root).not.toContainText("Still working…");
  await expect(chat.ui.root).not.toContainText(/another answer in this chat is still running/i);
  await expect(chat.ui.errors).toHaveCount(0);
  await expect(chat.ui.messageErrors).toHaveCount(0);
  return conversationId;
}

test.describe("admin assistant chat regressions", { tag: ["@live", "@unrun"] }, () => {
  test.skip(process.env.TOVU_E2E_ADMIN_CHAT !== "1", "opt in with TOVU_E2E_ADMIN_CHAT=1; requires authenticated Claude Code CLI");

  test("two images uploaded in two separate batches both survive send", async ({ chat }) => {
    await chat.attach({ files: [{ name: "batch-one.png", mimeType: "image/png", buffer: PNG }] });
    await expect(chat.ui.attachmentChip({ name: "batch-one.png" })).toBeVisible();
    // Deliberately a second call: a single two-file batch was never the failing restored-batch case.
    await chat.attach({ files: [{ name: "batch-two.png", mimeType: "image/png", buffer: PNG }] });
    await expect(chat.ui.attachmentChips).toHaveCount(2);
    expect(await chat.attachments()).toEqual([
      { name: "batch-one.png", kind: "image", path: null },
      { name: "batch-two.png", kind: "image", path: null },
    ]);
    await chat.send({ text: "Acknowledge these two attached images in one short sentence. Do not use tools." });
    const answer = await chat.waitForAnswer({ outcome: "succeeded" });
    expect(answer.content.trim()).not.toBe("");
    await expect(chat.ui.userMessages.last().getByRole("button", { name: "Open batch-one.png", exact: true })).toBeVisible();
    await expect(chat.ui.userMessages.last().getByRole("button", { name: "Open batch-two.png", exact: true })).toBeVisible();
    await expect.poll(async () => (await chat.attachments({ scope: "transcript" })).map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "batch-one.png", kind: "image" }, { name: "batch-two.png", kind: "image" },
    ]);
    await expect(chat.ui.errors).toHaveCount(0);
    await expect(chat.ui.messageErrors).toHaveCount(0);
  });

  test("a video chip appears as a file attachment and a turn with text succeeds", async ({ chat }) => {
    await chat.attach({ files: [{ path: VIDEO }] });
    const chip = chat.ui.attachmentChip({ name: "iris-ai-motion.mp4" });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("data-attachment-kind", "file");
    await chat.send({ text: "Acknowledge the attached video in one short sentence. Do not use tools." });
    const answer = await chat.waitForAnswer({ outcome: "succeeded" });
    expect(answer.content.trim()).not.toBe("");
    await expect.poll(async () => (await chat.attachments({ scope: "transcript" })).map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "iris-ai-motion.mp4", kind: "file" },
    ]);
    await expect(chat.ui.errors).toHaveCount(0);
    await expect(chat.ui.messageErrors).toHaveCount(0);
  });

  test("reload during streaming reopens the same conversation and finishes its answer", async ({ chat }) => {
    await reloadStreamingAnswer({ chat });
  });

  test("a follow-up succeeds in the same conversation after a streaming reload", async ({ chat }) => {
    const conversationId = await reloadStreamingAnswer({ chat });
    const priorIds = (await chat.transcript()).map((message) => message.id);
    await chat.send({ text: "Reply with exactly CHAT_FOLLOW_UP_OK. Do not use tools." });
    const answer = await chat.waitForAnswer({ outcome: "succeeded" });
    expect(answer.content).toContain("CHAT_FOLLOW_UP_OK");
    expect(priorIds).not.toContain(answer.id);
    expect(await chat.currentConversationId()).toBe(conversationId);
    expect((await chat.transcript()).filter((message) => message.role === "user")).toHaveLength(2);
    await expect(chat.ui.root).not.toContainText(/another answer in this chat is still running/i);
    await expect(chat.ui.root).not.toContainText("Still working…");
    await expect(chat.ui.errors).toHaveCount(0);
    await expect(chat.ui.messageErrors).toHaveCount(0);
  });
});
