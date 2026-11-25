import { afterEach, expect, it, vi } from "vitest";
import { defaultAgentPluginInstallPort } from "../hooks/agent-plugin-install-dependencies.hooks";
import { defaultPluginInstallPort } from "../hooks/plugin-install-dependencies.hooks";

afterEach(() => vi.unstubAllGlobals());

it("binds the update's old digest and preserves unconfirmed replacement", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init === undefined ? {} : { init }) });
    return new Response("{}", { headers: { "content-type": "application/json" } });
  });
  const file = new File(["zip"], "plugin.zip");
  await defaultAgentPluginInstallPort.installZip({ file, sha256: "new", update: { pluginId: "p/1", expectedOldDigest: "old" } });
  expect(calls[0]?.url).toBe("/api/admin/v1/workspaces/workspace-local/agent-plugins/p%2F1/update/zip?expectedSha256=new&replace=false&expectedOldDigest=old");
  await defaultPluginInstallPort.install({ source: { kind: "zip", file }, expectedDigest: "confirmed" });
  expect(calls[1]?.url).toBe("/api/admin/v1/workspaces/workspace-local/plugins/install/zip?replace=false&expectedDigest=confirmed");
  expect(calls[1]?.init?.method).toBe("POST");
});
