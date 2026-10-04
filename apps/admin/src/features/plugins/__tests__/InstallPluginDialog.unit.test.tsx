import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import { InstallPluginDialog } from "../InstallPluginDialog";
import { usePluginInstall } from "../hooks/use-plugin-install.hooks";
import { createFakePluginInstallPort } from "../hooks/plugin-install-dependencies.hooks";
import { usePlugins } from "../hooks/use-plugins.hooks";
import { createFakePluginsPort } from "../hooks/plugins-dependencies.hooks";
import { Plugins } from "../Plugins";
import { t } from "../plugins-i18n";

afterEach(cleanup);
const preview = { id: "fixture", name: "Fixture", version: "1.0.0", tier: "tier-3" as const, capabilities: ["content.read"], hooks: [], hasCode: true, digest: "sha256-" + "a".repeat(64) };

it("shows the trust warning and stays-off promise before install, with keyboard cancellation", async () => {
  const port = createFakePluginInstallPort({ preview }); const onInstalled = vi.fn(async () => {});
  function Harness() {
    const controller = usePluginInstall({ port, t: (key) => key, onInstalled });
    return <><button onClick={controller.open}>Open</button>{controller.isOpen ? <InstallPluginDialog controller={controller} /> : null}</>;
  }
  render(<Harness />); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  expect(screen.queryByRole("button", { name: "Install (stays off)" })).toBeNull();
  await user.type(screen.getByRole("textbox"), "/server/package");
  await user.click(screen.getByRole("button", { name: "Preview plugin" }));
  expect(await screen.findByText("This plugin runs code with full access to this computer and every site on it.")).toBeTruthy();
  expect(screen.getByText("It stays off in every workspace until you turn it on.")).toBeTruthy();
  expect(port.installed).toHaveLength(0);
  screen.getByRole("button", { name: "Install (stays off)" }).focus();
  await user.tab(); expect(screen.getByRole("textbox")).toBe(document.activeElement);
  await user.tab({ shift: true }); expect(screen.getByRole("button", { name: "Install (stays off)" })).toBe(document.activeElement);
  await user.click(screen.getByRole("button", { name: "Install (stays off)" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(port.installed).toHaveLength(1); expect(onInstalled).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Open" })); await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByRole("button", { name: "Open" })).toBe(document.activeElement);
});

it("Plugins advertises install only when server supplies folder capability", async () => {
  const port = createFakePluginsPort({ plugins: [], installSources: ["folder"] });
  const installPort = createFakePluginInstallPort({ preview });
  function useHook() { return usePlugins({ port, installPort, locale: "en", t: (key) => key }); }
  render(<Plugins usePluginsHook={useHook} />);
  expect(await screen.findByRole("button", { name: "Install plugin" })).toBeTruthy();
  const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Install plugin" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  cleanup();
  function useDisabledHook() { return usePlugins({ port: createFakePluginsPort({ plugins: [] }), installPort, locale: "en", t: (key) => key }); }
  render(<Plugins usePluginsHook={useDisabledHook} />);
  await screen.findByText("No plugins are enabled for this site.");
  expect(screen.queryByRole("button", { name: "Install plugin" })).toBeNull();
});

it("new consent strings are translated in all supported locales", () => {
  const keys = ["Install plugin", "Folder on this server", "Replace existing version", "Preview plugin", "Install (stays off)", "Local plugin · unverified publisher", "Capabilities", "Hooks", "This plugin runs code with full access to this computer and every site on it.", "It stays off in every workspace until you turn it on.", "Failed to preview plugin.", "Failed to install plugin.", "Package changed. Review it again before installing.", "Local folder installs are disabled on this server.", "Turn this plugin off in every workspace before installing.", "Installation conflicts with an existing plugin. Check its version and replacement option.", "Invalid plugin package. Check its manifest, integrity and folder."];
  for (const locale of ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"]) {
    for (const key of keys) {
      expect(t(locale, key)).toBeTruthy();
      if (key !== "Hooks") expect(t(locale, key)).not.toBe(key);
    }
  }
});
