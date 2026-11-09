import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential, CustomCredentialNotFoundError, CustomCredentialValidationError, type CustomCredentialWriteDeps } from "../store.js";
import {
  CredentialedRequestTransportError,
  CredentialedRequestValidationError,
  InMemoryCredentialedRequestAuditLog,
  makeCredentialedRequest,
  type CredentialedRequestDeps,
} from "../credentialed-request.js";
import { bindCredentialedRequestPort, bindSourceControlWritePort } from "../credential-ports.js";
import { EgressRefusedError, type HttpClientPort, type HttpRequest, type HttpResponse } from "../../../platform/http/index.js";
import type { SourceControlProviderOperations } from "../../source-control/provider-module.js";
import type { LoadSourceControlProviders, SourceControlProviderRegistry } from "../../source-control/provider-registry.js";

/**
 * @file EXTRACT-S8 C2 part 1: the core `CredentialedRequestPort` and `SourceControlWritePort` as
 * Tovu binds them (`credential-ports.ts`). Real bindings over the real request adapter, store,
 * sealer and provider registry builder; only the network and the provider's git-host calls are fakes.
 */

const WORKSPACE = "ws-c2p1";
const NOW = "2026-11-09T00:00:00.000Z";

class TrackingSealer implements SecretSealerPort {
  openCalls = 0;
  constructor(private readonly inner: SecretSealerPort) {}
  seal(input: Parameters<SecretSealerPort["seal"]>[0]): ReturnType<SecretSealerPort["seal"]> { return this.inner.seal(input); }
  open(input: Parameters<SecretSealerPort["open"]>[0], optional: Parameters<SecretSealerPort["open"]>[1] = {}): ReturnType<SecretSealerPort["open"]> {
    this.openCalls += 1;
    return this.inner.open(input, optional);
  }
}

class ScriptedHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly next: HttpResponse | Error = { status: 200, headers: {}, bodyText: "ok" }) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}

async function seeded(httpClient: HttpClientPort) {
  const keyring = new InMemoryKeyring();
  const sealer = new TrackingSealer(new AesGcmSecretSealer(keyring));
  const repo = new InMemoryCustomCredentialSetRepo();
  let n = 0;
  const writeDeps: CustomCredentialWriteDeps = { repo, sealer, keyring, clock: { nowMs: () => Date.parse(NOW) }, idGen: { newId: () => { n += 1; return `c2p1-${n}`; } } };
  await createCustomCredential(writeDeps, { workspaceId: WORKSPACE, label: "api", category: "ops", baseUrl: "https://api.example.test", connection: { token: "c2p1-secret-token" } });
  sealer.openCalls = 0;
  const audit = new InMemoryCredentialedRequestAuditLog();
  const deps: CredentialedRequestDeps = { repo, sealer, httpClient, clock: writeDeps.clock, audit, loadAuthSchemes: async () => [] };
  return { deps, sealer, audit, port: bindCredentialedRequestPort({ deps }) };
}

const REQUEST = { workspaceId: WORKSPACE, label: "api", method: "POST", url: "https://api.example.test/items" } as const;

test("classifyError: egress refusal keeps identity, exposes only the caller-safe form, and keeps the address in the audit", async () => {
  const refusal = new EgressRefusedError({ message: "refused internal.example.test -> 10.0.4.7" }, { callerSafeMessage: "refused internal.example.test" });
  const { port, audit } = await seeded(new ScriptedHttpClient(refusal));
  const thrown = await port.request(REQUEST).then(() => assert.fail("expected refusal"), (error: unknown) => error);
  assert.equal(thrown, refusal);
  const classified = port.classifyError({ error: thrown });
  assert.equal(classified.category, "egress-refused");
  assert.equal(classified.error, refusal);
  if (classified.category !== "egress-refused") return;
  assert.equal(classified.callerSafeMessage, "refused internal.example.test");
  assert.ok(classified.callerSafeError instanceof EgressRefusedError);
  assert.equal(classified.callerSafeError.message, "refused internal.example.test");
  assert.equal((classified.callerSafeError as EgressRefusedError).callerSafeMessage, "refused internal.example.test");
  assert.doesNotMatch(classified.callerSafeError.message, /10\.0\.4\.7/);
  assert.deepEqual(Object.keys(classified).sort(), ["callerSafeError", "callerSafeMessage", "category", "error"]);
  assert.match(audit.entries[0]?.egressRefusal ?? "", /10\.0\.4\.7/);
});

test("classifyError: validation, not-found, transport and unknown keep identity and expose only safe fields", async () => {
  const { port } = await seeded(new ScriptedHttpClient(new Error("connect ECONNREFUSED 10.0.0.9:443")));

  const offHost = await port.request({ ...REQUEST, url: "https://other.example.test/" }).then(() => assert.fail("expected"), (e: unknown) => e);
  assert.ok(offHost instanceof CredentialedRequestValidationError);
  const validation = port.classifyError({ error: offHost });
  assert.deepEqual(validation, { category: "validation", error: offHost, callerSafeMessage: offHost.message });
  assert.match(offHost.message, /add it to this credential in the Access Tokens form first/);

  const missing = await port.resolveTarget({ workspaceId: WORKSPACE, label: "nope", url: "https://api.example.test/" }).then(() => assert.fail("expected"), (e: unknown) => e);
  assert.ok(missing instanceof CustomCredentialNotFoundError);
  assert.deepEqual(port.classifyError({ error: missing }), { category: "not-found", error: missing, callerSafeMessage: missing.message });

  const transport = await port.request(REQUEST).then(() => assert.fail("expected"), (e: unknown) => e);
  assert.ok(transport instanceof CredentialedRequestTransportError);
  assert.deepEqual(port.classifyError({ error: transport }), { category: "transport", error: transport });

  const odd = { not: "an error" };
  assert.deepEqual(port.classifyError({ error: odd }), { category: "unknown", error: odd });
  assert.equal(port.classifyError({ error: odd }).error, odd);
});

test("request forwards headers/body and the adapter's bounds exactly like the direct adapter call", async () => {
  const viaPort = new ScriptedHttpClient();
  const direct = new ScriptedHttpClient();
  const a = await seeded(viaPort);
  const b = await seeded(direct);
  const optional = { headers: { "X-Trace": "c2p1" }, body: JSON.stringify({ name: "x" }) };
  const portResult = await a.port.request(REQUEST, optional);
  const directResult = await makeCredentialedRequest(b.deps, { ...REQUEST, ...optional });
  assert.deepEqual(portResult, directResult);
  assert.deepEqual(viaPort.calls, direct.calls);
  assert.equal(viaPort.calls[0]?.headers?.["X-Trace"], "c2p1");
  assert.equal(viaPort.calls[0]?.timeoutMs, 10_000);
  assert.equal(viaPort.calls[0]?.body, "{\"name\":\"x\"}");

  const tooBig = await a.port.request(REQUEST, { body: "x".repeat(1_000_001) }).then(() => assert.fail("expected"), (e: unknown) => e);
  assert.equal(a.port.classifyError({ error: tooBig }).category, "validation");
  assert.equal(viaPort.calls.length, 1);
});

test("verify and probe keep their tri-state results and diagnostics", async () => {
  const valid = await seeded(new ScriptedHttpClient({ status: 200, headers: {}, bodyText: "" }));
  assert.equal((await valid.port.verify({ workspaceId: WORKSPACE, label: "api" })).status, "valid");
  const invalid = await seeded(new ScriptedHttpClient({ status: 401, headers: {}, bodyText: "" }));
  const rejected = await invalid.port.verify({ workspaceId: WORKSPACE, label: "api" });
  assert.equal(rejected.status, "invalid");
  assert.deepEqual(rejected.authDiagnostic, { schemeSent: "Bearer", usernameStored: false });
  const down = await seeded(new ScriptedHttpClient(new Error("socket hang up")));
  assert.equal((await down.port.verify({ workspaceId: WORKSPACE, label: "api" })).status, "unreachable");

  const connection = { token: "probe-token" };
  for (const [response, expected] of [[{ status: 204, headers: {}, bodyText: "" }, "ok"], [{ status: 403, headers: {}, bodyText: "" }, "refused"], [new Error("down"), "unavailable"]] as const) {
    const client = new ScriptedHttpClient(response);
    const { port } = await seeded(client);
    assert.equal(await port.probe({ connection, url: "https://api.example.test/me", schemes: [] }), expected);
    assert.equal(client.calls[0]?.method, "GET");
    assert.equal(client.calls[0]?.body, undefined);
  }
});

test("resolveTarget validates the target without decrypting; request decrypts exactly once", async () => {
  const client = new ScriptedHttpClient();
  const { port, sealer } = await seeded(client);
  const target = await port.resolveTarget({ workspaceId: WORKSPACE, label: "api", url: "https://api.example.test/items/1" });
  assert.equal(target.url.href, "https://api.example.test/items/1");
  assert.equal(sealer.openCalls, 0);
  await assert.rejects(port.resolveTarget({ workspaceId: WORKSPACE, label: "api", url: "https://other.example.test/" }), CredentialedRequestValidationError);
  assert.equal(sealer.openCalls, 0);
  assert.equal(client.calls.length, 0);
  await port.request({ ...REQUEST, method: "DELETE", url: target.url.href });
  assert.equal(sealer.openCalls, 1);
});

/** One neutral provider whose methods record the object they were called on. */
function writerRegistry(log: { plans: unknown[]; commits: { self: unknown; plan: unknown }[]; planSelf: unknown[] }): SourceControlProviderRegistry {
  const plan = { parentCommitSha: "p1", baseTreeSha: "t1", fileStates: [{ path: "a.txt", exists: false }] };
  const ops = {
    async planFileWrite(this: unknown, input: unknown) { log.planSelf.push(this); log.plans.push(input); return { ok: true as const, plan }; },
    async commitFiles(this: unknown, _input: unknown, given: unknown) { log.commits.push({ self: this, plan: given }); return { ok: true as const, commitSha: "c1", commitUrl: "https://git.example.test/c/c1" }; },
  } as unknown as SourceControlProviderOperations;
  const loaded = [{ pluginId: "example-git", descriptor: { id: "example-git", label: "Example Git", apiOrigin: "https://git.example.test", module: "example.mjs" },
    module: { validateTarget: ({ owner }: { owner: string; repo: string }) => owner === "bad" ? "invalid Example Git owner 'bad'" : null, create: () => ops } }];
  return { list: () => loaded, get: (id: string) => loaded.find(entry => entry.descriptor.id === id), refusals: [] } as unknown as SourceControlProviderRegistry;
}

test("SourceControlWritePort: one build, target rules before planning, same provider and exact plan to commit", async () => {
  const log = { plans: [] as unknown[], commits: [] as { self: unknown; plan: unknown }[], planSelf: [] as unknown[] };
  let loads = 0;
  const load: LoadSourceControlProviders = async () => { loads += 1; return writerRegistry(log); };
  const port = bindSourceControlWritePort({ load, httpClient: new ScriptedHttpClient() });
  const built = await port.build({ workspaceId: WORKSPACE, baseUrl: "https://git.example.test" });
  assert.equal(loads, 1);
  assert.ok(built.ok);
  if (!built.ok) return;
  const provider = built.provider;

  assert.throws(() => port.validateTarget({ provider, target: { owner: "bad", repo: "r" } }), (e: unknown) => e instanceof CustomCredentialValidationError && /invalid Example Git owner 'bad'/.test(e.message));
  assert.equal(log.plans.length, 0);
  const target = port.validateTarget({ provider, target: { owner: "o", repo: "r" } });
  assert.deepEqual(target, { owner: "o", repo: "r" });

  const input = { baseUrl: "https://git.example.test", authorization: "Bearer x", ...target, branch: "main", files: [{ path: "a.txt", content: "hi" }] };
  const planned = await port.planFileWrite({ provider, input });
  assert.ok(planned.ok);
  if (!planned.ok) return;
  assert.equal(log.planSelf[0], provider);
  assert.equal(log.plans[0], input);
  assert.equal(log.commits.length, 0, "planning alone never commits (an aborted run stops here)");

  const committed = await port.commitFiles({ provider, input: { ...input, commitMessage: "m" }, plan: planned.plan });
  assert.deepEqual(committed, { ok: true, commitSha: "c1", commitUrl: "https://git.example.test/c/c1" });
  assert.equal(log.commits[0]?.self, provider);
  assert.equal(log.commits[0]?.plan, planned.plan);
  assert.equal(loads, 1);
});

test("SourceControlWritePort.build reports the host's no-provider message without throwing", async () => {
  const port = bindSourceControlWritePort({ load: async () => ({ list: () => [], get: () => undefined, refusals: [] }) as unknown as SourceControlProviderRegistry, httpClient: new ScriptedHttpClient() });
  const built = await port.build({ workspaceId: WORKSPACE, baseUrl: "https://git.example.test" });
  assert.equal(built.ok, false);
});
