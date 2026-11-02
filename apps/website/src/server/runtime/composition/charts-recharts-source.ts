/** Tovu's reviewed, compiled-in chart source. Jini owns admission and the browser lifecycle. */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { definePlugin } from "@tovu/sdk";
import type { BundledBrowserProviderApproval, PluginManifest } from "@jini-ai/plugins/host";

/** npm package that ships the Recharts provider payload and its agent face; a declared dependency. */
export const RECHARTS_PACKAGE_NAME = "@jini-ai/plugin-charts-recharts";

/** Tovu's default chart provider, injected into the chart snapshot; an explicit workspace setting wins. */
export const RECHARTS_DEFAULT_PROVIDER = "plugin.recharts";

// Review pins are compiled into the host, never read from a package requesting browser trust.
// They are copied from the packaged `plugins/charts-recharts/<version>/jini.plugin.json` after review;
// `recharts-package-pin.unit.test.ts` fails, printing the packaged map, whenever the two differ.
// The reviewed build carries the three-line labels (bd018de69), whole-number ticks (6ca90820a,
// 194095b1a) and the middle-dot separator wrapping (47b4199e0) that used to be patched into the bundle.
export const RECHARTS_BROWSER_APPROVAL: BundledBrowserProviderApproval = {
  pluginId: "charts-recharts",
  version: "0.6.19",
  browserProviders: [{ id: RECHARTS_DEFAULT_PROVIDER, kind: "chart", contractVersion: 1,
    kinds: ["bar", "line", "pie"], javascript: "client/provider.js", stylesheet: "client/styles.css" }],
  // PENDING INT: replace with the full packaged integrity map (licenses included) once the package is built.
  integrity: {
    "client/provider.js": "sha256-PENDING-PACKAGED-PIN",
    "client/styles.css": "sha256-PENDING-PACKAGED-PIN",
    "server/index.mjs": "sha256-PENDING-PACKAGED-PIN",
  },
};

const manifest: PluginManifest = {
  id: RECHARTS_BROWSER_APPROVAL.pluginId, name: "Recharts", version: RECHARTS_BROWSER_APPROVAL.version,
  extensions: { tovu: { id: "tovu/charts-recharts" } },
  sdkRange: "^0.1.0 || ^0.2.0", engine: 1, tier: "tier-3", capabilities: [], hooks: [], fields: [],
  browserProviders: RECHARTS_BROWSER_APPROVAL.browserProviders, integrity: RECHARTS_BROWSER_APPROVAL.integrity,
};

/**
 * The reviewed provider payload inside the installed package, at the PINNED version: a package upgrade
 * never admits unreviewed bytes (the pinned directory is absent, so charts fall back to the table).
 * @param optional.resolvePackage Node's resolver. Search roots match product-telemetry.ts, because the
 *   staged desktop bundle has no node_modules ancestor.
 * @throws When the declared package is not installed: a packaging defect, never a runtime choice.
 * @complexity O(1) resolver calls.
 * @example rechartsSourceDir({}) // …/node_modules/@jini-ai/plugin-charts-recharts/plugins/charts-recharts/0.6.19
 */
export function rechartsSourceDir(
  _required: Record<string, never> = {},
  { resolvePackage = createRequire(import.meta.url).resolve }: { resolvePackage?: (id: string, options: { paths: string[] }) => string } = {},
): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const installRoot = path.resolve(here, "../../../../..");
  const packageJson = resolvePackage(`${RECHARTS_PACKAGE_NAME}/package.json`,
    { paths: [here, path.join(installRoot, "tovu"), path.join(installRoot, "app.asar")] });
  return path.join(path.dirname(packageJson), "plugins", manifest.id, manifest.version);
}

const sourceDir = rechartsSourceDir();

export const RECHARTS_RUNTIME_SOURCE = {
  manifest, source: "built-in" as const, sourceDir, entryPath: path.join(sourceDir, "server/index.mjs"),
  // The no-op server wrapper is compiled in; only Jini's retained, admitted bytes reach the browser.
  importModule: async () => ({ default: definePlugin({ setup() {} }) }),
};
