// @unrun: Todo 18, edit-only dispatch; no tests, servers or Playwright were run.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { test as base, expect, type Page } from "../support/bug-pin-fixtures.js";
import { waitForAgentDaemon } from "../support/bug-pin-daemon.js";
import { createAdminChatDriver } from "../support/admin-chat-driver.js";
import { createCredentialLeakAudit, type CredentialLeakAudit } from "../support/credential-card-leak-audit.js";
import { buildCustomCredentialAad } from "../../../apps/website/src/features/custom-credentials/aad.js";
import { FixedSiteKeyKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";

/** PLAN.md's 2026-10-07 localhost journey (steps 1–6), using the existing pin-site owner.
 * No browser routes, SSE, tools, sealing or chat persistence are mocked. @real-service selects
 * the harness's authenticated Claude Local CLI; @isolated-site prevents unsafe warm resets.
 * No vendor call or test-connection claim: the recorded Mailchimp journey saves, then cancels
 * a second card. Real vendor reuse remains the separate integration journey in PLAN.md.
 *
 * Mutation/oracle review (testing-mistakes): plaintext save fails exact open + binary scan
 * (F1.2/F6.3); an echo to the model fails SSE/CLI scans (F3.4); disabling redaction fails the
 * exact persisted-user assertion; clearing evidence before scanning fails positive controls
 * (F5.2/F5.4/F5.6). Canary values are generated in memory and never attached or printed.
 */
const WS = "workspace-local";
const CREDENTIALS = `/api/admin/v1/workspaces/${WS}/system/custom/credentials`;
const CHAT_API = "/api/assistant/chats";

// The real-service project also disables these worker-scoped capture options. Recording fill/
// paste arguments would create a test-owned leak, even when the product keeps its boundary.
base.use({ trace: "off", screenshot: "off", video: "off" });

const test = base.extend<{}, { credentialAuditFinalizers: Array<() => Promise<void>> }>({
  credentialAuditFinalizers: [async ({}, use) => {
    const finalizers: Array<() => Promise<void>> = [];
    try { await use(finalizers); }
    finally {
      // Worker teardown follows journeySite teardown: its stdout/stderr attachment now exists
      // and its complete owned process tree has stopped. This is not a second server harness.
      const results = await Promise.allSettled(finalizers.map(finalize => finalize()));
      if (results.some(result => result.status === "rejected")) {
        throw new Error("Credential canary scan or owned CLI artifact cleanup failed; inspect the journey assertion");
      }
    }
  }, { scope: "worker", timeout: 180_000 }],
});

interface CredentialRow {
  id: string; label: string; sealed_key_id: string; sealed_ciphertext: string;
  sealed_nonce: string; sealed_alg: "aes-256-gcm";
}
function credentialRows({ contentDb }: { contentDb: string }, _options = {}): CredentialRow[] {
  const db = new Database(contentDb, { fileMustExist: true });
  try { return db.prepare("SELECT * FROM custom_credential_sets WHERE workspace_id = ?").all(WS) as CredentialRow[]; }
  finally { db.close(); }
}
async function persistedTranscript(
  { page, audit, conversationId }: { page: Page; audit: CredentialLeakAudit; conversationId: string }, _options = {},
): Promise<Array<{ role: string; content: string }>> {
  const response = await page.request.get(`${CHAT_API}/${encodeURIComponent(conversationId)}/messages`);
  await audit.scanApiResponse({ response });
  expect(response.ok(), "read the real persisted conversation").toBe(true);
  return (await response.json() as { messages: Array<{ role: string; content: string }> }).messages;
}

test.describe("Bug pin: localhost credential-card safety", { tag: ["@real-service", "@isolated-site", "@unrun"] }, () => {
  test.describe.configure({ timeout: 600_000 });

  test("save a masked Mailchimp canary, redact a pasted Stripe canary, cancel, and prove zero leaked bytes", async ({
    page, context, journeySite: site, credentialAuditFinalizers,
  }, testInfo) => {
    expect(site.database).toBe("sqlite");
    expect(site.runtime).toBe("local-cli");
    expect(new URL(site.adminURL).hostname).toBe("127.0.0.1");
    expect(new URL(site.apiURL).hostname).toBe("127.0.0.1");
    const contentDb = path.join(site.siteDir, "content.db");
    const chatDb = path.join(site.siteDir, "chat.db");
    const savedCanary = `${randomBytes(16).toString("hex")}-us21`; // same 37 chars/tail as PLAN
    const pastedCanary = `sk_live_${randomBytes(24).toString("hex")}`;
    const audit: CredentialLeakAudit = await createCredentialLeakAudit({ page, testInfo, canaries: [savedCanary, pastedCanary] });
    credentialAuditFinalizers.push(() => audit.finishAfterSiteCleanup({ siteDir: site.siteDir }));
    const baselineIds = new Set(credentialRows({ contentDb }).map(row => row.id));
    const chat = createAdminChatDriver({ page }, { answerTimeoutMs: 180_000 });
    let conversationId: string | undefined;

    try {
      await waitForAgentDaemon();
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: site.adminURL });
      await chat.open({ navigate: true });
      conversationId = await chat.newConversation();
      await chat.send({ text: "Help me save my Mailchimp API key" }, { submission: "enter" });
      const card = page.frameLocator('[data-mcpui-host][aria-label^="ui://tovu/custom-credential-create/"] iframe');
      await expect(card.getByRole("heading", { name: "Save a new custom credential" })).toBeVisible({ timeout: 180_000 });
      await expect(card.getByLabel("Label", { exact: true })).toHaveValue("mailchimp");
      await expect(chat.ui.userMessages).toHaveCount(1); // card on FIRST turn, no prompt repair
      const token = card.getByLabel("Token", { exact: true });
      await expect(token).toHaveAttribute("type", "password");
      // A native clipboard paste, rather than a synthetic card response or API-seeded token.
      await page.evaluate(value => navigator.clipboard.writeText(value), savedCanary);
      await token.focus();
      await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
      expect(await token.inputValue() === savedCanary, "the complete canary reached the masked field").toBe(true);
      const redemption = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/v1/mcp-ui/tool-calls"
        && response.request().method() === "POST");
      await card.getByRole("button", { name: "Save credential", exact: true }).click();
      expect((await redemption).ok(), "the real secure-card submission was accepted").toBe(true);
      await expect(card.getByRole("heading", { name: "Credential saved", exact: true })).toBeVisible({ timeout: 180_000 });
      await expect(card.locator("body")).toContainText("37 chars");
      await expect(card.locator("body")).toContainText("us21");
      await expect(card.locator("body")).toContainText("Saved, not tested.");
      await chat.waitForAnswer({ outcome: "succeeded" });
      await page.evaluate(() => navigator.clipboard.writeText(""));

      const savedRows = credentialRows({ contentDb }).filter(row => !baselineIds.has(row.id));
      expect(savedRows, "exactly one new persisted credential").toHaveLength(1);
      const row = savedRows[0]!;
      expect(row.label).toBe("mailchimp");
      expect(row.sealed_alg).toBe("aes-256-gcm");
      const manifest = JSON.parse(await readFile(site.manifestPath, "utf8")) as { env: { TOVU_SITE_KEY: string } };
      const sealer = new AesGcmSecretSealer(new FixedSiteKeyKeyring(manifest.env.TOVU_SITE_KEY, row.sealed_key_id));
      const opened = JSON.parse(await sealer.open({ sealed: {
        keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg,
      } }, { aad: buildCustomCredentialAad({ workspaceId: WS, id: row.id }) })) as { token: string };
      // Compare booleans so failure diagnostics never print either plaintext operand.
      expect(Buffer.from(opened.token).equals(Buffer.from(savedCanary)), "saved secret opens byte-for-byte").toBe(true);
      const listing = await page.request.get(CREDENTIALS);
      await audit.scanApiResponse({ response: listing });
      expect(listing.ok()).toBe(true);
      const summary = (await listing.json() as { credentials: Array<{ id: string; configured: boolean }> }).credentials.find(value => value.id === row.id);
      expect(summary?.configured).toBe(true);
      audit.scan({ source: "persisted first-turn transcript", bytes: JSON.stringify(await persistedTranscript({ page, audit, conversationId })) });
      await audit.browserSnapshot();
      await audit.scanTree({ dir: site.runtimeDir }); // BEFORE any row/chat cleanup (F5.4)

      await page.evaluate(value => navigator.clipboard.writeText(value), `Help me save my Stripe API key ${pastedCanary}`);
      await chat.ui.composer.focus();
      await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
      await chat.send({}, { submission: "enter" });
      await page.evaluate(() => navigator.clipboard.writeText(""));
      await expect(chat.ui.root).toContainText("If it was real, rotate it.");
      await expect(chat.ui.userMessages.last()).toContainText("Help me save my Stripe API key [token removed]");
      // The completed Mailchimp card remains in its first answer. Scope the next card to the
      // new answer bubble, rather than matching both historical and pending card iframes.
      const pendingStripe = chat.ui.assistantMessages.last()
        .frameLocator('[data-mcpui-host][aria-label^="ui://tovu/custom-credential-create/"] iframe');
      await expect(pendingStripe.getByLabel("Label", { exact: true })).toHaveValue("stripe", { timeout: 180_000 });
      await expect(pendingStripe.getByLabel("Base URL", { exact: true })).toHaveValue("https://api.stripe.com");
      await expect(pendingStripe.getByLabel("Token", { exact: true })).toHaveAttribute("type", "password");
      await pendingStripe.getByRole("button", { name: "Cancel", exact: true }).click();
      const answer = await chat.waitForAnswer({ outcome: "succeeded" });
      expect(answer.content).toMatch(/cancel/i);
      expect(answer.content).toMatch(/removed|redact/i);
      expect(credentialRows({ contentDb }).filter(value => !baselineIds.has(value.id)).map(value => value.id)).toEqual([row.id]);
      const persisted = await persistedTranscript({ page, audit, conversationId });
      expect(persisted.filter(message => message.role === "user").map(message => message.content)).toEqual([
        "Help me save my Mailchimp API key", "Help me save my Stripe API key [token removed]",
      ]);
      audit.scan({ source: "persisted redaction transcript", bytes: JSON.stringify(persisted) });
      audit.scan({ source: "rendered transcript", bytes: JSON.stringify(await chat.transcript()) });
      await audit.browserSnapshot();
      await expect(chat.ui.messageErrors).toHaveCount(0);
    } finally {
      // Scan even on failure, before deletion can erase the evidence. Harness teardown still
      // deletes the ENTIRE isolated site/snapshots and stops every owned process if these fail.
      try {
        await audit.scanDatabase({ file: contentDb });
        await audit.scanDatabase({ file: chatDb });
        await audit.scanTree({ dir: site.runtimeDir });
        expect(audit.scannedFiles.has(contentDb), "content.db raw bytes scanned").toBe(true);
        expect(audit.scannedFiles.has(chatDb), "chat.db raw bytes scanned").toBe(true);
        expect([...audit.scannedFiles].some(file => /\.db-wal$/.test(file)), "live WAL evidence scanned").toBe(true);
        await audit.assertClean();
      } finally {
        try {
          for (const row of credentialRows({ contentDb }).filter(value => !baselineIds.has(value.id))) {
            const removed = await page.request.delete(`${CREDENTIALS}/${encodeURIComponent(row.id)}`);
            await audit.scanApiResponse({ response: removed });
            expect(removed.status(), "delete this test's credential").toBe(204);
          }
          expect(credentialRows({ contentDb }).filter(value => !baselineIds.has(value.id))).toEqual([]);
          if (conversationId) {
            const removed = await page.request.delete(`${CHAT_API}/${encodeURIComponent(conversationId)}`);
            await audit.scanApiResponse({ response: removed });
            expect(removed.status(), "delete this test's chat").toBe(204);
            const chats = await page.request.get(CHAT_API);
            await audit.scanApiResponse({ response: chats });
            expect(chats.ok()).toBe(true);
            expect((await chats.json() as { conversations: Array<{ id: string }> }).conversations.some(value => value.id === conversationId)).toBe(false);
          }
          await page.evaluate(() => navigator.clipboard.writeText(""));
        } finally {
          try { await audit.detach(); }
          finally { await page.close(); }
        }
      }
    }
  });
});
