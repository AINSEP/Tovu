/** Active bundled data contributions only: an arbitrary issuer can impersonate any inbox. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundledContributionSources } from "../agent-plugins/bundled-contribution-sources.js";
import { loadPluginContributionsFromSource, type LoadPluginContributions,
  type PluginContributionDefinition } from "../agent-plugins/lifecycle.js";
import { MemberLoginError, type LoginProvider, type LoginProviderPreset } from "./types.js";

export const LOGIN_PROVIDERS_FILENAME = "tovu-login-providers.json";
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/;

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  return value;
}

function httpsUrl(value: unknown): string {
  const raw = text(value);
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  return raw;
}

function emailAuthority(value: Record<string, unknown>): Pick<LoginProviderPreset, "authoritativeEmailDomains" | "hostedDomainClaim"> {
  const domains = value.authoritativeEmailDomains ?? [];
  if (!Array.isArray(domains) || domains.length > 16) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  if (!domains.every(domain => typeof domain === "string" && DOMAIN.test(domain))) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  const claim = value.hostedDomainClaim;
  if (claim !== undefined && !/^[a-z][a-z0-9_]{0,63}$/.test(text(claim))) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  return { authoritativeEmailDomains: domains, ...(claim === undefined ? {} : { hostedDomainClaim: claim as string }) };
}

function scopes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length !== 3 || new Set(value).size !== 3) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  if (!value.every(scope => ["openid", "email", "profile"].includes(scope))) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  return value;
}

function preset(value: unknown): LoginProviderPreset {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  if (!ID.test(id)) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  if (row.signingAlgorithm !== "RS256" || row.clientAuthentication !== "client_secret_post") throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  if (row.pkce !== "S256") throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  return { id, label: text(row.label), issuer: httpsUrl(row.issuer), authorizationEndpoint: httpsUrl(row.authorizationEndpoint),
    tokenEndpoint: httpsUrl(row.tokenEndpoint), jwksUri: httpsUrl(row.jwksUri), scopes: scopes(row.scopes),
    signingAlgorithm: "RS256", clientAuthentication: "client_secret_post", pkce: "S256", credentialLabel: text(row.credentialLabel),
    credentialCardTarget: text(row.credentialCardTarget), ...emailAuthority(row) };
}

/** Parse a bounded v1 preset file. Failure exposes a fixed code, never raw plugin JSON.
 * @complexity O(bytes + p), bounded to 32 KiB and eight providers per package.
 */
export function parseLoginProviders(required: { raw: string }, _options = {}):
  { ok: true; descriptors: readonly LoginProviderPreset[] } | { ok: false; reason: string } {
  try {
    if (required.raw.length > 32768) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
    const file = JSON.parse(required.raw);
    if (file.schemaVersion !== 1 || !Array.isArray(file.providers) || file.providers.length > 8) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
    return { ok: true, descriptors: file.providers.map(preset) };
  } catch {
    return { ok: false, reason: "LOGIN_PROVIDER_INVALID" };
  }
}

function fingerprint(value: LoginProviderPreset): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const contribution: PluginContributionDefinition<LoginProviderPreset, LoginProvider> = {
  filename: LOGIN_PROVIDERS_FILENAME, contribution: "member login providers", kind: "data", parse: parseLoginProviders,
  load: ({ descriptor, plugin }) => ({ ...descriptor, pluginId: plugin.pluginId, configurationVersion: fingerprint(descriptor) }),
  onReadError: ({ error }) => (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : undefined,
};

/** Read only the product-owned bundle catalog root, never a workspace-installed package root.
 * Manifest namespace and the lifecycle's contained source reader establish the pinned presets.
 * @throws I/O errors for a broken shipped catalog; fails closed rather than trusting installed data.
 * @complexity O(p) bundled packages, two small file reads per provider package.
 */
export async function loadBundledLoginProviders(required: { sourceRoot: string }, _options = {}): Promise<readonly LoginProvider[]> {
  const items: LoginProvider[] = [];
  for (const plugin of bundledContributionSources({ sourceRoot: required.sourceRoot, filename: LOGIN_PROVIDERS_FILENAME })) {
    const manifest = JSON.parse(await readFile(path.join(plugin.packageRoot, "plugin.json"), "utf8"));
    if (manifest.extensions?.tovu?.id !== `tovu/${plugin.pluginId}`) continue;
    const loaded = await loadPluginContributionsFromSource({ plugin, definition: contribution });
    items.push(...loaded.items);
  }
  return items;
}

/** Reload activation/digest admission on start AND callback; compare the entire preset with the
 * shipped one. A trusted-looking installed id alone must never select an issuer or JWKS URL.
 * @returns Unique admitted providers only; duplicated ids are refused in full.
 * @complexity O(p + b), installed and bundled provider counts; no per-member queries.
 */
export async function loadLoginProviders(required: {
  workspaceId: string; loadContributions: LoadPluginContributions; bundledProviders: readonly LoginProvider[];
}, _options = {}): Promise<readonly LoginProvider[]> {
  const pins = new Map(required.bundledProviders.map(provider => [`${provider.pluginId}:${provider.id}`, provider]));
  const pluginIds = new Set(required.bundledProviders.map(provider => provider.pluginId));
  const loaded = await required.loadContributions({ workspaceId: required.workspaceId, definition: contribution }, { requireActive: true, orderByPluginId: true,
    packageRefusal: ({ plugin }) => pluginIds.has(plugin.pluginId) ? undefined : "LOGIN_PROVIDER_UNTRUSTED" });
  const admitted = loaded.items.filter(provider => pins.get(`${provider.pluginId}:${provider.id}`)?.configurationVersion === provider.configurationVersion);
  const counts = new Map<string, number>();
  for (const provider of admitted) counts.set(provider.id, (counts.get(provider.id) ?? 0) + 1);
  return admitted.filter(provider => counts.get(provider.id) === 1);
}
