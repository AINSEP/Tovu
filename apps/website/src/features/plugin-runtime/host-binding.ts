/** Tovu's product inputs for the Jini host. The runtime owns algorithms; this binding owns the
 * SDK vocabulary, declarations, admission policy and executable import boundary. */
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { definePlugin, HOOK_POINTS, HOOK_CONTENT_ENTRY_BEFORE_SAVE, type ContentEntryDraft, type PluginSdk } from "@tovu/sdk";
import type { ClaimMode, DeclarativeContentTypesPort, PluginManifest, PluginModuleImportPort, PluginSdkBinding, PluginTierPolicy, HookRegistry } from "@jini-ai/plugins/host";
import { PluginInstallError, snapshotPluginModuleGraph } from "@jini-ai/plugins/host/node";
import type { RunTier2CallRequired } from "@jini-ai/plugins/host/worker";
import { SHARED_EXTENSION_CAPABILITIES } from "../../contracts/core/extension-capability-vocabulary.js";
import { applyDeclaredContentTypes, parseDeclaredContentTypes, planDeclaredContentTypes, validateDeclarativeManifest, type DeclaredContentTypePlan, type DeclaredContentTypePorts, type DeclaredContentType } from "./declarative-content-types.js";
import { readSitePluginArchive } from "./install-archive.js";
import { createPluginInvocationCoreDeps } from "./invocation-core-deps.js";
import { readDefinedPlugin } from "./plugin-export.js";

/** How each host hook point arbitrates several plugins (see this file's header). */
export const PLUGIN_HOOK_SEMANTICS: Readonly<Record<string, ClaimMode>> = {
  [HOOK_CONTENT_ENTRY_BEFORE_SAVE]: "shared",
};

/** The SDK's complete product payload is guaranteed by Tovu's post/preview ports. Jini carries
 * its generic envelope unchanged; these assertions bridge that narrower type without rebuilding
 * or copying the SDK. The SDK builder is identity because @tovu/sdk defines types and definePlugin. */
const pluginSdkBinding: PluginSdkBinding = {
  hookIds: HOOK_POINTS.map((hook) => hook.name),
  beforeSaveHook: HOOK_CONTENT_ENTRY_BEFORE_SAVE,
  hookSemantics: PLUGIN_HOOK_SEMANTICS,
  // @tovu/sdk blocks package.json deep imports (ADR-005); bump with packages/sdk/package.json.
  runtimeSdkVersion: "0.1.0",
  readDefinedPlugin: ({ moduleValue }) => readDefinedPlugin(moduleValue) as unknown as ReturnType<PluginSdkBinding["readDefinedPlugin"]>,
  buildSdk: ({ sdk }) => sdk,
  definePlugin: (definition) => definePlugin(definition as unknown as { setup(sdk: PluginSdk): void | Promise<void> }) as unknown as ReturnType<PluginSdkBinding["definePlugin"]>,
};

/** Product declaration fields/plans remain opaque in Jini and return to the same Tovu owner. */
const declarativeContentTypes: DeclarativeContentTypesPort = {
  validateManifest: ({ manifest }) => validateDeclarativeManifest({ manifest }),
  parse: parseDeclaredContentTypes,
  plan: ({ ports, workspaceId, decls }) => planDeclaredContentTypes({ ports: ports as Pick<DeclaredContentTypePorts, "findByKey">, workspaceId, decls: decls as readonly DeclaredContentType[] }),
  apply: ({ ports, workspaceId, pluginId, plan }) => applyDeclaredContentTypes({ ports: ports as DeclaredContentTypePorts, workspaceId, pluginId, plan: plan as DeclaredContentTypePlan }),
};

/** Files a manifest-only package may carry: documentation, data and images — nothing a browser or
 * Node would execute. An allowlist, so a new script-like extension is refused by default (SVG is
 * left out on purpose: it can carry script). */
const DECLARATIVE_DATA_FILE = /(?:^|\/)(?:LICENSE|[^/]+\.(?:json|md|txt|png|jpe?g|gif|webp))$/;

/** Sideloads cannot grant themselves a verified publisher tier: the worker is no security sandbox
 * (it can still import node:fs). Discovery also refuses packages placed directly on disk. */
const tierPolicy: PluginTierPolicy = {
  execution: "worker",
  siteErrors: ({ manifestValue }) => {
    if (typeof manifestValue !== "object" || manifestValue === null || (manifestValue as { tier?: unknown }).tier !== "tier-2") return [];
    return [{ code: "TIER_NOT_ALLOWED", file: "tovu.plugin.json", message: "A site-installed plugin cannot declare tier-2: tier-2 is for verified publishers and needs a sandbox that does not exist yet. Declare tier-3 (unverified publisher)." }];
  },
  checkInstall: ({ manifest, files }) => {
    if (manifest.tier === "tier-1") {
      const code = [...files.keys()].filter((key) => key !== "tovu.plugin.json" && !DECLARATIVE_DATA_FILE.test(key));
      if (code.length) throw new PluginInstallError("PLUGIN_MANIFEST_INVALID", `A declarative (tier-1) plugin must not ship code: ${code.join(", ")}`);
      return;
    }
    if (!files.has("server/index.mjs")) throw new PluginInstallError("PLUGIN_MANIFEST_INVALID", "server/index.mjs is required.");
    if (manifest.tier !== "tier-3") throw new PluginInstallError("PLUGIN_MANIFEST_INVALID", "Local plugins must declare tier-3 (unverified publisher).");
  },
  // Explicit host allow for local tier-3 packages and trusted compiled-in sources. Tier-2's
  // worker seam is chosen by composition, never this executable importer.
  allowLoad: ({ record, manifest }) => record.source === "built-in" || manifest.tier === "tier-3",
};

/** Product inputs composed once, shared by composition, CLI, and the tier-2 worker. Hashing is the
 * established sha256-prefixed hex format; archives always pass through Tovu's bounded reader. */
export const pluginHostBinding = {
  pluginSdkBinding,
  capabilityVocabulary: SHARED_EXTENSION_CAPABILITIES,
  declarativeContentTypes,
  coreOwnerName: "Tovu core",
  tierPolicy,
  archiveReader: readSitePluginArchive,
  verifyDigest: async ({ absoluteFilePath }: { absoluteFilePath: string }): Promise<string> =>
    `sha256-${createHash("sha256").update(await readFile(absoluteFilePath)).digest("hex")}`,
  createInvocationCoreDeps: createPluginInvocationCoreDeps as unknown as RunTier2CallRequired["createInvocationCoreDeps"],
};

/** Product preview callback ABI remains positional; only the Jini registry receives objects. */
export type PluginBeforeSavePreview = (pluginId: string, entry: Readonly<ContentEntryDraft>) => ReturnType<HookRegistry["previewBeforeSave"]>;

/** Adapts the product's module seam to Jini's registry. A built-in/test seam retains its original path;
 * a site entry is contained and snapshotted only after Jini verifies integrity and SDK range.
 * Same-version replacement needs a fresh filesystem identity for ALL helpers, including late
 * dynamic imports and CommonJS require caches. Snapshots remain available until shutdown.
 * @param required The validated manifest and source selected for this load.
 * @param optional.importModule The existing built-in/worker/test import seam, when present.
 * @returns A registry importer projecting the default export without changing export validation.
 * @throws Snapshot/filesystem/import errors; Jini maps them to the existing load reasons.
 * @complexity O(total package bytes) for a site snapshot; O(1) for an injected seam.
 * @example createPluginModuleImporter({ manifest, source: "site" }, {})
 */
export function createPluginModuleImporter(
  required: { manifest: PluginManifest; source: "built-in" | "site" },
  optional: { importModule?: (entryPath: string) => Promise<unknown> } = {},
): PluginModuleImportPort {
  return async ({ plugin, modulePath }) => {
    if (optional.importModule) {
      const imported = await optional.importModule(modulePath);
      return { exported: typeof imported === "object" && imported !== null ? (imported as { default?: unknown }).default : undefined };
    }
    let entryPath = modulePath;
    if (required.source === "site") {
      const [root, entry] = await Promise.all([realpath(plugin.packageRoot), realpath(modulePath)]);
      // The immutable snapshot owner rejects symlinks/hardlinks and checks every retained byte.
      if (!entry.startsWith(root + path.sep)) return `module path '${modulePath}' escapes the plugin root`;
      entryPath = await snapshotPluginModuleGraph({ pluginRoot: plugin.packageRoot, manifest: required.manifest });
    }
    const imported = await import(pathToFileURL(entryPath).href);
    return { exported: imported.default };
  };
}
