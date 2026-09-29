import path from "node:path";

import { findTrustedPluginPackages, importContainedModule, readTrustedPluginFile, type TrustedPluginPackage } from "#src/features/agent-plugins/trusted-plugin-files";

import type { DeployTargetCredentialSpec, DeployTargetDescriptor, DeployTargetEnvFallback, DeployTargetFieldSpec, DeployTargetModule, DeployTargetProjectNameCopy, DeployTargetRegistry, LoadedDeployTarget } from "./types.js";

/**
 * @file Loads deploy targets that Agent Plugins contribute — the generic seam that lets the `deploy`
 * plugin (and only plugins Tovu itself ships) add a hosting vendor without core naming one.
 *
 * A plugin opts in by shipping {@link DEPLOY_TARGETS_FILENAME} at its root: a data-only list of
 * `{ id, label, module }`. Each `module` is a plain-JS `.mjs` file inside the plugin whose default
 * export is a `DeployTargetModule` (`types.ts`).
 *
 * TRUST RULE (fail closed). Importing a module runs its code in this process, so a module is loaded
 * only when all of these hold (enforced by the shared gate, `features/agent-plugins/trusted-plugin-files.ts`):
 * 1. the plugin is ACTIVE by the fail-closed reader (`resolveAgentPluginActivation`) — an unreadable
 *    activation record refuses rather than reading as consent;
 * 2. its installed digest is the one `bundled-digests.json` records for it — the build's own seed,
 *    so an operator-installed package (or a tampered copy under a bundled id) never runs here
 *    (owner decision 2026-09-29: third-party hosts come later);
 * 3. the module path resolves inside the plugin root on disk (`assertContainedOnDisk`) and ends in
 *    `.mjs`, so no `package.json` above the install directory can make Node read it as CommonJS.
 *
 * Failure isolation: a bad plugin drops only its own targets, a bad module only itself, and a target
 * id two plugins both declare is dropped for both ("refusing to guess", as in
 * `resolve-agent-plugin-refs.ts`). Every drop is reported in `refusals`, never thrown.
 *
 * Architectural role: `features/deployments` capability, read by the static-publish adapter. Depends
 * on `features/agent-plugins` for installed-package discovery and trust; nothing depends back.
 */

/** The file a plugin ships at its root to contribute deploy targets. */
export const DEPLOY_TARGETS_FILENAME = "tovu-deploy-targets.json";

/** Same shape as today's provider ids (`github-pages`, `cloudflare-pages`, `s3-compatible`). */
const TARGET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TARGET_ID_LENGTH = 64;
const MAX_LABEL_LENGTH = 100;

type ParseResult = { readonly ok: true; readonly descriptors: readonly DeployTargetDescriptor[] } | { readonly ok: false; readonly reason: string };

interface PluginLoad {
  readonly targets: readonly LoadedDeployTarget[];
  readonly refusals: readonly string[];
}

/**
 * Builds this workspace's deploy-target registry from its installed Agent Plugins.
 *
 * Read fresh on every call (publishing is rare and human-triggered); a module import itself is cached
 * by Node per file URL, and installed digest directories never change.
 *
 * @throws Nothing for a plugin-level fault (see this file's header); only a filesystem fault listing
 * the workspace's package directory itself propagates.
 * @complexity O(p) installed plugins, each one small file read plus one import per declared target.
 */
export async function loadDeployTargetRegistry(ctx: { readonly workspaceId: string }): Promise<DeployTargetRegistry> {
  const verdicts = await findTrustedPluginPackages({ workspaceId: ctx.workspaceId, filename: DEPLOY_TARGETS_FILENAME, contribution: "deploy targets", requireActive: true });

  const targets: LoadedDeployTarget[] = [];
  const refusals: string[] = [];
  for (const verdict of verdicts) {
    if ("refusal" in verdict) {
      refusals.push(verdict.refusal);
      continue;
    }
    const load = await loadPackageTargets(verdict.trusted);
    targets.push(...load.targets);
    refusals.push(...load.refusals);
  }
  return buildRegistry(targets, refusals);
}

/** A package's own targets, trusted: parses its descriptor file and imports each module. Every trust
 *  gate is the CALLER's job ({@link loadDeployTargetRegistry}, or the hermetic source registry below).
 *  @complexity O(t) targets, one import each. */
async function loadPackageTargets(plugin: TargetPackage): Promise<PluginLoad> {
  const parsed = parseDeployTargetsFile(await readTrustedPluginFile(plugin, DEPLOY_TARGETS_FILENAME));
  if (!parsed.ok) return { targets: [], refusals: [`deploy targets from '${plugin.pluginId}' were not loaded: ${DEPLOY_TARGETS_FILENAME} is invalid: ${parsed.reason}`] };

  const targets: LoadedDeployTarget[] = [];
  const refusals: string[] = [];
  for (const descriptor of parsed.descriptors) {
    const loaded = await loadTargetModule(plugin, descriptor);
    if (typeof loaded === "string") refusals.push(`deploy target '${descriptor.id}' from '${plugin.pluginId}' was not loaded: ${loaded}`);
    else targets.push({ descriptor, pluginId: plugin.pluginId, module: loaded });
  }
  return { targets, refusals };
}

/** The two facts {@link loadPackageTargets} needs about a package: whose it is and where it lives. */
type TargetPackage = TrustedPluginPackage;

/**
 * A registry read straight from a plugin's SOURCE directory, with no install, activation or digest
 * gate. For the hermetic composition root (`server/runtime/composition/app.ts`) and tests only,
 * where the directory is this product's own `content/agent-plugins/<id>/`: never point it at
 * anything an operator or a third party can write.
 *
 * @complexity O(t) targets, one import each.
 */
export async function loadDeployTargetRegistryFromSource(plugin: TargetPackage): Promise<DeployTargetRegistry> {
  const load = await loadPackageTargets(plugin);
  return buildRegistry(load.targets, load.refusals);
}

/** Imports one module after the containment check. Returns the module, or the refusal reason.
 *  @complexity One `realpath` walk plus one dynamic import. */
async function loadTargetModule(plugin: TargetPackage, descriptor: DeployTargetDescriptor): Promise<DeployTargetModule | string> {
  const imported = await importContainedModule(plugin, descriptor.module);
  if (typeof imported === "string") return imported;
  const candidate = imported.exported;
  if (!isPlainObject(candidate) || typeof candidate.create !== "function") return "its module has no create() function";
  return candidate as unknown as DeployTargetModule;
}

/**
 * Parses a plugin's {@link DEPLOY_TARGETS_FILENAME}. Pure (exported for its own tests). Unknown keys are ignored so later slices
 * can add credential/config field specs without breaking an older host.
 *
 * @complexity O(t) in the declared target count.
 */
export function parseDeployTargetsFile(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  if (!Array.isArray(value.targets)) return { ok: false, reason: "targets must be an array" };

  const descriptors: DeployTargetDescriptor[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.targets.entries()) {
    const result = parseDescriptor(entry, `targets[${index}]`);
    if (typeof result === "string") return { ok: false, reason: result };
    if (seen.has(result.id)) return { ok: false, reason: `targets[${index}].id '${result.id}' is declared twice` };
    seen.add(result.id);
    descriptors.push(result);
  }
  return { ok: true, descriptors };
}

/** One descriptor entry, or the reason it is invalid. @complexity O(f) declared fields. */
function parseDescriptor(entry: unknown, at: string): DeployTargetDescriptor | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { id, label, module } = entry;
  if (typeof id !== "string" || id.length > MAX_TARGET_ID_LENGTH || !TARGET_ID_PATTERN.test(id)) return `${at}.id must be a lowercase hyphenated id`;
  if (!isLabel(label)) return `${at}.label must be a non-empty string`;
  if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module)) return `${at}.module must be a relative path ending in .mjs`;
  const configFields = parseConfigFields(entry.config, `${at}.config`);
  if (typeof configFields === "string") return configFields;
  const env = parseEnvFallback(entry.env, `${at}.env`);
  if (typeof env === "string") return env;
  const credential = parseCredentialSpec(entry.credential, `${at}.credential`);
  if (typeof credential === "string") return credential;
  const projectName = parseProjectNameCopy(entry.projectName, `${at}.projectName`);
  if (typeof projectName === "string") return projectName;
  return {
    id,
    label,
    module,
    configFields,
    ...(projectName !== undefined ? { projectName } : {}),
    ...(env !== undefined ? { env } : {}),
    ...(credential !== undefined ? { credential } : {}),
  };
}

/** A target's `projectName` copy (absent = the generic "Project name"), or the reason it is invalid. @complexity O(1). */
function parseProjectNameCopy(value: unknown, at: string): DeployTargetProjectNameCopy | undefined | string {
  if (value === undefined) return undefined;
  if (!isPlainObject(value) || !isLabel(value.label)) return `${at}.label must be a non-empty string`;
  const { label, help } = value;
  if (help !== undefined && (typeof help !== "string" || help.length > MAX_HELP_LENGTH)) return `${at}.help must be a string of at most ${MAX_HELP_LENGTH} characters`;
  return { label, ...(help !== undefined ? { help } : {}) };
}

/** An absolute https URL, the only kind a credential form links out to. @complexity O(n) in its length. */
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** A saved connection's own discriminant, so a credential field of that name would be ambiguous. */
const RESERVED_CREDENTIAL_FIELD_NAMES: ReadonlySet<string> = new Set(["providerId"]);

/** A target's `credential` block (absent = no saved credential), or the reason it is invalid. @complexity O(f). */
function parseCredentialSpec(value: unknown, at: string): DeployTargetCredentialSpec | undefined | string {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return `${at} must be an object`;
  const { vendorId, vendorLabel, yieldsAccountLabel, help, tokenPageUrl, tokenField = "token" } = value;
  if (typeof vendorId !== "string" || vendorId.length > MAX_TARGET_ID_LENGTH || !TARGET_ID_PATTERN.test(vendorId)) return `${at}.vendorId must be a lowercase hyphenated id`;
  if (vendorLabel !== undefined && !isLabel(vendorLabel)) return `${at}.vendorLabel must be a non-empty string`;
  if (yieldsAccountLabel !== undefined && typeof yieldsAccountLabel !== "boolean") return `${at}.yieldsAccountLabel must be a boolean`;
  if (help !== undefined && (typeof help !== "string" || help.length > MAX_HELP_LENGTH)) return `${at}.help must be a string of at most ${MAX_HELP_LENGTH} characters`;
  if (tokenPageUrl !== undefined && !isHttpsUrl(tokenPageUrl)) return `${at}.tokenPageUrl must be an https URL`;
  const fields = parseFieldList(value.fields, `${at}.fields`, RESERVED_CREDENTIAL_FIELD_NAMES);
  if (typeof fields === "string") return fields;
  if (typeof tokenField !== "string" || !fields.some((field) => field.name === tokenField && field.required)) return `${at}.tokenField '${String(tokenField)}' must name a required field`;
  return {
    vendorId,
    ...(vendorLabel !== undefined ? { vendorLabel } : {}),
    ...(yieldsAccountLabel === true ? { yieldsAccountLabel: true as const } : {}),
    ...(help !== undefined ? { help } : {}),
    ...(tokenPageUrl !== undefined ? { tokenPageUrl } : {}),
    tokenField,
    fields,
  };
}

/** Keys a publish request already uses for itself, so a config field of that name would be ambiguous. */
const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set(["target", "projectName", "credentialId"]);
const FIELD_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/;
const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const MAX_FIELDS = 16;
const MAX_HELP_LENGTH = 500;

/** A target's `config` list (absent = none), or the reason it is invalid. @complexity O(f). */
function parseConfigFields(value: unknown, at: string): DeployTargetFieldSpec[] | string {
  if (value === undefined) return [];
  const fields = parseFieldList(value, at, RESERVED_FIELD_NAMES);
  if (typeof fields === "string") return fields;
  const secretAt = fields.findIndex((field) => field.secret === true);
  return secretAt === -1 ? fields : `${at}[${secretAt}] is marked secret; config is passed in the clear, so declare it under credential.fields`;
}

/** A list of uniquely named field specs, or the reason it is invalid. @complexity O(f²), f <= {@link MAX_FIELDS}. */
function parseFieldList(value: unknown, at: string, reserved: ReadonlySet<string>): DeployTargetFieldSpec[] | string {
  if (!Array.isArray(value) || value.length > MAX_FIELDS) return `${at} must be an array of at most ${MAX_FIELDS} fields`;
  const fields: DeployTargetFieldSpec[] = [];
  for (const [index, entry] of value.entries()) {
    const field = parseFieldSpec(entry, `${at}[${index}]`, reserved);
    if (typeof field === "string") return field;
    if (fields.some((seen) => seen.name === field.name)) return `${at}[${index}].name '${field.name}' is declared twice`;
    fields.push(field);
  }
  return fields;
}

/** One field spec, or the reason it is invalid. @complexity O(1). */
function parseFieldSpec(entry: unknown, at: string, reserved: ReadonlySet<string>): DeployTargetFieldSpec | string {
  if (!isPlainObject(entry)) return `${at} must be an object`;
  const { name, label, required, help, secret } = entry;
  if (typeof name !== "string" || !FIELD_NAME_PATTERN.test(name)) return `${at}.name must be a camelCase identifier`;
  if (reserved.has(name)) return `${at}.name '${name}' is reserved`;
  if (!isLabel(label)) return `${at}.label must be a non-empty string`;
  if (required !== undefined && typeof required !== "boolean") return `${at}.required must be a boolean`;
  if (secret !== undefined && typeof secret !== "boolean") return `${at}.secret must be a boolean`;
  if (help !== undefined && (typeof help !== "string" || help.length > MAX_HELP_LENGTH)) return `${at}.help must be a string of at most ${MAX_HELP_LENGTH} characters`;
  return { name, label, required: required === true, ...(help !== undefined ? { help } : {}), ...(secret === true ? { secret: true as const } : {}) };
}

/** A target's `env` block (absent = no env fallback), or the reason it is invalid. @complexity O(v). */
function parseEnvFallback(value: unknown, at: string): DeployTargetEnvFallback | undefined | string {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return `${at} must be an object`;
  const { tokenVars, fields } = value;
  if (!Array.isArray(tokenVars) || tokenVars.length === 0 || tokenVars.length > MAX_FIELDS || !tokenVars.every(isEnvVarName)) {
    return `${at}.tokenVars must be a non-empty array of env var names`;
  }
  if (fields === undefined) return { tokenVars };
  const entries = isPlainObject(fields) ? Object.entries(fields) : [];
  if (!isPlainObject(fields) || entries.length > MAX_FIELDS || !entries.every(([name, envVar]) => FIELD_NAME_PATTERN.test(name) && isEnvVarName(envVar))) {
    return `${at}.fields must map field names to env var names`;
  }
  return { tokenVars, fields: Object.fromEntries(entries) as Record<string, string> };
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= MAX_LABEL_LENGTH;
}

function isEnvVarName(value: unknown): value is string {
  return typeof value === "string" && ENV_VAR_PATTERN.test(value);
}

/** Indexes loaded targets by id, dropping every id more than one plugin declares.
 *  @complexity O(n) in the loaded target count. */
function buildRegistry(loaded: readonly LoadedDeployTarget[], refusals: readonly string[]): DeployTargetRegistry {
  const byId = new Map<string, LoadedDeployTarget[]>();
  for (const target of loaded) byId.set(target.descriptor.id, [...(byId.get(target.descriptor.id) ?? []), target]);

  const unique = new Map<string, LoadedDeployTarget>();
  const allRefusals = [...refusals];
  for (const [id, claimants] of byId) {
    if (claimants.length === 1) unique.set(id, claimants[0]!);
    else {
      const owners = claimants.map((target) => `'${target.pluginId}'`).sort().join(", ");
      allRefusals.push(`deploy target '${id}' was not loaded: more than one plugin declares it (${owners})`);
    }
  }
  return {
    get: (targetId) => unique.get(targetId),
    list: () => [...unique.values()],
    refusals: allRefusals,
  };
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
