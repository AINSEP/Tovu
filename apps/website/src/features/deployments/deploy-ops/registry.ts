import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveProductRoot } from "#src/platform/site-dir/index";
import { bundledContributionSources } from "../../agent-plugins/bundled-contribution-sources.js";
import { ToolInputError } from "@jini-ai/core";
import { defineExecutablePluginContribution, type LoadPluginContributions, loadPluginContributionsFromSource, type TrustedPluginPackage } from "../../agent-plugins/lifecycle.js";
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
    const reason = descriptorError({ entry, at, seen }, {});
    if (reason) return { ok: false, reason };
    const { id, label, module, hosts } = entry as unknown as DeployOpsDescriptor;
    seen.add(id); descriptors.push({ id, label, module, hosts });
  }
  return { ok: true, descriptors };
}

/** Lexical containment is checked before the lifecycle loader checks disk containment. */
function containedModule({ module }: { module: unknown }, _optional = {}): boolean {
  if (typeof module !== "string" || !module.endsWith(".mjs")) return false;
  return !module.startsWith("/") && !module.includes("\\") && !module.split("/").some(s => s === ".." || s === "." || !s);
}

function validHosts({ hosts }: { hosts: unknown }, _optional = {}): boolean {
  return Array.isArray(hosts) && hosts.length > 0 && hosts.length <= 8 && hosts.every(host => typeof host === "string" && host.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host));
}

function descriptorError({ entry, at, seen }: { entry: Record<string, unknown>; at: string; seen: Set<string> }, _optional = {}): string | undefined {
  const { id, label, module, hosts } = entry;
  if (typeof id !== "string" || id.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return `${at}.id must be a lowercase hyphenated id`;
  if (seen.has(id)) return `${at}.id '${id}' is declared twice`;
  return descriptorFieldsError({ label, module, hosts, at }, {});
}

function descriptorFieldsError({ label, module, hosts, at }: { label: unknown; module: unknown; hosts: unknown; at: string }, _optional = {}): string | undefined {
  if (typeof label !== "string" || !label.trim() || label.length > 100) return `${at}.label must be a non-empty string`;
  if (!containedModule({ module }, {})) return `${at}.module must be a contained relative .mjs path`;
  if (!validHosts({ hosts }, {})) return `${at}.hosts must be a non-empty array of HTTPS hostnames`;
  return undefined;
}

const OPTIONAL_VERBS = ["listTargets", "deploy", "listSecrets", "setSecret", "unsetSecret", "readSecret"] as const;
const SECRET_VERBS = ["listSecrets", "setSecret", "unsetSecret"] as const;
/** A half secrets adapter would list what it cannot remove (or the reverse), so the verbs and capabilities come as one set. O(1). */
function secretsShapeError(candidate: Record<string, unknown>): string | undefined {
  const present = SECRET_VERBS.filter(verb => candidate[verb] !== undefined);
  if (present.length === 0) return candidate.secretCapabilities !== undefined || candidate.readSecret !== undefined ? "secretCapabilities and readSecret need listSecrets(), setSecret() and unsetSecret()" : undefined;
  if (present.length !== SECRET_VERBS.length) return "a secrets adapter must export listSecrets(), setSecret() and unsetSecret() together";
  const caps = candidate.secretCapabilities;
  if (!object(caps) || !["next-deploy", "vendor-restart", "immediately"].includes(caps.appliesOn as string) || typeof caps.supportsStaging !== "boolean") return "secretCapabilities must declare appliesOn and supportsStaging";
  return undefined;
}

/** Export shape and secrets capabilities remain this domain's contract. @complexity O(1). */
function asOpsModule(candidate: unknown): DeployOpsModule | string {
  if (!object(candidate) || typeof candidate.status !== "function" || typeof candidate.logs !== "function" || OPTIONAL_VERBS.some(verb => candidate[verb] !== undefined && typeof candidate[verb] !== "function")) return "module must export status() and logs()";
  const reason = secretsShapeError(candidate);
  return reason ?? (candidate as unknown as DeployOpsModule);
}

const opsContribution = defineExecutablePluginContribution<DeployOpsDescriptor, DeployOpsModule>({
  filename: DEPLOY_OPS_FILENAME, contribution: "deploy ops",
  parse: ({ raw }) => parseDeployOpsFile(raw), modulePath: ({ descriptor }) => descriptor.module,
  validate: ({ exported }) => asOpsModule(exported),
  refusal: ({ descriptor, reason }) => `deploy ops platform '${descriptor.id}' was not loaded: ${reason}`,
}, {
  onReadError: ({ plugin }) => [`deploy ops from '${plugin.pluginId}' were not loaded: ${DEPLOY_OPS_FILENAME} could not be read`],
  importRefusalReason: "module could not be imported", importErrorReason: "module could not be read or imported",
});

/**
 * Import contained modules; isolate unreadable manifests, invalid exports and missing modules as refusals.
 * @param plugin - Trusted source directory. The caller owns activation/digest gates; this seam is for tests.
 * @returns Loaded modules and refusal messages; never throws for a malformed package.
 * @complexity Time and space: O(platforms), bounded to 32 entries.
 * @example await loadDeployOpsRegistryFromSource({ pluginId: "my-host", packageRoot: bundledRoot });
 */
export async function loadDeployOpsRegistryFromSource(plugin: TrustedPluginPackage, _optional: Record<string, never> = {}): Promise<DeployOpsRegistry> {
  const load = await loadPluginContributionsFromSource({ plugin, definition: opsContribution });
  return buildRegistry(load.items, load.refusals);
}

/** All Tovu bundled ops sources; category parsing and duplicate refusal stay with this registry.
 * @complexity O(p + platforms), one contained import per contribution. */
export async function loadBundledDeployOpsRegistry(required: { readonly sourceRoot: string }, _optional: Record<string, never> = {}): Promise<DeployOpsRegistry> {
  const items: LoadedDeployOps[] = [];
  const refusals: string[] = [];
  for (const plugin of bundledContributionSources({ ...required, filename: DEPLOY_OPS_FILENAME })) {
    const registry = await loadDeployOpsRegistryFromSource(plugin);
    items.push(...registry.list());
    refusals.push(...registry.refusals);
  }
  return buildRegistry(items, refusals);
}

/** Data-only enum discovery for hermetic tool catalogs, never authorization or module loading.
 * Ambiguous ids are omitted, as in the executable registry. @complexity O(p + platforms). */
export function readBundledDeployOpsDescriptors(required: { readonly sourceRoot: string }, _optional: Record<string, never> = {}): readonly DeployOpsDescriptor[] {
  const descriptors = bundledContributionSources({ ...required, filename: DEPLOY_OPS_FILENAME }).flatMap(plugin => {
    try {
      const parsed = parseDeployOpsFile(readFileSync(path.join(plugin.packageRoot, DEPLOY_OPS_FILENAME), "utf8"));
      return parsed.ok ? parsed.descriptors : [];
    } catch { return []; }
  });
  const counts = new Map<string, number>();
  for (const descriptor of descriptors) counts.set(descriptor.id, (counts.get(descriptor.id) ?? 0) + 1);
  return descriptors.filter(descriptor => counts.get(descriptor.id) === 1);
}

/**
 * Load only active, bundled-digest-trusted installed deployment packages; never fall back to source.
 * @param ctx - Workspace whose installed packages and activation records are checked fresh.
 * @returns Loaded modules and refusals, including filesystem faults; no expected failure escapes.
 * @param required - Contribution loader from this boot's lifecycle; no site-dependent module default.
 * @complexity Time: O(bundled sources + installed packages + platforms). Space: O(packages + platforms + refusals).
 * @example await loadDeployOpsRegistry({ workspaceId }, { loadContributions: lifecycle.loadPluginContributions });
 */
export async function loadDeployOpsRegistry(ctx: { workspaceId: string }, required: { readonly loadContributions: LoadPluginContributions }): Promise<DeployOpsRegistry> {
  try {
    // Only packages that ship this category in this build own it. The shared source selector
    // excludes retired packages: an old package retained until its successors are usable must
    // not contribute duplicate ids (duplicates are dropped). Installed activation and digest
    // checks still run in the lifecycle loader; this source list never authorizes an import.
    const owners = new Set(bundledContributionSources({
      sourceRoot: path.join(resolveProductRoot(), "content", "agent-plugins"), filename: DEPLOY_OPS_FILENAME,
    }).map(plugin => plugin.pluginId));
    const load = await required.loadContributions({ ...ctx, definition: opsContribution }, {
      packageRefusal: ({ plugin }) => owners.has(plugin.pluginId) ? undefined : `deploy ops from '${plugin.pluginId}' were not loaded: only bundled plugins shipping ${DEPLOY_OPS_FILENAME} may contribute`,
    });
    return buildRegistry(load.items, load.refusals);
  } catch { return buildRegistry([], ["deploy ops were not loaded: installed plugin packages could not be read"]); }
}

/** Refuse an absent id with the available ids and loader refusals, rather than guessing a platform. */
export function requirePlatform(registry: DeployOpsRegistry, id: string): LoadedDeployOps {
  const platform = registry.get(id);
  if (!platform) {
    const refusals = registry.refusals.length ? ` ${registry.refusals.join(" ")}` : "";
    throw new ToolInputError({ message: `Unknown deployment ops platform '${id}'. Choose: ${registry.list().map(p => p.descriptor.id).join(", ") || "(none)"}.${refusals}` });
  }
  return platform;
}
/** Index uniquely claimed ids. Ambiguous ids are refused for all claimants. O(platforms). */
function buildRegistry(loaded: readonly LoadedDeployOps[], inputRefusals: readonly string[]): DeployOpsRegistry {
  const map = new Map<string, LoadedDeployOps>(); const duplicates = new Set<string>(); const refusals = [...inputRefusals];
  for (const platform of loaded) { if (map.has(platform.descriptor.id)) duplicates.add(platform.descriptor.id); else map.set(platform.descriptor.id, platform); }
  for (const id of duplicates) { map.delete(id); refusals.push(`deploy ops platform '${id}' was not loaded: declared more than once`); }
  return { get: id => map.get(id), list: () => [...map.values()], refusals };
}
