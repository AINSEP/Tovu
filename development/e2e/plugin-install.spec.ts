// Runbook: README-plugin-install-tests.md.
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test as base, expect, type Page } from "@playwright/test";
import { createAdminChatDriver } from "./support/admin-chat-driver.js";
import type { IsolatedJourneySite } from "./support/isolated-journey-site.js";
import { createPluginInstallFixtures, pluginRows, HELLO_NAME, type PluginFamily, type PluginInstallFixtures } from "./support/plugin-install-fixtures.js";

const test = base.extend<{ packages: PluginInstallFixtures; isolatedSite: IsolatedJourneySite }>({
  isolatedSite: async ({ baseURL }, use, testInfo) => {
    const site = testInfo.config.metadata.isolatedJourneySite as IsolatedJourneySite | undefined;
    if (!site || site.suite !== "plugin-install" || site.database !== "sqlite" || site.runtime !== "local-cli"
      || baseURL !== site.adminURL || site.adminURL !== `http://127.0.0.1:${site.ports.admin}`
      || !site.runtimeDir.startsWith(path.join(os.tmpdir(), "tovu-plugin-install-"))
      || site.siteDir !== path.join(site.runtimeDir, "sites", "journey-site")) {
      throw new Error("Use playwright.plugin-install.config.ts; only its fresh isolated seeded site is allowed");
    }
    await use(site);
  },
  packages: async ({ isolatedSite, request }, use) => {
    const packages = await createPluginInstallFixtures({ site: isolatedSite, request });
    try { await use(packages); }
    finally { await packages.cleanup(); } // Runs even when preview, chat or upgrade fails.
  },
});

function handle({ page, name }: { page: Page; name: string }) {
  return page.locator(`[data-agent-element=${JSON.stringify(name)}]`);
}

async function dropArchive({ page, zipPath }: { page: Page; zipPath: string }) {
  const bytes = Array.from(await readFile(zipPath));
  const transfer = await page.evaluateHandle(({ bytes, name }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type: "application/zip" }));
    return transfer;
  }, { bytes, name: path.basename(zipPath) });
  try { await page.locator(".install-tab-dropzone").dispatchEvent("drop", { dataTransfer: transfer }); }
  finally { await transfer.dispose(); }
}

async function reviewAndInstall({ page }: { page: Page }) {
  await handle({ page, name: "plugins-install-preview" }).click();
  await expect(page.locator(".install-tab-review")).toContainText("This plugin has no code; nothing in it runs on this computer.");
  await expect(page.locator(".install-tab-review")).toContainText("1.0.0");
  await handle({ page, name: "plugins-install-confirm" }).click();
  await expect(page.getByRole("status")).toContainText("installed and switched off");
}

async function expectInstalledOff({ page, packages, family, version = "1.0.0" }: {
  page: Page; packages: PluginInstallFixtures; family: PluginFamily; version?: string;
}) {
  await expect.poll(async () => (await pluginRows({ request: page.request, family })).find((row) => (row.id ?? row.pluginId) === packages.ids[family]))
    .toMatchObject({ enabled: false, version });
}

/** Stock Chromium has no native WebMCP host. Capture the app's REAL registrations in
 * document.modelContext and call their execute methods; do not substitute DOM clicks for tools. */
async function installWebMcpHost({ page }: { page: Page }) {
  await page.addInitScript(() => {
    const tools = new Map<string, { name: string; execute: (args: unknown) => Promise<unknown> }>();
    const context = {
      registerTool(registration: { tool?: { name: string; execute: (args: unknown) => Promise<unknown> }; name?: string; execute?: (args: unknown) => Promise<unknown> }, options?: { signal?: AbortSignal }) {
        const tool = registration.tool ?? registration as { name: string; execute: (args: unknown) => Promise<unknown> };
        tools.set(tool.name, tool);
        options?.signal?.addEventListener("abort", () => { if (tools.get(tool.name) === tool) tools.delete(tool.name); }, { once: true });
      },
      listTools: () => [...tools.keys()],
      executeTool: async (name: string, args: unknown) => {
        const tool = tools.get(name);
        if (!tool) throw new Error(`WebMCP tool not registered: ${name}`);
        return tool.execute(args);
      },
    };
    Object.defineProperty(document, "modelContext", { configurable: true, value: context });
    localStorage.setItem("tovu.admin.webmcp.enabled", "true");
    window.confirm = () => true;
  });
}

async function webMcp({ page, name, args }: { page: Page; name: string; args: Record<string, unknown> }) {
  return page.evaluate(async ({ name, args }) => {
    const context = (document as unknown as { modelContext: { executeTool: (name: string, args: unknown) => Promise<unknown> } }).modelContext;
    return context.executeTool(name, args);
  }, { name, args });
}

test.describe("isolated plugin installs", () => {
  test.skip(process.env.TOVU_E2E_PLUGIN_INSTALL !== "1", "Opt in with TOVU_E2E_PLUGIN_INSTALL=1; never use an external admin site");

  test("UI drop ZIP → Preview → Install appears switched off", async ({ page, packages }) => {
    const fixture = await packages.packageFiles({ family: "site" });
    await page.goto("/admin/plugins?tab=add");
    await expect(handle({ page, name: "plugins-install-confirm" })).toHaveCount(0);
    await dropArchive({ page, zipPath: fixture.zipPath });
    await expect(page.locator(".install-tab-dropzone")).not.toContainText("0.0 MiB");
    await reviewAndInstall({ page });
    await expectInstalledOff({ page, packages, family: "site" });
    await handle({ page, name: "plugins-tab-downloaded" }).click();
    await expect(page.getByRole("listitem", { name: HELLO_NAME })).toHaveAttribute("data-enabled", "false");
  });

  test("UI Choose a folder uploads directory input files then previews and installs", async ({ page, packages }) => {
    const fixture = await packages.packageFiles({ family: "site" });
    await page.goto("/admin/plugins?tab=add");
    await expect(page.getByRole("button", { name: "Choose a folder", exact: true })).toBeVisible();
    await page.locator('input[webkitdirectory]').setInputFiles(fixture.directory);
    await expect(page.locator(".install-tab-dropzone-title")).toContainText(".zip");
    await reviewAndInstall({ page });
    await expectInstalledOff({ page, packages, family: "site" });
  });

  test("WebMCP fills plugins-install-folder then previews and confirms via document.modelContext", async ({ page, packages }) => {
    const fixture = await packages.packageFiles({ family: "site" });
    await installWebMcpHost({ page });
    await page.goto("/admin/plugins?tab=add");
    await expect.poll(() => page.evaluate(() => (document as unknown as { modelContext: { listTools: () => string[] } }).modelContext.listTools())).toContain("page.fill");
    // The server path is intentionally behind Advanced. Opening it only reveals the field; all
    // install actions below go through the registered page tools and their confirmation policy.
    await page.getByText("Advanced: install from a path on this server", { exact: true }).click();
    await webMcp({ page, name: "page.fill", args: { handle: "plugins-install-folder", text: fixture.directory } });
    await expect(page.getByLabel("Folder on this server", { exact: true })).toHaveValue(fixture.directory);
    await webMcp({ page, name: "page.click", args: { handle: "plugins-install-preview" } });
    await expect(page.locator(".install-tab-review")).toBeVisible();
    await webMcp({ page, name: "page.click", args: { handle: "plugins-install-confirm" } });
    await expect(page.getByRole("status")).toContainText("installed and switched off");
    await expectInstalledOff({ page, packages, family: "site" });
  });

  test("Downloaded rows wrap at container width with a 380px chat dock", async ({ page, packages }) => {
    const fixture = await packages.packageFiles({ family: "site" });
    await page.goto("/admin/plugins?tab=add");
    await dropArchive({ page, zipPath: fixture.zipPath });
    await reviewAndInstall({ page });
    await handle({ page, name: "plugins-tab-downloaded" }).click();
    await page.setViewportSize({ width: 980, height: 900 });
    const chat = createAdminChatDriver({ page });
    await chat.open();
    // Pin the same dock width as the live report, then vary ONLY the list container. This catches
    // a viewport media-query fix which still breaks when the dock or sidebar takes more room.
    await chat.ui.dock.evaluate((dock) => { (dock as HTMLElement).style.width = "380px"; (dock as HTMLElement).style.flexBasis = "380px"; });
    const row = page.getByRole("listitem", { name: HELLO_NAME });
    for (const width of [540, 360, 280]) {
      await page.locator(".plugin-rows").evaluate((list, width) => { (list as HTMLElement).style.width = `${width}px`; (list as HTMLElement).style.maxWidth = "100%"; }, width);
      await expect.poll(() => row.evaluate((element) => {
        const name = element.querySelector(".plugin-row-name") as HTMLElement;
        const version = element.querySelector(".plugin-row-version") as HTMLElement;
        const summary = element.querySelector(".plugin-row-summary") as HTMLElement;
        const actions = element.querySelector(".plugin-row-actions") as HTMLElement;
        const a = name.getBoundingClientRect(); const b = version.getBoundingClientRect();
        return { truncated: name.scrollWidth > name.clientWidth + 1,
          overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
          stacked: actions.getBoundingClientRect().top >= summary.getBoundingClientRect().bottom - 1,
          overflow: element.scrollWidth > element.clientWidth + 1 };
      })).toEqual({ truncated: false, overlap: false, stacked: true, overflow: false });
    }
  });

  for (const family of ["site", "agent"] as const) {
    test(`chat attaches ${family} plugin ZIP and installs with attachmentRef`, async ({ page, packages }) => {
      const toolId = family === "site" ? "plugins_install" : "agent_plugins_install";
      // No catalog probe: /api/tools is daemon-token only. The tool_use assertions below fail
      // with the tool's name when the catalog lacks it.
      const fixture = await packages.packageFiles({ family });
      // Keep a list mounted beside the chat: the test must prove the assistant refresh bridge.
      await page.goto(family === "site" ? "/admin/plugins?tab=downloaded" : "/admin/agent-plugins?tab=installed");
      const chat = createAdminChatDriver({ page }, { answerTimeoutMs: 180_000 });
      await chat.open(); await chat.newConversation();
      await chat.attach({ files: [{ path: fixture.zipPath }] });
      await expect(chat.ui.attachmentChip({ name: path.basename(fixture.zipPath) })).toBeVisible();
      // Prove that this is the configured Local CLI path, not an unrelated BYOK success.
      await Promise.all([
        page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/api/runs"), { timeout: 30_000 }),
        chat.send({ text: `Install the attached ${family === "site" ? "SITE" : "AGENT"} plugin ZIP using ${toolId} and source.attachmentRef. Review its manifest and keep it switched off. Do not use a filesystem path, Bash, or enable it. If confirmation is required, show the install review.` }),
      ]);
      // Consent surfaces differ between tool versions. Confirm only install cards in this dock;
      // absence of a card is fine, but a failed run or missing tool call is always an assertion.
      const confirm = chat.ui.root.getByRole("button", { name: /^Install(?: plugin| \(stays off\))?$/i });
      await expect.poll(async () => {
        if (await confirm.count() === 1 && await confirm.isEnabled()) await confirm.click();
        return (await pluginRows({ request: page.request, family })).some((row) => (row.id ?? row.pluginId) === packages.ids[family]);
      }, { timeout: 180_000 }).toBe(true);
      await chat.waitForAnswer({ outcome: "succeeded" });
      const events = await page.evaluate(() => {
        const messages = (window as unknown as { __tovuAssistantMessages?: Array<{ events?: Array<{ kind: string; id?: string; name?: string; input?: unknown; toolUseId?: string; content?: string; isError?: boolean }> }> }).__tovuAssistantMessages ?? [];
        return messages.flatMap((message) => message.events ?? []);
      });
      // The delegated-tool bridge emits the domain tool's own name/input, even when Claude
      // reaches it via execute_delegated_tool. Assert that event and its correlated result.
      const installCall = events.find((event) => event.kind === "tool_use" && event.name === toolId);
      expect(installCall, `assistant did not invoke ${toolId}`).toBeDefined();
      const source = (installCall?.input as { source?: { kind?: string; attachmentRef?: string; path?: string } } | undefined)?.source;
      expect(source?.kind).toBe("zip");
      expect(source?.attachmentRef).toMatch(/^attachment:[A-Za-z0-9-]{8,80}$/);
      expect(source?.path).toBeUndefined();
      const result = events.find((event) => event.kind === "tool_result" && event.toolUseId === installCall?.id);
      expect(result, `${toolId} did not finish`).toBeDefined();
      expect(result?.isError).not.toBe(true);
      expect(result?.content).toMatch(/"installed"\s*:\s*true/);
      await expectInstalledOff({ page, packages, family });
      // No reload/navigation here: this is the mounted Downloaded/Installed stale-list regression.
      if (family === "site") await expect(page.getByRole("listitem", { name: HELLO_NAME })).toBeVisible();
      else await expect(page.getByRole("listitem", { name: packages.ids.agent.split("-").map((word) => word[0]!.toUpperCase() + word.slice(1)).join(" ") })).toHaveAttribute("data-enabled", "false");
    });
  }

  test("agent plugin ZIP installs off and Replace upgrades 1.0.0 → 1.0.1", async ({ page, packages }) => {
    const first = await packages.packageFiles({ family: "agent" });
    const upgrade = await packages.packageFiles({ family: "agent", version: "1.0.1" });
    await page.goto("/admin/agent-plugins?tab=add");
    await expect(page.locator(".install-tab-dropzone")).toBeVisible(); // Also exercises URL-tab wiring.
    await page.getByLabel("Upload a .zip", { exact: true }).setInputFiles(first.zipPath);
    await handle({ page, name: "agent-plugin-add-install" }).click();
    await expect(page.getByRole("status")).toContainText("installed and switched off");
    await expectInstalledOff({ page, packages, family: "agent" });
    await page.getByLabel("Upload a .zip", { exact: true }).setInputFiles(upgrade.zipPath);
    // Keep the same id across versions: a fresh id would miss the real replacement regression.
    await page.getByRole("checkbox", { name: /Replace/ }).check();
    await handle({ page, name: "agent-plugin-add-install" }).click();
    await expect(page.getByRole("status")).toContainText("installed and switched off");
    await expectInstalledOff({ page, packages, family: "agent", version: "1.0.1" });
    await page.getByTestId("settings-dialog-nav-installed").click();
    const row = page.getByRole("listitem", { name: packages.ids.agent.split("-").map((word) => word[0]!.toUpperCase() + word.slice(1)).join(" ") });
    await expect(row).toContainText("v1.0.1");
    await expect(row).toHaveAttribute("data-enabled", "false");
  });

  test("cleanup uninstalls every QA fixture installed by the suite", async ({ request, isolatedSite }) => {
    expect(isolatedSite.suite).toBe("plugin-install");
    for (const family of ["site", "agent"] as const) {
      const leftovers = (await pluginRows({ request, family })).filter((row) => /^qa-fake-(hello|agent)-/.test(row.id ?? row.pluginId ?? ""));
      expect(leftovers, `${family} fixture cleanup left installed packages`).toEqual([]);
    }
  });
});
