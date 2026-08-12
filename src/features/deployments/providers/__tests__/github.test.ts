import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/http/index";

import type { DeploymentProviderContext } from "../../ports";
import type { DeploymentTargetRecord, ReleaseRecord } from "../../types";
import { createGitHubDeploymentProvider, mapGitHubDeploymentStatus, sendPinned } from "../github";

/**
 * @file Regression tests for `../github.ts`.
 *
 * Mirrors `src/integrations/http.memory.ts`'s `RecordingHttpClient` shape (scripted responses in
 * call order, every request recorded) rather than reusing it directly, so this feature's tests do
 * not reach across a feature boundary into `integrations/`'s test infrastructure.
 *
 * Uses `node:test` + `node:assert/strict`, matching this repo's actual test runner
 * (`package.json`'s `test` script: `node --import tsx --test`) — NOT vitest, which several of the
 * peer designs this adapter was built from assumed incorrectly.
 */

class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private cursor = 0;
  constructor(private readonly responses: readonly HttpResponse[]) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const response = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    return response;
  }
}

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const TEST_PRIVATE_KEY_PEM = privateKey;

function jsonResponse(status: number, body: unknown): HttpResponse {
  return { status, headers: {}, bodyText: JSON.stringify(body) };
}

function makeTarget(overrides: Partial<DeploymentTargetRecord["config"]> = {}): DeploymentTargetRecord {
  return {
    workspaceId: "ws-1",
    id: "target-1",
    environmentId: "env-1",
    providerId: "github",
    label: "Production",
    config: { owner: "acme", repo: "site", environmentName: "production", ...overrides },
    enabled: true,
    createdAtIso: "2026-08-12T00:00:00.000Z",
    version: 1,
  };
}

function makeRelease(overrides: Partial<ReleaseRecord> = {}): ReleaseRecord {
  return {
    workspaceId: "ws-1",
    id: "release-1",
    label: "v1.2.3",
    source: { kind: "git-revision", repoUrl: "https://github.com/acme/site", commitSha: "a".repeat(40) },
    createdByPrincipalId: "user-1",
    createdAtIso: "2026-08-12T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function makeContext(http: HttpClientPort): DeploymentProviderContext {
  return {
    credentials: { appId: "1", installationId: "2", privateKeyPem: TEST_PRIVATE_KEY_PEM },
    httpClient: http,
    now: () => Date.parse("2026-08-12T19:00:00Z"),
  };
}

test("startRun mints a token, creates a deployment, and returns a callback-reconciled run ref", async () => {
  const http = new FakeHttpClient([
    jsonResponse(201, { token: "ghs_opaque", expires_at: "2026-08-12T20:00:00Z" }),
    jsonResponse(201, { id: 91 }),
  ]);
  const provider = createGitHubDeploymentProvider();

  const result = await provider.startRun({ target: makeTarget(), release: makeRelease() }, makeContext(http));

  assert.deepEqual(result, { ok: true, providerRunRef: "91", reconciliation: "callback" });
  assert.equal(http.calls.length, 2);
  assert.equal(http.calls[0].url, "https://api.github.com/app/installations/2/access_tokens");
  assert.equal(http.calls[1].url, "https://api.github.com/repos/acme/site/deployments");
  const createBody = JSON.parse(String(http.calls[1].body)) as Record<string, unknown>;
  assert.equal(createBody.ref, "a".repeat(40));
  assert.equal(createBody.environment, "production");
  assert.equal(createBody.production_environment, true);
});

test("startRun rejects an external-artifact release (the honesty constraint)", async () => {
  const http = new FakeHttpClient([jsonResponse(200, {})]);
  const provider = createGitHubDeploymentProvider();

  const result = await provider.startRun(
    { target: makeTarget(), release: makeRelease({ source: { kind: "external-artifact", uri: "https://example.com/x.tgz" } }) },
    makeContext(http)
  );

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "INVALID_RELEASE");
  // No network call was made — the check happens before any credential is even read.
  assert.equal(http.calls.length, 0);
});

test("startRun reports NO_CREDENTIALS_CONFIGURED without ever calling the network", async () => {
  const http = new FakeHttpClient([jsonResponse(200, {})]);
  const provider = createGitHubDeploymentProvider();
  const ctx: DeploymentProviderContext = { ...makeContext(http), credentials: {} };

  const result = await provider.startRun({ target: makeTarget(), release: makeRelease() }, ctx);

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "NO_CREDENTIALS_CONFIGURED");
  assert.equal(http.calls.length, 0);
});

test("origin pinning: every outbound call stays under https://api.github.com even with hostile owner/repo", async () => {
  const http = new FakeHttpClient([
    jsonResponse(201, { token: "ghs_opaque" }),
    jsonResponse(201, { id: 1 }),
  ]);
  const provider = createGitHubDeploymentProvider();

  const target = makeTarget({ owner: "acme", repo: "../../app/installations/1" });
  await provider.startRun({ target, release: makeRelease() }, makeContext(http));

  for (const call of http.calls) {
    assert.equal(new URL(call.url).origin, "https://api.github.com");
  }
  // The hostile repo segment must survive as ONE opaque path segment (its "/" characters encoded
  // to %2F) — never split into multiple "/"-delimited segments the URL parser could dot-collapse
  // into an actual path traversal outside /repos/acme/. encodeURIComponent leaves literal "."
  // untouched, which is fine: the danger is unencoded "/", not the dots themselves, and there is
  // exactly one "/" between "acme" and the encoded segment below.
  assert.match(http.calls[1].url, /\/repos\/acme\/\.\.%2F\.\.%2Fapp%2Finstallations%2F1\/deployments$/);
});

test("sendPinned refuses any request whose resolved origin is not https://api.github.com", async () => {
  // Direct test of the chokepoint itself (see its doc comment): every current adapter call site
  // builds URLs through `githubApiUrl()`, which can only ever resolve under the pinned origin, so
  // an adapter-level test cannot prove this guard is load-bearing — a mutation check confirmed
  // disabling it did not fail any adapter-level test. This is the guard's own proof.
  const http = new FakeHttpClient([jsonResponse(200, {})]);
  const hostile: HttpRequest = { method: "GET", url: "https://evil.example.com/steal", headers: {}, timeoutMs: 1000 };

  await assert.rejects(() => sendPinned(http, hostile), /refused to send.*evil\.example\.com/);
  assert.equal(http.calls.length, 0, "the hostile request must never reach the transport");
});

test("pollRun takes the status with the greatest id, not statuses[0] (GitHub documents no response order)", async () => {
  const http = new FakeHttpClient([
    jsonResponse(201, { token: "ghs_opaque" }),
    jsonResponse(200, [
      { id: 1, state: "queued" },
      { id: 3, state: "success" }, // deliberately not first, to falsify a newest-first assumption
      { id: 2, state: "in_progress" },
    ]),
  ]);
  const provider = createGitHubDeploymentProvider();

  const result = await provider.pollRun({ target: makeTarget(), providerRunRef: "42" }, makeContext(http));

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.update.status, "succeeded");
  assert.equal(result.ok && result.update.providerStatusId, "3");
});

test("pollRun returns queued when GitHub has not reported any status yet", async () => {
  const http = new FakeHttpClient([jsonResponse(201, { token: "ghs_opaque" }), jsonResponse(200, [])]);
  const provider = createGitHubDeploymentProvider();

  const result = await provider.pollRun({ target: makeTarget(), providerRunRef: "42" }, makeContext(http));

  assert.deepEqual(result, { ok: true, update: { status: "queued", providerStatusId: null, message: null } });
});

test("mapGitHubDeploymentStatus covers the real seven-value state enum explicitly", () => {
  const cases: Array<[string, string]> = [
    ["error", "failed"],
    ["failure", "failed"],
    ["success", "succeeded"],
    ["inactive", "cancelled"],
    ["in_progress", "running"],
    ["queued", "queued"],
    ["pending", "queued"],
  ];
  for (const [state, expected] of cases) {
    assert.equal(mapGitHubDeploymentStatus({ id: 1, state }).status, expected, `state '${state}'`);
  }
});

test("mapGitHubDeploymentStatus fails closed to 'running' for an unrecognized future state", () => {
  // Never terminal, so an enum value GitHub adds later cannot be mistaken for success or a
  // permanent failure.
  assert.equal(mapGitHubDeploymentStatus({ id: 1, state: "some_future_state" }).status, "running");
});

test("startRun surfaces a non-2xx token exchange as a typed PROVIDER_ERROR, never a throw", async () => {
  const http = new FakeHttpClient([jsonResponse(403, { message: "installation not found" })]);
  const provider = createGitHubDeploymentProvider();

  const result = await provider.startRun({ target: makeTarget(), release: makeRelease() }, makeContext(http));

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "PROVIDER_ERROR");
  assert.equal(!result.ok && result.error.providerStatus, 403);
});
