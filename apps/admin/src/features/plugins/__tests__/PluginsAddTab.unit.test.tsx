/** The Plugins "Add a plugin" tab (moved from the retired "Install plugin" popup, 2026-10-06):
 *  the trust review is shown before install, installs stay off, and the tab reads as switched off
 *  when the server allows no local installs. */
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import { createFakePluginInstallPort } from "../hooks/plugin-install-dependencies.hooks";
import type { PluginInstallPort } from "../hooks/plugin-install-port.hooks";
import { usePlugins } from "../hooks/use-plugins.hooks";
import { createFakePluginsPort } from "../hooks/plugins-dependencies.hooks";
import { Plugins } from "../Plugins";
import { t } from "../plugins-i18n";

afterEach(cleanup);
const preview = { id: "fixture", name: "Fixture", version: "1.0.0", tier: "tier-3", capabilities: ["content.read"], hooks: [], hasCode: true, contentTypes: [], conflicts: [], digest: "sha256-" + "a".repeat(64) };

function renderAddTab(installPort: PluginInstallPort, installSources: string[] = ["folder"]) {
  const port = createFakePluginsPort({ plugins: [], installSources });
  function useHook() { return usePlugins({ port, installPort, locale: "en", t: (key) => key }); }
  render(<Plugins tabId="add" usePluginsHook={useHook} />);
  return { user: userEvent.setup() };
}

it("shows the trust warning and stays-off promise before install, then installs and clears the form", async () => {
  const port = createFakePluginInstallPort({ preview });
  const { user } = renderAddTab(port);
  expect(await screen.findByRole("heading", { name: "Add a plugin" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Install (stays off)" })).toBeNull();
  await user.type(screen.getByRole("textbox", { name: "Folder on this server" }), "/server/package");
  await user.click(screen.getByRole("button", { name: "Preview plugin" }));
  expect(await screen.findByText("This plugin runs code with full access to this computer and every site on it.")).toBeTruthy();
  expect(port.installed).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Install (stays off)" }));
  expect(await screen.findByText("Fixture is installed and switched off. Turn it on in Downloaded.")).toBeTruthy();
  expect(port.installed).toHaveLength(1);
  expect((screen.getByRole("textbox", { name: "Folder on this server" }) as HTMLInputElement).value).toBe("");
  expect(screen.queryByRole("button", { name: "Install (stays off)" })).toBeNull();
});

it("Cancel drops the review without installing", async () => {
  const port = createFakePluginInstallPort({ preview });
  const { user } = renderAddTab(port);
  await user.type(await screen.findByRole("textbox", { name: "Folder on this server" }), "/server/package");
  await user.click(screen.getByRole("button", { name: "Preview plugin" }));
  await user.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(screen.queryByText("This plugin runs code with full access to this computer and every site on it.")).toBeNull();
  expect(screen.getByRole("button", { name: "Preview plugin" })).toBeTruthy();
  expect(port.installed).toHaveLength(0);
});

it("Enter in the folder field previews, like the button", async () => {
  const port = createFakePluginInstallPort({ preview }); const read = vi.spyOn(port, "preview");
  const { user } = renderAddTab(port);
  await user.type(await screen.findByRole("textbox", { name: "Folder on this server" }), "/server/package{Enter}");
  await waitFor(() => expect(read).toHaveBeenCalledWith({ source: { kind: "folder", path: "/server/package" }, replace: false }));
});

it("a code-free (tier-1) package reads as code-free, lists its content types, and shows this workspace's conflicts", async () => {
  const declarative = {
    ...preview, tier: "tier-1", hasCode: false, contentTypes: ["faq", "testimonial"],
    conflicts: [{ kind: "content-type", key: "faq", heldBy: "faq-holder", heldByName: "FAQ Holder", heldKey: "faq" }],
  };
  const { user } = renderAddTab(createFakePluginInstallPort({ preview: declarative }));
  await user.type(await screen.findByRole("textbox", { name: "Folder on this server" }), "/server/package");
  await user.click(screen.getByRole("button", { name: "Preview plugin" }));
  expect(await screen.findByText("This plugin has no code; nothing in it runs on this computer. Turning it on only adds what it declares.")).toBeTruthy();
  expect(screen.queryByText("This plugin runs code with full access to this computer and every site on it.")).toBeNull();
  expect(screen.getByText("Content types: faq, testimonial")).toBeTruthy();
  expect(screen.getByText("Tier: tier-1 · Local plugin · unverified publisher")).toBeTruthy();
  expect(screen.getByText("Already in use in this workspace (other workspaces are checked when you turn it on there):")).toBeTruthy();
  expect(screen.getByText('Content type "faq" is already used by FAQ Holder.')).toBeTruthy();
});

it("no conflicts: no conflict heading", async () => {
  const { user } = renderAddTab(createFakePluginInstallPort({ preview }));
  await user.type(await screen.findByRole("textbox", { name: "Folder on this server" }), "/server/package");
  await user.click(screen.getByRole("button", { name: "Preview plugin" }));
  await screen.findByText("Content types: —");
  expect(screen.queryByText(/Already in use in this workspace/)).toBeNull();
});

it("the header no longer carries an Install plugin button; the tab offers fields only when the server allows local installs", async () => {
  renderAddTab(createFakePluginInstallPort({ preview }));
  expect(await screen.findByRole("textbox", { name: "Folder on this server" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Install plugin" })).toBeNull();
  expect(screen.getByRole("tab", { name: /Add a plugin/ })).toBeTruthy();
  cleanup();
  renderAddTab(createFakePluginInstallPort({ preview }), []);
  expect(await screen.findByText("Local folder installs are disabled on this server.")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Folder on this server" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Preview plugin" })).toBeNull();
});

it("new consent and tab strings are translated in all supported locales", () => {
  const keys = ["Add a plugin", "Folder on this server", "Replace existing version", "Preview plugin", "Install (stays off)", "Local plugin · unverified publisher", "Capabilities", "Hooks", "This plugin runs code with full access to this computer and every site on it.", "It stays off in every workspace until you turn it on.", "Failed to preview plugin.", "Failed to install plugin.", "Package changed. Review it again before installing.", "Local folder installs are disabled on this server.", "Turn this plugin off in every workspace before installing.", "Installation conflicts with an existing plugin. Check its version and replacement option.", "Invalid plugin package. Check its manifest, integrity and folder.", "{name} is installed and switched off. Turn it on in Downloaded.", "Plugins that ship with Tovu can't be uninstalled: they come back on the next restart. To remove one you added, ask the assistant.", "Upload a .zip or a folder", "A .zip or a plugin folder, up to 32 MiB.", "Choose a folder", "Choose a plugin folder", "Advanced: install from a path on this server", "The full path of a plugin folder on the computer running Tovu.", "That folder is empty.", "Could not read that folder. Try again.", "That folder has more than 4096 files."];
  for (const locale of ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"]) {
    for (const key of keys) {
      expect(t({ locale: locale, key: key })).toBeTruthy();
      if (key !== "Hooks") expect(t({ locale: locale, key: key })).not.toBe(key);
    }
    expect(t({ locale: locale, key: "{name} is installed and switched off. Turn it on in Downloaded." })).toContain("{name}");
  }
});

it("Choose a folder zips the picked folder and previews it as a .zip; the server path sits under Advanced", async () => {
  const port = createFakePluginInstallPort({ preview }); const read = vi.spyOn(port, "preview");
  const { user } = renderAddTab(port, ["folder", "zip"]);
  expect(await screen.findByRole("button", { name: "Choose a folder" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Folder on this server" }).closest("details")?.querySelector("summary")?.textContent).toBe("Advanced: install from a path on this server");
  const manifest = new File(["{}"], "tovu.plugin.json");
  Object.defineProperty(manifest, "webkitRelativePath", { value: "hello/tovu.plugin.json" });
  fireEvent.change(screen.getByLabelText("Choose a plugin folder"), { target: { files: [manifest] } });
  expect(await screen.findByText("hello.zip")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Preview plugin" }));
  await waitFor(() => expect(read).toHaveBeenCalledOnce());
  const source = read.mock.calls[0]![0].source;
  expect(source.kind === "zip" && source.file.name).toBe("hello.zip");
});

it("an empty picked folder is refused in plain words and leaves nothing to preview", async () => {
  renderAddTab(createFakePluginInstallPort({ preview }), ["folder", "zip"]);
  fireEvent.change(await screen.findByLabelText("Choose a plugin folder"), { target: { files: [] } });
  expect(await screen.findByText("That folder is empty.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Preview plugin" }) as HTMLButtonElement).disabled).toBe(true);
});

it("the working Add a plugin tab is untagged and switches to the tab", async () => {
  const port = createFakePluginsPort({ plugins: [], installSources: ["folder"] });
  function useHook() { return usePlugins({ port, installPort: createFakePluginInstallPort({ preview }), locale: "en", t: (key) => key }); }
  render(<Plugins tabId="installed" usePluginsHook={useHook} />);
  const tab = await screen.findByRole("tab", { name: /^Add a plugin/ });
  expect(tab.querySelector(".tab-bar-tag")).toBeNull();
  expect(tab).not.toBeDisabled();
  await userEvent.setup().click(tab);
  expect(window.location.search).toBe("?tab=add");
  window.history.replaceState(null, "", "/");
});


it("publishes stable handles for the drop zone, Advanced, Replace and Cancel", async () => {
  const { user } = renderAddTab(createFakePluginInstallPort({ preview }), ["folder", "zip"]);
  await screen.findByRole("textbox", { name: "Folder on this server" });
  const advanced = screen.getByText("Advanced: install from a path on this server");
  expect(advanced).toHaveAttribute("data-agent-element", "plugins-install-advanced");
  expect(advanced.parentElement).not.toHaveAttribute("open");
  await user.click(advanced);
  expect(advanced.parentElement).toHaveAttribute("open");
  expect(screen.getByText("Drop a .zip here").closest(".install-tab-dropzone")).toHaveAttribute("data-agent-element", "plugins-install-dropzone");
  expect(screen.getByLabelText("Upload .zip (max 32 MiB)")).toHaveAttribute("data-agent-element", "plugins-install-zip-input");
  expect(screen.getByLabelText("Choose a plugin folder")).toHaveAttribute("data-agent-element", "plugins-install-folder-input");
  const replace = screen.getByRole("checkbox", { name: "Replace existing version" });
  expect(replace).toHaveAttribute("data-agent-element", "plugins-install-replace");
  await user.click(replace);
  expect(replace).toBeChecked();
  await user.type(screen.getByRole("textbox", { name: "Folder on this server" }), "/server/package");
  await user.click(screen.getByRole("button", { name: "Preview plugin" }));
  const cancel = await screen.findByRole("button", { name: "Cancel" });
  expect(cancel).toHaveAttribute("data-agent-element", "plugins-install-cancel");
  await user.click(cancel);
  expect(screen.queryByRole("button", { name: "Install (stays off)" })).toBeNull();
});
