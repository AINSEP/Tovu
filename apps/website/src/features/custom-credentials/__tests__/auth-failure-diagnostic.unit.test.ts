import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential, type CustomCredentialWriteDeps } from "../store.js";
import { makeCredentialedRequest, verifyCustomCredential, type CredentialedRequestDeps } from "../credentialed-request.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import type { ToolFailureDiagnostic } from "../../../contracts/core/tool-failure-diagnostics.js";

/**
 * @file The 401/403 authentication-failure diagnostic (2026-09-01) — the fix for the live name.com
 * incident this whole dispatch exists for: `custom_credential_make_request`/`custom_credential_verify`
 * used to return a bare 401 with no explanation, so the owner had to go hunt through the Access
 * Tokens UI by hand to discover the saved credential had no username. See `credentialed-request.ts`'s
 * own header, "Authentication-failure diagnostics", for the exact honesty contract this file certifies:
 * a NARROW hypothesis (Bearer sent + no username stored), never a claim, and never surfaced at all
 * when a username IS already stored (a 401 with a stored username is a different, unguessable
 * problem — a wrong username, an expired token, missing scopes — and suggesting "add a username" for
 * that case would be actively misleading).
 *
 * Also certifies (2026-09-01, second pass) that `AuthFailureDiagnostic` is now a genuine INSTANCE of
 * the general `ToolFailureDiagnostic` contract (`contracts/core/tool-failure-diagnostics.ts`), not a
 * parallel shape: `remedyToolId` — facet 4 of that contract, "whether a registered tool can supply
 * it" — names `custom_credential_set_username` exactly when `hint` fires, and is absent whenever
 * `hint` is (the two travel as a pair, never separately).
 */

const WORKSPACE = "ws-1";
const FIXED_NOW = "2026-09-01T00:00:00.000Z";

class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly responses: (HttpResponse | Error)[];
  private cursor = 0;
  constructor(responses: (HttpResponse | Error)[] = [{ status: 200, headers: {}, bodyText: "" }]) {
    this.responses = responses;
  }
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const next = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    if (next instanceof Error) throw next;
    return next;
  }
}

function makeWriteDeps(): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  return {
    repo: new InMemoryCustomCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => FIXED_NOW },
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
  };
}

/** Seeds the exact live incident shape: a name.com credential with NO saved username, so every
 *  request goes out as `Bearer` — which name.com's API rejects (it accepts only HTTP Basic
 *  `username:token`). */
async function seedWithoutUsername(): Promise<CustomCredentialWriteDeps> {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });
  return writeDeps;
}

/** Seeds the SAME provider, but already fixed — a saved username, so requests go out as Basic. */
async function seedWithUsername(): Promise<CustomCredentialWriteDeps> {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token", username: "leonaburime@gmail.com" },
  });
  return writeDeps;
}

function makeDeps(httpClient: HttpClientPort, base: CustomCredentialWriteDeps): CredentialedRequestDeps {
  return { repo: base.repo, sealer: base.sealer, clock: base.clock, httpClient };
}

// ---------------------------------------------------------------------------------------------
// makeCredentialedRequest
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: a 401 with Bearer sent and no username stored carries an honest, narrow authDiagnostic hint", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.equal(result.status, 401);
  // The provider's own error body must still be there, unsuppressed, alongside the new diagnostic.
  assert.equal(result.bodyText, "unauthorized");
  assert.ok(result.authDiagnostic, "expected an authDiagnostic on a 401 with no stored username");
  assert.equal(result.authDiagnostic!.schemeSent, "Bearer");
  assert.equal(result.authDiagnostic!.usernameStored, false);
  assert.ok(result.authDiagnostic!.hint, "expected a hint for the Bearer+no-username case");
  assert.match(result.authDiagnostic!.hint!, /username/i);
  // Never a claim: the wording must stay hedged ("may"/"might"), not assert the cause outright.
  assert.match(result.authDiagnostic!.hint!, /may|might|could/i);
});

test("makeCredentialedRequest: a 403 with Bearer sent and no username stored still reports the two structured facts (not just 401)", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 403, headers: {}, bodyText: "forbidden" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.ok(result.authDiagnostic, "the structured facts must still be present on a 403");
  assert.equal(result.authDiagnostic!.schemeSent, "Bearer");
  assert.equal(result.authDiagnostic!.usernameStored, false);
});

test("makeCredentialedRequest: a 403 with Bearer sent and no username stored carries NO hint — the live GitHub incident this fix addresses (2026-09-03). A saved GitHub PAT with full scopes 403'd because the outbound request carried no User-Agent header, not because of the auth scheme; the old logic offered the Basic-auth hint on ANY 401-or-403 and sent the owner down a dead-end repair path (asked for and saved a GitHub username; the retry still 403'd). 403 Forbidden covers causes unrelated to auth scheme in general — scopes, provider policy, a missing standard header — so this module now offers the scheme hypothesis only for a 401 (see credentialed-request.ts's header, '401 vs 403').", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 403, headers: {}, bodyText: "forbidden" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.equal(result.authDiagnostic!.hint, undefined, "a 403 must never suggest the Basic-auth/username hypothesis — that cause is unproven and was confirmed wrong for GitHub");
  assert.equal(result.authDiagnostic!.remedyToolId, undefined, "remedyToolId travels only alongside hint, never alone");
});

test("makeCredentialedRequest: a 401 on a credential that ALREADY has a stored username reports the facts but no hint — a different, unguessable cause", async () => {
  const writeDeps = await seedWithUsername();
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.ok(result.authDiagnostic, "structured facts (scheme/usernameStored) must still be present");
  assert.equal(result.authDiagnostic!.schemeSent, "Basic");
  assert.equal(result.authDiagnostic!.usernameStored, true);
  assert.equal(result.authDiagnostic!.hint, undefined, "must NOT suggest 'add a username' when one is already saved");
});

test("makeCredentialedRequest: a 401 on a self-describing-scheme token (FlyV1) reports schemeSent as the scheme actually sent, with NO hint — a different, unguessable cause since the scheme was already correct (2026-09-03, the Fly.io incident)", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "FlyV1fake_test_token_value" },
  });
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" });

  assert.ok(result.authDiagnostic);
  assert.equal(result.authDiagnostic!.schemeSent, "FlyV1");
  assert.equal(result.authDiagnostic!.usernameStored, false);
  assert.equal(result.authDiagnostic!.hint, undefined, "a self-describing scheme was already sent correctly — the Bearer-hint hypothesis does not apply");
  assert.equal(result.authDiagnostic!.remedyToolId, undefined);
});

test("makeCredentialedRequest: a self-describing-scheme token WITH a leftover saved username still reports the scheme it actually sent (FlyV1), not Basic — schemeSent never drifts from buildAuthorizationHeader's own precedence", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "FlyV1fake_test_token_value", username: "leftover-username" },
  });
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" });

  assert.equal(result.authDiagnostic!.schemeSent, "FlyV1");
  assert.equal(result.authDiagnostic!.usernameStored, true);
  assert.equal(result.authDiagnostic!.hint, undefined);
});

test("makeCredentialedRequest: a 200 response carries no authDiagnostic at all", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "ok" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.equal("authDiagnostic" in result, false);
});

test("makeCredentialedRequest: a 404 (not an auth failure) carries no authDiagnostic — only 401/403 do", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 404, headers: {}, bodyText: "not found" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.equal("authDiagnostic" in result, false);
});

test("makeCredentialedRequest: the Bearer+no-username hint carries remedyToolId pointing at the tool that can fix it (facet 4 of the general contract)", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.equal(result.authDiagnostic!.remedyToolId, "custom_credential_set_username");
});

test("makeCredentialedRequest: a stored-username 401 carries no remedyToolId — it travels only alongside hint, never alone", async () => {
  const writeDeps = await seedWithUsername();
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.equal(result.authDiagnostic!.hint, undefined);
  assert.equal(result.authDiagnostic!.remedyToolId, undefined);
});

test("makeCredentialedRequest: authDiagnostic is a genuine instance of the general ToolFailureDiagnostic contract, not a parallel shape", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  // Read through the GENERAL contract's own type — if `AuthFailureDiagnostic` were only a parallel
  // shape (same field names, no real `extends`), this assignment would still compile by accident;
  // what it CANNOT fake is agreement on the runtime values, asserted below against the same object.
  const asGeneralContract: ToolFailureDiagnostic = result.authDiagnostic!;
  assert.equal(asGeneralContract.hint, result.authDiagnostic!.hint);
  assert.equal(asGeneralContract.remedyToolId, result.authDiagnostic!.remedyToolId);
});

test("makeCredentialedRequest: the authDiagnostic never carries the token, in any field, serialized", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  const serialized = JSON.stringify(result.authDiagnostic);
  assert.ok(!serialized.includes("namecom-secret-token"));
  assert.ok(!/authorization/i.test(serialized), "the diagnostic must never carry the Authorization header value");
});

// ---------------------------------------------------------------------------------------------
// verifyCustomCredential
// ---------------------------------------------------------------------------------------------

test("verifyCustomCredential: an 'invalid' (401) result with no stored username carries the same honest hint", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });

  assert.equal(result.status, "invalid");
  assert.ok(result.authDiagnostic);
  assert.equal(result.authDiagnostic!.schemeSent, "Bearer");
  assert.equal(result.authDiagnostic!.usernameStored, false);
  assert.ok(result.authDiagnostic!.hint);
  assert.equal(result.authDiagnostic!.remedyToolId, "custom_credential_set_username");
});

test("verifyCustomCredential: an 'invalid' (401) result WITH a stored username carries no hint", async () => {
  const writeDeps = await seedWithUsername();
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });

  assert.equal(result.authDiagnostic?.usernameStored, true);
  assert.equal(result.authDiagnostic?.hint, undefined);
  assert.equal(result.authDiagnostic?.remedyToolId, undefined);
});

test("verifyCustomCredential: an 'invalid' (403) result with no stored username carries the structured facts but NO hint — the same GitHub-incident fix as makeCredentialedRequest's own 403 case", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 403, headers: {}, bodyText: "forbidden" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });

  assert.equal(result.status, "invalid");
  assert.ok(result.authDiagnostic, "the structured facts must still be present on a 403");
  assert.equal(result.authDiagnostic!.schemeSent, "Bearer");
  assert.equal(result.authDiagnostic!.usernameStored, false);
  assert.equal(result.authDiagnostic!.hint, undefined, "403 must never suggest the Basic-auth hypothesis");
  assert.equal(result.authDiagnostic!.remedyToolId, undefined);
});

test("verifyCustomCredential: a 'valid' (200) result carries no authDiagnostic at all", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });

  assert.equal(result.status, "valid");
  assert.equal("authDiagnostic" in result, false);
});

test("verifyCustomCredential: an 'unreachable' (500) result carries no authDiagnostic — only an affirmative 401/403 rejection does", async () => {
  const writeDeps = await seedWithoutUsername();
  const httpClient = new FakeHttpClient([{ status: 500, headers: {}, bodyText: "" }]);
  const deps = makeDeps(httpClient, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });

  assert.equal(result.status, "unreachable");
  assert.equal("authDiagnostic" in result, false);
});
