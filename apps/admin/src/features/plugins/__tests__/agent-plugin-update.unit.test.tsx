import { act, render, renderHook, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AgentPlugins } from "../AgentPlugins";
import { AgentPluginDisableConfirmDialog } from "../AgentPluginDisableConfirmDialog";
import { AgentPluginRow } from "../AgentPluginRow";
import { AgentPluginUpdateControl } from "../AgentPluginUpdateControl";
import { createFakeAgentPluginInstallPort, defaultAgentPluginInstallPort } from "../hooks/agent-plugin-install-dependencies.hooks";
import { useAgentPluginInstall } from "../hooks/use-agent-plugin-install.hooks";
import type { AgentPluginsController } from "../hooks/use-agent-plugins.hooks";
import { t as translatePlugins } from "../plugins-i18n";
import { agentPluginCompatibilityLines, agentPluginWarningText, canUpdateAgentPlugin } from "../rules";
import { ApiError, type AdminAgentPlugin } from "@/lib/api";

/**
 * @file The Agent Plugins lifecycle fields on screen (2026-10-21): a row this Tovu cannot run or
 * whose requirements are unmet says so; only an operator-installed row with its installed digest
 * offers Update (bundled rows never do); the update uploads through `AGENT_PLUGIN_UPDATE_ZIP` with
 * that digest; its refusals and warnings read in the operator's language; and the disable dialog
 * names the plugins that rely on the one being turned off.
 */

const DIGEST = "d".repeat(64);
const UPLOADED: AdminAgentPlugin & { archiveDigest: string } = {
  pluginId: "note-taker", displayName: "Note Taker", version: "1.0.0", description: null, keywords: [], enabled: true, skills: [], mcpServerIds: [],
  origin: "operator-installed", archiveDigest: DIGEST, hostOk: true, missingRequires: [], requiredBy: [],
};
const BUNDLED: AdminAgentPlugin = { ...UPLOADED, pluginId: "site-compliance", displayName: "Site Compliance", origin: "bundled" };
const NO_DIGEST: AdminAgentPlugin = { ...UPLOADED, pluginId: "old-server", displayName: "Old Server", archiveDigest: undefined };

const zip = (name = "note-taker.zip") => new File(["PK\u0003\u0004"], name, { type: "application/zip" });

function controllerFor(agentPlugins: AdminAgentPlugin[], onInstalled = vi.fn()): AgentPluginsController {
  return {
    agentPlugins, error: null, toggleError: null, togglingIds: new Set<string>(), onToggleEnabled: async () => {}, onInstalled,
    expandedIds: new Set(agentPlugins.map((plugin) => plugin.pluginId)), onToggleExpanded: () => {},
    inspectedPlugin: null, inspectPlugin: () => {}, closeInspector: () => {}, t: (key: string) => key, locale: "en",
  };
}

function renderRow(plugin: AdminAgentPlugin, update?: ReactNode) {
  render(<ul><AgentPluginRow plugin={plugin} t={(key) => key} locale="en" expanded busy={false} onToggleExpanded={vi.fn()}
    stateControl={{ kind: "toggle", onToggleEnabled: vi.fn() }} onInspect={vi.fn()} uninstallNoteId="note" agentHandleBase="row" update={update} /></ul>);
  return screen.getByRole("listitem", { name: plugin.displayName! });
}

describe("Agent Plugin rows — compatibility and Update", () => {
  it("only an operator-installed row with its digest offers Update; bundled rows never do", async () => {
    const port = createFakeAgentPluginInstallPort({ row: UPLOADED });
    render(<AgentPlugins useAgentPluginsHook={() => controllerFor([UPLOADED, BUNDLED, NO_DIGEST])} agentPluginInstallPort={port} />);
    expect(await screen.findByRole("button", { name: "Update Note Taker" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Update Site Compliance" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Update Old Server" })).toBeNull();
  });

  it("a row this Tovu cannot run, and one with unmet requirements, say so under the name", () => {
    const row = renderRow({ ...UPLOADED, hostOk: false, missingRequires: ["db:query", "mail:send"] });
    expect(within(row).getByText("Not for this Tovu version")).toHaveClass("agent-plugin-row-desc");
    expect(within(row).getByText("Needs db:query, mail:send")).toHaveClass("agent-plugin-row-desc");
  });

  it("a compatible row, or one from a server without the fields, shows no compatibility line", () => {
    const row = renderRow({ ...NO_DIGEST, hostOk: undefined, missingRequires: undefined });
    expect(within(row).queryByText(/Not for this Tovu version|^Needs /)).toBeNull();
  });

  it("the Update slot renders inside the expanded details", () => {
    const row = renderRow(UPLOADED, <button type="button">slot</button>);
    expect(within(row).getByRole("button", { name: "slot" }).closest(".agent-plugin-row-detail")).not.toBeNull();
  });
});

describe("AgentPluginUpdateControl", () => {
  async function openAndUpload(port: ReturnType<typeof createFakeAgentPluginInstallPort>, onUpdated = vi.fn()) {
    render(<AgentPluginUpdateControl plugin={UPLOADED} t={(key) => key} agentHandleBase="row-note-taker" onUpdated={onUpdated} port={port} />);
    const toggle = screen.getByRole("button", { name: "Update Note Taker" });
    expect(toggle).toHaveAttribute("data-agent-element", "row-note-taker-update");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Update Note Taker" })).toHaveAttribute("id", "row-note-taker-update-title");
    expect(screen.queryByRole("checkbox", { name: "Replace existing version" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Plugin URL" })).toBeNull();
    await userEvent.upload(screen.getByLabelText("Upload a .zip"), zip());
    const submit = screen.getByRole("button", { name: "Update" });
    expect(submit).toHaveAttribute("data-agent-element", "row-note-taker-update-install");
    await userEvent.click(submit);
    return { onUpdated };
  }

  it("uploads with the row's digest, hands back the updated row, and says it is updated with any warnings", async () => {
    const updated = { ...UPLOADED, version: "1.1.0", archiveDigest: "e".repeat(64) };
    const port = createFakeAgentPluginInstallPort({ row: updated }, { warnings: ["Needs x:y", "consumer needs mail:send"] });
    const { onUpdated } = await openAndUpload(port);
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    expect(port.uploads).toEqual([{ name: "note-taker.zip", sha256: "sha-of-note-taker.zip", update: { pluginId: "note-taker", expectedOldDigest: DIGEST } }]);
    expect(screen.getByText("Note Taker is updated.")).toBeInTheDocument();
    expect(screen.getByText("Needs x:y")).toBeInTheDocument();
    expect(screen.getByText("consumer needs mail:send")).toBeInTheDocument();
  });

  it("closes again from the same button", async () => {
    render(<AgentPluginUpdateControl plugin={UPLOADED} t={(key) => key} agentHandleBase="row" onUpdated={vi.fn()} port={createFakeAgentPluginInstallPort({ row: UPLOADED })} />);
    const toggle = screen.getByRole("button", { name: "Update Note Taker" });
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Upload a .zip")).toBeNull();
  });

  it.each([
    ["PLUGIN_CHANGED", "This plugin changed since this page loaded. Reload the page and try again."],
    ["PLUGIN_DOWNGRADE_REFUSED", "This package is an older version than the one installed."],
    ["PLUGIN_ID_MISMATCH", "This package is a different plugin."],
    ["PLUGIN_BUNDLED", "Plugins that ship with Tovu update with Tovu."],
    ["PLUGIN_UPDATE_PENDING", "An earlier update is still being recovered. Restart Tovu and try again."],
    ["PLUGIN_HOST_INCOMPATIBLE", "This plugin is not made for this Tovu version."],
    ["UPDATE_JOURNAL_INVALID", "Could not update the plugin. Try again."],
  ])("a 409 %s refusal reads in plain words, never the server's text", async (code, message) => {
    const port = createFakeAgentPluginInstallPort({ row: UPLOADED }, { failWith: new ApiError("server english", 409, code) });
    const { onUpdated } = await openAndUpload(port);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

describe("useAgentPluginInstall — install vs update copy", () => {
  function hookWith(installZip: () => Promise<never>, update?: { pluginId: string; expectedOldDigest: string }) {
    const port = { sha256: async () => "sha", installZip: vi.fn(installZip) };
    return renderHook(() => useAgentPluginInstall({ port, t: (key) => `t:${key}`, onInstalled: vi.fn() }, update ? { update } : {})).result;
  }

  it("an unrecognised install refusal is the install's own try-again line, translated", async () => {
    const result = hookWith(async () => { throw new ApiError("raw", 409, "SOMETHING_NEW"); });
    act(() => result.current.onFileChange({ target: { files: [zip()] } } as never));
    await act(async () => result.current.install());
    expect(result.current.error).toBe("t:Could not install the plugin. Try again.");
    expect(result.current.updating).toBe(false);
  });

  it("a non-API failure while updating is the update's try-again line", async () => {
    const result = hookWith(async () => { throw new TypeError("network down"); }, { pluginId: "note-taker", expectedOldDigest: DIGEST });
    act(() => result.current.onFileChange({ target: { files: [zip()] } } as never));
    await act(async () => result.current.install());
    expect(result.current.error).toBe("t:Could not update the plugin. Try again.");
    expect(result.current.updating).toBe(true);
  });

  it("an update of identical bytes says it is already installed", async () => {
    const port = createFakeAgentPluginInstallPort({ row: UPLOADED }, { alreadyInstalled: true });
    const { result } = renderHook(() => useAgentPluginInstall({ port, t: (key) => key, onInstalled: vi.fn() }, { update: { pluginId: "note-taker", expectedOldDigest: DIGEST } }));
    act(() => result.current.onFileChange({ target: { files: [zip()] } } as never));
    await act(async () => result.current.install());
    expect(result.current.installedMessage).toBe("Note Taker is already installed.");
    expect(result.current.warnings).toEqual([]);
  });
});

describe("Agent Plugin update transport", () => {
  it("posts to the plugin's update route with the installed digest", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ agentPlugin: UPLOADED, alreadyInstalled: false, warnings: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      await defaultAgentPluginInstallPort.installZip({ file: zip(), sha256: "a".repeat(64), update: { pluginId: "note-taker", expectedOldDigest: DIGEST } });
      const url = new URL(String(fetch.mock.calls[0]![0]), "http://localhost");
      expect(url.pathname).toMatch(/\/agent-plugins\/note-taker\/update\/zip$/);
      expect(url.searchParams.get("expectedOldDigest")).toBe(DIGEST);
      expect(url.searchParams.get("expectedSha256")).toBe("a".repeat(64));
    } finally { fetch.mockRestore(); }
  });
});

describe("AgentPluginDisableConfirmDialog — provenance and dependents", () => {
  function renderDialog(props: { origin?: "bundled" | "operator-installed"; requiredBy?: string[] }) {
    render(<AgentPluginDisableConfirmDialog name="Mailer" variant="disable" agentHandleBase="row-mailer" onConfirm={vi.fn()} onCancel={vi.fn()} t={(key) => key} {...props} />);
    return screen.getByRole("dialog");
  }

  it("an operator-installed package keeps its files and memory; dependents are named", () => {
    const dialog = renderDialog({ origin: "operator-installed", requiredBy: ["consumer needs mail:send", "digest needs mail:send"] });
    expect(dialog).toHaveTextContent("You added this package. Turning it off keeps its files and memory.");
    expect(within(dialog).getByText("Other enabled plugins rely on it: consumer needs mail:send; digest needs mail:send")).toBeInTheDocument();
  });

  it("a bundled package (or an older server's row) keeps the ships-with-Tovu sentence and lists no dependents", () => {
    const dialog = renderDialog({ requiredBy: [] });
    expect(dialog).toHaveTextContent("This package ships with Tovu — it can't be deleted outright, only turned off.");
    expect(dialog).not.toHaveTextContent("Other enabled plugins rely on it");
  });
});

describe("plugins-i18n — every lifecycle string is translated in every locale", () => {
  const KEYS = [
    "Not for this Tovu version", "Needs {capabilities}", "{plugin} needs {capability}", "Update", "Updating…",
    "Upload a newer version of this plugin as a .zip or a folder. It keeps its memory and stays on or off as it is now.",
    "{name} is updated.", "You added this package. Turning it off keeps its files and memory.", "Other enabled plugins rely on it:",
    "This plugin changed since this page loaded. Reload the page and try again.", "This package is an older version than the one installed.",
    "This package is a different plugin.", "Plugins that ship with Tovu update with Tovu.",
    "An earlier update is still being recovered. Restart Tovu and try again.", "This plugin is not made for this Tovu version.",
    "Could not update the plugin. Try again.", "This package has no release version to compare.",
    "Same version number as the installed one, with different contents.",
  ];
  const LOCALES = ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"];

  it.each(LOCALES)("%s translates each key and keeps its placeholders", (locale) => {
    for (const key of KEYS) {
      const value = translatePlugins({ locale, key });
      expect(value, `${locale}: ${key}`).not.toBe(key);
      for (const placeholder of key.match(/\{[a-z]+\}/g) ?? []) expect(value, `${locale}: ${key}`).toContain(placeholder);
    }
  });
});

describe("rules — lifecycle fields", () => {
  const translate = (key: string) => `[${key}]`;

  it("agentPluginWarningText translates the server's known warnings, keeping ids, and passes unknown ones through", () => {
    expect(agentPluginWarningText("Needs x:y", translate)).toBe("[Needs {capabilities}]".replace("{capabilities}", "x:y"));
    expect(agentPluginWarningText("consumer needs mail:send", translate)).toBe("[{plugin} needs {capability}]".replace("{plugin}", "consumer").replace("{capability}", "mail:send"));
    expect(agentPluginWarningText("Unknown release version; explicit replacement required.", translate)).toBe("[This package has no release version to compare.]");
    expect(agentPluginWarningText("Same version with different bytes; explicit replacement required.", translate)).toBe("[Same version number as the installed one, with different contents.]");
    expect(agentPluginWarningText("Something the server added later", translate)).toBe("Something the server added later");
  });

  it("agentPluginCompatibilityLines: incompatible first, then unmet requirements; nothing for a compatible row", () => {
    expect(agentPluginCompatibilityLines({ hostOk: false, missingRequires: ["a:b"] }, (key) => key)).toEqual(["Not for this Tovu version", "Needs a:b"]);
    expect(agentPluginCompatibilityLines({ hostOk: true, missingRequires: [] }, (key) => key)).toEqual([]);
  });

  it("canUpdateAgentPlugin: operator-installed with a digest only", () => {
    expect(canUpdateAgentPlugin({ origin: "operator-installed", archiveDigest: DIGEST })).toBe(true);
    expect(canUpdateAgentPlugin({ origin: "operator-installed", archiveDigest: "" })).toBe(false);
    expect(canUpdateAgentPlugin({ origin: "operator-installed" })).toBe(false);
    expect(canUpdateAgentPlugin({ origin: "bundled", archiveDigest: DIGEST })).toBe(false);
    expect(canUpdateAgentPlugin({ archiveDigest: DIGEST })).toBe(false);
  });
});
