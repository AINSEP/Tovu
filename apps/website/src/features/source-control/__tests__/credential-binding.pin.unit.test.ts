import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import type { SourceControlProviderOperations } from "@jini-ai/devops/source-control/site/provider-module";
import type { SourceControlWritePort } from "@jini-ai/core/contracts/credentials";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { InMemoryKeyring } from "../../webhooks/keyring.env.js";
import { validateRepositoryTarget } from "../../custom-credentials/repository-target.js";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory.js";
import { listSourceControlCredentials, resolveDefaultForSourceControl } from "@jini-ai/devops/source-control/site/store";
import { createSourceControlCredential } from "../store.js";
import type { SourceControlProviderRegistry } from "../provider-registry.js";
import { bindSourceControlWritePort } from "../write-port.js";
import { exampleProvidersWithoutProbe } from "./fixtures/example-provider.js";

/**
 * @file A04 pin: the source-control store's vault, scope and hint collaborator, and the write port's
 * repository-target refusal. Real store, real in-memory vault, real sealer; only the provider's git-host
 * calls are fakes. Fake credentials only; leak checks are boolean so a failure never prints a token.
 */

const SITE = "ws-a04-site";
const OTHER = "ws-a04-other";
const FAKE_TOKEN = "fixture_fake_a04_token_never_real";

function storeDeps() {
  const keyring = new InMemoryKeyring();
  return { repo: new InMemorySourceControlCredentialSetRepo(), sealer: new AesGcmSecretSealer({ keyring }), keyring,
    clock: createFakeClock({ startIso: "2026-11-25T00:00:00.000Z" }), idGen: { newId: () => "cred-a04" },
    loadSourceControlProviders: exampleProvidersWithoutProbe };
}

test("A04 pin: a saved connection is described by label in its own workspace with a safe hint, never the secret", async () => {
  const deps = storeDeps();
  const saved = await createSourceControlCredential({ deps, input: { workspaceId: SITE, label: "Deploy key", connection: { providerId: "example-git", token: FAKE_TOKEN } } });
  assert.equal(saved.label, "Deploy key");
  assert.deepEqual(saved.tokenHint, { length: FAKE_TOKEN.length, last4: FAKE_TOKEN.slice(-4) });

  const listed = await listSourceControlCredentials(deps, { workspaceId: SITE });
  assert.deepEqual(listed.map(row => ({ label: row.label, providerId: row.providerId, tokenHint: row.tokenHint })),
    [{ label: "Deploy key", providerId: "example-git", tokenHint: { length: FAKE_TOKEN.length, last4: FAKE_TOKEN.slice(-4) } }]);
  assert.equal(JSON.stringify(listed).includes(FAKE_TOKEN), false, "a listed summary carried the secret");
  assert.deepEqual(await listSourceControlCredentials(deps, { workspaceId: OTHER }), [], "another workspace must not see this row");

  assert.equal(await resolveDefaultForSourceControl(deps, { workspaceId: OTHER, providerId: "example-git" }), null);
  const opened = await resolveDefaultForSourceControl(deps, { workspaceId: SITE, providerId: "example-git" });
  assert.equal(opened?.label, "Deploy key");
  assert.equal(opened?.connection.token === FAKE_TOKEN, true, "the selected row must open in its own scope");
});

class NoNetwork implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  async send(request: HttpRequest): Promise<HttpResponse> { this.calls.push(request); throw new Error("no network in this pin"); }
}

function recordingRegistry(log: string[]): SourceControlProviderRegistry {
  const ops = {
    async planFileWrite() { log.push("plan"); return { ok: true as const, plan: { parentCommitSha: "p", baseTreeSha: "t", fileStates: [] } }; },
    async commitFiles() { log.push("commit"); return { ok: true as const, commitSha: "c", commitUrl: "https://git.example.test/c" }; },
  } as unknown as SourceControlProviderOperations;
  const loaded = [{ pluginId: "example-git", descriptor: { id: "example-git", label: "Example Git", apiOrigin: "https://git.example.test", module: "example.mjs" },
    module: { validateTarget: ({ owner }: { owner: string; repo: string }) => owner === "bad" ? "invalid Example Git owner 'bad'" : null, create: () => ops } }];
  return { list: () => loaded, get: ({ providerId }: { providerId: string }) => loaded.find(entry => entry.descriptor.id === providerId), refusals: [] } as unknown as SourceControlProviderRegistry;
}

/** The order the core write tool uses: the selected credential's host checks the target, then plan, then commit. */
async function writeInCoreOrder({ port, target }: { port: SourceControlWritePort; target: { owner: string; repo: string } }) {
  const built = await port.build({ workspaceId: SITE, baseUrl: "https://git.example.test" });
  if (!built.ok) throw new Error("provider did not build");
  const checked = port.validateTarget({ provider: built.provider, target });
  const input = { baseUrl: "https://git.example.test", authorization: "Bearer fake", ...checked, branch: "main", files: [{ path: "a.txt", content: "hi" }] };
  const planned = await port.planFileWrite({ provider: built.provider, input });
  if (!planned.ok) throw new Error("plan failed");
  return port.commitFiles({ provider: built.provider, input: { ...input, commitMessage: "m" }, plan: planned.plan });
}

test("A04 pin: an invalid repository target for the selected credential's host is refused before any write", async () => {
  const log: string[] = [];
  const httpClient = new NoNetwork();
  const port = bindSourceControlWritePort({ load: async () => recordingRegistry(log), httpClient, validateRepositoryTarget });
  await assert.rejects(() => writeInCoreOrder({ port, target: { owner: "bad", repo: "site" } }), { message: "invalid Example Git owner 'bad'" });
  assert.deepEqual(log, [], "no plan or commit may follow a refused target");
  assert.equal(httpClient.calls.length, 0);

  await writeInCoreOrder({ port, target: { owner: "octo", repo: "site" } });
  assert.deepEqual(log, ["plan", "commit"]);
});
