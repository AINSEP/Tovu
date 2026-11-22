import assert from "node:assert/strict";
import test from "node:test";

import { createHttpClient } from "#src/platform/http/client";
import { CUSTOM_CREDENTIALS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import type { HttpRequest, HttpResponse, HttpTransportAdapter } from "#src/platform/http/ports";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory.js";
import { createSourceControlCredential } from "../store.js";
import { githubFromSource } from "./fixtures/github-from-source.js";

/**
 * @file The bundled `github` plugin's save-time account probe, end to end through the REAL guarded
 * client (egress guard, redirect policy) over a recording transport: no request carrying the saved
 * token may reach a host the API redirected to, and the save still succeeds. Plugin and guard are the
 * production code; only DNS and the socket are replaced (no real network).
 */

const TOKEN = "fixture_probe_credential_Zq81";
const REDIRECT_TARGET = "https://redirected.example.invalid/user";

/** Answers `GET api.github.com/user` with a redirect and records every request that reaches the wire. */
class RedirectingTransport implements HttpTransportAdapter {
  readonly wire: { url: string; authorization: string | undefined }[] = [];
  async requestPinned(request: HttpRequest): Promise<HttpResponse> {
    this.wire.push({ url: request.url, authorization: request.headers.Authorization });
    if (request.url === REDIRECT_TARGET) return { status: 200, headers: {}, bodyText: JSON.stringify({ login: "attacker-controlled" }) };
    return { status: 302, headers: { location: REDIRECT_TARGET }, bodyText: "" };
  }
}

const publicDns = { resolve: async () => ["140.82.112.5"] };

function makeDeps(transport: HttpTransportAdapter) {
  const keyring = new InMemoryKeyring();
  const clock = createFakeClock({ startIso: "2026-11-17T00:00:00.000Z" });
  const httpClient = createHttpClient({ transport, policy: CUSTOM_CREDENTIALS_EGRESS_POLICY }, { dns: publicDns });
  return { repo: new InMemorySourceControlCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring, clock,
    idGen: { newId: () => "cred-1" }, httpClient, loadSourceControlProviders: githubFromSource };
}

test("a redirect answered to the github account probe is refused: nothing with the token reaches the redirected host", async () => {
  const transport = new RedirectingTransport();
  const saved = await createSourceControlCredential({ deps: makeDeps(transport), input: {
    workspaceId: "ws-1", label: "probe", connection: { providerId: "github", token: TOKEN } } });
  assert.deepEqual(transport.wire, [{ url: "https://api.github.com/user", authorization: `Bearer ${TOKEN}` }], "only the first hop may be contacted");
  assert.equal(saved.accountLabel, null, "the redirect target's answer must not become the account label");
  assert.equal(saved.connection, "unreachable");
  assert.equal(saved.configured, true, "the credential is still saved");
});
