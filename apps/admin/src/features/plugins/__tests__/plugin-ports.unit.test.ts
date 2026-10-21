import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminAgentPlugin, AdminPlugin } from "@/lib/api";
import { defaultAgentPluginInstallPort } from "../hooks/agent-plugin-install-dependencies.hooks";
import { defaultAgentPluginMemoryPort } from "../hooks/agent-plugin-memory-dependencies.hooks";
import { createFakeAgentPluginsPort } from "../hooks/agent-plugins-dependencies.hooks";
import { createFakePluginInstallPort, defaultPluginInstallPort } from "../hooks/plugin-install-dependencies.hooks";
import { createFakePluginsPort } from "../hooks/plugins-dependencies.hooks";
import type { PluginInstallPreview } from "../hooks/plugin-install-port.hooks";

/**
 * @file The plugin screens' ports: the live bindings' request shapes (method, path, body) through
 * the shared authenticated request seam, the agent-plugin zip digest, and the in-memory fakes'
 * refusal rules, which mirror the real routes so screen tests can rely on them.
 */

type FetchCall = { url: string; init: RequestInit };

function stubFetch(body: unknown = {}): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("defaultAgentPluginInstallPort", () => {
  it("POSTs the zip bytes with the expected digest and replace flag", async () => {
    const calls = stubFetch({ agentPlugin: { pluginId: "p" } });
    const file = new File(["zip-bytes"], "plugin.zip");
    await defaultAgentPluginInstallPort.installZip({ file, sha256: "ab12" });
    await defaultAgentPluginInstallPort.installZip({ file, sha256: "ab12", replace: true });
    expect(calls.map((call) => call.url)).toEqual([
      expect.stringMatching(/\/agent-plugins\/install\/zip\?expectedSha256=ab12&replace=false$/),
      expect.stringMatching(/\/agent-plugins\/install\/zip\?expectedSha256=ab12&replace=true$/),
    ]);
    expect(calls[0]?.init.method).toBe("POST");
    const sent = calls[0]?.init.body as Blob;
    expect(sent.type).toBe("application/zip");
    expect(await sent.text()).toBe("zip-bytes");
  });

  it("hashes a file to its lower-case hex SHA-256", async () => {
    await expect(defaultAgentPluginInstallPort.sha256({ file: new File(["abc"], "a.zip") }))
      .resolves.toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("defaultAgentPluginMemoryPort", () => {
  it("PUTs a note to the plugin's encoded memory endpoint", async () => {
    const calls = stubFetch({ notes: [], learned: [] });
    await defaultAgentPluginMemoryPort.saveNote({ pluginId: "acme/notes", entryPath: "a.md", text: "hi" });
    expect(calls[0]?.url).toMatch(/\/agent-plugins\/acme%2Fnotes\/memory$/);
    expect(calls[0]?.init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ entryPath: "a.md", text: "hi" });
  });
});

describe("defaultPluginInstallPort", () => {
  it("previews and installs a folder source as JSON on the folder endpoints", async () => {
    const calls = stubFetch({ plugin: {} });
    const body = { source: { kind: "folder" as const, path: "/plugins/acme" } };
    await defaultPluginInstallPort.preview(body as never);
    await defaultPluginInstallPort.install(body as never);
    expect(calls.map((call) => call.url)).toEqual([
      expect.stringMatching(/\/plugins\/install\/preview$/),
      expect.stringMatching(/\/plugins\/install$/),
    ]);
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual(body);
  });
});

describe("createFakePluginInstallPort", () => {
  it("refuses an install whose consent digest no longer matches the preview", async () => {
    const port = createFakePluginInstallPort({ preview: { digest: "d1" } as PluginInstallPreview });
    await expect(port.install({ expectedDigest: "stale" } as never)).rejects.toMatchObject({ status: 409, code: "PLUGIN_CHANGED_SINCE_PREVIEW" });
    expect(port.installed).toEqual([]);
  });
});

describe("createFakeAgentPluginsPort", () => {
  it("refuses to toggle a plugin that is not installed", async () => {
    const port = createFakeAgentPluginsPort({ agentPlugins: [{ pluginId: "a", enabled: false } as AdminAgentPlugin] });
    await expect(port.setAgentPluginEnabled("missing", { enabled: true })).rejects.toThrow("fake port: 'missing' is not installed");
  });
});

describe("createFakePluginsPort refusals mirror the real routes", () => {
  const userPlugin = { id: "user", source: "installed", enabled: false } as AdminPlugin;
  const builtIn = { id: "core", source: "built-in", enabled: false } as AdminPlugin;

  it("refuses to toggle an unknown plugin", async () => {
    const port = createFakePluginsPort({ plugins: [userPlugin] });
    await expect(port.setPluginEnabled("missing", { enabled: true })).rejects.toThrow("fake plugin not found: missing");
  });

  it("refuses to uninstall an unknown, built-in, or already-trashed plugin", async () => {
    const port = createFakePluginsPort({ plugins: [userPlugin, builtIn] });
    await expect(port.uninstallPlugin("missing")).rejects.toMatchObject({ status: 404, code: "PLUGIN_NOT_FOUND" });
    await expect(port.uninstallPlugin("core")).rejects.toMatchObject({ status: 422, code: "PLUGIN_NOT_UNINSTALLABLE" });
    await expect(port.uninstallPlugin("user")).resolves.toEqual({ pluginId: "user", trashed: true });
    await expect(port.uninstallPlugin("user")).rejects.toMatchObject({ status: 409, code: "PLUGIN_IN_TRASH" });
  });

  it("refuses to uninstall a plugin that is still enabled", async () => {
    const port = createFakePluginsPort({ plugins: [{ ...userPlugin, enabled: true }] });
    await expect(port.uninstallPlugin("user")).rejects.toMatchObject({ status: 409, code: "PLUGIN_ENABLED" });
    expect(port.plugins.map((plugin) => plugin.id)).toEqual(["user"]);
  });

  it("answers 404 for package files it has no listing for", async () => {
    const port = createFakePluginsPort({ plugins: [userPlugin] });
    await expect(port.getPluginFiles("user")).rejects.toMatchObject({ status: 404, code: "PLUGIN_NOT_FOUND" });
  });
});
