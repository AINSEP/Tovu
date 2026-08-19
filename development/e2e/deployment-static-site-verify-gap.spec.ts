import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Regression test for a gap found live during the A1 re-verification pass (2026-08-16, see
 * `ADS-memory/reports/verification/2026-08-16-live-publish-through-assistant.md`).
 *
 * The assistant's own capability tool (`deployment_get_static_publish_capabilities`,
 * `src/features/deployments/static-publish/verify.ts`) tells the model to default a GitHub Pages
 * publish's `owner` from the credential's verified `accountLabel` rather than guessing it — but
 * `accountLabel` only exists once a human (re-)verifies the saved token, and verification is a
 * CACHED, in-memory result (`InMemoryPublishCredentialVerificationCache`, `src/server/app.ts`,
 * `src/server/deps.ts`) that a server restart silently wipes even though the credential itself is
 * unchanged. When that happens live, the assistant tells the human: "Go to Deployment panel ->
 * Static Site -> Publish and hit verify on the GitHub token" — but grepping
 * `apps/admin/src/features/deployment/StaticSiteTab.tsx` for "verify" (any case) returns zero
 * matches. The backend route that would do this (`POST .../publish/credentials/:id/verify`,
 * `src/server/routes/admin/system/publish-credentials.ts:171`) exists and works — confirmed live via
 * a direct authenticated fetch, which returned a real `accountLabel` — but nothing in the admin
 * frontend ever calls it. A human following the assistant's own instructions has no button to find.
 *
 * Two tests: the first is the reproduction and is EXPECTED TO FAIL until a Verify control is wired
 * up in `StaticSiteTab.tsx`'s connected-credential row. The second is a grounding fact and should
 * PASS today — it proves the gap is a missing UI wiring, not a missing backend capability, so
 * whoever fixes this does not also need to build the verify mechanism from scratch.
 *
 * Synthetic credential only (`data-classification.md`'s synthetic-PII rule) — this test never talks
 * to the real GitHub API, so the token value itself is never expected to verify as valid; only its
 * REACHABILITY from the UI, and the raw route's existence, are under test here.
 */

const WORKSPACE_ID = "workspace-local";
const CREDENTIALS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/system/publish/credentials`;

test.describe("Deployment > Static Site > GitHub Pages: re-verifying an already-saved credential", () => {
  test("a connected-but-unverified credential offers a way to (re-)verify it without re-entering the token [reproduction — expected to fail until fixed]", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // Seed a synthetic, already-saved GitHub Pages credential — simulates the real-world state this
    // bug was found in: a token that IS saved, but whose cached verification is cold (e.g. right
    // after a restart), which is exactly the state `deployment_get_static_publish_capabilities`
    // reports as "not ready" and the assistant then sends the human here to fix.
    const createRes = await page.request.post(CREDENTIALS_PATH, {
      data: {
        label: "e2e-synthetic-github-pages",
        connection: { providerId: "github-pages", token: "ghp_synthetic_test_token_0000000000" },
        isDefault: true,
      },
    });
    expect(createRes.ok(), `seeding the synthetic credential failed: ${createRes.status()} ${await createRes.text()}`).toBe(true);

    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "GitHub Pages" }).click();

    // The connected-credential card is visible ("token stored, encrypted" per StaticSiteTab.tsx) —
    // confirms the seed worked and we're looking at the right state before asserting on its
    // controls.
    await expect(page.getByText(/token stored, encrypted/i)).toBeVisible();

    // The reproduction: the assistant tells a human to "hit verify" here. No such control exists.
    const verifyControl = page.getByRole("button", { name: /verify/i });
    await expect(
      verifyControl,
      'expected a "Verify" control on the connected GitHub Pages credential row — none exists today, ' +
        "so a human following the assistant's own recovery instructions (Deployment > Static Site > " +
        "Publish > hit verify) has nothing to click. See this file's header for the full chain."
    ).toBeVisible();
  });

  test("the backend verify route already exists and works — the gap above is UI wiring, not a missing capability [grounding fact]", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const createRes = await page.request.post(CREDENTIALS_PATH, {
      data: {
        label: "e2e-synthetic-github-pages-2",
        connection: { providerId: "github-pages", token: "ghp_synthetic_test_token_1111111111" },
        isDefault: true,
      },
    });
    expect(createRes.ok()).toBe(true);
    const { credential } = (await createRes.json()) as { credential: { id: string } };

    // Same route `StaticSiteTab.tsx` never calls. A synthetic token will not come back `valid`
    // against the real GitHub API — that's fine, this only asserts the route responds and reports a
    // real verification shape, proving the capability is there for a UI control to call.
    const verifyRes = await page.request.post(`${CREDENTIALS_PATH}/${credential.id}/verify`);
    expect(verifyRes.ok(), `verify route failed: ${verifyRes.status()} ${await verifyRes.text()}`).toBe(true);
    const body = (await verifyRes.json()) as { verification?: { status: string } };
    expect(body.verification?.status).toBeDefined();
  });
});
