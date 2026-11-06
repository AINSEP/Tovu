/** Private spawning-main capability. Never a stored credential or a CLI launch setting. */
import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection, type McpBearerTokenSupplier } from "@jini-ai/mcp/federation";
import { startupSecretEnvironment } from "../server/runtime/boot/startup-secrets.js";

export const DESKTOP_MCP_ID = "tovu-desktop";
export const DESKTOP_MCP_HANDOFF_ENV = "TOVU_DESKTOP_MCP_HANDOFF_TOKEN";
const CAPABILITY_KEYS = ["TOVU_DESKTOP_MCP_URL", "TOVU_DESKTOP_MCP_TOKEN", DESKTOP_MCP_HANDOFF_ENV] as const;
export interface DesktopMcpCapability { readonly url: string; readonly token: string }

/** Strict loopback endpoint contract; canonical spelling also scopes the bearer supplier. O(1). */
export function isDesktopMcpCapability(value: unknown, _options = {}): value is DesktopMcpCapability {
  if (typeof value !== "object" || value === null) return false;
  if (!("url" in value) || !("token" in value)) return false;
  if (typeof value.url !== "string" || typeof value.token !== "string") return false;
  return /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/mcp$/.test(value.url)
    && Number(value.url.split(":")[2]?.split("/")[0]) <= 65535 && /^[a-f0-9]{64}$/.test(value.token);
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
 * @example const runtime = createDesktopMcpRuntime({ env });
 * @complexity O(1) time/state; one fixed three-tool host preset.
 */
export function createDesktopMcpRuntime({ env }: { env: NodeJS.ProcessEnv }, _options = {}): DesktopMcpRuntime {
  const candidate = { url: env.TOVU_DESKTOP_MCP_URL, token: env.TOVU_DESKTOP_MCP_TOKEN };
  let capability: DesktopMcpCapability | undefined = isDesktopMcpCapability(candidate) ? candidate : undefined;
  const suppliedHandoff = env[DESKTOP_MCP_HANDOFF_ENV];
  const handoffToken = suppliedHandoff && /^[a-f0-9]{64}$/.test(suppliedHandoff) ? suppliedHandoff : undefined;
  for (const key of CAPABILITY_KEYS) delete env[key];
  return {
    handoffToken,
    owned: capability !== undefined || handoffToken !== undefined,
    bearerToken: ({ url }) => {
      if (!capability || url !== capability.url) return undefined;
      return capability.token;
    },
    accept(input, _optional = {}) {
      if (!isDesktopMcpCapability(input)) return false;
      if (capability && (capability.url !== input.url || capability.token !== input.token)) return false;
      capability = { ...input };
      return true;
    },
    connection(_required, _optional = {}) {
      if (!capability) return null;
      return { config: { ...FEDERATED_CONNECTION_DEFAULTS, connectionId: DESKTOP_MCP_ID, label: "Tovu Desktop",
        origin: { kind: "preset" }, allowedToolNames: ["list_sites", "add_site_pointer", "reveal_site_folder"],
        writeAllowedToolNames: ["add_site_pointer", "reveal_site_folder"], readOnlyRemoteNames: new Set(["list_sites"]),
      }, launch: { url: capability.url, headers: {} } };
    },
  };
}

let processRuntime: DesktopMcpRuntime | undefined;

/** Imports precede startup IPC; capture only when boot consumers first need the private runtime.
 * @complexity O(e) environment copy on first use, O(1) thereafter; no I/O or persistence.
 */
function runtimeForProcess(): DesktopMcpRuntime {
  if (!processRuntime) {
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
