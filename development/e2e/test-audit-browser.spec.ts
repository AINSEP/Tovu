import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

// Only the HTTP data boundary is faked; production components, CSS and native
// keyboard navigation run in Chromium. Run with playwright.test-audit-browser.config.ts.
test("package files wrap long lines and keep each gutter aligned with its source line", async ({ page }) => {
  const content = `first line\n${"x".repeat(400)}\nthird line`;
  await page.route(/\/api\/admin\/v1\/workspaces\/[^/]+\/agent-plugins$/, (route) => route.fulfill({
    json: { agentPlugins: [{ pluginId: "layout-fixture", version: "1.0.0", description: null, keywords: [], enabled: false, skills: [], mcpServerIds: [] }] },
  }));
  await page.route(/\/agent-plugins\/layout-fixture\/files$/, (route) => route.fulfill({
    json: { pluginId: "layout-fixture", truncated: false,
      limits: { maxFiles: 200, maxEntries: 1000, maxFileBytes: 100000, maxTotalBytes: 1000000 },
      files: ["SKILL.md", "plugin.json"].map((relativePath) => ({ relativePath, content, sizeBytes: content.length, omitted: null })),
    },
  }));
  await loginAsAdmin(page);
  await page.goto("/admin/agent-plugins");
  await page.getByRole("button", { name: /^Inspect package files/ }).click();
  const pane = page.locator(".agent-plugin-source-content");
  for (const file of ["SKILL.md", "plugin.json"]) {
    await page.getByRole("treeitem", { name: file, exact: true }).click();
    await expect(pane.getByRole("heading", { name: file, exact: true })).toBeVisible();
    // Constrain the real pane to guarantee the fixture wraps even on wide displays.
    await pane.evaluate((element) => { (element as HTMLElement).style.width = "240px"; });
    const viewer = pane.locator(".code-viewer--wrap");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator(".line-number")).toHaveText(["1", "2", "3"]);
    const layout = await viewer.evaluate((element) => {
      const lines = [...element.querySelectorAll<HTMLElement>(".line-content")];
      const numbers = [...element.querySelectorAll<HTMLElement>(".line-number")];
      return { overflow: element.scrollWidth - element.clientWidth,
        heights: lines.map((line) => line.getBoundingClientRect().height),
        offsets: lines.map((line, index) => line.getBoundingClientRect().top - numbers[index]!.getBoundingClientRect().top),
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.heights).toHaveLength(3);
    expect(layout.heights[1]!).toBeGreaterThan(layout.heights[0]! * 2);
    for (const offset of layout.offsets) expect(Math.abs(offset)).toBeLessThanOrEqual(1);
  }
});

test("MCP Remove and Tools dialogs contain native Tab navigation and Escape deletes nothing", async ({ page }) => {
  let deletions = 0;
  const server = { serverId: "focus-fixture", label: "Focus fixture", transport: "stdio", authMode: "none", enabled: true,
    command: "fixture", url: null, args: [], allowedToolNames: [], writeAllowedToolNames: [],
    writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: [],
    oauth: { providerId: null, grant: null, clientId: null, scopes: [], status: "disconnected", expiresAt: null, tokenEnvName: null, hasStoredToken: false },
  };
  await page.route(/\/api\/admin\/v1\/workspaces\/[^/]+\/mcp-servers$/, (route) => route.fulfill({ json: { servers: [server] } }));
  await page.route(/\/mcp-servers\/focus-fixture$/, (route) => {
    if (route.request().method() === "DELETE") deletions += 1;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route(/\/mcp-servers\/focus-fixture\/probe$/, (route) => route.fulfill({
    json: { tools: [], probedAt: "2026-10-01T00:00:00.000Z" },
  }));
  await loginAsAdmin(page);
  await page.goto("/admin/providers?tab=external-mcp");
  const card = page.getByTestId("source-config-item-card");
  await expect(card).toHaveCount(1);
  for (const modal of ["Remove", "Tools"]) {
    if (modal === "Remove") await card.getByRole("button", { name: "Remove", exact: true }).click();
    else await page.getByRole("button", { name: /Open tool permissions for Focus fixture/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    if (modal === "Tools") {
      await expect(dialog.getByText("This server advertises no tools.", { exact: true })).toBeVisible();
      await expect(dialog.locator(".external-mcp-tool-actions button").first()).toBeEnabled();
    }
    const controls = dialog.locator("button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex='0']");
    expect(await controls.count()).toBeGreaterThanOrEqual(2);
    await controls.last().focus();
    await page.keyboard.press("Tab");
    await expect(controls.first()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(controls.nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveCount(1);
    expect(deletions).toBe(0);
  }
});
