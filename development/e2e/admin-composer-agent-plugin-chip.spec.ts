import { test, expect, type Page, type Route } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Deterministic, self-asserting proof that "the operator pins the UI/UX Design Agent Plugin
 * from the composer's '+' menu -> its real ref reaches the agent" actually works end to end on the
 * CLIENT side, without ever depending on what a model replies.
 *
 * Split deliberately into two halves that meet in the middle (this dispatch's own design
 * guidance): this file is HALF 1, the browser half. HALF 2
 * (`src/server/agent-daemon/__tests__/plugin-prompt-prefix.unit.test.ts`) proves the SERVER half —
 * that a resolved `pluginRefIds` array really does get turned into the real installed SKILL.md
 * text and prepended onto the prompt. Together they prove the whole chain without a single
 * assertion on generated model output, which would be non-deterministic and worthless as a gate.
 *
 * Three deterministic claims, all client-observable, none of them "what did the agent say back":
 *
 * 1. Selecting "UI/UX Design (Agent Plugin)" from the "+" menu renders a removable chip
 *    (`.jini-attachment-chip`, `SelectedAgentPluginTray.tsx`) and does NOT type anything into the
 *    composer textarea — `resolveComposerDiscoveryOutcome` (`AssistantDock.hooks.tsx:884-887`)
 *    returns before ever touching the draft for a `pluginRefId` capability.
 * 2. Clicking the chip's × (`button[aria-label="Remove UI/UX Design (Agent Plugin)"]`) removes it.
 * 3. On send, the REAL outbound `POST /api/runs` body's `contextRef` (a JSON string,
 *    `assistant-transport.ts`'s `buildLocalCliContextRef`) contains `pluginRefIds: ["ui-ux-design"]`
 *    — intercepted via `page.route`, asserted directly against the parsed request body, never
 *    against a rendered reply.
 *
 * The `POST /api/runs` request is intercepted and fulfilled with a synthetic run id rather than
 * allowed to reach the real agent daemon: per this repo's own architecture (`ADR-049` — Tovu
 * launches real coding-agent CLI subprocesses, not an API), letting the request through would
 * spawn a real CLI process on whatever machine runs this suite, which is exactly the
 * non-deterministic dependency this split is designed to avoid. Capturing the request body BEFORE
 * fulfilling it proves the browser really sent the right payload, independent of whether a daemon
 * or CLI is even installed on the runner.
 */
async function openDock(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator("button.chat-fab").click();
  const dock = page.locator(".admin-chat-dock");
  await expect(dock).not.toHaveAttribute("hidden", "");
}

/** The row's visible LABEL — `SelectedAgentPluginTray`'s chip renders exactly this text, and its
 *  `Remove ${label}` aria-label is an exact match on it. The menu ROW itself is a different story
 *  (see {@link pinAgentPluginChip}'s own comment): its accessible NAME is not this string alone. */
const AGENT_PLUGIN_MENU_ITEM_NAME = "UI/UX Design (Agent Plugin)";
const AGENT_PLUGIN_REF_ID = "ui-ux-design";

async function openAddContextMenu(page: Page): Promise<void> {
  await page.locator('button[aria-label="Add context"]').click();
  await expect(page.locator(".jini-composer-discovery-menu")).toBeVisible();
}

async function pinAgentPluginChip(page: Page): Promise<void> {
  await openAddContextMenu(page);
  // NOT an exact-name match: `ComposerDiscoveryMenu.tsx` renders this row's description in a child
  // `<small aria-describedby=...>`, and because that text is a CHILD of the button (not merely
  // referenced from outside it), the accname algorithm folds it into the button's own accessible
  // NAME — confirmed live via this test's own first failed run, whose page snapshot showed the row's
  // real accessible name as "UI/UX Design (Agent Plugin) UI/UX Design Agent Plugin bundled with
  // Tovu — pins its skill as context for the agent", not the bare label. A substring match on the
  // label alone is still unambiguous: the sibling "UI/UX Design (Skill)" row's full name does not
  // contain this string.
  await page.getByRole("menuitem", { name: AGENT_PLUGIN_MENU_ITEM_NAME }).click();
}

/**
 * The OTHER selection path — typing `/` directly into the composer textarea — proven separately
 * from {@link pinAgentPluginChip}'s "+" menu because `Composer.tsx` resolves the two through
 * different functions that used to disagree: `selectPlusItem` guards on `item.insertText ? ... :
 * composer.draft` (falsy either way when `insertText` is absent, draft untouched), but
 * `selectSlashItem` calls `replaceComposerSlashTrigger(draft, match.item.insertText ??
 * match.item.label)` — an absent `insertText` fell back to `label`, typing the literal
 * "UI/UX Design (Agent Plugin)" string into the draft. This is the regression the "+" menu test
 * above never caught, because it never exercises this function.
 *
 * "design" is a safe filter word: while the command word is still being typed (no space yet),
 * `filterComposerDiscovery` fuzzy-matches every item's `label`/`description`/`kind`/`keywords`
 * (`composer-discovery.ts`'s `matchesFuzzyCommand`), and only two bundled items contain "design"
 * anywhere in that text — this row and the sibling "UI/UX Design (Skill)" row — so both surface
 * and the same unambiguous label substring `pinAgentPluginChip` already relies on disambiguates
 * them here too.
 */
async function pinAgentPluginChipViaSlash(page: Page): Promise<void> {
  const textarea = page.locator("textarea.jini-composer-input");
  await textarea.click();
  await textarea.pressSequentially("/design");
  await expect(page.locator("#jini-composer-slash-menu")).toBeVisible();
  await page.getByRole("option", { name: AGENT_PLUGIN_MENU_ITEM_NAME }).click();
}

test.describe("admin composer — Agent Plugin chip pin/remove/send wiring", () => {
  test("pinning the Agent Plugin row renders a removable chip and types nothing into the draft", async ({ page }) => {
    await openDock(page);
    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.waitFor({ state: "visible" });
    await expect(textarea).toHaveValue("");

    await pinAgentPluginChip(page);

    const chip = page.locator(".jini-attachment-chip", { hasText: AGENT_PLUGIN_MENU_ITEM_NAME });
    await expect(chip).toBeVisible();
    await expect(chip.locator(".jini-attachment-chip-name")).toHaveText(AGENT_PLUGIN_MENU_ITEM_NAME);

    // The load-bearing negative: the old behavior typed the label into the draft as inert text.
    // This is the regression this whole feature chain replaced — the chip must be the only effect.
    await expect(textarea).toHaveValue("");
  });

  test("the chip's remove button clears the pinned plugin ref", async ({ page }) => {
    await openDock(page);
    await pinAgentPluginChip(page);

    const chip = page.locator(".jini-attachment-chip", { hasText: AGENT_PLUGIN_MENU_ITEM_NAME });
    await expect(chip).toBeVisible();

    await page.getByRole("button", { name: `Remove ${AGENT_PLUGIN_MENU_ITEM_NAME}` }).click();

    await expect(chip).toHaveCount(0);
  });

  test("sending with the chip pinned puts pluginRefIds on the real outbound /api/runs request body", async ({ page }) => {
    await openDock(page);
    await pinAgentPluginChip(page);
    const chip = page.locator(".jini-attachment-chip", { hasText: AGENT_PLUGIN_MENU_ITEM_NAME });
    await expect(chip).toBeVisible();

    let capturedContextRef: Record<string, unknown> | null = null;
    let resolveCaptured!: () => void;
    const captured = new Promise<void>((resolve) => {
      resolveCaptured = resolve;
    });

    // Intercepts ONLY the exact `/api/runs` POST that starts a run — the trailing-segment routes
    // (`/api/runs/:id/events`, `/api/runs/:id/cancel`) do not match this glob (it requires the URL
    // to END at "/api/runs"), so this leaves this test's own SSE reattach path alone.
    await page.route("**/api/runs", async (route: Route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }
      const body = request.postDataJSON() as { contextRef: string; agentId?: string };
      capturedContextRef = JSON.parse(body.contextRef) as Record<string, unknown>;
      resolveCaptured();
      // Fulfilled with a synthetic run rather than let the real daemon start a real agent CLI
      // subprocess — see this file's own module doc for why.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ run: { id: "e2e-fake-run-id", state: "running" } }),
      });
    });

    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.click();
    await textarea.pressSequentially("does the pinned plugin ref reach the outbound request?");
    await page.locator('button[aria-label="Send"]').click();

    await captured;
    expect(capturedContextRef).not.toBeNull();
    expect((capturedContextRef as Record<string, unknown>)["pluginRefIds"]).toEqual([AGENT_PLUGIN_REF_ID]);
  });

  test("selecting the Agent Plugin row via the SLASH trigger pins the chip and leaves the draft empty", async ({
    page,
  }) => {
    await openDock(page);
    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.waitFor({ state: "visible" });
    await expect(textarea).toHaveValue("");

    await pinAgentPluginChipViaSlash(page);

    const chip = page.locator(".jini-attachment-chip", { hasText: AGENT_PLUGIN_MENU_ITEM_NAME });
    await expect(chip).toBeVisible();

    // The load-bearing regression assertion: `selectSlashItem` (Jini's `Composer.tsx`) falls back
    // to `match.item.label` when `insertText` is absent, so this specific path — untested by the
    // "+" menu tests above — is the one that actually typed "UI/UX Design (Agent Plugin)" into the
    // draft before this fix (`composer-capabilities.ts`'s `insertText: ""` on this row).
    await expect(textarea).toHaveValue("");
  });
});
