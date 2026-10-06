// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { Page } from "@playwright/test";

import { startFakeModelServer, toolResultsIn, type CapturedModelRequest, type FakeModelServer } from "../harness/fake-model-server.js";
import { expect, test, uniq, WS_API } from "./_fixtures.js";
import { createAdminChatDriver } from "../support/admin-chat-driver.js";

/**
 * W9 (SCOPE.md §2, layer 2): a REAL tool call through the admin dock. Unlike `assistant.journey.ts`,
 * nothing on the browser side is stubbed: the dock runs in "API · BYOK" mode against the Anthropic
 * protocol, the site server's BYOK route (`assistant-byok.ts`) calls the fake model server
 * (`harness/fake-model-server.ts`), and the fake model's scripted `tool_use` goes through the real
 * meta-tool surface (`execute_delegated_tool` -> `content_post_create`), the real command gateway
 * and the real DB. The journey then reads the row back through the admin API and the Posts screen.
 *
 * Setup is per test, through the admin API (no globalSetup change): the non-secret ledger keys in
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
const SETTINGS_URL = `${WS_API}/settings/value`;
const CREDENTIAL_URL = `${WS_API}/assistant/execution-credential`;

async function putLedger(page: Page, key: string, valueJson: unknown): Promise<void> {
  const res = await page.request.put(SETTINGS_URL, { data: { namespace: "core.execution", key, scope: "workspace", valueJson } });
  expect(res.status(), `core.execution.${key}: ${await res.text()}`).toBe(200);
}

async function configureByok(page: Page, fake: FakeModelServer): Promise<void> {
  await putLedger(page, "byok.protocol", "anthropic");
  await putLedger(page, "byok.providerId", "anthropic");
  await putLedger(page, "byok.baseUrl", fake.baseUrl);
  await putLedger(page, "byok.model", FAKE_MODEL);
  await putLedger(page, "mode", "byok");
  const saved = await page.request.put(CREDENTIAL_URL, {
    data: { apiKey: FAKE_KEY, protocol: "anthropic", providerId: "anthropic", baseUrl: fake.baseUrl, model: FAKE_MODEL },
  });
  expect(saved.status(), `credential save: ${await saved.text()}`).toBe(200);
  expect((await saved.json()).data.isSet).toBe(true);
}

async function restoreLocalCli(page: Page): Promise<void> {
  await putLedger(page, "mode", "local-cli");
  const cleared = await page.request.delete(CREDENTIAL_URL);
  expect(cleared.ok(), `credential delete: ${cleared.status()}`).toBe(true);
}

type PostRow = { id: string; title: string; status: string };
/** `GET .../posts` returns `{ posts: [{ post: … }] }` (`toAdminPostResponse` envelopes), not bare rows. */
type PostListResponse = { posts: Array<{ post: PostRow }> };

async function listPosts(page: Page): Promise<PostRow[]> {
  const res = await page.request.get(`${WS_API}/posts`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as PostListResponse).posts.map((envelope) => envelope.post);
}

async function postsTitled(page: Page, title: string): Promise<PostRow[]> {
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

test.describe("assistant real tool call (BYOK, fake model)", () => {
  test("a scripted tool_use creates a real draft post, visible in the API and on the Posts screen", { tag: ["@unrun"] }, async ({ page }) => {
    const fake = await startFakeModelServer("anthropic");
    const title = uniq("Agent draft");
    const toolUseId = "toolu_journey_create_1";
    createPostScript(fake, title, toolUseId);
    try {
      await configureByok(page, fake);
      const chat = createAdminChatDriver({ page });
      // A fresh load remounts `AssistantDock`, whose `useExecutionConfig` reads the ledger just written.
      await chat.open({ navigate: true });
      await chat.send({ text: `Create a draft post titled ${title}` });

      await expect(chat.ui.assistantMessages.last()).toContainText(`Done: the draft "${title}" exists.`, { timeout: 30_000 });
      await expect(chat.ui.messageErrors).toHaveCount(0);

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

      const rows = await postsTitled(page, title);
      expect(rows, "exactly one post row").toHaveLength(1);
      expect(rows[0]!.status).toBe("draft");
      expect(result!.content).toContain(rows[0]!.id);

      await page.goto("/admin/posts");
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    } finally {
      await restoreLocalCli(page).finally(() => fake.close());
    }
  });

  test("a tool call with invalid input is refused to the model, writes no row, and the turn still finishes", { tag: ["@unrun"] }, async ({ page }) => {
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
      const chat = createAdminChatDriver({ page });
      // A fresh load remounts `AssistantDock`, whose `useExecutionConfig` reads the ledger just written.
      await chat.open({ navigate: true });
      await chat.send({ text: "Create a post with no title" });

      await expect(chat.ui.assistantMessages.last()).toContainText("the title is missing", { timeout: 30_000 });
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
    const fake = await startFakeModelServer("anthropic");
    const title = uniq("Agent double");
    const toolUseId = "toolu_journey_double_1";
    createPostScript(fake, title, toolUseId);
    try {
      await configureByok(page, fake);
      const chat = createAdminChatDriver({ page });
      // A fresh load remounts `AssistantDock`, whose `useExecutionConfig` reads the ledger just written.
      await chat.open({ navigate: true });
      await chat.send({ text: `Create a draft post titled ${title}` }, { doubleClick: true });
      await expect(chat.ui.assistantMessages.last()).toContainText(`Done: the draft "${title}" exists.`, { timeout: 30_000 });
      // A second turn would hit the empty queue (500) and show an error, and a second create would
      // show up as a second row.
      expect(fake.generationRequests()).toHaveLength(2);
      await expect(chat.ui.messageErrors).toHaveCount(0);
      expect(await postsTitled(page, title)).toHaveLength(1);
    } finally {
      await restoreLocalCli(page).finally(() => fake.close());
    }
  });
});
