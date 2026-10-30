import { applyPluginCredentialCard } from "../../../../contracts/core/plugin-credential-card.js";
import { ExternalMcpSecretStoreUnconfiguredError, ExternalMcpValidationError, saveExternalMcpServer } from "../../../external-mcp/external-mcp-store.js";
import type { ExternalMcpStoreDeps } from "../../../external-mcp/contracts.js";
import { findPluginCredentialCard, loadPluginCredentialCardsSafely, type LoadPluginCredentialCards } from "../../../custom-credentials/plugin-credential-card.js";
import { probeCredentialConnection } from "../../../custom-credentials/credentialed-request.js";
import type { HttpClientPort } from "../../../../platform/http/index.js";
import type { AgentPluginMcpPort, PluginCredentialsPort } from "../../service-ports.js";

/** Bind the existing in-memory store/sealer fixtures through the consumer's production boundary. */
export function mcpTestPort(store: ExternalMcpStoreDeps, _options = {}): AgentPluginMcpPort {
  return {
    repo: store.repo,
    saveServer: (input, _options = {}) => saveExternalMcpServer(store, input),
    classifyError: ({ error }, _options = {}) => {
      if (error instanceof ExternalMcpValidationError) return "validation";
      return error instanceof ExternalMcpSecretStoreUnconfiguredError ? "unconfigured" : "other";
    },
    notifyRosterChanged: async (_input, _options = {}) => {},
  };
}

/** Preserve the real safe lookup and guarded probe while the test controls cards and vendor HTTP. */
export function credentialTestPort(input: { loadCards?: LoadPluginCredentialCards; httpClient?: HttpClientPort }, _options = {}): PluginCredentialsPort {
  return {
    apply: applyPluginCredentialCard,
    loadSafe: (request, _options = {}) => loadPluginCredentialCardsSafely({ ...request, loadCards: input.loadCards }),
    find: (request, _options = {}) => findPluginCredentialCard({ ...request, loadCards: input.loadCards }),
    probe: ({ probeUrl, token }, _options = {}) => {
      if (!input.httpClient) throw new Error("No vendor HTTP fixture supplied");
      return probeCredentialConnection({ connection: { token }, url: probeUrl, schemes: [] }, { httpClient: input.httpClient });
    },
  };
}
