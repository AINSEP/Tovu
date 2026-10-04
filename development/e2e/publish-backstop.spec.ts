import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/** UI contract only: all manual publish calls are intercepted so this screenshot/confirmation
 * spec never sends real content or installs schema. Backend policy has separate real-HTTP tests. */
for (const width of [1440, 900]) {
  test(`manual publish value review and human confirmation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await loginAsAdmin(page);
    const base = "**/api/admin/v1/workspaces/workspace-local/publish-content";
    await page.route(`${base}/backstop/status`, (route) => route.fulfill({ json: { allowed: true, installed: true } }));
    await page.route(`${base}/peers`, (route) => route.fulfill({ json: { peers: [{ id: "live", label: "Live example", baseUrl: "https://live.example", remoteWorkspaceId: "workspace-local", masked: null, hasCredential: false }] } }));
    await page.route(`${base}/backstop/gaps`, (route) => route.fulfill({ json: { gaps: [{ label: "table:p_banner", count: 4, lastReason: "Footer missing a publish type", lastAt: "2026-10-04T00:00:00Z" }] } }));
    let sends = 0;
    await page.route(`${base}/backstop`, async (route) => {
      const body = route.request().postDataJSON();
      expect(body.rows).toEqual([{ table: "p_banner", pk: { id: "one" } }]);
      expect(body.files).toEqual(["config.json"]);
      if (body.action === "plan") {
        expect(body.typedHost).toBeUndefined();
        await route.fulfill({ json: { logId: "log-1", entities: [], skipped: [{ entityType: "raw-file", id: "config.json", reason: "Private configuration is never sent." }],
          plan: { planId: "plan-1", planHash: "hash-1", details: { refused: false, refusalReason: null, rows: [{ entityType: "raw-row", entityId: "p_banner:one", outcome: "applied", writes: true, reason: null }] },
            backstopPreview: [{ entityType: "raw-row", entityId: "p_banner:one", before: { title: "Old footer" }, after: { title: "New footer" }, unavailableReason: null }] } } });
      } else {
        expect(body.action).toBe("send"); expect(body.typedHost).toBe("live.example"); expect(body.reason).toBe("Footer missing a publish type"); expect(body.logId).toBe("log-1");
        sends++;
        await route.fulfill({ json: { runId: "run-1", logId: "log-1", destination: "https://live.example", report: { rows: [{ entityType: "raw-row", entityId: "p_banner:one", outcome: "applied", writes: true, reason: null }] } } });
      }
    });
    await page.goto("/admin/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Advanced: send by hand" }).click();
    const section = page.locator("section.publish-backstop");
    await section.getByLabel("Table", { exact: true }).fill("p_banner");
    await section.getByLabel("Primary key (JSON)").fill('{"id":"one"}');
    await section.getByRole("button", { name: "Add row", exact: true }).click();
    await section.getByLabel("Site-relative file path").fill("config.json");
    await section.getByRole("button", { name: "Add file", exact: true }).click();
    await section.getByLabel("Reason (at least 10 characters)").fill("Footer missing a publish type");
    await section.getByRole("button", { name: "Check what would change" }).click();
    await expect(section.getByText(/Old footer/)).toBeVisible(); await expect(section.getByText(/New footer/)).toBeVisible();
    await expect(section.getByText("Private configuration is never sent.")).toBeVisible();
    const send = section.getByRole("button", { name: "Send to live", exact: true });
    await expect(send).toBeDisabled();
    const address = section.getByLabel("Type the live address"); await expect(address).toHaveValue("");
    expect(await address.evaluate((node) => [...node.attributes].some((attribute) => attribute.name.startsWith("data-agent") || attribute.name.startsWith("data-webmcp")))).toBe(false);
    await address.fill("wrong.example"); await expect(send).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`backstop-plan-${width}.png`), fullPage: true });
    await address.fill("live.example"); await expect(send).toBeEnabled(); await send.click();
    await expect(section.getByText("Send complete", { exact: true })).toBeVisible();
    expect(sends).toBe(1);
    await expect(section.getByRole("link", { name: "Open live to undo this send" })).toHaveAttribute("href", "https://live.example/admin/?backstopRun=run-1");
    await page.screenshot({ path: testInfo.outputPath(`backstop-result-${width}.png`), fullPage: true });
  });
}
