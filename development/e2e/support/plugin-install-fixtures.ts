import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";
import { buildZipFixture } from "../../../apps/website/src/features/agent-plugins/__tests__/fixtures/build-zip.js";
import type { IsolatedJourneySite } from "./isolated-journey-site.js";

export const WORKSPACE = "workspace-local";
export const PLUGIN_API = `/api/admin/v1/workspaces/${WORKSPACE}`;
export const HELLO_NAME = "QA Fake Hello Plugin With A Long Name For Narrow Lists";
const SOURCE = path.resolve(import.meta.dirname, "../fixtures/plugins");
export type PluginFamily = "site" | "agent";
export interface PluginRow { id?: string; pluginId?: string; name?: string; version: string; enabled: boolean }

/** Reuse the real ZIP writer already used by the install-route tests; no archive dependency added. */
async function entries({ directory, prefix = "" }: { directory: string; prefix?: string }): Promise<Array<{ path: string; content: Buffer }>> {
  const result: Array<{ path: string; content: Buffer }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await entries({ directory: absolute, prefix: relative + "/" }));
    else result.push({ path: relative, content: await readFile(absolute) });
  }
  return result;
}

export async function pluginRows({ request, family }: { request: APIRequestContext; family: PluginFamily }, _optional = {}): Promise<PluginRow[]> {
  const response = await request.get(`${PLUGIN_API}/${family === "site" ? "plugins" : "agent-plugins"}`);
  expect(response.ok(), await response.text()).toBe(true);
  const body = await response.json();
  return family === "site" ? body.plugins : body.agentPlugins;
}

/** Every case gets fresh ids: site uninstalls retain a Trash entry and cannot be reinstalled under
 * the same id. Renaming only the manifest leaves the README integrity/skill contents untouched. */
export async function createPluginInstallFixtures(
  { site, request }: { site: IsolatedJourneySite; request: APIRequestContext }, _optional = {},
) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "tovu-plugin-install-fixtures-"));
  const suffix = createHash("sha256").update(randomUUID()).digest("hex").slice(0, 10);
  const ids = { site: `qa-fake-hello-${suffix}`, agent: `qa-fake-agent-${suffix}` };
  async function packageFiles({ family, version = "1.0.0" }: { family: PluginFamily; version?: "1.0.0" | "1.0.1" }, _optional = {}) {
    const sourceId = family === "site" ? "qa-fake-hello" : "qa-fake-agent";
    const directory = path.join(temp, ids[family], version);
    await cp(path.join(SOURCE, sourceId, version), directory, { recursive: true });
    const manifestPath = path.join(directory, family === "site" ? "tovu.plugin.json" : "plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest[family === "site" ? "id" : "name"] = ids[family];
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    const zipPath = path.join(temp, `${ids[family]}-${version}.zip`);
    await writeFile(zipPath, await buildZipFixture(await entries({ directory })));
    return { directory, zipPath, id: ids[family] };
  }

  async function cleanup(_required = {}, _optional = {}) {
    // The test fixture checks site provenance before constructing this helper. Never infer a root
    // from the shell's TOVU_* settings: those may still point at the owner's development site.
    const errors: unknown[] = [];
    for (const family of ["site", "agent"] as const) {
      try {
        const rows = await pluginRows({ request, family });
        if (rows.some((row) => (row.id ?? row.pluginId) === ids[family])) {
          if (family === "site") {
            const response = await request.delete(`${PLUGIN_API}/plugins/${ids.site}`);
            expect(response.ok(), await response.text()).toBe(true);
          } else {
            // Agent Plugins has no HTTP uninstall route/UI action yet. Use the same domain
            // uninstall as plugins_uninstall, with an explicitly isolated layout and one QA id.
            const { resolveAgentPluginLayout } = await import("../../../apps/website/src/features/agent-plugins/layout.js");
            const { uninstallAgentPlugin } = await import("../../../apps/website/src/features/agent-plugins/uninstall.js");
            const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(site.siteDir, "agent-plugins") } });
            await uninstallAgentPlugin({ layout, workspaceId: WORKSPACE, pluginId: ids.agent });
          }
        }
        expect((await pluginRows({ request, family })).some((row) => (row.id ?? row.pluginId) === ids[family]), `cleanup left ${ids[family]} installed`).toBe(false);
      } catch (error) { errors.push(error); }
    }
    await rm(temp, { recursive: true, force: true });
    if (errors.length) throw new AggregateError(errors, "Plugin fixture cleanup failed");
  }
  return { ids, packageFiles, cleanup };
}

export type PluginInstallFixtures = Awaited<ReturnType<typeof createPluginInstallFixtures>>;
