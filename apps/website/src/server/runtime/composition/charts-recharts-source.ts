/** Tovu's reviewed, compiled-in chart source. Jini owns admission and the browser lifecycle. */
import path from "node:path";
import { definePlugin } from "@tovu/sdk";
import type { BundledBrowserProviderApproval, PluginManifest } from "@jini-ai/plugins/host";
import { resolveProductRoot } from "#src/platform/site-dir/product-root";

// Review pins are compiled into the host, never read from a package requesting browser trust.
export const RECHARTS_BROWSER_APPROVAL: BundledBrowserProviderApproval = {
  pluginId: "charts-recharts",
  version: "0.1.0",
  browserProviders: [{ id: "plugin.recharts", kind: "chart", contractVersion: 1,
    kinds: ["bar", "line", "pie"], javascript: "client/provider.js", stylesheet: "client/styles.css" }],
  integrity: {
    "client/provider.js": "sha256-6d789dce000e43e5ff988e2dc383938d3284cd8e33fac527716bfd3e53d9ca37",
    "client/styles.css": "sha256-bf1945d4c9ea2f3c8e2d99ac0e96429e486f408a72135c39b25a0da855ca4a1b",
    "server/index.mjs": "sha256-8b150b05c97bd91c5fa0015b7cdc88add7435e1b08ea7665ded2960b13c5ba85",
  },
};

const manifest: PluginManifest = {
  id: RECHARTS_BROWSER_APPROVAL.pluginId, name: "Recharts", version: RECHARTS_BROWSER_APPROVAL.version,
  extensions: { tovu: { id: "tovu/charts-recharts" } },
  sdkRange: "^0.1.0 || ^0.2.0", engine: 1, tier: "tier-3", capabilities: [], hooks: [], fields: [],
  browserProviders: RECHARTS_BROWSER_APPROVAL.browserProviders, integrity: RECHARTS_BROWSER_APPROVAL.integrity,
};
const sourceDir = path.join(resolveProductRoot(), "content/plugins/charts-recharts", manifest.version);

export const RECHARTS_RUNTIME_SOURCE = {
  manifest, source: "built-in" as const, sourceDir, entryPath: path.join(sourceDir, "server/index.mjs"),
  // The no-op server wrapper is compiled in; only Jini's retained, admitted bytes reach the browser.
  importModule: async () => ({ default: definePlugin({ setup() {} }) }),
};
