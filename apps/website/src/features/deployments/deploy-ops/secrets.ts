import { createHash, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { ToolInputError } from "@jini-ai/core";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { fingerprintSiteKeyHex, parseSiteKeyHex, revealSiteKeyMaterial } from "#src/features/webhooks/keyring.env";
import { siteKeySourcesForSiteDir } from "#src/features/webhooks/site-key-sources";
import { loadDeployOpsRegistry, requirePlatform } from "./registry.js";
import { aborted, boundContext, type DeployOpsToolDeps } from "./run-ops.js";
import type { DeployOpsContext, DeployOpsSecretAppliesOn, DeployOpsSecretInfo, DeployOpsSecretWrite, LoadedDeployOps } from "./types.js";

/**
 * @file Generic host-secrets verbs (owner 2026-10-05: "a tool that sets and unsets secrets ... not just
 * for Fly ... it should work for really any vendor"). Vendors are adapters exported by the trusted
 * deploy plugin's deploy-ops modules (`listSecrets`/`setSecret`/`unsetSecret`, optional `readSecret`);
 * this file owns everything vendor-neutral: the value source, the compare-before-write, the human
 * confirmation before an overwrite or removal, and a result that never carries a secret value.
 *
 * A value never comes from the model. `source` names where the server reads it: this site's own key
 * (`site-key`), or another secret on the same target (`secret`, copied vendor side through
 * `readSecret`). Values stay inside this process: the audit records metadata only, and the result
 * reports a one-way fingerprint.
 */

export type SecretValueSource = { kind: "site-key" } | { kind: "secret"; name: string };
export interface SecretTargetInput { platform: string; target: string; credentialLabel?: string }
export interface SetSecretInput extends SecretTargetInput { name: string; source: SecretValueSource; dryRun?: boolean }
export interface UnsetSecretInput extends SecretTargetInput { name: string }
/** `unknown`: the secret exists but this adapter cannot read it back, so the values were not compared. */
export type SecretComparison = "same" | "different" | "absent" | "unknown";
/** What a human is asked to approve; fixed before the card is drawn. */
export interface SecretConfirmRequest { action: "overwrite" | "remove"; platform: string; target: string; name: string; source?: string; comparison?: SecretComparison; appliesOn: DeployOpsSecretAppliesOn }
/** The model-facing shape of a card the human did not confirm (`notConfirmedResult`). */
export interface SecretNotConfirmed { cancelled: boolean; reason?: "expired" | "abandoned"; note: string }
/** The tool layer's card. A refusal carries the model-facing not-confirmed result to spread into the reply. */
export type SecretConfirm = (request: SecretConfirmRequest) => Promise<{ confirmed: true } | { confirmed: false; result: SecretNotConfirmed }>;
interface SecretWriteResultBase extends Partial<SecretNotConfirmed> {
  platform: string; target: string; name: string; appliesOn: DeployOpsSecretAppliesOn; supportsStaging: boolean; deployNeeded: boolean; summary?: string; version?: string;
}
/** Never carries a value: only the comparison verdict and a one-way fingerprint. */
export interface SetSecretResult extends SecretWriteResultBase {
  source: SecretValueSource; comparison: SecretComparison; fingerprint: string; fingerprintKind: "site-key" | "sha256"; changed: boolean; dryRun?: true;
}
export interface UnsetSecretResult extends SecretWriteResultBase { removed: boolean }

export const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const clip = (value: unknown, max: number) => String(value).slice(0, max);
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** Constant-time over fixed-length digests, so neither length nor prefix leaks through timing. O(n). */
function sameValue(left: string, right: string): boolean {
  return timingSafeEqual(sha256(left), sha256(right));
}

/** A site-key-shaped value gets the Security page's own fingerprint, so the two can be compared by eye. O(n). */
export function secretFingerprint(value: string): { fingerprint: string; fingerprintKind: "site-key" | "sha256" } {
  const parsed = parseSiteKeyHex(value);
  return parsed.ok ? { fingerprint: fingerprintSiteKeyHex(parsed.hex), fingerprintKind: "site-key" } : { fingerprint: sha256(value).toString("hex").slice(0, 12), fingerprintKind: "sha256" };
}

/** Same ordered sources and precedence the Security page and the keyring read; re-read on every call. */
function defaultReadSiteKey(deps: DeployOpsToolDeps): string | undefined {
  const siteDir = deps.siteBinding?.dir;
  if (!siteDir) return undefined;
  const env = process.env;
  return revealSiteKeyMaterial({ sources: siteKeySourcesForSiteDir({ siteDir, mode: resolveRuntimeMode({ env }), env, home: homedir(), cwd: process.cwd() }) }).hex;
}

function requireSiteKey(deps: DeployOpsToolDeps): string {
  const hex = deps.readSiteKey ? deps.readSiteKey() : defaultReadSiteKey(deps);
  if (!hex) throw new ToolInputError({ message: "This site has no usable site key to copy. Check Security > Site key in the admin first." });
  return hex;
}

/** Refuse unknown platforms and platforms without a secrets adapter before any credential or network work. */
async function secretsPlatform(deps: DeployOpsToolDeps, id: string, signal?: AbortSignal): Promise<LoadedDeployOps> {
  if (signal?.aborted) throw aborted();
  const registry = await (deps.loadDeployOps ?? loadDeployOpsRegistry)({ workspaceId: deps.workspaceId });
  const platform = requirePlatform(registry, id);
  if (!platform.module.setSecret || !platform.module.secretCapabilities) {
    const capable = registry.list().filter(p => typeof p.module.setSecret === "function").map(p => p.descriptor.id);
    throw new ToolInputError({ message: `Deployment ops platform '${id}' has no secrets adapter. Platforms with one: ${capable.join(", ") || "(none)"}.` });
  }
  return platform;
}

function requireName(value: string, key = "name"): string {
  if (!SECRET_NAME_PATTERN.test(value)) throw new ToolInputError({ message: `${key} must be an environment variable name (letters, digits and underscores, not starting with a digit, at most 128 characters).` });
  return value;
}

/** Keep only documented fields; a malformed adapter result is refused rather than echoed. O(secrets). */
async function listNormalized(platform: LoadedDeployOps, ctx: DeployOpsContext, target: string): Promise<{ secrets: DeployOpsSecretInfo[]; truncated: boolean }> {
  const result = await platform.module.listSecrets!(ctx, { target });
  if (!Array.isArray(result?.secrets) || result.secrets.some(s => !s || typeof s.name !== "string" || !s.name)) throw new ToolInputError({ message: `Deployment ops platform '${platform.descriptor.id}' returned an invalid secret list.` });
  const secrets = result.secrets.slice(0, 500).map(s => ({ name: clip(s.name, 128), ...(typeof s.digest === "string" ? { digest: clip(s.digest, 200) } : {}), ...(typeof s.updatedAt === "string" ? { updatedAt: clip(s.updatedAt, 64) } : {}) }));
  return { secrets, truncated: result.truncated === true || result.secrets.length > 500 };
}

const applies = (platform: LoadedDeployOps) => {
  const { appliesOn, supportsStaging } = platform.module.secretCapabilities!;
  return { appliesOn, supportsStaging, deployNeeded: appliesOn === "next-deploy" };
};
const version = (write: DeployOpsSecretWrite | undefined): { version?: string } => (typeof write?.version === "string" || typeof write?.version === "number" ? { version: clip(write.version, 64) } : {});
const nextStep = (platform: LoadedDeployOps, target: string) => (platform.module.secretCapabilities!.appliesOn === "next-deploy" ? ` The running app keeps the old environment until the next deploy of '${target}' (deployment_ops_deploy).` : "");

/**
 * List a target's secret names with the vendor's digest and update time; never a value.
 * @param required - `deps`: saved-credential ports and the no-redirect client; `input`: platform, target, optional credential label.
 * @param optional - `signal` cancels before further requests.
 * @returns Names, vendor digests, update times, truncation and when writes take effect.
 * @throws {ToolInputError} Unknown or secrets-less platforms, credential/host/auth failures, malformed adapter output.
 * @complexity Time and space: O(credentials + secrets).
 * @example await runListSecrets({ deps, input: { platform: "fly", target: "my-app" } });
 */
export async function runListSecrets(required: { deps: DeployOpsToolDeps; input: SecretTargetInput }, optional: { signal?: AbortSignal } = {}) {
  const { deps, input } = required; const { signal } = optional;
  const platform = await secretsPlatform(deps, input.platform, signal);
  const ctx = await boundContext(deps, platform, input.credentialLabel, signal);
  const listed = await listNormalized(platform, ctx, input.target);
  return { platform: input.platform, target: input.target, ...listed, ...applies(platform) };
}

/** Read the source value server side. A copy needs the adapter's read verb and a source that exists. */
async function resolveValue(platform: LoadedDeployOps, ctx: DeployOpsContext, input: SetSecretInput, siteKey: string | undefined): Promise<string> {
  if (siteKey !== undefined) return siteKey;
  const source = input.source as { kind: "secret"; name: string };
  const read = await platform.module.readSecret!(ctx, { target: input.target, name: source.name });
  if (!read || !("value" in read) || typeof read.value !== "string") throw new ToolInputError({ message: `Secret '${source.name}' is not set on '${input.target}', so there is nothing to copy. List the secrets with deployment_ops_list_secrets.` });
  return read.value;
}

/** Compare the stored value when the adapter can read it; otherwise fall back to presence from the list. */
async function compareCurrent(platform: LoadedDeployOps, ctx: DeployOpsContext, input: SetSecretInput, value: string, signal?: AbortSignal): Promise<SecretComparison> {
  if (platform.module.readSecret) {
    try {
      const current = await platform.module.readSecret(ctx, { target: input.target, name: input.name });
      if (current && "value" in current && typeof current.value === "string") return sameValue(current.value, value) ? "same" : "different";
      if (current && "absent" in current && current.absent === true) return "absent";
    } catch (error) { if (signal?.aborted) throw error; /* An unreadable value (e.g. a token without secret-read scope) degrades to a presence check. */ }
  }
  const listed = await listNormalized(platform, ctx, input.target);
  return listed.secrets.some(s => s.name === input.name) ? "unknown" : "absent";
}

/** Fail closed: an overwrite or removal without a confirmation channel never runs. */
async function confirmOrRefuse(confirm: SecretConfirm | undefined, request: SecretConfirmRequest) {
  if (!confirm) throw new ToolInputError({ message: `Changing existing secret '${request.name}' needs a human confirmation, and this call has no way to ask. Nothing was changed.` });
  return confirm(request);
}

function validateSetInput(platform: LoadedDeployOps, input: SetSecretInput): void {
  requireName(input.name);
  if (input.source.kind !== "secret") return;
  requireName(input.source.name, "source.name");
  if (input.source.name === input.name) throw new ToolInputError({ message: "source.name must differ from name; a secret cannot be copied onto itself." });
  if (!platform.module.readSecret) throw new ToolInputError({ message: `Deployment ops platform '${input.platform}' cannot read secret values, so it cannot copy one secret to another. Use source kind 'site-key'.` });
}

/**
 * Set one secret on a host target from a server-side source; skips the write when the value is already there.
 * @param required - `deps`: credential ports, no-redirect client, site-key reader; `input`: platform, target, name, source, optional dryRun and credential label.
 * @param optional - `signal` cancels; `confirm` asks a human before an existing secret is replaced.
 * @returns changed, comparison, the value's fingerprint, when it applies, and an optional vendor version. Never the value.
 * @throws {ToolInputError} Invalid names, unusable sources, secrets-less platforms, credential/host/auth failures, or an overwrite with no confirm channel.
 * @complexity Time: O(credentials + secrets + value length) plus at most four adapter requests. Space: O(secrets).
 * @example await runSetSecret({ deps, input: { platform: "fly", target: "my-app", name: "TOVU_SITE_KEY", source: { kind: "site-key" } } }, { confirm });
 */
export async function runSetSecret(required: { deps: DeployOpsToolDeps; input: SetSecretInput }, optional: { signal?: AbortSignal; confirm?: SecretConfirm } = {}): Promise<SetSecretResult> {
  const { deps, input } = required; const { signal, confirm } = optional;
  const platform = await secretsPlatform(deps, input.platform, signal);
  validateSetInput(platform, input);
  const siteKey = input.source.kind === "site-key" ? requireSiteKey(deps) : undefined;
  const ctx = await boundContext(deps, platform, input.credentialLabel, signal);
  const value = await resolveValue(platform, ctx, input, siteKey);
  const comparison = await compareCurrent(platform, ctx, input, value, signal);
  const source = input.source.kind === "site-key" ? "this site's key" : `secret ${input.source.name}`;
  const base = { platform: input.platform, target: input.target, name: input.name, source: input.source, comparison, ...secretFingerprint(value), ...applies(platform) };
  if (comparison === "same") return { ...base, changed: false, deployNeeded: false, summary: `'${input.name}' on '${input.target}' already holds ${source}; nothing was written.` };
  if (input.dryRun) return { ...base, changed: false, dryRun: true, deployNeeded: false, summary: `Dry run: '${input.name}' would be ${comparison === "absent" ? "created" : "replaced"} from ${source}. Nothing was written.` };
  if (comparison !== "absent") {
    const decision = await confirmOrRefuse(confirm, { action: "overwrite", platform: input.platform, target: input.target, name: input.name, source, comparison, appliesOn: base.appliesOn });
    if (!decision.confirmed) return { ...base, changed: false, deployNeeded: false, ...decision.result };
  }
  if (signal?.aborted) throw aborted();
  const write = await platform.module.setSecret!(ctx, { target: input.target, name: input.name, value });
  return { ...base, changed: true, ...version(write), summary: `Set '${input.name}' on '${input.target}' from ${source}.${nextStep(platform, input.target)}` };
}

/**
 * Remove one secret from a host target after a human confirms; an absent name is reported, not deleted.
 * @param required - `deps`: credential ports and the no-redirect client; `input`: platform, target, name, optional credential label.
 * @param optional - `signal` cancels; `confirm` is required for an actual removal.
 * @returns removed, when the removal applies, and an optional vendor version.
 * @throws {ToolInputError} Invalid names, secrets-less platforms, credential/host/auth failures, or no confirm channel.
 * @complexity Time and space: O(credentials + secrets) plus two adapter requests.
 * @example await runUnsetSecret({ deps, input: { platform: "fly", target: "my-app", name: "OLD_KEY" } }, { confirm });
 */
export async function runUnsetSecret(required: { deps: DeployOpsToolDeps; input: UnsetSecretInput }, optional: { signal?: AbortSignal; confirm?: SecretConfirm } = {}): Promise<UnsetSecretResult> {
  const { deps, input } = required; const { signal, confirm } = optional;
  const platform = await secretsPlatform(deps, input.platform, signal);
  requireName(input.name);
  const ctx = await boundContext(deps, platform, input.credentialLabel, signal, { allowDelete: true });
  const listed = await listNormalized(platform, ctx, input.target);
  const base = { platform: input.platform, target: input.target, name: input.name, ...applies(platform) };
  if (!listed.truncated && !listed.secrets.some(s => s.name === input.name)) return { ...base, removed: false, deployNeeded: false, summary: `'${input.name}' is not set on '${input.target}'; nothing was removed.` };
  const decision = await confirmOrRefuse(confirm, { action: "remove", platform: input.platform, target: input.target, name: input.name, appliesOn: base.appliesOn });
  if (!decision.confirmed) return { ...base, removed: false, deployNeeded: false, ...decision.result };
  if (signal?.aborted) throw aborted();
  const write = await platform.module.unsetSecret!(ctx, { target: input.target, name: input.name });
  return { ...base, removed: true, ...version(write), summary: `Removed '${input.name}' from '${input.target}'.${nextStep(platform, input.target)}` };
}
