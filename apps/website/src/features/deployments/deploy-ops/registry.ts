import { ToolInputError } from "@jini-ai/core";
import { findTrustedPluginPackages, importContainedModule, readTrustedPluginFile, type TrustedPluginPackage } from "#src/features/agent-plugins/trusted-plugin-files";
import type { DeployOpsDescriptor, DeployOpsModule, DeployOpsRegistry, LoadedDeployOps } from "./types.js";

/** Installed modules use the same activation, bundled digest and disk containment gates as deploy targets. */
export const DEPLOY_OPS_FILENAME = "tovu-deploy-ops.json";
type ParseResult = { ok: true; descriptors: DeployOpsDescriptor[] } | { ok: false; reason: string };
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Parse data only. Duplicate ids, URL hosts and escaping paths refuse the entire manifest. O(platforms). */
export function parseDeployOpsFile(raw: string): ParseResult {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { ok: false, reason: "not valid JSON" }; }
  if (!object(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.platforms) || value.platforms.length > 32) return { ok: false, reason: "platforms must be an array of at most 32 entries" };
  const descriptors: DeployOpsDescriptor[] = [];
  const seen = new Set<string>();
  for (const [i, entry] of value.platforms.entries()) {
    const at = `platforms[${i}]`;
    if (!object(entry)) return { ok: false, reason: `${at} must be an object` };
    const { id, label, module, hosts } = entry;
    if (typeof id !== "string" || id.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return { ok: false, reason: `${at}.id must be a lowercase hyphenated id` };
    if (seen.has(id)) return { ok: false, reason: `${at}.id '${id}' is declared twice` };
    if (typeof label !== "string" || !label.trim() || label.length > 100) return { ok: false, reason: `${at}.label must be a non-empty string` };
    if (typeof module !== "string" || !module.endsWith(".mjs") || module.startsWith("/") || module.includes("\\") || module.split("/").some(s => s === ".." || s === "." || !s)) return { ok: false, reason: `${at}.module must be a contained relative .mjs path` };
    if (!Array.isArray(hosts) || hosts.length === 0 || hosts.length > 8 || !hosts.every(host => typeof host === "string" && host.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host))) return { ok: false, reason: `${at}.hosts must be a non-empty array of HTTPS hostnames` };
    seen.add(id); descriptors.push({ id, label, module, hosts });
  }
  return { ok: true, descriptors };
}

/**
 * Import contained modules; isolate unreadable manifests, invalid exports and missing modules as refusals.
 * @param plugin - Trusted source directory. The caller owns activation/digest gates; this seam is for tests.
 * @returns Loaded modules and refusal messages; never throws for a malformed package.
 * @complexity Time and space: O(platforms), bounded to 32 entries.
 * @example await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: bundledRoot });
 */
export async function loadDeployOpsRegistryFromSource(plugin: TrustedPluginPackage): Promise<DeployOpsRegistry> {
  const loaded: LoadedDeployOps[] = []; const refusals: string[] = [];
  let raw: string;
  try { raw = await readTrustedPluginFile(plugin, DEPLOY_OPS_FILENAME); }
  catch { return buildRegistry([], [`deploy ops from '${plugin.pluginId}' were not loaded: ${DEPLOY_OPS_FILENAME} could not be read`]); }
  const parsed = parseDeployOpsFile(raw);
  if (!parsed.ok) return buildRegistry([], [`deploy ops from '${plugin.pluginId}' were not loaded: ${DEPLOY_OPS_FILENAME} is invalid: ${parsed.reason}`]);
  for (const descriptor of parsed.descriptors) {
    try {
      const imported = await importContainedModule(plugin, descriptor.module);
      const candidate = typeof imported === "string" ? undefined : imported.exported;
      if (typeof imported === "string") refusals.push(`deploy ops platform '${descriptor.id}' was not loaded: module could not be imported`);
      else if (!object(candidate) || typeof candidate.status !== "function" || typeof candidate.logs !== "function" || (candidate.listTargets !== undefined && typeof candidate.listTargets !== "function") || (candidate.deploy !== undefined && typeof candidate.deploy !== "function")) refusals.push(`deploy ops platform '${descriptor.id}' was not loaded: module must export status() and logs()`);
      else loaded.push({ descriptor, pluginId: plugin.pluginId, module: candidate as unknown as DeployOpsModule });
    } catch { refusals.push(`deploy ops platform '${descriptor.id}' was not loaded: module could not be read or imported`); }
  }
  return buildRegistry(loaded, refusals);
}

/**
 * Load only the active, bundled-digest-trusted installed deploy package; never fall back to source.
 * @param ctx - Workspace whose installed packages and activation records are checked fresh.
 * @returns Loaded modules and refusals, including filesystem faults; no expected failure escapes.
 * @complexity Time: O(installed packages + platforms). Space: O(platforms + refusals).
 * @example await loadDeployOpsRegistry({ workspaceId });
 */
export async function loadDeployOpsRegistry(ctx: { workspaceId: string }): Promise<DeployOpsRegistry> {
  const loaded: LoadedDeployOps[] = []; const refusals: string[] = [];
  try {
    const verdicts = await findTrustedPluginPackages({ ...ctx, filename: DEPLOY_OPS_FILENAME, contribution: "deploy ops", requireActive: true });
    for (const verdict of verdicts) {
      if ("refusal" in verdict) { refusals.push(verdict.refusal); continue; }
      if (verdict.trusted.pluginId !== "deploy") { refusals.push(`deploy ops from '${verdict.trusted.pluginId}' were not loaded: only the bundled deploy plugin may contribute`); continue; }
      const result = await loadDeployOpsRegistryFromSource(verdict.trusted);
      loaded.push(...result.list()); refusals.push(...result.refusals);
    }
  } catch { refusals.push("deploy ops were not loaded: installed plugin packages could not be read"); }
  return buildRegistry(loaded, refusals);
}

/** Refuse an absent id with the available ids and loader refusals, rather than guessing a platform. */
export function requirePlatform(registry: DeployOpsRegistry, id: string): LoadedDeployOps {
  const platform = registry.get(id);
  if (!platform) throw new ToolInputError({ message: `Unknown deployment ops platform '${id}'. Choose: ${registry.list().map(p => p.descriptor.id).join(", ") || "(none)"}.${registry.refusals.length ? ` ${registry.refusals.join(" ")}` : ""}` });
  return platform;
}
/** Index uniquely claimed ids. Ambiguous ids are refused for all claimants. O(platforms). */
function buildRegistry(loaded: readonly LoadedDeployOps[], inputRefusals: readonly string[]): DeployOpsRegistry {
  const map = new Map<string, LoadedDeployOps>(); const duplicates = new Set<string>(); const refusals = [...inputRefusals];
  for (const platform of loaded) { if (map.has(platform.descriptor.id)) duplicates.add(platform.descriptor.id); else map.set(platform.descriptor.id, platform); }
  for (const id of duplicates) { map.delete(id); refusals.push(`deploy ops platform '${id}' was not loaded: declared more than once`); }
  return { get: id => map.get(id), list: () => [...map.values()], refusals };
}
