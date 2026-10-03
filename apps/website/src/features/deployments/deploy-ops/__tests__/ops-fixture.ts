import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../../webhooks/keyring.memory.js";
import { InMemoryCustomCredentialSetRepo } from "../../../custom-credentials/repo.memory.js";
import { createCustomCredential } from "../../../custom-credentials/store.js";
import { InMemoryCredentialedRequestAuditLog } from "../../../custom-credentials/credentialed-request.js";
import { loadDeployOpsRegistryFromSource } from "../registry.js";
import path from "node:path";
import { AT } from "./module-fixture.js";
export async function fixture(labels: string[] = ["ops"], host = "https://api.machines.dev", additionalHosts: string[] = ["https://api.fly.io"]) {
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => Date.parse(AT) };
  let id = 0;
  for (const label of labels) await createCustomCredential({ repo, keyring, sealer, clock, idGen: { newId: () => String(++id) } }, { workspaceId: "ws", label, category: "ops", baseUrl: host, additionalHosts, connection: { token: "saved-private-token" } });
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: path.resolve("content/agent-plugins/deploy") });
  const calls: any[] = [];
  let response = { status: 200, headers: {}, bodyText: "[]" };
  const audit = new InMemoryCredentialedRequestAuditLog();
  const httpClient = { send: async (request: any) => { calls.push(request); return response; } };
  return { calls, registry, audit, setResponse: (next: typeof response) => { response = next; }, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }), customCredentialSetRepo: repo, siteAssistantSecretSealer: sealer, customCredentialsHttpClient: httpClient, deployOpsHttpClient: httpClient, clock, loadAuthSchemes: async () => [], customCredentialsAudit: audit, deployOpsRegistry: registry, loadDeployOps: async () => registry } };
}
export function execution(input: Record<string, unknown>, signal = new AbortController().signal) { return { executionId: "exec", run: { id: "run" }, principal: { id: "principal" }, input, signal }; }
