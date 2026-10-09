// @unrun: e2 edit-only dispatch, 2026-10-08; coordinator owns all execution.
import { createUIResource } from "@jini-ai/ui/mcp-ui";
import { test, expect, requestApi, installFixtureTheme, WS_API } from "../support/release-0113-fixtures.js";
import { createAdminChatDriver } from "../support/admin-chat-driver.js";
import { stubPendingRun } from "../support/assistant-run-stub.js";
import { journeyJson } from "../support/assistant-journey-state.js";
import { uniqSlug } from "./_fixtures.js";

test.describe("0.1.13 A8 operator journeys", { tag: ["@unrun", "@isolated-site"] }, () => {
  test("markdown and sandboxed tool-card links open new tabs and preserve the conversation and draft", async ({ page, context }) => {
    const resource = createUIResource({ uri: "ui://tovu/journey/link-card", htmlString:
      '<!doctype html><html><body><h1>Tool result links</h1><a href="/admin/menus"><span>Open menus from tool</span></a></body></html>' });
    await stubPendingRun({ page, toolCallStatus: 202, payloads: [
      { type: "text_delta", delta: "[Open pages from markdown](/admin/pages)" },
      { type: "tool_use", id: "link-card", name: "show_mcpui_widget", input: { title: "Tool result links" } },
      { type: "mcp-ui", resource },
    ] });
    const chat = createAdminChatDriver({ page });
    await chat.open({ navigate: true });
    const id = await chat.newConversation();
    await chat.send({ text: "Show me the page and menu links" });
    await expect(chat.ui.root.getByRole("link", { name: "Open pages from markdown" })).toBeVisible();
    await chat.ui.composer.fill("Keep this unsent draft");
    const originalUrl = page.url();
    const links = [
      { locator: chat.ui.root.getByRole("link", { name: "Open pages from markdown" }), path: "/admin/pages" },
      { locator: page.frameLocator('[data-mcpui-host][aria-label="ui://tovu/journey/link-card"] iframe').getByRole("link", { name: "Open menus from tool" }), path: "/admin/menus" },
    ];
    for (const { locator, path } of links) {
      await expect(locator).toBeVisible();
      const opened = context.waitForEvent("page");
      await locator.click();
      const tab = await opened;
      try { await expect(tab).toHaveURL(new URL(path, originalUrl).href); }
      finally { await tab.close(); }
      await expect(page).toHaveURL(originalUrl);
      expect(await chat.currentConversationId()).toBe(id);
      await expect(chat.ui.composer).toHaveValue("Keep this unsent draft");
      await expect(chat.ui.stop).toBeVisible();
    }
  });

  test("mid-run Send delivers one message to the active run and Stop cancels that same run", async ({ page }) => {
    const stub = await stubPendingRun({ page, toolCallStatus: 202, payloads: [{ type: "text_delta", delta: "Working on your request." }] });
    const chat = createAdminChatDriver({ page });
    await chat.open({ navigate: true });
    const id = await chat.newConversation();
    await chat.send({ text: "Start the task" });
    await expect(chat.ui.stop).toBeVisible();
    await expect(chat.ui.send).toHaveCount(0);
    await chat.ui.composer.fill("Use the second layout instead");
    await expect(chat.ui.send).toBeEnabled();
    await expect(chat.ui.stop).toBeVisible();
    await chat.ui.send.click();
    await expect.poll(() => stub.midRunMessages).toEqual([{ text: "Use the second layout instead" }]);
    expect(stub.runStarts).toHaveLength(1);
    expect(stub.cancels).toHaveLength(0);
    expect(stub.toolCalls).toHaveLength(0);
    await expect(chat.ui.composer).toHaveValue("");
    await expect(chat.ui.root.getByText("Use the second layout instead", { exact: true })).toHaveCount(1);
    expect(await chat.currentConversationId()).toBe(id);
    await chat.ui.stop.click();
    await expect.poll(() => stub.cancels.length).toBe(1);
    expect(new URL(stub.cancels[0]!.url()).pathname).toBe("/api/runs/journey-run-1/cancel");
    await expect(chat.ui.stop).toHaveCount(0);
    expect(stub.runStarts).toHaveLength(1);
    await chat.ui.composer.fill("Next task");
    await expect(chat.ui.send).toBeEnabled();
  });

  test("menu Options and HTML tabs persist HTML mode and exact source when saved and reopened", async ({ page, request }) => {
    const api = requestApi({ request });
    const slug = uniqSlug("html-menu");
    const created = await journeyJson<{ menu: { id: string } }>({ api, url: `${WS_API}/menus`, method: "POST", status: 201,
      data: { title: "HTML journey menu", slug, items: [{ id: "home", label: "Home", target: { kind: "url", href: "/" } }] } });
    const url = `/admin/menus/${created.menu.id}`;
    await page.goto(url);
    const options = page.getByRole("tab", { name: "Options", exact: true });
    const html = page.getByRole("tab", { name: "HTML", exact: true });
    await expect(options).toHaveAttribute("aria-selected", "true");
    await html.click();
    const source = '<nav aria-label="Footer"><a href="/privacy">Privacy &amp; terms</a></nav>';
    await page.getByRole("textbox", { name: "Menu HTML", exact: true }).fill(source);
    const saved = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname === `${WS_API}/menus/${created.menu.id}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await page.goto("/admin/menus");
    await page.getByText("HTML journey menu", { exact: true }).click();
    await expect(page).toHaveURL(new URL(`/admin/menus/${slug}`, page.url()).href);
    await expect(html).toHaveAttribute("aria-selected", "true");
    await expect(options).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("textbox", { name: "Menu HTML", exact: true })).toHaveValue(source);
    const stored = await journeyJson<{ menu: { mode: string; html: string } }>({ api, url: `${WS_API}/menus/${created.menu.id}` });
    expect(stored.menu.mode).toBe("html");
    expect(stored.menu.html).toBe(source);
  });

  test("Themes Explore Save as original removes the warning and Reset restores the saved original", async ({ page, request, journeySite }) => {
    const api = requestApi({ request });
    const theme = await installFixtureTheme({ api, site: journeySite, color: "#b5543a" });
    await page.goto(`/admin/themes/explore?theme=${theme.id}&file=${encodeURIComponent("css/theme.css")}`);
    const warning = page.getByText("This theme has no stored original, so nothing can be reset.", { exact: true });
    const reset = page.getByRole("button", { name: "Reset theme.css", exact: true });
    await expect(warning).toBeVisible();
    // Reset is offered only when stored original bytes exist and the selected file differs.
    await expect(reset).toHaveCount(0);
    await page.getByRole("button", { name: "Save as original", exact: true }).click();
    await expect(warning).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save as original", exact: true })).toHaveCount(0);
    expect((await journeyJson<{ hasOriginal: boolean }>({ api, url: `${WS_API}/themes/${theme.id}` })).hasOriginal).toBe(true);
    await expect(reset).toHaveCount(0);
    await page.getByRole("tab", { name: "HTML", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Theme file source", exact: true });
    const original = (await journeyJson<{ content: string }>({ api, url: `${WS_API}/themes/${theme.id}/file?path=css%2Ftheme.css` })).content;
    await expect(editor).toHaveValue(original);
    await editor.fill(`${original}\nbody { color: #123456; }\n`);
    const saved = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname === `${WS_API}/themes/${theme.id}/file`);
    await page.getByRole("button", { name: "Save theme.css", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(reset).toBeEnabled();
    await reset.click();
    await page.getByRole("dialog", { name: "Reset this file to the original?" }).getByRole("button", { name: "Reset file", exact: true }).click();
    await expect(editor).toHaveValue(original);
    expect((await journeyJson<{ content: string }>({ api, url: `${WS_API}/themes/${theme.id}/file?path=css%2Ftheme.css` })).content).toBe(original);
    await expect(reset).toHaveCount(0);
    await page.reload();
    await expect(warning).toHaveCount(0);
  });

  test("theme cards replace inherited identical pictures with captures of each theme's own render", { tag: ["@theme-captures"] }, async ({ page, request, journeySite }) => {
    const api = requestApi({ request });
    // Both themes carry the SAME inherited screenshot. Only capturing their different rendered
    // backgrounds makes their cards distinct; advertising two different URLs alone proves nothing.
    const red = await installFixtureTheme({ api, site: journeySite, color: "#b5543a" }, { screenshotColor: "#abcdef" });
    const blue = await installFixtureTheme({ api, site: journeySite, color: "#276aab" }, { screenshotColor: "#abcdef" });
    await page.goto("/admin/themes?tab=static");
    const urls: string[] = [];
    const bodies: Buffer[] = [];
    for (const theme of [red, blue]) {
      const preview = page.getByRole("button", { name: `Expand preview for ${theme.id}`, exact: true }).locator("img");
      await expect(preview).toBeVisible();
      await preview.scrollIntoViewIfNeeded();
      await expect.poll(() => preview.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
      const src = (await preview.getAttribute("src"))!;
      expect(src).toContain(theme.id);
      expect(new URL(src, journeySite.apiURL).pathname).toBe(`${WS_API}/themes/${theme.id}/preview`);
      urls.push(src);
      const image = await request.get(new URL(src, journeySite.apiURL).href);
      expect(image.status()).toBe(200);
      expect(image.headers()["content-type"]).toBe("image/jpeg");
      bodies.push(await image.body());
    }
    expect(urls[0]).not.toBe(urls[1]);
    expect(bodies[0]!.equals(bodies[1]!)).toBe(false);
  });

  test("Recent errors groups repeated entries, expands full details, copies and refreshes to empty", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const message = "[assistant] Journey tool failed\n    at /fixture/apps/website/src/agent.ts:42:7";
    let empty = false;
    const reads: string[] = [];
    // A fake HTTP log-read port controls the server's external log input. The real tab, grouping,
    // expansion, clipboard and refresh flow run unchanged; no application module is mocked.
    await page.route((url) => url.pathname === `${WS_API}/system/server-logs`, async (route) => {
      reads.push(route.request().url());
      await route.fulfill({ json: { capturing: true, matched: empty ? 0 : 2, buffered: 2, truncated: false, entries: empty ? [] : [
        { at: "2026-10-08T12:00:00.000Z", level: "error", source: "daemon", message },
        { at: "2026-10-08T12:01:00.000Z", level: "error", source: "daemon", message },
      ] } });
    });
    await page.goto("/admin/observability");
    const recentErrors = page.getByRole("button", { name: "Recent errors", exact: true });
    await expect(recentErrors).toBeVisible();
    expect(reads).toHaveLength(0);
    await recentErrors.click();
    await expect(recentErrors).toHaveAttribute("aria-pressed", "true");
    const panel = page.getByRole("region", { name: "Recent server errors", exact: true });
    const rows = panel.getByRole("listitem");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("×2");
    const toggle = rows.first().getByRole("button", { expanded: false });
    await expect(rows.first().locator("pre")).toBeHidden();
    await toggle.click();
    await expect(rows.first().getByRole("button", { expanded: true })).toBeVisible();
    await expect(rows.first().locator("pre")).toContainText("Journey tool failed");
    await expect(rows.first().locator('[title="/fixture/apps/website/src/agent.ts:42:7"]')).toBeVisible();
    await rows.first().getByRole("button", { name: "Copy", exact: true }).click();
    await expect(rows.first().getByRole("button", { name: "Copied", exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(message);
    empty = true;
    await panel.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(panel.getByText("No errors recorded.", { exact: true })).toBeVisible();
    await expect(rows).toHaveCount(0);
    expect(reads).toHaveLength(2);
    for (const url of reads) { expect(new URL(url).searchParams.get("level")).toBe("error"); expect(new URL(url).searchParams.get("limit")).toBe("50"); }
  });

  test("pending and completed chat tool rows expand to input and result and collapse again", async ({ page }) => {
    const input = { id: "journey-post-read", kind: "post" };
    const output = '{"id":"journey-post-read","title":"Read result"}';
    await stubPendingRun({ page, toolCallStatus: 202, payloads: [
      { type: "tool_use", id: "read-row", name: "content_read.content_post", input },
      { type: "tool_result", toolUseId: "read-row", content: output, isError: false },
      { type: "tool_use", id: "pending-row", name: "assistant_ask_choice", input: { title: "Pending choice", options: [{ value: "default", label: "Default" }] } },
    ] });
    const chat = createAdminChatDriver({ page });
    await chat.open({ navigate: true });
    await chat.newConversation();
    await chat.send({ text: "Show tool details" });
    for (const [id, text] of [["read-row", "Read result"], ["pending-row", "Waiting for the result or answer…"]]) {
      const row = chat.ui.root.locator(`[data-agent-element="tool-call-${id}"]`);
      const toggle = row.getByRole("button").first();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(row).toContainText(text!);
      await expect(row).toContainText(id === "read-row" ? JSON.stringify(input, null, 2) : "Pending choice");
      const panelId = (await toggle.getAttribute("aria-controls"))!;
      const details = page.locator(`[id=${JSON.stringify(panelId)}]`);
      await expect(details).toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(details).toBeHidden();
    }
  });
});
