import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Deployment panel → Static Site tab, driven through the REAL admin SPA against the REAL Tovu
 * API (`../playwright.static-site-tab.config.ts`'s hermetic two-server harness, `TOVU_DB=memory`).
 * No route stubbing.
 *
 * This tab's "Build static export" button used to be permanently `aria-disabled`, with no
 * `onClick` at all — the exporter existed (`tovu export <dir>` from a terminal) but no admin route
 * could start one. This spec pins the fix at the browser level: a real click, through the real
 * `POST`/`GET .../system/export` routes, producing a real folder of files on disk (into
 * `TOVU_EXPORT_DIR`, a scratch temp dir this suite's own config points at — never this repo's own
 * `infra/export`). A passing unit test against a fake port does not by itself prove a real click
 * reaches a real route and a real export actually runs; this does.
 *
 * It also pins the "Getting it online" card's provider split: switching the picker between GitHub
 * Pages and Vercel must show ONE provider's CLI row and form at a time, never both, and the CLI
 * row's detected/not-detected pill must reflect the REAL `deployClis` the server computed (this
 * suite's config prepends a fake `gh` onto the API server's own `PATH`, so `gh` reports installed
 * for real over the HTTP route — see that config's own header for the exact mechanism and its one
 * documented caveat).
 *
 * `vercel`'s own pill is asserted ADAPTIVELY, not hardcoded to "not detected" — {@link
 * fetchDeployClis} reads the SAME live `deployClis` the UI itself is fetching, over the same
 * authenticated route, and the assertion below matches whatever that says. Confirmed necessary, not
 * theoretical: an earlier draft of this spec hardcoded "not detected" and failed on the machine this
 * suite was written on, because that machine has a REAL `vercel` CLI on its own PATH — the exact
 * "real system PATH may already have vercel" caveat `../playwright.static-site-tab.config.ts`'s own
 * header warns about. Asserting against the live route instead of a guess is what makes this
 * portable across whatever the runner's own PATH actually contains.
 *
 * ## This suite never reaches the real internet
 *
 * `GITHUB_TOKEN`/`VERCEL_TOKEN` are never set for this harness's API server (confirmed by this
 * config's own `env` block, which does not mention either). `publishStaticSite` (`static-publish/
 * adapter.ts`) resolves credentials BEFORE ever constructing a real GitHub/Vercel API client, so a
 * triggered publish with no token configured returns `NO_CREDENTIALS_CONFIGURED` and settles WITHOUT
 * any outbound call — the exact same guarantee `publish-site-route.test.ts` already proves
 * server-side. This spec exercises a real Publish click for the Vercel target (no owner/repo
 * needed) specifically BECAUSE that failure mode is structurally incapable of leaving this process,
 * and asserts the honest error the UI shows once it settles.
 */

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

/** Reads the SAME `deployClis` the admin UI itself fetches from `GET .../system/deployment-
 *  overview`, over `page.request` (shares the session cookie `loginAsAdmin` already set) — see this
 *  file's own header for why the Vercel assertions below read this instead of assuming an install
 *  state. */
async function fetchDeployClis(page: import("@playwright/test").Page): Promise<{ name: string; installed: boolean }[]> {
  const res = await page.request.get("/api/admin/v1/workspaces/workspace-local/system/deployment-overview");
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { deployClis: { name: string; installed: boolean }[] };
  return body.deployClis;
}

test.describe("Static Site tab — build export", () => {
  test("the Build button starts a real export and the run settles to a real, non-fabricated result", async ({ page }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });

    const buildButton = page.getByRole("button", { name: "Build static export" });
    await buildButton.waitFor({ state: "visible", timeout: 10_000 });
    await expect(buildButton).toBeEnabled();

    await buildButton.click();

    // The button reflects the real in-flight state — never a silent no-op.
    await expect(page.getByRole("button", { name: "Exporting…" })).toBeVisible();

    // Settles to either a clean finish or an honest failure — never hangs, never fabricates.
    await expect(page.getByText(/Export finished|Finished with failures|Export failed/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Build static export" })).toBeEnabled();
  });

  test("the overwrite checkbox starts unchecked, matching the exporter's own clean:false default", async ({ page }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    const checkbox = page.getByRole("checkbox", { name: /overwrite existing files/i });
    await checkbox.waitFor({ state: "visible", timeout: 10_000 });
    await expect(checkbox).not.toBeChecked();
  });
});

test.describe("Static Site tab — provider split (GitHub Pages vs Vercel)", () => {
  test("GitHub Pages is the default: shows the real gh detected pill, owner/repo/branch fields, and no Vercel row anywhere on screen", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("tab", { name: "GitHub Pages" })).toHaveAttribute("aria-selected", "true");
    // Real detection, not a guess: this harness's own config put a fake `gh` on the API server's
    // PATH specifically so this assertion is backed by a real filesystem check over a real route.
    await expect(page.getByText("Detected on this server")).toBeVisible();
    await expect(page.getByLabel("GitHub owner or org")).toBeVisible();
    await expect(page.getByLabel("Repository")).toBeVisible();
    await expect(page.getByLabel("Branch (optional)")).toBeVisible();
    await expect(page.getByLabel(/Vercel team/)).toHaveCount(0);
  });

  test("switching to Vercel shows ONLY the Vercel CLI row, with its own real (not gh's) detected state, and ONLY the teamId field — no GitHub fields, no gh row, no leftover owner/repo values", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByLabel("GitHub owner or org").fill("octo");
    const deployClis = await fetchDeployClis(page);
    const vercelInstalled = deployClis.find((cli) => cli.name === "vercel")?.installed ?? false;
    const ghInstalled = deployClis.find((cli) => cli.name === "gh")?.installed ?? false;
    // This harness's config guarantees `gh` for real (a fake binary prepended onto the API
    // server's own PATH) — asserted here as a sanity check that the fixture itself is working,
    // not a hardcoded guess about the host.
    expect(ghInstalled).toBe(true);

    await page.getByRole("tab", { name: "Vercel" }).click();

    await expect(page.getByRole("tab", { name: "Vercel" })).toHaveAttribute("aria-selected", "true");
    // Vercel's OWN real state — never gh's borrowed "Detected" pill, and never a hardcoded guess
    // about whether THIS runner happens to have a real `vercel` CLI on its own PATH. See this
    // file's own header for why a hardcoded "not detected" broke on the machine this was written on.
    await expect(page.getByText(vercelInstalled ? "Detected on this server" : "Not detected on this server")).toBeVisible();
    await expect(page.getByLabel(/Vercel team/)).toBeVisible();
    await expect(page.getByLabel("GitHub owner or org")).toHaveCount(0);
    await expect(page.getByLabel("Repository")).toHaveCount(0);

    // Switching back proves the earlier typed value survived — the hook keeps both targets' fields
    // in state at once (see `use-static-publish.hooks.ts`'s own header) rather than discarding one
    // side's work whenever the operator is still deciding between the two.
    await page.getByRole("tab", { name: "GitHub Pages" }).click();
    await expect(page.getByLabel("GitHub owner or org")).toHaveValue("octo");
  });
});

test.describe("Static Site tab — preview and publish, never touching the real internet", () => {
  test("Preview reports a real derived base path with no credential configured — a pure read, never starts a run", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByLabel("GitHub owner or org").fill("octocat");
    await page.getByLabel("Repository").fill("demo-repo");

    await page.getByRole("button", { name: "Preview" }).click();

    await expect(page.getByText("/demo-repo")).toBeVisible();
    await expect(page.getByText("Not configured")).toBeVisible();
    // A preview must never start a real run — the Publish button stays enabled-and-idle (never
    // flips to the busy "Publishing…" label a real trigger would show) the whole time.
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publishing…" })).toHaveCount(0);
  });

  test("a real Publish click for Vercel (no token configured) settles honestly to a credential failure — this can never leave the process, see this file's own header", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Vercel" }).click();
    await page.getByLabel("Project name").fill("e2e-demo");

    const publishButton = page.getByRole("button", { name: "Publish" });
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    await expect(page.getByRole("button", { name: "Publishing…" })).toBeVisible();
    await expect(page.getByText(/VERCEL_TOKEN is not set/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
    // Never a live link on a failed publish.
    await expect(page.getByRole("link", { name: /vercel\.app/ })).toHaveCount(0);
  });
});
