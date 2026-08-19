import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD, loginAsAdmin } from "./auth-fixtures.js";
import { waitForAgentDaemon } from "./daemon-ready.js";

/**
 * @file The first fully automated, click-through proof that a real publish to GitHub Pages can
 * succeed through the Tovu assistant (dispatch: "Live publish end-to-end test", 2026-08-16).
 *
 * Everything before this file drove the flow by hand: `live-publish-driver.mjs` was a one-shot
 * fire-and-forget script; `live-publish-verify-launch.mjs`/`live-publish-verify-poll.mjs` were an
 * interactive multi-script session (see `ADS-memory/reports/verification/
 * 2026-08-16-live-publish-through-assistant.md`). That session got as far as a correctly-rendered
 * confirmation dialog showing `leonaburime-ucla/tovu-demo` and then stopped — the click was never
 * made, so no publish has ever actually completed through the assistant. This spec is that click,
 * saved as a real, rerunnable Playwright test rather than a one-off session.
 *
 * ## What is genuinely real here, and what is test setup standing in for a missing UI control
 *
 * Real: the browser, the login, the chat turn, the spawned `claude` CLI, the MCP-UI iframe, the click
 * on it, the GitHub push, the live URL fetch. Standing in for a UI control that does not exist yet:
 * `healGitHubAccountLabel` below calls `POST .../credentials/:id/verify` directly — the same
 * human-gated backend route a "Verify" button in `StaticSiteTab.tsx` would call, except that button
 * does not exist (tracked separately, `deployment-static-site-verify-gap.spec.ts`, NOT this file's job
 * to fix or duplicate). Calling the route directly through an authenticated `page.request` is the same
 * class of action the admin UI's own credential-save flow already makes automatically
 * (`verifyAfterSave` in `publish-credentials.ts`) — not a backdoor, just the one piece a human would
 * need a button for that this suite reaches directly instead.
 *
 * ## Why this seeds from a snapshot of the real `infra/content.db` (see the config's own header)
 *
 * The only working GitHub Pages token in this install lives in the live DB, with no env-var fallback.
 * `playwright.live-publish-e2e.config.ts` takes a `.backup`-consistent snapshot of it into an isolated
 * temp file before this suite's own dedicated server ever starts, so this test never opens the live
 * file the running dev server also has open.
 *
 * ## What this deliberately does NOT do
 *
 * Retry a failed publish. A real publish is not idempotent-safe to blindly retry (it pushes to a real
 * public repo), and `playwright.live-publish-e2e.config.ts` sets `retries: 0` for exactly that reason.
 * If this test fails, that is the finding — see the QA/E2E persona's own truthfulness mandate.
 */

const WORKSPACE_ID = "workspace-local";
const CREDENTIALS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/system/publish/credentials`;
const EXPECTED_REPO = "tovu-demo";
/** The original bug's invented owner — verified NOT to appear anywhere in this run except as a
 *  substring of the correct `leonaburime-ucla`. Matches a bare `leonaburime` NOT immediately followed
 *  by `-ucla`, so it never false-positives on the correct account name. */
const WRONG_OWNER_PATTERN = /\bleonaburime\b(?!-ucla)/i;

interface CredentialSummary {
  id: string;
  providerId: string;
  isDefault: boolean;
  accountLabel: string | null;
}

/**
 * Heals the snapshot's `github-pages` credential's `account_label` column by calling the same
 * human-gated verify route a "Verify" button would (see this file's header). Asserts the token is
 * genuinely valid against the REAL GitHub API and returns the real, resolved account login — the
 * ground truth this test's "does the assistant resolve the correct account" assertions are checked
 * against.
 */
async function healGitHubAccountLabel(page: Page): Promise<string> {
  const credsRes = await page.request.get(CREDENTIALS_PATH);
  expect(credsRes.ok(), `listing publish credentials failed: ${credsRes.status()} ${await credsRes.text()}`).toBe(true);
  const { credentials } = (await credsRes.json()) as { credentials: CredentialSummary[] };
  const ghRow = credentials.find((c) => c.providerId === "github-pages" && c.isDefault);
  expect(ghRow, `expected a default github-pages credential in the snapshot DB; got: ${JSON.stringify(credentials)}`).toBeTruthy();

  const verifyRes = await page.request.post(`${CREDENTIALS_PATH}/${ghRow!.id}/verify`);
  expect(verifyRes.ok(), `verify route failed: ${verifyRes.status()} ${await verifyRes.text()}`).toBe(true);
  const { verification } = (await verifyRes.json()) as { verification?: { status: string; accountLabel?: string; message: string } };
  expect(
    verification?.status,
    `the real GitHub token must still verify as valid for this run to mean anything — got: ${JSON.stringify(verification)}`
  ).toBe("valid");
  expect(verification?.accountLabel, "verify succeeded but returned no accountLabel").toBeTruthy();
  return verification!.accountLabel!;
}

async function openAssistantDock(page: Page): Promise<void> {
  const dock = page.locator(".admin-chat-dock");
  if (await dock.evaluate((el) => !el.hasAttribute("hidden"))) return;
  await page.locator("button.chat-fab").click();
  await expect(dock).not.toHaveAttribute("hidden", "");
}

async function sendAssistantMessage(page: Page, text: string): Promise<void> {
  const composer = page.getByPlaceholder(/ask the assistant to do something/i);
  await composer.waitFor({ state: "visible", timeout: 10_000 });
  await composer.fill(text);
  await composer.press("Enter");
}

/** Same debug transcript mirror `destructive-path.spec.ts` reads (`AssistantDock.tsx`'s
 *  `window.__tovuAssistantMessages`) — the actual persisted `ChatMessage[]`, not scraped DOM prose. */
async function readTranscript(page: Page): Promise<Array<{ role: string; content: string; runStatus?: string }>> {
  return page.evaluate(() => (window as unknown as { __tovuAssistantMessages?: Array<{ role: string; content: string; runStatus?: string }> }).__tovuAssistantMessages ?? []);
}

async function waitForTurnToFinish(page: Page, opts: { timeoutMs: number; pollMs?: number }): Promise<void> {
  const terminal = new Set(["succeeded", "failed", "canceled"]);
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const transcript = await readTranscript(page);
    const last = transcript.at(-1);
    if (last && last.role === "assistant" && terminal.has(last.runStatus ?? "")) return;
    await page.waitForTimeout(opts.pollMs ?? 2_000);
  }
  throw new Error(`assistant turn did not reach a terminal status within ${opts.timeoutMs}ms`);
}

/** The publish confirmation/outcome surface is keyed by `ui://tovu/deployment-execute-static-publish/
 *  <exchangeId>` (`publish-agent-tools.ts`'s `publishConfirmationUri`) — the SAME uri for both the
 *  confirmation and, after a confirm click, the outcome that replaces it in place
 *  (`buildPublishOutcomeResource` deliberately reuses it). Matching on that prefix, not a generic
 *  `iframe` selector, fails loudly if some other surface renders first instead of silently reading the
 *  wrong dialog. */
function publishSurfaceFrame(page: Page) {
  return page.frameLocator('iframe[title^="ui://tovu/deployment-execute-static-publish/"]');
}

test.describe("live-publish-e2e: a real, click-through GitHub Pages publish through the assistant", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAgentDaemon();
    await loginAsAdmin(page);
  });

  test("resolves the correct account, does not fall back to guessing/prompting, publishes for real, reports the truth, and is recorded", async ({ page, request, baseURL }) => {
    test.setTimeout(600_000);

    // --- Setup: heal the snapshot's credential (see this file's header for why this stands in for a
    // missing "Verify" click) and capture the REAL, ground-truth account login before the assistant
    // ever runs. Everything downstream is checked against this, not against what the test itself typed
    // anywhere. ---
    const realAccountLabel = await healGitHubAccountLabel(page);
    expect(realAccountLabel, "sanity: the credential this run resolved to must be the real leonaburime-ucla account, not the original bug's invented one").toBe("leonaburime-ucla");

    // --- Turn 1: ask for a publish WITHOUT naming an owner anywhere. If the assistant ends up
    // publishing to the right account, that resolution has to have come from the verified credential,
    // not from this prompt. ---
    await openAssistantDock(page);
    await sendAssistantMessage(
      page,
      `Please publish this site to GitHub Pages. Use "${EXPECTED_REPO}" as the repository name. Check readiness first, ` +
        `then go ahead and publish — use whichever GitHub account the saved, verified credential belongs to.`
    );

    // The assistant may either raise the confirmation dialog directly, or first ask a clarifying
    // question (its own tool description explicitly tells it to "still confirm the owner with the
    // human before publishing rather than assuming it silently" even when accountLabel is known). Loop
    // a bounded number of exchanges, collecting every assistant message seen along the way — that
    // collection is what assertion 2 (no wrong-username fallback) is checked against.
    const seenAssistantText: string[] = [];
    const dialog = publishSurfaceFrame(page);
    let dialogAppeared = false;
    const MAX_ROUNDS = 3;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      dialogAppeared = await dialog
        .locator('[data-mcpui-action="confirm"]')
        .waitFor({ state: "visible", timeout: round === 0 ? 240_000 : 90_000 })
        .then(() => true)
        .catch(() => false);
      if (dialogAppeared) break;

      // No dialog yet — the turn must have finished with a question instead. Read it, then answer it
      // WITHOUT ever supplying an owner ourselves, so the assistant's own resolution stays the only
      // source of the account name.
      await waitForTurnToFinish(page, { timeoutMs: 60_000 }).catch(() => undefined);
      const transcript = await readTranscript(page);
      const last = transcript.at(-1);
      if (last?.role === "assistant" && last.content) seenAssistantText.push(last.content);
      if (round < MAX_ROUNDS - 1) {
        await sendAssistantMessage(page, "Yes — go ahead and publish, using whichever GitHub account the saved credential verified against.");
      }
    }
    // Whatever the dialog itself said just before/as it appeared is also in-scope for the fallback
    // check below.
    const transcriptAtDialog = await readTranscript(page);
    const lastBeforeDialog = transcriptAtDialog.at(-1);
    if (lastBeforeDialog?.role === "assistant" && lastBeforeDialog.content) seenAssistantText.push(lastBeforeDialog.content);

    expect(
      dialogAppeared,
      `publish confirmation dialog never appeared after ${MAX_ROUNDS} exchange(s). Assistant said: ${JSON.stringify(seenAssistantText)}`
    ).toBe(true);

    // --- Assertion 2: the old wrong-username fallback ("Type it, e.g. leonaburime") must not fire
    // anywhere in the conversation. ---
    for (const text of seenAssistantText) {
      expect(
        text,
        `assistant text must never suggest the original wrong username "leonaburime" (bare, without ` +
          `-ucla) as an example or otherwise — found it in: ${JSON.stringify(text)}`
      ).not.toMatch(WRONG_OWNER_PATTERN);
    }

    // --- Assertion 1: the RENDERED confirmation dialog names the real account, not the invented one.
    // ---
    const dialogText = (await dialog.locator("body").innerText().catch(() => "")) || "";
    expect(dialogText, "confirmation dialog must show the real resolved owner/repo").toContain(`${realAccountLabel}/${EXPECTED_REPO}`);
    expect(dialogText, "confirmation dialog must never show the original wrong owner").not.toMatch(WRONG_OWNER_PATTERN);

    // --- The click. Real, irreversible, owner-authorized (see this file's header + the dispatch
    // brief). Scrolled into view first — a known, separately-tracked MCP-UI layout defect clips this
    // control off-screen at some viewports/content lengths (project memory:
    // "MCP-UI dialog clipped its own buttons" — a scroll-anchor issue, not fixed here, this is only a
    // test-side workaround so the click itself can land). ---
    const confirmButton = dialog.locator('[data-mcpui-action="confirm"]');
    await confirmButton.scrollIntoViewIfNeeded().catch(() => undefined);
    await confirmButton.click();

    // --- Assertion 3 + 4: the SAME surface (same `ui://` uri) replaces the confirmation with a real
    // outcome once the publish actually finishes server-side — never staying on a generic "Done.". A
    // real GitHub Pages push (export + git commit + push) takes real time; this waits, it does not
    // sleep a fixed amount. ---
    await expect
      .poll(async () => (await dialog.locator("body").innerText().catch(() => "")) || "", {
        message: "the publish outcome surface must eventually replace the confirmation dialog",
        timeout: 300_000,
        intervals: [3_000],
      })
      .toMatch(/Published|Publish failed|Uploaded, not live yet/);

    const outcomeText = (await dialog.locator("body").innerText().catch(() => "")) || "";
    expect(outcomeText.trim(), "the outcome surface must never be the old generic placeholder").not.toBe("Done.");

    const urlMatch = outcomeText.match(/https:\/\/[^\s"'<]+/);
    const publishedUrl = urlMatch?.[0];

    // This is the actual verdict of the run. Reported honestly either way — a failure here is a real,
    // valuable finding, not something to retry into looking better (config sets `retries: 0`).
    const outcomeSucceeded = /^Published\b/.test(outcomeText.trim()) || /\bPublished\b/.test(outcomeText);
    test.info().annotations.push({ type: "publish-outcome", description: outcomeText.slice(0, 2000) });

    // --- Assertion 5: the assistant's OWN chat message, once the parked turn resumes, must report the
    // same truth the outcome surface just showed — success as success, failure as failure. ---
    await waitForTurnToFinish(page, { timeoutMs: 240_000 });
    const finalTranscript = await readTranscript(page);
    const finalReply = finalTranscript.at(-1);
    expect(finalReply?.role).toBe("assistant");
    if (outcomeSucceeded) {
      expect(finalReply?.content.toLowerCase(), `chat must truthfully report success — outcome surface said: ${JSON.stringify(outcomeText)}, chat said: ${JSON.stringify(finalReply?.content)}`).toMatch(
        /publish|live|success/i
      );
      expect(finalReply?.content, "chat report must never claim a bare 'Done.' once the real outcome tool wired up (0f9bef4b)").not.toBe("Done.");
    } else {
      expect(finalReply?.content.toLowerCase(), `chat must truthfully report the failure it actually hit — outcome surface said: ${JSON.stringify(outcomeText)}`).toMatch(/fail|error|could not|couldn.t|problem/i);
    }

    if (!outcomeSucceeded) {
      // Everything below (DB row, live URL) only makes sense for a successful publish. Fail here with
      // the full outcome text as the diagnostic, rather than let later assertions produce a confusing
      // secondary failure.
      throw new Error(`live publish did not succeed — reporting as a real, valid test result, not retrying. Outcome surface: ${JSON.stringify(outcomeText)}`);
    }

    expect(publishedUrl, `expected a URL in the success outcome text: ${JSON.stringify(outcomeText)}`).toBeTruthy();
    expect(publishedUrl, "published URL must point at the real account, not the invented one").toContain(`${realAccountLabel}.github.io`);

    // --- Assertion 6: a publish_history row landed, triggered by the agent tool, with a real commit
    // sha — queried directly against this run's own isolated DB snapshot (no route exposes
    // triggeredBy/commitSha to the admin API; see this file's header). ---
    const dbPath = process.env.E2E_LIVE_PUBLISH_CONTENT_DB;
    expect(dbPath, "config must publish E2E_LIVE_PUBLISH_CONTENT_DB").toBeTruthy();
    const raw = execFileSync("sqlite3", ["-json", dbPath!, "SELECT triggered_by, commit_sha, url, published_at FROM publish_history WHERE target='github-pages' ORDER BY id DESC LIMIT 1;"]).toString();
    const rows = JSON.parse(raw || "[]") as Array<{ triggered_by: string; commit_sha: string | null; url: string; published_at: string }>;
    expect(rows.length, "expected a publish_history row after a successful publish").toBeGreaterThan(0);
    const row = rows[0]!;
    expect(row.triggered_by, "publish_history row must be attributed to the agent tool, not the admin UI").toBe("agent_tool");
    expect(row.commit_sha, `publish_history row must carry a real commit sha; got: ${JSON.stringify(row)}`).toBeTruthy();
    expect(row.commit_sha!.length, "commit sha must look like a real git sha, not a placeholder").toBeGreaterThanOrEqual(7);

    // --- Assertion 7: the published URL is actually live. Polled, not a single shot — GitHub Pages'
    // own CDN can lag a published push by a few seconds even after the server's own reachability check
    // passed. ---
    await expect
      .poll(async () => (await request.get(publishedUrl!)).status(), {
        message: `published URL ${publishedUrl} must return 200`,
        timeout: 60_000,
        intervals: [3_000],
      })
      .toBe(200);
  });
});
