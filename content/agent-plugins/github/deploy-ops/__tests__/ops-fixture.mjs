import { fileURLToPath } from "node:url";
import { AesGcmSecretSealer } from "../../../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.ts";
import { InMemoryKeyring } from "../../../../../apps/website/src/features/webhooks/keyring.memory.ts";
import { InMemoryCustomCredentialSetRepo } from "../../../../../apps/website/src/features/custom-credentials/repo.memory.ts";
import { createCustomCredential } from "../../../../../apps/website/src/features/custom-credentials/store.ts";
import { InMemoryCredentialedRequestAuditLog } from "../../../../../apps/website/src/features/custom-credentials/credentialed-request.ts";
import { loadDeployOpsRegistryFromSource } from "../../../../../apps/website/src/features/deployments/deploy-ops/registry.ts";

// Moved from core's deploy-ops/__tests__/ops-fixture.ts with the tests that drive the generic runners
// through this plugin's real adapter: saved ops credentials, a scripted HTTP fake and this package's registry.
export const AT = "2026-10-01T12:00:00.000Z";
const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export async function fixture(optional = {}) {
  const { labels = ["ops"], host = "https://api.github.com", additionalHosts = [] } = optional;
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => Date.parse(AT) };
  let id = 0;
  for (const label of labels) await createCustomCredential({ repo, keyring, sealer, clock, idGen: { newId: () => String(++id) } }, { workspaceId: "ws", label, category: "ops", baseUrl: host, additionalHosts, connection: { token: "saved-private-token" } });
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "github", packageRoot: PACKAGE_ROOT });
  const calls = [];
  let response = { status: 200, headers: {}, bodyText: "[]" };
  const audit = new InMemoryCredentialedRequestAuditLog();
  const httpClient = { send: async (request) => { calls.push(request); return response; } };
  return { calls, registry, audit, setResponse: (next) => { response = next; }, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }), customCredentialSetRepo: repo, siteAssistantSecretSealer: sealer, customCredentialsHttpClient: httpClient, deployOpsHttpClient: httpClient, clock, loadAuthSchemes: async () => [], customCredentialsAudit: audit, deployOpsRegistry: registry, loadDeployOps: async () => registry } };
}
export function execution(input, signal = new AbortController().signal) { return { executionId: "exec", run: { id: "run" }, principal: { id: "principal" }, input, signal }; }
