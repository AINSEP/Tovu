import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../../webhooks/keyring.memory.js";
import { InMemoryCustomCredentialSetRepo } from "../../../custom-credentials/repo.memory.js";
import { createCustomCredential } from "../../../custom-credentials/store.js";
import { InMemoryCredentialedRequestAuditLog } from "../../../custom-credentials/credentialed-request.js";
import { loadDeployOpsRegistryFromSource } from "../registry.js";
import { fileURLToPath } from "node:url";
import { AT } from "./module-fixture.js";

/**
 * Core's deploy-ops harness over the neutral `fixtures/example-host` plugin, so generic runner tests
 * never depend on a real vendor's adapter. Credentials are saved for `host` (plus `additionalHosts`); HTTP is a scripted fake.
 */
export const EXAMPLE_API = "https://api.example-host.dev";
/** A second declared platform host, saved on the default credential, for secondary-host coverage. */
export const EXAMPLE_LOGS = "https://logs.example-host.dev";
const EXAMPLE_ROOT = fileURLToPath(new URL("./fixtures/example-host/", import.meta.url));
type Options = { labels?: string[]; host?: string; additionalHosts?: string[] };
export async function fixture(optional: Options = {}) {
  const { labels = ["ops"], host = EXAMPLE_API, additionalHosts = [EXAMPLE_LOGS] } = optional;
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => Date.parse(AT) };
  let id = 0;
  for (const label of labels) await createCustomCredential({ repo, keyring, sealer, clock, idGen: { newId: () => String(++id) } }, { workspaceId: "ws", label, category: "ops", baseUrl: host, additionalHosts, connection: { token: "saved-private-token" } });
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "example-host", packageRoot: EXAMPLE_ROOT });
  const calls: any[] = [];
  let response = { status: 200, headers: {}, bodyText: "[]" };
  const audit = new InMemoryCredentialedRequestAuditLog();
  const httpClient = { send: async (request: any) => { calls.push(request); return response; } };
  return { calls, registry, audit, setResponse: (next: typeof response) => { response = next; }, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }), customCredentialSetRepo: repo, siteAssistantSecretSealer: sealer, customCredentialsHttpClient: httpClient, deployOpsHttpClient: httpClient, clock, loadAuthSchemes: async () => [], customCredentialsAudit: audit, deployOpsRegistry: registry, loadDeployOps: async () => registry } };
}
export function execution(input: Record<string, unknown>, signal = new AbortController().signal) { return { executionId: "exec", run: { id: "run" }, principal: { id: "principal" }, input, signal }; }
