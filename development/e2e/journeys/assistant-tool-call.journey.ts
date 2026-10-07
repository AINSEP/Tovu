// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { Page } from "@playwright/test";

import { startFakeModelServer, toolResultsIn, type CapturedModelRequest, type FakeModelServer } from "../harness/fake-model-server.js";
import { uniq, WS_API } from "./_fixtures.js";
import { expect, test } from "../support/assistant-journey-fixtures.js";
import { assistantJourneyApi, CODEX_JOURNEY, journeyJson, journeyPosts, LIVE_ANSWER_TIMEOUT_MS, putExecutionSetting } from "../support/assistant-journey-state.js";
import { createAdminChatDriver } from "../support/admin-chat-driver.js";

/**
 * TOVU_E2E_ASSISTANT_AGENT=codex-cli runs the successful create and double-send cases against
 * the installed Codex CLI in Local CLI mode. It uses the same execution settings as the user,
 * waits for a terminal answer, and asserts exactly one real draft rather than model prose or
 * provider request counts. The invalid scripted input case skips with an explicit reason.
 * Every case has fixture teardown that deletes and proves deletion of created rows and chats.
 *
 * W9 (SCOPE.md §2, layer 2): a REAL tool call through the admin dock. Unlike `assistant.journey.ts`,
 * nothing on the browser side is stubbed: the dock runs in "API · BYOK" mode against the Anthropic
 * protocol, the site server's BYOK route (`assistant-byok.ts`) calls the fake model server
 * (`harness/fake-model-server.ts`), and the fake model's scripted `tool_use` goes through the real
 * meta-tool surface (`execute_delegated_tool` -> `content_post_create`), the real command gateway
 * and the real DB. The journey then reads the row back through the admin API and the Posts screen.
 *
 * Fake BYOK setup is per test, through the admin API: the non-secret ledger keys in
 * `core.execution` (what `apps/admin/src/lib/execution-settings.ts` writes) plus the admin's own
 * encrypted credential (`PUT .../assistant/execution-credential`, the "Save key" route). The
 * `finally` puts `mode` back to `local-cli` and deletes the credential, because the other assistant
 * journeys stub the local-CLI run path and share this memory DB.
 *
 * `apiKey` is a fake that the fake model server never checks; it is asserted on the captured
 * request only to prove the stored credential (not some other key) reached the provider call.
 */
const FAKE_KEY = "sk-ant-journey-FAKE-NOT-REAL-0000000000";
const FAKE_MODEL = "claude-journey-fake";
const CREDENTIAL_URL = `${WS_API}/assistant/execution-credential`;

async function putLedger(page: Page, key: string, valueJson: unknown): Promise<void> {
  await putExecutionSetting({ api: assistantJourneyApi({ page }), key, valueJson });
}

async function configureByok(page: Page, fake: FakeModelServer): Promise<void> {
  await putLedger(page, "byok.protocol", "anthropic");
  await putLedger(page, "byok.providerId", "anthropic");
  await putLedger(page, "byok.baseUrl", fake.baseUrl);
  await putLedger(page, "byok.model", FAKE_MODEL);
  await putLedger(page, "mode", "byok");
  const saved = await journeyJson<{ data: { isSet: boolean } }>({ api: assistantJourneyApi({ page }), url: CREDENTIAL_URL, method: "PUT",
    data: { apiKey: FAKE_KEY, protocol: "anthropic", providerId: "anthropic", baseUrl: fake.baseUrl, model: FAKE_MODEL } });
  expect(saved.data.isSet).toBe(true);
}

async function restoreLocalCli(page: Page): Promise<void> {
  await putLedger(page, "mode", "local-cli");
  const api = assistantJourneyApi({ page });
  await journeyJson({ api, url: CREDENTIAL_URL, method: "DELETE" });
  const cleared = await journeyJson<{ data: { isSet: boolean } }>({ api, url: CREDENTIAL_URL });
  expect(cleared.data.isSet, "The fake credential was deleted").toBe(false);
}

async function listPosts(page: Page) {
  return journeyPosts({ api: assistantJourneyApi({ page }) });
}

async function postsTitled(page: Page, title: string): Promise<Awaited<ReturnType<typeof listPosts>>> {
  return (await listPosts(page)).filter((p) => p.title === title);
}

async function postCount(page: Page): Promise<number> {
  return (await listPosts(page)).length;
}

/** Script: call `content_post_create` through the meta-tool, then answer from the tool result. */
function createPostScript(fake: FakeModelServer, title: string, toolUseId: string): void {
  fake.enqueue(
    {
      text: "Creating the draft now.",
      toolCalls: [
        {
          id: toolUseId,
          name: "execute_delegated_tool",
          input: { toolId: "content_post_create", input: { kind: "post", title, status: "draft" } },
        },
      ],
    },
    (request: CapturedModelRequest) => {
      const result = toolResultsIn("anthropic", request).find((r) => r.toolUseId === toolUseId);
      return { text: result && !result.isError ? `Done: the draft "${title}" exists.` : `The tool failed: ${result?.content ?? "no result"}` };
    },
  );
}

if (CODEX_JOURNEY) test.setTimeout(6 * 60_000);

/** Exact titles and the one-row outcome remain deterministic even when the model's prose is not. */
function createPrompt(title: string): string {
  return CODEX_JOURNEY
    ? `Use the site's content_post_create tool to create exactly one draft post with kind "post" and title ${JSON.stringify(title)}. Keep the title exactly as given. Do not create media or sites, edit files, or perform any other mutation. After the tool succeeds, reply briefly.`
    : `Create a draft post titled ${title}`;
}

test.describe("assistant real tool call (fake BYOK by default; opt-in Codex Local CLI)", () => {
  test("a scripted tool_use creates a real draft post, visible in the API and on the Posts screen", { tag: ["@unrun"] }, async ({ page }) => {
    const fake = CODEX_JOURNEY ? undefined : await startFakeModelServer("anthropic");
    const title = uniq("Agent draft");
    const toolUseId = "toolu_journey_create_1";
    if (fake) createPostScript(fake, title, toolUseId);
    try {
      if (fake) await configureByok(page, fake);
      const chat = createAdminChatDriver({ page }, { answerTimeoutMs: CODEX_JOURNEY ? LIVE_ANSWER_TIMEOUT_MS : 30_000 });
      // A fresh load remounts `AssistantDock`, whose `useExecutionConfig` reads the ledger just written.
      await chat.open({ navigate: true });
      await chat.newConversation();
      await chat.send({ text: createPrompt(title) });

      await chat.waitForAnswer({ outcome: "succeeded" });
      const reply = chat.ui.assistantMessages.last().locator(".jini-message-content").last();
      await expect(reply, "An assistant reply appears").toHaveText(/\S/);
      if (fake) await expect(reply).toHaveText(`Done: the draft "${title}" exists.`, { timeout: 30_000 });
      await expect(chat.ui.errors).toHaveCount(0);
      await expect(chat.ui.messageErrors).toHaveCount(0);

      if (fake) {
        // The provider call carried the stored credential, and the second call carried a successful
        // tool result naming the row the handler wrote.
        const calls = fake.generationRequests();
        expect(calls).toHaveLength(2);
        expect(calls[0]!.headers["x-api-key"]).toBe(FAKE_KEY);
        const [result] = toolResultsIn("anthropic", calls[1]!).filter((r) => r.toolUseId === toolUseId);
        expect(result, "the server sent no tool_result for the scripted tool_use").toBeDefined();
        expect(result!.isError, result!.content).toBe(false);
        expect(result!.content).toContain(title);
        expect(fake.remainingTurns()).toBe(0);
      }

      const rows = await postsTitled(page, title);
      expect(rows, "exactly one post row").toHaveLength(1);
      expect(rows[0]!.status).toBe("draft");
      if (fake) {
        const result = toolResultsIn("anthropic", fake.generationRequests()[1]!).find((r) => r.toolUseId === toolUseId);
        expect(result!.content).toContain(rows[0]!.id);
      }

      await page.goto("/admin/posts");
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    } finally {
      if (fake) await restoreLocalCli(page).finally(() => fake.close());
    }
  });

  test("a tool call with invalid input is refused to the model, writes no row, and the turn still finishes", { tag: ["@unrun"] }, async ({ page }) => {
    test.skip(CODEX_JOURNEY, "Requires a scripted invalid tool_use and exact model error; live Codex may ask for a title or repair the input.");
    const fake = await startFakeModelServer("anthropic");
    const toolUseId = "toolu_journey_invalid_1";
    fake.enqueue(
      // No `title`: `content_post_create` requires it (`requireString`), so the handler refuses.
      { toolCalls: [{ id: toolUseId, name: "execute_delegated_tool", input: { toolId: "content_post_create", input: { kind: "post" } } }] },
      { text: "That did not work; the title is missing." },
    );
    try {
      await configureByok(page, fake);
      const before = await postCount(page);
      const chat = createAdminChatDriver({ page }, { answerTimeoutMs: CODEX_JOURNEY ? LIVE_ANSWER_TIMEOUT_MS : 30_000 });
      // A fresh load remounts `AssistantDock`, whose `useExecutionConfig` reads the ledger just written.
      await chat.open({ navigate: true });
      await chat.newConversation();
      await chat.send({ text: "Create a post with no title" });

      await chat.waitForAnswer({ outcome: "succeeded" });
      await expect(chat.ui.assistantMessages.last().locator(".jini-message-content")).toHaveText("That did not work; the title is missing.", { useInnerText: true, timeout: 30_000 });
      const calls = fake.generationRequests();
      expect(calls).toHaveLength(2);
      const [result] = toolResultsIn("anthropic", calls[1]!).filter((r) => r.toolUseId === toolUseId);
      expect(result?.isError, "the refusal must reach the model as an error result").toBe(true);
      expect(result!.content).toMatch(/title/i);
      expect(await postCount(page), "a refused create must not write a row").toBe(before);
    } finally {
      await restoreLocalCli(page).finally(() => fake.close());
    }
  });

  test("double-clicking Send runs one turn and creates one post", { tag: ["@unrun"] }, async ({ page }) => {
    const fake = CODEX_JOURNEY ? undefined : await startFakeModelServer("anthropic");
    const title = uniq("Agent double");
    const toolUseId = "toolu_journey_double_1";
    if (fake) createPostScript(fake, title, toolUseId);
    try {
      if (fake) await configureByok(page, fake);
      const chat = createAdminChatDriver({ page }, { answerTimeoutMs: CODEX_JOURNEY ? LIVE_ANSWER_TIMEOUT_MS : 30_000 });
      // A fresh load remounts `AssistantDock`, whose `useExecutionConfig` reads the ledger just written.
      await chat.open({ navigate: true });
      await chat.newConversation();
      await chat.send({ text: createPrompt(title) }, { doubleClick: true });
      await chat.waitForAnswer({ outcome: "succeeded" });
      const reply = chat.ui.assistantMessages.last().locator(".jini-message-content").last();
      await expect(reply, "An assistant reply appears").toHaveText(/\S/);
      if (fake) await expect(reply).toHaveText(`Done: the draft "${title}" exists.`, { timeout: 30_000 });
      await expect(chat.ui.errors).toHaveCount(0);
      // A second turn would hit the empty queue (500) and show an error, and a second create would
      // show up as a second row.
      if (fake) expect(fake.generationRequests()).toHaveLength(2);
      await expect(chat.ui.messageErrors).toHaveCount(0);
      expect(await postsTitled(page, title)).toHaveLength(1);
    } finally {
      if (fake) await restoreLocalCli(page).finally(() => fake.close());
    }
  });
});
