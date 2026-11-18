import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { CustomCredentialValidationError } from "../../custom-credentials/store.js";
import type { SourceControlProviderOperations } from "../provider-module.js";
import type { LoadSourceControlProviders, SourceControlProviderRegistry } from "../provider-registry.js";
import { bindSourceControlWritePort } from "../write-port.js";

/**
 * @file The core `SourceControlWritePort` as Tovu binds it (`write-port.ts`). Real binding over the real provider
 * registry builder; only the provider's git-host calls and the network are fakes.
 */

const WORKSPACE = "ws-c2p1";

class ScriptedHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly next: HttpResponse | Error = { status: 200, headers: {}, bodyText: "ok" }) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}

/** One neutral provider whose methods record the object they were called on. */
function writerRegistry(log: { plans: unknown[]; commits: { self: unknown; plan: unknown }[]; planSelf: unknown[] }): SourceControlProviderRegistry {
  const plan = { parentCommitSha: "p1", baseTreeSha: "t1", fileStates: [{ path: "a.txt", exists: false }] };
  const ops = {
    async planFileWrite(this: unknown, input: unknown) { log.planSelf.push(this); log.plans.push(input); return { ok: true as const, plan }; },
    async commitFiles(this: unknown, _input: unknown, given: unknown) { log.commits.push({ self: this, plan: given }); return { ok: true as const, commitSha: "c1", commitUrl: "https://git.example.test/c/c1" }; },
  } as unknown as SourceControlProviderOperations;
  const loaded = [{ pluginId: "example-git", descriptor: { id: "example-git", label: "Example Git", apiOrigin: "https://git.example.test", module: "example.mjs" },
    module: { validateTarget: ({ owner }: { owner: string; repo: string }) => owner === "bad" ? "invalid Example Git owner 'bad'" : null, create: () => ops } }];
  return { list: () => loaded, get: ({ providerId: id }: { providerId: string }) => loaded.find(entry => entry.descriptor.id === id), refusals: [] } as unknown as SourceControlProviderRegistry;
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

test("SourceControlWritePort reads its loader, client and observability when a write runs, never when it is bound", async () => {
  const log = { plans: [] as unknown[], commits: [] as { self: unknown; plan: unknown }[], planSelf: [] as unknown[] };
  const reads: string[] = [];
  const port = bindSourceControlWritePort({
    load: async () => writerRegistry(log),
    get httpClient(): HttpClientPort { reads.push("httpClient"); return new ScriptedHttpClient(); },
    get observability(): undefined { reads.push("observability"); return undefined; },
  });
  assert.deepEqual(reads, [], "binding must not read the host values: the roots bind before they exist");
  const built = await port.build({ workspaceId: WORKSPACE, baseUrl: "https://git.example.test" });
  assert.ok(built.ok);
  assert.deepEqual(reads.sort(), ["httpClient", "observability"]);
});
