/** Private spawning-main capability. Never a stored credential or a CLI launch setting. */
import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection, type McpBearerTokenSupplier } from "@jini-ai/mcp/federation";
import { createPinnedCapabilityRuntime, type PinnedCapabilityNames } from "@jini-ai/mcp/federation/hosted";
import { startupSecretEnvironment } from "../server/runtime/boot/startup-secrets.js";

export const DESKTOP_MCP_ID = "tovu-desktop";
export const DESKTOP_MCP_HANDOFF_ENV = "TOVU_DESKTOP_MCP_HANDOFF_TOKEN";
const CAPABILITY_NAMES: PinnedCapabilityNames = { url: "TOVU_DESKTOP_MCP_URL", token: "TOVU_DESKTOP_MCP_TOKEN", handoff: DESKTOP_MCP_HANDOFF_ENV };
export interface DesktopMcpCapability { readonly url: string; readonly token: string }

/** Strict loopback endpoint contract; canonical spelling also scopes the bearer supplier. O(1). */
export function isDesktopMcpCapability(value: unknown, _options = {}): value is DesktopMcpCapability {
  if (typeof value !== "object" || value === null) return false;
  if (!("url" in value) || !("token" in value)) return false;
  if (typeof value.url !== "string" || typeof value.token !== "string") return false;
  return isDesktopMcpUrl({ url: value.url }) && /^[a-f0-9]{64}$/.test(value.token);
}

/** Validate the canonical loopback spelling and TCP port range without URL normalization. O(1). */
function isDesktopMcpUrl({ url }: { url: string }, _optional = {}): boolean {
  return /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/mcp$/.test(url)
    && Number(url.split(":")[2]?.split("/")[0]) <= 65535;
}

export interface DesktopMcpRuntime {
  readonly handoffToken: string | undefined;
  readonly owned: boolean;
  readonly bearerToken: McpBearerTokenSupplier;
  connection(required: Record<string, never>, optional?: Record<string, never>): ResolvedFederatedConnection | null;
  accept(required: DesktopMcpCapability, optional?: Record<string, never>): boolean;
}

/** Capture and scrub the spawn contract before any child can inherit it. An initial bind failure
 * leaves only the handoff authority; its authenticated later delivery can fill the endpoint once.
 * A different main can never replace that endpoint. No I/O or persistence.
 * Jini's pinned-capability runtime owns the pin and the bearer supplier; the endpoint policy
 * ({@link isDesktopMcpCapability}), the variable names and the connection preset stay here. The
 * connection is built from the pinned URL only: the token leaves the runtime through `bearerToken`
 * for that exact URL and no other way, so it is never a header on the connection.
 * @example const runtime = createDesktopMcpRuntime({ env });
 * @complexity O(1) time/state; one fixed three-tool host preset.
 */
export function createDesktopMcpRuntime({ env }: { env: NodeJS.ProcessEnv }, _options = {}): DesktopMcpRuntime {
  const pinned = createPinnedCapabilityRuntime({ env, names: CAPABILITY_NAMES, isCapability: isDesktopMcpCapability });
  return {
    handoffToken: pinned.handoffToken,
    owned: pinned.owned,
    bearerToken: pinned.bearerToken,
    accept: (input, _optional = {}) => pinned.accept(input),
    connection(_required, _optional = {}) {
      const url = pinned.endpointUrl({});
      if (url === null) return null;
      return { config: { ...FEDERATED_CONNECTION_DEFAULTS, connectionId: DESKTOP_MCP_ID, label: "Tovu Desktop",
        origin: { kind: "preset" }, allowedToolNames: ["list_sites", "add_site_pointer", "reveal_site_folder"],
        writeAllowedToolNames: ["add_site_pointer", "reveal_site_folder"], readOnlyRemoteNames: new Set(["list_sites"]),
      }, launch: { url, headers: {} } };
    },
  };
}

let processRuntime: DesktopMcpRuntime | undefined;

/** Imports precede startup IPC; capture only when boot consumers first need the private runtime.
 * @complexity O(e) environment copy on first use, O(1) thereafter; no I/O or persistence.
 */
function runtimeForProcess(): DesktopMcpRuntime {
  if (!processRuntime) {
    // startupSecretEnvironment returns a detached copy, so the engine's scrub of that copy removes
    // nothing a child could inherit. The live environment is scrubbed here (URL) and at startup-secret
    // capture (token and handoff, STARTUP_SECRET_KEYS); both must stay.
    processRuntime = createDesktopMcpRuntime({ env: startupSecretEnvironment({ env: process.env }) });
    delete process.env.TOVU_DESKTOP_MCP_URL;
  }
  return processRuntime;
}

// One process-local owner; the stable supplier can be wired before startup IPC completes.
export const desktopMcpRuntime: DesktopMcpRuntime = {
  get handoffToken() { return runtimeForProcess().handoffToken; },
  get owned() { return runtimeForProcess().owned; },
  bearerToken: required => runtimeForProcess().bearerToken(required),
  connection: (required, optional) => runtimeForProcess().connection(required, optional),
  accept: (required, optional) => runtimeForProcess().accept(required, optional),
};
