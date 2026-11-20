import { createHttpClient as createGuardedMediaHttpClient, createNodeGuardedHttpPorts } from "@jini-ai/platform/http/guarded";
import { createTovuOAuthHttpPorts } from "#src/platform/oauth/endpoint-safety";
import { resolveApiConnectionRuntime } from "./agent-plugin-connections.js";

export function composeOutboundHttp(_required: Record<string, never> = {}, _optional = {}) {
  // One pinned HTTP capability backs both media and OAuth; each request keeps its own tighter budget.
  const guardedOutboundHttpClient = createGuardedMediaHttpClient({
      ...createNodeGuardedHttpPorts({}),
      userAgent: "Tovu/0.1.0",
      // Preserve Jini's generation budget (10 minutes, 96 MiB); asset requests may choose less.
      // Redirects are refused; provider-returned URLs get no private-network exception.
      policy: { allowedSchemes: ["https", "http"], denyPrivateAddresses: true, devHostAllowlist: [],
        maxRedirects: 0, connectTimeoutMs: 10 * 60 * 1000,
        maxResponseBytes: 96 * 1024 * 1024, maxDecompressedBytes: 96 * 1024 * 1024 },
    });
  // c266749d0: desktop's loopback callback needs the same exception as plugin API OAuth.
  const externalMcpOAuthHttpPorts = createTovuOAuthHttpPorts({ http: guardedOutboundHttpClient }, { allowLoopbackHttp: resolveApiConnectionRuntime({ env: process.env }) === "desktop" });
  return { externalMcpOAuthHttpPorts, guardedOutboundHttpClient };
}
