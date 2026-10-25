import type { AgentPluginExport } from "@jini-ai/agent-plugins/manifest";
import type { PluginExportPackage, PluginExportSource } from "../../exports/source.js";
import { createPluginExportRuntime } from "../../exports/runtime.js";
import type { LoginProvider } from "../../../member-login/types.js";

export const workspaceId = "ws-embeds";
export const template = '<a class="plugin-demo-button" href="{{host.signIn}}"><img src="{{host.assets.mark}}" alt=""><span>{{props.label}}</span></a>';
export const definition: AgentPluginExport = {
  template: "components/button.html", version: 3, minVersion: 1, consent: "functional", staticExport: "full",
  props: { type: "object", properties: { label: { type: "string" } }, required: ["label"], additionalProperties: false },
  aliases: ["old-button"], hostLinks: { signIn: "member-login:demo" }, styles: "components/button.css", assets: { mark: "components/mark.png" },
};
export const owner: PluginExportPackage = {
  plugin: { pluginId: "demo", packageRoot: "/not-exposed/demo" }, id: "tovu/demo", renamedFrom: ["tovu/old-demo"],
  enabled: true, exports: { button: definition },
};
export const config = { type: "plugin", plugin: owner.id, component: "button", version: 1, props: { label: "Continue" } };
export function harness(options: { packages?: readonly PluginExportPackage[]; ready?: boolean; template?: string } = {}) {
  let reads = 0;
  const source: PluginExportSource = {
    list: async () => options.packages ?? [owner],
    readFile: async () => { reads += 1; return options.template ?? template; },
    readAsset: async ({ filename }) => filename.endsWith(".png") ? Uint8Array.from([137, 80, 78, 71, 255]) : "@layer plugin-exports {}",
  };
  const runtime = createPluginExportRuntime({ workspaceId, source,
    listProviders: async () => options.ready === false ? [] : [{ id: "demo", pluginId: "demo" } as LoginProvider] });
  return { source, runtime, reads: () => reads };
}
