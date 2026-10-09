import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

/** Files may be mixed in one batch; separate attach calls preserve separate upload batches. */
export type AdminChatFile =
  | { readonly path: string }
  | { readonly name: string; readonly mimeType: string; readonly buffer: Buffer };

export type AnswerOutcome = "succeeded" | "failed" | "canceled";
export interface AttachmentObservation {
  readonly name: string;
  readonly kind: string | null;
  readonly path: string | null;
}
export interface TranscriptMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  /** Rendered text (including tool labels), or raw markdown when source is persisted. */
  readonly content: string;
  readonly runStatus: string | null;
  readonly attachments: readonly AttachmentObservation[];
}
export interface AdminChatDriverOptions {
  readonly adminPath?: string;
  readonly actionTimeoutMs?: number;
  readonly answerTimeoutMs?: number;
}

/**
 * Tovu's admin adapter around Playwright's Page port. Authentication belongs to the caller.
 * All ordinary chat driving and selectors live here; specs retain assertions on the exposed ui.
 * Locale must be English for role names, as in the existing E2E configs.
 */
export function createAdminChatDriver(
  { page }: { page: Page },
  { adminPath = "/admin/", actionTimeoutMs = 15_000, answerTimeoutMs = 90_000 }: AdminChatDriverOptions = {},
) {
  const dock = page.getByRole("complementary", { name: "Assistant", exact: true });
  const root = page.getByTestId("admin-chat-driver-root");
  // Jini already exposes these message identity, role and lifecycle hooks for agent control.
  const messages = root.locator("[data-message-id]");
  const assistantMessages = messages.and(root.locator('[data-agent-label="A reply from the assistant"]'));
  const userMessages = messages.and(root.locator('[data-agent-label="A message from the user"]'));
  /**
   * The file input always exists once the composer mounts with discovery groups (rendered
   * unconditionally by whichever of Jini's two composer render branches is live, not gated on the
   * "+" menu being open), so no menu click is needed to reach it — matching how `setInputFiles`
   * drives it directly rather than through a simulated click-then-native-dialog flow Playwright
   * cannot automate anyway.
   *
   * Keyed off the real `data-testid="composer-attachment-input"` hook, present on both of Jini's
   * composer render branches (`Composer.tsx`'s own `attachmentPicker && !hasDiscoveryItems` branch
   * and `ComposerDiscovery.tsx`'s `ComposerDiscoveryMenu` Files group — Tovu's admin dock takes the
   * discovery branch) — this locator doesn't need to know or care which one is live.
   */
  const fileInput = root.getByTestId("composer-attachment-input");
  const attachmentChips = root.getByTestId("attachment-chip");
  let priorAssistantIds = new Set<string>();
  let answerId: string | null = null;

  const ui = {
    dock, root, messages, assistantMessages, userMessages, fileInput, attachmentChips,
    composer: root.getByRole("textbox"),
    send: root.getByRole("button", { name: "Send", exact: true }),
    stop: root.getByRole("button", { name: "Stop run", exact: true }),
    errors: root.getByRole("alert"),
    // These Jini notice classes have no distinct test hook. Kept here so consumers never repeat
    // package-internal selectors; adding hooks requires a Jini release outside this dispatch.
    messageErrors: root.locator(".jini-message-error"),
    paneErrors: root.locator('.jini-chat-pane__error[role="alert"]'),
    /** Locates one attachment chip by its exact, post-sanitization `data-attachment-name` — the real
     *  value Jini's `sanitizeAttachmentName` computed, not a substring match on rendered text. Both
     *  attributes live on the same element, so this is one combined selector rather than a scoped
     *  `getByTestId().filter(...)` (which only matches a DESCENDANT, not the element itself). */
    attachmentChip({ name }: { name: string }, _optional = {}): Locator {
      return attachmentChips.and(root.locator(`[data-attachment-name=${JSON.stringify(name)}]`));
    },
  };

  async function currentAnswer(): Promise<Locator | null> {
    const ids = await assistantMessages.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-message-id")!));
    const id = answerId ?? ids.filter((candidate) => !priorAssistantIds.has(candidate)).at(-1);
    if (!id) return null;
    answerId = id;
    return assistantMessages.and(root.locator(`[data-message-id=${JSON.stringify(id)}]`));
  }

  /** Open the dock idempotently; navigate when requested or when outside /admin. Does not log in. */
  async function open({ navigate = false }: { navigate?: boolean } = {}, _optional = {}): Promise<void> {
    if (navigate || !new URL(page.url()).pathname.startsWith("/admin")) {
      // Never networkidle: the app holds streams open. A visible composer proves React mounted.
      await page.goto(adminPath, { waitUntil: "domcontentloaded" });
    }
    await page.locator(".admin-layout").waitFor({ state: "visible", timeout: actionTimeoutMs });
    if (!(await dock.isVisible())) await page.getByRole("button", { name: "Open assistant", exact: true }).click();
    await expect(dock).not.toHaveAttribute("hidden", "", { timeout: actionTimeoutMs });
    await ui.composer.waitFor({ state: "visible", timeout: actionTimeoutMs });
  }

  /** Read the currently selected conversation, not the newest row or a remembered storage value. */
  async function currentConversationId(_required = {}, _optional = {}): Promise<string | null> {
    return (await root.getAttribute("data-conversation-id")) || null;
  }

  /** Create a durable conversation through the real switcher, and wait for the empty pane. */
  async function newConversation(_required = {}, _optional = {}): Promise<string> {
    await open();
    const previous = await currentConversationId();
    await root.getByTestId("conversation-trigger").click();
    await root.getByTestId("conversation-new").click();
    await expect.poll(currentConversationId, { timeout: actionTimeoutMs }).toEqual(expect.any(String));
    await expect.poll(currentConversationId, { timeout: actionTimeoutMs }).not.toBe(previous);
    await expect(messages).toHaveCount(0, { timeout: actionTimeoutMs });
    priorAssistantIds.clear();
    answerId = null;
    return (await currentConversationId())!;
  }

  /**
   * Select one batch, then wait for the upload to settle (including rejections). Assertions own
   * success/failure, so zero-byte/oversize tests can use the same path. The hidden input always
   * exists after mount in both Jini composer branches; no menu click is necessary for input mode.
   * picker mode also proves the visible Attach files action opens that very input.
   */
  async function attach(
    { files }: { files: readonly AdminChatFile[] },
    { via = "input" }: { via?: "input" | "picker" } = {},
  ): Promise<void> {
    if (files.length === 0) throw new Error("attach requires at least one file");
    await expect(fileInput).toBeEnabled({ timeout: actionTimeoutMs });
    // Playwright accepts paths OR payloads per call. Normalize only mixed batches, so they still
    // reach the composer in ONE change event rather than accidentally becoming separate batches.
    const allPaths = files.every((file) => "path" in file);
    const selected = allPaths
      ? files.map((file) => (file as { path: string }).path)
      : await Promise.all(files.map(async (file) => "path" in file
        ? { name: path.basename(file.path), mimeType: "", buffer: await readFile(file.path) }
        : file));
    if (via === "picker") {
      await root.getByRole("button", { name: "Add context", exact: true }).click();
      const chooserOpened = page.waitForEvent("filechooser", { timeout: actionTimeoutMs });
      await page.getByRole("menuitem", { name: "Attach files", exact: true }).click();
      const chooser = await chooserOpened;
      expect(await chooser.element().getAttribute("data-testid")).toBe("composer-attachment-input");
      await chooser.setFiles(selected);
    } else {
      await fileInput.setInputFiles(selected);
    }
    await expect(fileInput).toBeEnabled({ timeout: actionTimeoutMs });
  }

  /**
   * Submit text; omit text to submit the existing draft without changing it. enter also drives
   * typed answers and queueing while Stop replaces Send. Returns after submission, without
   * waiting for completion. doubleClick preserves duplicate-send proof.
   */
  async function send(
    { text }: { text?: string },
    { submission = "button", doubleClick = false }: { submission?: "button" | "enter"; doubleClick?: boolean } = {},
  ): Promise<void> {
    priorAssistantIds = new Set(await assistantMessages.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-message-id")!)));
    answerId = null;
    if (text !== undefined) await ui.composer.fill(text);
    if (submission === "enter") await ui.composer.press("Enter");
    else {
      await expect(ui.send).toBeEnabled({ timeout: actionTimeoutMs });
      if (doubleClick) await ui.send.dblclick();
      else await ui.send.click();
    }
  }

  /** Read chips in the draft, or sent attachments from the persisted transcript (with their paths). */
  async function attachments(
    { scope = "composer" }: { scope?: "composer" | "transcript" } = {}, _optional = {},
  ): Promise<readonly AttachmentObservation[]> {
    if (scope === "transcript") return (await transcript({}, { source: "persisted" })).flatMap((message) => message.attachments);
    return attachmentChips.evaluateAll((chips) => chips.map((chip) => ({
      name: chip.getAttribute("data-attachment-name") ?? "",
      kind: chip.getAttribute("data-attachment-kind"), path: null,
    })));
  }

  /** Read ordered rendered messages, or raw persisted markdown/attachment metadata via the real API. */
  async function transcript(
    _required = {}, { source = "rendered" }: { source?: "rendered" | "persisted" } = {},
  ): Promise<readonly TranscriptMessage[]> {
    if (source === "persisted") {
      const id = await currentConversationId();
      if (!id) return [];
      // In-page fetch carries the session's Secure cookie over loopback HTTP; page.request omits it.
      const response = await page.evaluate(async (url) => {
        const reply = await fetch(url, { credentials: "same-origin" });
        return { status: reply.status, text: await reply.text() };
      }, `/api/assistant/chats/${encodeURIComponent(id)}/messages`);
      if (response.status < 200 || response.status >= 300) throw new Error(`Read chat ${id}: ${response.status} ${response.text}`);
      const body = JSON.parse(response.text) as { messages: Array<{
        id: string; role: "user" | "assistant"; content: string; runStatus?: string;
        attachments?: Array<{ name: string; kind: string; path: string }>;
      }> };
      return body.messages.map((message) => ({ ...message, runStatus: message.runStatus ?? null, attachments: message.attachments ?? [] }));
    }
    return messages.evaluateAll((rows) => rows.map((row) => ({
      id: row.getAttribute("data-message-id")!,
      role: row.getAttribute("data-agent-label") === "A message from the user" ? "user" as const : "assistant" as const,
      content: (row as HTMLElement).innerText,
      runStatus: row.getAttribute("data-run-status"),
      attachments: Array.from(row.querySelectorAll('.jini-message-attachments button[aria-label^="Open "]')).map((button) => ({
        name: button.getAttribute("aria-label")!.slice(5), kind: null, path: null,
      })),
    })));
  }

  /**
   * Wait for THIS submission's terminal lifecycle state. A visible sentence or missing Stop alone
   * is insufficient: tools can still be running. Fail promptly on a different terminal outcome.
   */
  async function waitForAnswer(
    { outcome }: { outcome: AnswerOutcome }, { timeoutMs = answerTimeoutMs }: { timeoutMs?: number } = {},
  ): Promise<TranscriptMessage> {
    await expect.poll(async () => {
      const answer = await currentAnswer();
      const status = await answer?.getAttribute("data-run-status", { timeout: actionTimeoutMs });
      if (status && ["succeeded", "failed", "canceled"].includes(status)) return status;
      return null;
    }, { timeout: timeoutMs, message: "Assistant answer never reached a terminal run status" }).toEqual(expect.any(String));
    const answer = (await currentAnswer())!;
    await expect(answer).toHaveAttribute("data-run-status", outcome);
    return (await transcript()).find((message) => message.id === answerId)!;
  }

  /**
   * Reload only after nonempty output arrives during a live run; never silently reload a finished
   * answer. Wait for the same conversation and message to reopen. A controllably slow provider is
   * required for deterministic timing; live runs fail this precondition if they finish too quickly.
   */
  async function reloadMidAnswer(_required = {}, { timeoutMs = answerTimeoutMs }: { timeoutMs?: number } = {}): Promise<string> {
    await expect.poll(async () => {
      const answer = await currentAnswer();
      // MessageRow's activity placeholder lives outside .jini-message-content. Observing it
      // would reload before any actual answer text arrived, despite the nonempty-output contract.
      const text = answer ? await answer.locator(".jini-message-content").allTextContents() : [];
      return !!answer && await answer.getAttribute("data-run-status", { timeout: actionTimeoutMs }) === "running"
        && text.some((part) => part.trim().length > 0) && await ui.stop.isVisible();
    }, { timeout: timeoutMs, message: "No streaming answer observed before reload" }).toBe(true);
    const id = await currentConversationId();
    if (!id) throw new Error("Streaming answer has no active conversation");
    await expect((await currentAnswer())!).toHaveAttribute("data-run-status", "running");
    await page.reload({ waitUntil: "domcontentloaded" });
    await open();
    await expect.poll(currentConversationId, { timeout: actionTimeoutMs }).toBe(id);
    await expect((await currentAnswer())!).toBeVisible({ timeout: actionTimeoutMs });
    return id;
  }

  return { ui, open, newConversation, attach, send, waitForAnswer, reloadMidAnswer, transcript, attachments, currentConversationId };
}

export type AdminChatDriver = ReturnType<typeof createAdminChatDriver>;
