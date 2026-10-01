import { expect, test, type Route } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

// Uses the post-editor config's real server and durable autosave endpoint.
test("reload recovers the newest draft while an earlier autosave PUT is pending", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const editorUrl = page.url();
  const id = editorUrl.split("/").pop()!;
  const autosavePath = `/api/admin/v1/workspaces/workspace-local/posts/${id}/autosave`;
  let heldRoute: Route | undefined;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${autosavePath}`, async (route) => {
    if (route.request().method() !== "PUT" || heldRoute) return route.continue();
    heldRoute = route;
    await held;
    // Cleanup only: never persist the older draft after the reload.
    await route.abort().catch(() => {});
  });
  page.on("dialog", (dialog) => dialog.accept());
  try {
    await page.locator('[data-agent-element="post-title"]').fill("Earlier pending draft");
    await expect.poll(() => heldRoute?.request().postDataJSON().title).toBe("Earlier pending draft");
    const newest = "Newest draft survives document teardown";
    await page.locator('[data-agent-element="post-title"]').fill(newest);
    await page.reload({ waitUntil: "domcontentloaded" });

    // Read through the real server after the old document is gone. An eventual port call in
    // that document or a synthetic pagehide cannot satisfy this assertion.
    await expect.poll(async () => {
      const response = await page.request.get(`http://localhost:7851${autosavePath}`);
      expect(response.ok()).toBe(true);
      return (await response.json()).autosave?.title;
    }).toBe(newest);
    // Reload again after persistence is confirmed so recovery does not race the exit request.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-agent-element="post-autosave-recovery"]')).toBeVisible();
    await page.locator('[data-agent-element="post-autosave-restore"]').click();
    await expect(page.locator('[data-agent-element="post-title"]')).toHaveValue(newest);
  } finally {
    release();
    await page.unroute(`**${autosavePath}`);
  }
});
