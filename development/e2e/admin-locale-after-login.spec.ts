import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Regression cover for "I changed the admin language and nothing happened" — reported
 * 2026-08-09 after asking the admin assistant to "change the language to portuguese", traced to a
 * read-side race that had nothing to do with the assistant.
 *
 * ## The bug
 *
 * `App.tsx` calls `useAdminLocale()` unconditionally, but only returns `<Login>` further down, so
 * the hook mounts while the login screen is still showing. Its one-shot fetch of
 * `core.language.locale` therefore resolves against a `401` (no session yet), and the hook
 * swallows a failed fetch to `DEFAULT_LOCALE` by design — a screen mounted without a stubbed
 * settings endpoint should degrade to English, not break. The effect's dependency list is empty,
 * and nothing in it changes at login, so it never retried: the sidebar stayed English for the rest
 * of the session no matter what the ledger said.
 *
 * That made a stored preference look like it had been ignored, which is what the assistant report
 * actually was. The assistant's own write was never the problem — `settings_set_ui_preference`
 * lands on the same `core.language.locale` row this test writes, so §1 covers that path's
 * UI-reflection half without needing a live LLM in the loop.
 *
 * ## Why a fresh browser context is load-bearing in §1
 *
 * The race only exists on the interactive-login path. A reload that already carries a
 * `tovu_session` cookie authenticates the mount-time fetch, so it returns the stored locale and
 * the bug is invisible — which is exactly why this survived manual testing. §1 must therefore
 * arrive with no cookie and go through the real form.
 *
 * §2 covers the other half (a write that lands mid-session, from another process — the shape an
 * agent-daemon write actually has) so a future fix to §1 cannot be made by breaking the change
 * feed that §2 depends on.
 */

const WORKSPACE_ID = "workspace-local";
const SETTINGS_VALUE_URL = `/api/admin/v1/workspaces/${WORKSPACE_ID}/settings/value`;

/** `Overview`'s pt-BR nav translation (`apps/admin/src/lib/admin-nav-i18n.ts`). Asserting a
 *  rendered STRING rather than the fetched setting is the point: the ledger already held the right
 *  value while the UI showed English. */
const PT_BR_OVERVIEW = "Visão geral";
const EN_OVERVIEW = "Overview";

/** Writes `core.language.locale` through the same authorized route the admin UI itself uses.
 *  `credentials: "same-origin"` picks up the real session cookie — not a backdoor. */
async function setLocale(page: Page, locale: string): Promise<void> {
  const status = await page.evaluate(
    async ({ url, locale }) => {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ namespace: "core.language", key: "locale", scope: "user", valueJson: locale }),
      });
      return res.status;
    },
    { url: SETTINGS_VALUE_URL, locale },
  );
  expect(status, `expected the settings write for '${locale}' to be accepted`).toBe(200);
}

/** The sidebar's first nav item, which is `Overview` in English and {@link PT_BR_OVERVIEW} in
 *  pt-BR. Scoped to `nav` so a page heading with the same text cannot satisfy it by accident. */
function overviewNavItem(page: Page) {
  return page.locator("nav").first().getByText(new RegExp(`^(${PT_BR_OVERVIEW}|${EN_OVERVIEW})$`));
}

test.describe("admin locale survives an interactive login", () => {
  test("a stored non-English locale renders in the sidebar on a fresh form login", async ({ page, browser }) => {
    // Arrange: store pt-BR as this operator's preference, in a session that is then discarded.
    await loginAsAdmin(page);
    await setLocale(page, "pt-BR");

    // Act: a genuinely fresh context — no `tovu_session` cookie — logging in through the real form.
    // This is the arrangement the bug needs; a reload with a cookie would pass either way.
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await loginAsAdmin(freshPage);

    // Assert: the sidebar reflects the stored preference, without a reload.
    await expect(overviewNavItem(freshPage)).toHaveText(PT_BR_OVERVIEW, { timeout: 15_000 });

    await freshContext.close();
  });

  test("a locale written mid-session by another process reaches an open tab", async ({ page, browser }) => {
    // Baseline the ledger to English and open a tab that has already rendered.
    await loginAsAdmin(page);
    await setLocale(page, "en");

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await loginAsAdmin(viewerPage);
    await expect(overviewNavItem(viewerPage)).toHaveText(EN_OVERVIEW, { timeout: 15_000 });

    // The agent-daemon shape: the write happens somewhere other than the tab that must reflect it.
    // `settings/events` polls the shared revision ledger, so the open tab learns about it without
    // any in-process coupling to the writer.
    await setLocale(page, "pt-BR");

    await expect(overviewNavItem(viewerPage)).toHaveText(PT_BR_OVERVIEW, { timeout: 20_000 });

    await viewerContext.close();
  });
});
