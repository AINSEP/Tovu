import type { OperatorLocaleDeps } from "#src/features/agent-plugins/operator-locale";
import { issueCredentialSetup, type ToolFailureDiagnostic } from "#src/contracts/core/tool-failure-diagnostics";
import { nowIso } from "@jini-ai/core/primitives";
import { ToolInputError } from "@jini-ai/core";
import { makeCredentialedRequest, resolveRequestTarget, CredentialedRequestValidationError, CredentialedRequestTransportError, type CredentialedRequestDeps, listCustomCredentials, CustomCredentialNotFoundError, allowedOriginsFor } from "#src/features/custom-credentials/index";
import { EgressRefusedError } from "../../../platform/http/index.js";
import type { AuthorizeFn } from "../../../contracts/core/commands/index.js";
import { loadDeployOpsRegistry, requirePlatform } from "./registry.js";
import type { DeployOpsContext, DeployOpsDeployResult, DeployOpsInput, DeployOpsResponse, DeployOpsSendRequest, DeployOpsLogs, DeployOpsRegistry, DeployOpsStatus, DeployOpsTargets, DeployOpsWaitResult, LoadedDeployOps } from "./types.js";

/** Response text is capped before parsing; the credential layer has already redacted secrets. */
export const MAX_RESPONSE_CHARS = 256_000;
/** The daemon applies no default tool timeout; this tool owns its 300s deadline and cancellation. */
export const MAX_WAIT_SECONDS = 300;
/** One module pause is short; a module that needs longer must poll, so cancellation stays prompt. */
export const MAX_MODULE_SLEEP_MS = 5_000;
export interface DeployOpsToolDeps extends OperatorLocaleDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: CredentialedRequestDeps["clock"];
  customCredentialSetRepo: CredentialedRequestDeps["repo"];
  siteAssistantSecretSealer: CredentialedRequestDeps["sealer"];
  /** Dedicated guarded client with redirects disabled, constructed by the composition root. */
  deployOpsHttpClient?: CredentialedRequestDeps["httpClient"];
  customCredentialsAudit?: CredentialedRequestDeps["audit"];
  loadAuthSchemes?: CredentialedRequestDeps["loadAuthSchemes"];
  /** Test/hermetic seam only. Production defaults to freshly gated installed packages. */
  loadDeployOps?: (ctx: { workspaceId: string }) => Promise<DeployOpsRegistry>;
  deployOpsRegistry?: DeployOpsRegistry;
  waitClock?: WaitClock;
  /** This boot's site folder; the default site-key reader resolves the same sources the Security page does. */
  siteBinding?: { dir?: string };
  /** Test seam: this site's active site key in hex, or undefined when none is usable. Never returned to the model. */
  readSiteKey?: () => string | undefined;
}
export interface WaitClock { now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void> }
const systemClock: WaitClock = {
  now: () => performance.now(),
  sleep: (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(aborted()); return; }
    const finish = () => { signal?.removeEventListener("abort", onAbort); resolve(); };
    const timer = setTimeout(finish, ms);
    const onAbort = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); reject(aborted()); };
    signal?.addEventListener("abort", onAbort, { once: true });
  }),
};
export const aborted = () => new ToolInputError({ message: "Deployment ops wait was aborted." });
const TIMEOUT = Symbol("deployment ops timeout");

/** Internal control signal caught at the registration boundary; tools return the diagnostic. */
export class DeployCredentialSetupRequired extends ToolInputError {
  readonly credentialSetup: ToolFailureDiagnostic;
  constructor({ label, baseUrl }: { label: string; baseUrl: string }, _optional = {}) {
    super({ message: "No matching deployment credential is saved. Call credential_save with kind api to open its secure card, then retry once." });
    this.credentialSetup = issueCredentialSetup({ setupToolId: "credential_save", prefill: { kind: "api", label, baseUrl, category: "ops" } }, {});
  }
}

/** Resolve by explicit label or exactly one saved host match, without decrypting. O(credentials). */
async function credentialLabel(deps: DeployOpsToolDeps, platform: LoadedDeployOps, explicit?: string): Promise<string> {
  const credentials = await listCustomCredentials({ repo: deps.customCredentialSetRepo }, { workspaceId: deps.workspaceId });
  const labels = credentials.map(c => c.label).sort().join(", ") || "(none)";
  if (explicit !== undefined) {
    if (!credentials.some(c => c.label === explicit)) throw new DeployCredentialSetupRequired({ label: explicit, baseUrl: `https://${platform.descriptor.hosts[0]!}` }, {});
    return explicit;
  }
  const host = platform.descriptor.hosts[0]!;
  const matches = credentials.filter(c => allowedOriginsFor(c).includes(`https://${host}`));
  if (matches.length === 0) throw new DeployCredentialSetupRequired({ label: platform.descriptor.id, baseUrl: `https://${host}` }, {});
  if (matches.length !== 1) throw new ToolInputError({ message: `Several saved custom credentials match '${host}'. Set credentialLabel to one of: ${matches.map(c => c.label).sort().join(", ")}.` });
  return matches[0]!.label;
}

/**
 * Bound GET/write facade. Both the platform and saved credential must allow the exact HTTPS origin.
 * `allowDelete` is set only by the secret-removal verb, so no other verb's module can send a DELETE.
 */
export async function boundContext(deps: DeployOpsToolDeps, platform: LoadedDeployOps, explicit: string | undefined, signal?: AbortSignal, options: { allowDelete?: boolean } = {}): Promise<DeployOpsContext> {
  if (!deps.deployOpsHttpClient) throw new ToolInputError({ message: "Deployment ops HTTP client is unavailable. Restart the site to rebuild its tool dependencies." });
  const label = await credentialLabel(deps, platform, explicit);
  const requestDeps: CredentialedRequestDeps = {
    repo: deps.customCredentialSetRepo,
    sealer: deps.siteAssistantSecretSealer,
    httpClient: deps.deployOpsHttpClient,
    clock: deps.clock,
    ...(deps.customCredentialsAudit ? { audit: deps.customCredentialsAudit } : {}),
    ...(deps.loadAuthSchemes ? { loadAuthSchemes: deps.loadAuthSchemes } : {}),
  };
  /** One guarded path for every method, so a write can never get a looser binding than a read. */
  const call = async (method: "GET" | DeployOpsSendRequest["method"], rawUrl: string, body?: unknown): Promise<DeployOpsResponse> => {
    if (signal?.aborted) throw aborted();
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new ToolInputError({ message: "Deployment ops module supplied an invalid URL." }); }
    if (url.protocol !== "https:" || url.username || url.password || url.port || !platform.descriptor.hosts.includes(url.hostname)) throw new ToolInputError({ message: `Deployment ops platform '${platform.descriptor.id}' does not allow host '${url.hostname}'.` });
    try { await resolveRequestTarget({ repo: requestDeps.repo }, { workspaceId: deps.workspaceId, label, url: rawUrl }); }
    catch (error) {
      if (error instanceof CredentialedRequestValidationError) throw new ToolInputError({ message: `Credential '${label}' does not allow host '${url.hostname}'. Add that host to the saved credential or choose another credentialLabel.` });
      if (error instanceof CustomCredentialNotFoundError) throw new ToolInputError({ message: `No saved custom credential labeled '${label}'. Choose another credentialLabel.` });
      throw error;
    }
    if (signal?.aborted) throw aborted();
    let response;
    let transportTruncated = false;
    // Preserve the text clipping flag the credential API does not expose in its returned shape.
    const boundedDeps: CredentialedRequestDeps = { ...requestDeps, httpClient: { send: async request => {
      // Auth scheme loading can yield after the earlier abort check. Recheck at the I/O boundary.
      if (signal?.aborted) throw aborted();
      const result = await requestDeps.httpClient.send({ ...request, ...(signal ? { signal } : {}), maxResponseBytes: MAX_RESPONSE_CHARS });
      transportTruncated = result.bodyTruncated === true;
      return result;
    } } };
    const write = method === "GET" ? {} : { headers: { "content-type": "application/json", accept: "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    try { response = await makeCredentialedRequest(boundedDeps, { workspaceId: deps.workspaceId, label, method, url: rawUrl, ...write }); }
    catch (error) {
      if (signal?.aborted) throw aborted();
      if (error instanceof EgressRefusedError) throw new ToolInputError({ message: `Deployment ops host '${url.hostname}' was refused by outbound HTTP policy. Use a public HTTPS endpoint allowed by the saved credential.` });
      if (error instanceof CredentialedRequestTransportError) throw new ToolInputError({ message: method === "GET" ? `Could not reach deployment ops host '${url.hostname}' using credential '${label}'. Retry the check.` : `Lost the connection to deployment ops host '${url.hostname}' during a ${method}; it may or may not have been accepted. Check deployment_ops_status before retrying.` });
      if (error instanceof CredentialedRequestValidationError || error instanceof CustomCredentialNotFoundError) throw new ToolInputError({ message: `Credential '${label}' changed or no longer allows host '${url.hostname}'. Check its saved hosts or choose another credentialLabel.` });
      throw error;
    }
    if (signal?.aborted) throw aborted();
    if (response.status === 401 || response.status === 403) throw new ToolInputError({ message: `Credential '${label}' was rejected (HTTP ${response.status}). Run custom_credential_verify with label '${label}' and check its saved token/scopes.` });
    if (response.status < 200 || response.status >= 300) throw new ToolInputError({ message: `Deployment ops host '${url.hostname}' returned HTTP ${response.status}. Check the target and retry; redirects are not followed.` });
    const text = response.bodyText.slice(0, MAX_RESPONSE_CHARS);
    const truncated = transportTruncated || response.bodyText.length > MAX_RESPONSE_CHARS;
    let json: unknown;
    if (!truncated) { try { json = JSON.parse(text); } catch { /* Plain logs are valid text. */ } }
    return { status: response.status, ...(json !== undefined ? { json } : {}), text, truncated };
  };
  return {
    nowIso: () => nowIso({ clock: deps.clock }),
    fail: message => { throw new ToolInputError({ message: message }); },
    sleep: ms => (deps.waitClock ?? systemClock).sleep(Math.min(Math.max(0, Number(ms) || 0), MAX_MODULE_SLEEP_MS), signal),
    get: rawUrl => call("GET", rawUrl),
    send: input => {
      if (![...["POST", "PATCH", "PUT"], ...(options.allowDelete ? ["DELETE"] : [])].includes(input.method)) throw new ToolInputError({ message: `Deployment ops module supplied unsupported method '${String(input.method)}'.` });
      return call(input.method, input.url, input.body);
    },
  };
}

type Operation = "status" | "logs" | "listTargets";
export function runDeployOps(deps: DeployOpsToolDeps, input: DeployOpsInput, operation: "status", signal?: AbortSignal): Promise<DeployOpsStatus>;
export function runDeployOps(deps: DeployOpsToolDeps, input: DeployOpsInput, operation: "logs", signal?: AbortSignal): Promise<DeployOpsLogs>;
export function runDeployOps(deps: DeployOpsToolDeps, input: DeployOpsInput, operation: "listTargets", signal?: AbortSignal): Promise<DeployOpsTargets>;
/**
 * Read through a freshly gated installed adapter, passing only a bound GET facade to the module.
 * @param deps - Saved-credential ports, audited HTTP client with redirects disabled, and test seams.
 * @param input - Platform, target, optional credential label and operation-specific selectors.
 * @param operation - Selects the normalized status, logs or target-list result.
 * @param signal - Cancels before further requests and propagates to the transport.
 * @throws {ToolInputError} Unknown platforms, credential/host/auth failures or cancelled requests.
 * @complexity Time: O(credentials + response size) plus bounded adapter requests. Space: O(response size).
 * @example await runDeployOps(deps, { platform: platformId, target: targetId }, "status", signal);
 */
export async function runDeployOps(deps: DeployOpsToolDeps, input: DeployOpsInput, operation: Operation, signal?: AbortSignal): Promise<DeployOpsStatus | DeployOpsLogs | DeployOpsTargets> {
  if (signal?.aborted) throw aborted();
  const registry = await (deps.loadDeployOps ?? loadDeployOpsRegistry)({ workspaceId: deps.workspaceId });
  const platform = requirePlatform(registry, input.platform);
  if (operation === "listTargets" && !platform.module.listTargets) throw new ToolInputError({ message: `Deployment ops platform '${input.platform}' does not support listing targets. Supply a target for deployment_ops_status.` });
  const ctx = await boundContext(deps, platform, input.credentialLabel, signal);
  if (signal?.aborted) throw aborted();
  if (operation === "listTargets") return platform.module.listTargets!(ctx, { org: input.org });
  if (operation === "logs") return platform.module.logs(ctx, { ...input, limit: input.limit ?? 100 });
  return platform.module.status(ctx, input);
}

export interface DeployRequest { platform: string; target: string; ref?: string; credentialLabel?: string }
const clip = (value: unknown) => String(value).slice(0, 2000);
/** Keep only the documented fields; platform/target come from the request, never from the module. O(machineIds). */
function normalizeDeployResult(input: DeployRequest, result: DeployOpsDeployResult): DeployOpsDeployResult {
  if (result?.started !== true || typeof result.summary !== "string") throw new ToolInputError({ message: `Deployment ops platform '${input.platform}' returned an invalid deploy result.` });
  if (result.runId !== undefined && !/^[0-9]+$/.test(String(result.runId))) throw new ToolInputError({ message: `Deployment ops platform '${input.platform}' returned an invalid run id.` });
  return {
    platform: input.platform, target: input.target, started: true, summary: clip(result.summary),
    ...(result.runId !== undefined ? { runId: String(result.runId) } : {}),
    ...(typeof result.sha === "string" ? { sha: clip(result.sha) } : {}),
    ...(Array.isArray(result.machineIds) ? { machineIds: result.machineIds.slice(0, 32).map(clip) } : {}),
    ...(typeof result.image === "string" ? { image: clip(result.image) } : {}),
    ...(typeof result.url === "string" && result.url.startsWith("https://") ? { url: clip(result.url) } : {}),
  };
}

/**
 * Start a deploy through a freshly gated installed adapter. The chat tool and the admin route both call this.
 * @param required - `deps`: saved-credential ports and the no-redirect HTTP client; `input`: platform, target, optional ref and credential label.
 * @param optional - `signal` cancels before further requests and propagates to the transport.
 * @returns The normalized accepted-deploy result; landing is observed afterwards with status/wait.
 * @throws {ToolInputError} Unknown or observe-only platforms, credential/host/auth failures, invalid module results, or cancellation.
 * @complexity Time: O(credentials + response size) plus bounded adapter requests. Space: O(response size).
 * @example await runDeploy({ deps, input: { platform: "github-actions", target: "owner/repo", ref: "main" } }, { signal });
 */
export async function runDeploy(required: { deps: DeployOpsToolDeps; input: DeployRequest }, optional: { signal?: AbortSignal } = {}): Promise<DeployOpsDeployResult> {
  const { deps, input } = required; const { signal } = optional;
  if (signal?.aborted) throw aborted();
  const registry = await (deps.loadDeployOps ?? loadDeployOpsRegistry)({ workspaceId: deps.workspaceId });
  const platform = requirePlatform(registry, input.platform);
  if (!platform.module.deploy) {
    const deployable = registry.list().filter(p => typeof p.module.deploy === "function").map(p => p.descriptor.id);
    throw new ToolInputError({ message: `Deployment ops platform '${input.platform}' cannot deploy; it is observe-only. Platforms that can deploy: ${deployable.join(", ") || "(none)"}.` });
  }
  const ctx = await boundContext(deps, platform, input.credentialLabel, signal);
  if (signal?.aborted) throw aborted();
  const result = await platform.module.deploy(ctx, { target: input.target, ...(input.ref !== undefined ? { ref: input.ref } : {}) });
  return normalizeDeployResult(input, result);
}

/** Race an in-flight status against the deadline and cancellation. Listeners/timers always cleaned up. */
async function boundedPoll(status: (signal: AbortSignal) => Promise<DeployOpsStatus>, remaining: number, signal?: AbortSignal): Promise<DeployOpsStatus> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => { controller.abort(); reject(aborted()); };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(TIMEOUT); }, remaining);
  });
  try { if (signal?.aborted) return await stopped; return await Promise.race([status(controller.signal), stopped]); }
  finally { if (timer) clearTimeout(timer); if (onAbort) signal?.removeEventListener("abort", onAbort); }
}

/**
 * Poll immediately and every 10s, bounding sleeps and in-flight polls by the remaining deadline.
 * @param deps - Status reader, optional monotonic clock/sleep seam, and initial unknown observation.
 * @param input - Desired condition, timeout (default 180s; validated by the tool handler), and abort signal.
 * @returns Reached flag, elapsed seconds, attempted poll count and last observation; timeout is a result.
 * @throws {ToolInputError} Cancellation or a refusal from the status reader.
 * @complexity Time: O(timeout / 10s) polls. Space: O(one status response).
 * @example await waitForDeployOps({ status }, { until: "healthy", timeoutSeconds: 180, signal });
 */
export async function waitForDeployOps(deps: { status(signal: AbortSignal): Promise<DeployOpsStatus>; clock?: WaitClock; initial?: DeployOpsStatus }, input: { until: "healthy" | "finished"; timeoutSeconds?: number; signal?: AbortSignal }): Promise<DeployOpsWaitResult> {
  const clock = deps.clock ?? systemClock; const started = clock.now(); const deadline = started + (input.timeoutSeconds ?? 180) * 1000;
  let polls = 0;
  let last = deps.initial ?? { platform: "unknown", target: "unknown", state: "unknown", summary: "No status received before timeout.", items: [], checkedAt: "" };
  const result = (reached: boolean): DeployOpsWaitResult => ({ reached, waitedSeconds: Math.min((clock.now() - started) / 1000, (deadline - started) / 1000), polls, last });
  while (clock.now() < deadline) {
    if (input.signal?.aborted) throw aborted();
    polls++;
    try { last = await boundedPoll(deps.status, deadline - clock.now(), input.signal); }
    catch (error) { if (error === TIMEOUT) return result(false); throw error; }
    if (input.signal?.aborted) throw aborted();
    if (clock.now() > deadline) return result(false);
    if (input.until === "healthy" ? last.state === "healthy" : ["healthy", "failing", "stopped"].includes(last.state)) return result(true);
    const remaining = deadline - clock.now();
    if (remaining > 0) await clock.sleep(Math.min(10_000, remaining), input.signal);
  }
  if (input.signal?.aborted) throw aborted();
  return result(false);
}
