/** Tovu's reviewed, compiled-in chart source. Jini owns admission and the browser lifecycle. */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { definePlugin } from "@tovu/sdk";
import type { BundledBrowserProviderApproval, PluginManifest } from "@jini-ai/plugins/host";

/**
 * npm package that ships the Recharts provider payload (`plugins/charts-recharts/<version>`); a declared
 * dependency. Its agent face ships separately as `@jini-ai/agent-plugins/charts-recharts`, selected in
 * `bundled-catalog.ts` (owner, 11-02: no per-plugin npm packages).
 */
export const RECHARTS_PACKAGE_NAME = "@jini-ai/provider-plugins";

/** Tovu's default chart provider, injected into the chart snapshot; an explicit workspace setting wins. */
export const RECHARTS_DEFAULT_PROVIDER = "plugin.recharts";

// Review pins are compiled into the host, never read from a package requesting browser trust.
// They are copied from the packaged `plugins/charts-recharts/<version>/jini.plugin.json` after review;
// (before the first build they were sha256-PENDING-PACKAGED-PIN
// placeholders, and admission refused the provider so charts fell back to the table);
// `recharts-package-pin.unit.test.ts` fails, printing the packaged map, whenever the two differ.
// The reviewed build carries the three-line labels (bd018de69), whole-number ticks (6ca90820a,
// 194095b1a) and the middle-dot separator wrapping (47b4199e0) that used to be patched into the bundle.
export const RECHARTS_BROWSER_APPROVAL: BundledBrowserProviderApproval = {
  pluginId: "charts-recharts",
  version: "0.7.0",
  browserProviders: [{ id: RECHARTS_DEFAULT_PROVIDER, kind: "chart", contractVersion: 1,
    kinds: ["bar", "line", "pie"], javascript: "client/provider.js", stylesheet: "client/styles.css" }],
  // The full packaged integrity map (licenses included), copied from the reviewed 0.7.0 build.
  // 0.6.24 -> 0.7.0 (2026-11-13): only three license-metadata files changed (version strings);
  // provider.js, styles.css and server/index.mjs are byte-identical. Missing this bump after the
  // Jini 0.7.0 move left the pinned folder absent: INTEGRITY_FAILED, charts off on every site.
  integrity: {
    "client/provider.js": "sha256-94627633bcbab5f1daa365f4c0285cd6a2bb571dd55265f9a9ee04e950daad4d",
    "client/styles.css": "sha256-8bf7290ed757364db0ab99e55f2ab682647f572fbdda622f1c39937727e8eb3c",
    "licenses/_jini-ai_provider-plugins/LICENSE": "sha256-9d95806a26532623360eb84bb17d298f394b55ef73fb4c0796d99b4319b2b0da",
    "licenses/_jini-ai_provider-plugins/NOTICE": "sha256-41f25c5b9af4c8e8e98e2a7c658b3922253c760686e17e0ef7fa003fae83cb95",
    "licenses/_jini-ai_provider-plugins/package-license.json": "sha256-3827ebcebc2ee244ddd52e242e17e39a0c7e43baa8c414f980f3f22e58c8cb1a",
    "licenses/_jini-ai_ui/LICENSE": "sha256-9d95806a26532623360eb84bb17d298f394b55ef73fb4c0796d99b4319b2b0da",
    "licenses/_jini-ai_ui/LICENSE-SOURCE": "sha256-719e65e0fba2e55cf53f4b4ebe7174340bab0e88695bed92a81a6bf990ac19a2",
    "licenses/_jini-ai_ui/NOTICE": "sha256-41f25c5b9af4c8e8e98e2a7c658b3922253c760686e17e0ef7fa003fae83cb95",
    "licenses/_jini-ai_ui/package-license.json": "sha256-1cef9dc7892975dbd987a9b14a884f09ed5542df26a2475857179b71f7348271",
    "licenses/_reduxjs_toolkit/LICENSE": "sha256-49784961ec6c4941437b7a2c54d8977d0528076a9e7c73dd40f7d0942b8f106d",
    "licenses/_reduxjs_toolkit/package-license.json": "sha256-841f76ddac88a780f1d16a201f72ad529d0b50148fcba84d103a65a8689f95b0",
    "licenses/clsx/license": "sha256-9a9edad7baae52622bddf3c15b2ef8a33d2c89f2d25408ad13e8a7481c6b0c97",
    "licenses/clsx/package-license.json": "sha256-3c6f359a107dc95f67b8fecccd18257a3cfdb127a9d01f4eb01e5cef1c0c51ab",
    "licenses/d3-array/LICENSE": "sha256-3e6849627f74ff73c257a3ae1efb574015d94fc1035c05ec3c15805165efcbc4",
    "licenses/d3-array/package-license.json": "sha256-b24887be0f7bd9f832d427c94322f7803bd6a48fb925a0eb749b74b90cb029f1",
    "licenses/d3-color/LICENSE": "sha256-faa682e3e430941f958d26180458f5934a62f58dac4d70ccdd15608c15d0f884",
    "licenses/d3-color/package-license.json": "sha256-20d0241a9a4da4ffc6e6f3b5380310d71d8cd26fd7716a1f63447382bd73df0d",
    "licenses/d3-format/LICENSE": "sha256-2a6d2d5f32ba0b755ddbc1c833f766e30cdbe6ebe9a6d4e3e24427721f0b63d3",
    "licenses/d3-format/package-license.json": "sha256-196e9bdf613fdaf3b896a34a5bc696c16b91960bfca827193e90192cbb51e220",
    "licenses/d3-interpolate/LICENSE": "sha256-e008c5e25a6be382593089c29bfabbc553c6378eee02895aec46ce396cc404ee",
    "licenses/d3-interpolate/package-license.json": "sha256-2924e9f7b424c749f4d690ddbe7ff9266d4f06a971bf0de2e854f58bfa1f3623",
    "licenses/d3-path/LICENSE": "sha256-a09b0d6d76e768fca2085fad05743ee81ddd11946bcda160a3cf5e1081a479aa",
    "licenses/d3-path/package-license.json": "sha256-9af8f26d221e2f671e05ed8086fab26974562d0095ea8c08516c927e38770134",
    "licenses/d3-scale/LICENSE": "sha256-e008c5e25a6be382593089c29bfabbc553c6378eee02895aec46ce396cc404ee",
    "licenses/d3-scale/package-license.json": "sha256-da8dde35c77ac5c672f4184a6b4d6474a6adadb7fc352280ffc7f91b671e0a9a",
    "licenses/d3-shape/LICENSE": "sha256-faa682e3e430941f958d26180458f5934a62f58dac4d70ccdd15608c15d0f884",
    "licenses/d3-shape/package-license.json": "sha256-0d83e82ab9636ecf3e6a1fb4501b9a8a796d99625c42f70b100de36a01e19882",
    "licenses/d3-time/LICENSE": "sha256-faa682e3e430941f958d26180458f5934a62f58dac4d70ccdd15608c15d0f884",
    "licenses/d3-time/package-license.json": "sha256-218a0f8b88ddbab89e8cca6b16fae46ff3d8b7608edb6a82b8959192afed6321",
    "licenses/d3-time-format/LICENSE": "sha256-e008c5e25a6be382593089c29bfabbc553c6378eee02895aec46ce396cc404ee",
    "licenses/d3-time-format/package-license.json": "sha256-e41d14702b5db73ca9e76e0e0abae67194e33f92a3fb382a218bb88a9a0e8026",
    "licenses/decimal.js-light/LICENCE.md": "sha256-fc0397fbd5c128bec7edef4e8d3f45e15db5fd043cdd0a2edfc4f14d47fbc3e4",
    "licenses/decimal.js-light/package-license.json": "sha256-e3c96d33f14b9645b319a0edc94c832c20d348f6c48a30c4384ac39ec0ddc1c2",
    "licenses/es-toolkit/LICENSE": "sha256-51f3674294d988d89dbebd31273baaeb3c697a15482d9699b14d1fded2e132a7",
    "licenses/es-toolkit/package-license.json": "sha256-f93bae16609dbb188e02aceb896a0fe6b04bfacc8dbaa7e0f1abe6cf2397e162",
    "licenses/eventemitter3/LICENSE": "sha256-3aecc12b1cb28832b5f65ab64291de96568c3f236a74d646281b4491f7bcadbf",
    "licenses/eventemitter3/package-license.json": "sha256-bf0d027341b4646153c08e429b981b358a3366a64bdc109d9e45bbae09b2e057",
    "licenses/immer/LICENSE": "sha256-99cf22f6960a6fe228ec84ea9aefb0d75b27999ece83a3a9801e1c2081fa270b",
    "licenses/immer/package-license.json": "sha256-0e72a621ea42e771da505e6ac09ccd6b2151c2846cc7e72e05202dc99f42d9e4",
    "licenses/internmap/LICENSE": "sha256-9ea8903938dab5f12c4572d60725069bec2d1b0dc3bcc210b09bae946a5ebb1f",
    "licenses/internmap/package-license.json": "sha256-0de9dc34835acc99743e68facb1eecfd48d4442240853f1e79ce553dd5c92a0d",
    "licenses/react/LICENSE": "sha256-da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93",
    "licenses/react/package-license.json": "sha256-a9e4cd232557d1bdffd10b4c9dc694ee975f250e30bb6641fd17ea3e0d861bb1",
    "licenses/react-dom/LICENSE": "sha256-da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93",
    "licenses/react-dom/package-license.json": "sha256-3401f979e83126af6eda1348437cf927066a4c49cf64f6c5c958c93e354e6d9e",
    "licenses/react-is/LICENSE": "sha256-52412d7bc7ce4157ea628bbaacb8829e0a9cb3c58f57f99176126bc8cf2bfc85",
    "licenses/react-is/package-license.json": "sha256-09e091b983080debc57039eea1eedcda7729ada086fa07e1afbd78f956ac7b2c",
    "licenses/react-redux/LICENSE.md": "sha256-f2da73c752c6b87624755edacf927cbd915fa76555d383e74494bad4a5155ab3",
    "licenses/react-redux/package-license.json": "sha256-1181b7bcf0a314f65281243a9019fc2526c1afa63d698a049625229bb4748d8f",
    "licenses/recharts/LICENSE": "sha256-2d3aa48a8d1d3b93093680e8e68d3a64cfb590c3ade377ffcaefc69dac7c2ce5",
    "licenses/recharts/package-license.json": "sha256-1271b62a556e9ed8b32f2187192c7663fecf60951b5fce53e400862a8616c58b",
    "licenses/redux/LICENSE.md": "sha256-f2da73c752c6b87624755edacf927cbd915fa76555d383e74494bad4a5155ab3",
    "licenses/redux/package-license.json": "sha256-ff007f00731f8a9ce406bc94dafe6a325e607329b14c1a5230674595ce4fca3f",
    "licenses/redux-thunk/LICENSE.md": "sha256-635da794c92d278f8355428be0f9922d643f556d4f75f33fe4aca6b98d27affe",
    "licenses/redux-thunk/package-license.json": "sha256-4ac2774ba1453e66cdc18ceb48271aa1cab57553e65b12c756cf8d597829ee85",
    "licenses/reselect/LICENSE": "sha256-e98047a5dee068b33f82e8c4b7a63037b5108c93393198efd4097753004af5dd",
    "licenses/reselect/package-license.json": "sha256-265373a61edec5d5616e04f2df1f401bc39b1f0f8d1f083435f7ee1447461bf6",
    "licenses/scheduler/LICENSE": "sha256-da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93",
    "licenses/scheduler/package-license.json": "sha256-3ce8edaf40744a9561b4a65904de56aa0a0485103668f0a00704044d50ceae9b",
    "licenses/tiny-invariant/LICENSE": "sha256-b1c501095de70182748cb8e8d97ac5577701a4ef3b755ba30d59fd87b24bdb0f",
    "licenses/tiny-invariant/package-license.json": "sha256-1423e4f10ec810cc816f6914a1cf4732726bf5869c636f6fe5a0d5d0dc10e1af",
    "licenses/use-sync-external-store/LICENSE": "sha256-da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93",
    "licenses/use-sync-external-store/package-license.json": "sha256-be330d23f9f8507a3871ea40ac093dfd3cc5dcdf42294599606cc40aac8fcfc7",
    "licenses/victory-vendor/LICENSE.txt": "sha256-909af77588b84d9e557d26c4bd1a26a282aaba7123c4a839c75287c803166955",
    "licenses/victory-vendor/package-license.json": "sha256-c49c483e1ea4b423861fd21dae1b9fb7129a47f8f06cc7a9037b42f0adb0c701",
    "licenses/zod/LICENSE": "sha256-3f1189b28e3866e0d979968d466b78f813f76827cfdca1fbb124cc0a5c8841f8",
    "licenses/zod/package-license.json": "sha256-b874b502e45d7154ce82a27bdb9c9b6c1d5f3c0129ff43175b19ecfab2b2fb3b",
    "server/index.mjs": "sha256-49db3039500e0247df3a8f9a31814807afc5a9913fa94219c1cc6a67b040b69f",
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
 *   staged desktop bundle has no node_modules ancestor. The package root comes from its `./catalog`
 *   export: the package does not export `package.json`, and resolving a file inside the pinned folder
 *   would turn a missing pinned version into a boot failure instead of a table fallback.
 * @throws When the declared package is not installed: a packaging defect, never a runtime choice.
 * @complexity O(1) resolver calls.
 * @example rechartsSourceDir({}) // …/node_modules/@jini-ai/provider-plugins/plugins/charts-recharts/0.7.0
 */
export function rechartsSourceDir(
  _required: Record<string, never> = {},
  { resolvePackage = createRequire(import.meta.url).resolve }: { resolvePackage?: (id: string, options: { paths: string[] }) => string } = {},
): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const installRoot = path.resolve(here, "../../../../..");
  const catalogJson = resolvePackage(`${RECHARTS_PACKAGE_NAME}/catalog`,
    { paths: [here, path.join(installRoot, "tovu"), path.join(installRoot, "app.asar")] });
  return path.join(path.dirname(catalogJson), "plugins", manifest.id, manifest.version);
}

const sourceDir = rechartsSourceDir();

export const RECHARTS_RUNTIME_SOURCE = {
  manifest, source: "built-in" as const, sourceDir, entryPath: path.join(sourceDir, "server/index.mjs"),
  // The no-op server wrapper is compiled in; only Jini's retained, admitted bytes reach the browser.
  importModule: async () => ({ default: definePlugin({ setup() {} }) }),
};
