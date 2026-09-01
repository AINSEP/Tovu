import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential, type CustomCredentialWriteDeps } from "../store.js";
import { CustomCredentialNotFoundError } from "../store.js";
import {
  ConsoleCredentialedRequestAuditLog,
  CredentialedRequestTransportError,
  CredentialedRequestValidationError,
  InMemoryCredentialedRequestAuditLog,
  makeCredentialedRequest,
  verifyCustomCredential,
  type CredentialedRequestDeps,
} from "../credentialed-request.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";

/**
 * @file `credentialed-request.ts` — the two capabilities that let the agent actually USE a saved
 * custom credential (`custom_credential_verify`/`custom_credential_make_request`). Per the task's
 * own priority, the per-credential host-binding/SSRF-shaped tests are written and proven FIRST,
 * ahead of the happy path — this is the one control that stops "send provider A's token to provider
 * B's host" or to a host of the caller's own choosing.
 */

const WORKSPACE = "ws-1";
const FIXED_NOW = "2026-08-31T00:00:00.000Z";

/** Scripted `HttpClientPort` double — records every request it was asked to send (so a test can
 *  assert on the REAL resolved URL/headers a security boundary let through) and returns queued
 *  responses in order. Never touches the network — this file's whole point is testing
 *  `credentialed-request.ts`'s OWN host-binding/validation layer, which sits entirely above the
 *  `HttpClientPort` boundary; the guarded client's own SSRF protections are already covered by
 *  `platform/http/__tests__/client.test.ts`. */
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
      return {
        newId: () => {
          n += 1;
          return `cred-${n}`;
        },
      };
    })(),
  };
}

function makeDeps(overrides: Partial<CredentialedRequestDeps> & { httpClient: HttpClientPort }, base: CustomCredentialWriteDeps): CredentialedRequestDeps {
  return {
    repo: base.repo,
    sealer: base.sealer,
    clock: base.clock,
    ...overrides,
  };
}

/** Seeds both `name.com` and `fly.io` custom credentials — the owner's own real motivating case
 *  (`AGENTS.md`/the dispatch task both name these two rows explicitly). Returns the write deps so a
 *  test can build `CredentialedRequestDeps` from the SAME repo/sealer. */
async function seedNameComAndFlyIo(): Promise<CustomCredentialWriteDeps> {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token", username: "namecom-user" },
  });
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "flyio-secret-token" },
  });
  return writeDeps;
}

// ---------------------------------------------------------------------------------------------
// Per-credential host binding / SSRF-shaped rejections — written and proven first.
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: provider A's token cannot reach provider B's host — an absolute-URL path naming fly.io is refused while calling with the name.com credential, before any request is sent", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "https://api.fly.io/v1/apps" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal(
        (err as Error).message,
        "path must start with '/' — it is resolved against the credential's own saved base URL, never an absolute URL"
      );
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0, "the guarded client must never be reached once the path is rejected");
});

test("makeCredentialedRequest: a protocol-relative path ('//host/...') naming fly.io is refused while calling with the name.com credential", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "//api.fly.io/v1/apps" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal(
        (err as Error).message,
        "path '//api.fly.io/v1/apps' looks like it names a different host or scheme — this tool only ever resolves a path against the credential's own saved base URL"
      );
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a backslash-smuggled path is refused", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "/\\api.fly.io/steal" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.match((err as Error).message, /looks like it names a different host or scheme/);
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a path not starting with '/' is refused", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "v1/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal(
        (err as Error).message,
        "path must start with '/' — it is resolved against the credential's own saved base URL, never an absolute URL"
      );
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a legitimate relative path against name.com never touches fly.io's host, and carries name.com's own Authorization, not fly.io's", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: '{"domains":[]}' }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "/v4/domains" });

  assert.equal(httpClient.calls.length, 1);
  const sent = httpClient.calls[0];
  assert.equal(sent.url, "https://api.name.com/v4/domains");
  assert.ok(!sent.url.includes("fly.io"), "the request must never be addressed to fly.io's host");
  // name.com's saved connection carries a username -> HTTP Basic, base64("namecom-user:namecom-secret-token").
  assert.equal(sent.headers.Authorization, `Basic ${Buffer.from("namecom-user:namecom-secret-token").toString("base64")}`);
  assert.ok(!sent.headers.Authorization.includes("flyio-secret-token"));
  assert.equal(result.status, 200);
  assert.equal(result.bodyText, '{"domains":[]}');
});

test("makeCredentialedRequest: fly.io's own credential resolves to fly.io's own host and token — no cross-contamination in the other direction either", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", path: "/v1/apps/my-app" });

  const sent = httpClient.calls[0];
  assert.equal(sent.url, "https://api.fly.io/v1/apps/my-app");
  // fly.io's saved connection has no username -> Bearer.
  assert.equal(sent.headers.Authorization, "Bearer flyio-secret-token");
  assert.ok(!sent.headers.Authorization.includes("namecom-secret-token"));
});

// ---------------------------------------------------------------------------------------------
// Forbidden headers / method gating
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: a caller-supplied Authorization header is refused, case-insensitively", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "/v4/domains", headers: { AUTHORIZATION: "Bearer hacked" } }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal((err as Error).message, "header 'AUTHORIZATION' may not be set by the caller — the server injects the real credential's own Authorization header itself");
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a caller-supplied Cookie/Host/Proxy-Authorization header is refused", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  for (const forbidden of ["Cookie", "Host", "Proxy-Authorization"]) {
    await assert.rejects(
      () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "/v4/domains", headers: { [forbidden]: "x" } }),
      (err: unknown) => {
        assert.ok(err instanceof CredentialedRequestValidationError);
        assert.equal((err as Error).message, `header '${forbidden}' may not be set by the caller — the server injects the real credential's own Authorization header itself`);
        return true;
      }
    );
  }
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a non-GET method is refused with the exact reason", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "POST", path: "/v4/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal(
        (err as Error).message,
        "method must be 'GET' — this tool does not support write methods (POST/PUT/PATCH/DELETE) yet, see credentialed-request.ts's own header for why"
      );
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: an unknown label throws CustomCredentialNotFoundError, and shape validation runs before the credential lookup", async () => {
  const writeDeps = makeWriteDeps(); // no credentials seeded at all
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  // A bad path is rejected even though the label doesn't exist either — validation never leaks
  // "does this label exist" information via a different error for a malformed request.
  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "does-not-exist", method: "GET", path: "not-a-path" }),
    CredentialedRequestValidationError
  );

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "does-not-exist", method: "GET", path: "/v1/x" }),
    (err: unknown) => {
      assert.ok(err instanceof CustomCredentialNotFoundError);
      assert.equal((err as Error).message, "no custom credential labeled 'does-not-exist' in this workspace");
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// Token never leaks — audit trail and error messages
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: audits exactly {label, host, method, status, at} and never the token", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "ok" }]);
  const audit = new InMemoryCredentialedRequestAuditLog();
  const deps = makeDeps({ httpClient, audit }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "/v4/domains" });

  assert.equal(audit.entries.length, 1);
  assert.deepEqual(audit.entries[0], { label: "name.com", host: "api.name.com", method: "GET", status: 200, at: FIXED_NOW });
  const serialized = JSON.stringify(audit.entries);
  assert.ok(!serialized.includes("namecom-secret-token"), "the audit trail must never carry the token");
});

test("makeCredentialedRequest: a transport failure throws CredentialedRequestTransportError, audits status:0, and the error message never carries the token", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([new Error("getaddrinfo ENOTFOUND api.name.com")]);
  const audit = new InMemoryCredentialedRequestAuditLog();
  const deps = makeDeps({ httpClient, audit }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "/v4/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestTransportError);
      assert.equal((err as Error).message, "request to 'name.com' failed: getaddrinfo ENOTFOUND api.name.com");
      assert.ok(!(err as Error).message.includes("namecom-secret-token"));
      return true;
    }
  );
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0].status, 0);
});

test("makeCredentialedRequest: ConsoleCredentialedRequestAuditLog logs a structured line and never the token", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "ok" }]);
  const lines: string[] = [];
  const deps = makeDeps({ httpClient, audit: new ConsoleCredentialedRequestAuditLog((line) => lines.push(line)) }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", path: "/v4/domains" });

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "[custom-credentials] request label=name.com host=api.name.com method=GET status=200 at=2026-08-31T00:00:00.000Z");
  assert.ok(!lines[0].includes("namecom-secret-token"));
});

// ---------------------------------------------------------------------------------------------
// verifyCustomCredential — tri-state classification, never the response body
// ---------------------------------------------------------------------------------------------

test("verifyCustomCredential: a 2xx response classifies as 'valid'", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "secret account details" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });

  assert.deepEqual(result, { status: "valid", message: "'name.com' accepted this credential.", checkedAt: FIXED_NOW });
  assert.deepEqual(Object.keys(result).sort(), ["checkedAt", "message", "status"]);
  assert.equal(httpClient.calls[0].url, "https://api.name.com/");
});

test("verifyCustomCredential: a 401 response classifies as 'invalid'", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 401, headers: {}, bodyText: "unauthorized" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });

  assert.equal(result.status, "invalid");
  assert.equal(result.message, "'name.com' rejected this credential (HTTP 401) — it is invalid, expired, or missing required permissions.");
});

test("verifyCustomCredential: a 403 response also classifies as 'invalid'", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 403, headers: {}, bodyText: "" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });
  assert.equal(result.status, "invalid");
});

test("verifyCustomCredential: a 500 response classifies as 'unreachable', not 'invalid'", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 500, headers: {}, bodyText: "" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });
  assert.equal(result.status, "unreachable");
});

test("verifyCustomCredential: a network failure classifies as 'unreachable' and never throws", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([new Error("connect ETIMEDOUT")]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });
  assert.equal(result.status, "unreachable");
  assert.equal(result.message, "Could not reach 'name.com' to verify this credential — this does not necessarily mean the credential is bad.");
});

test("verifyCustomCredential: an unknown label throws CustomCredentialNotFoundError", async () => {
  const writeDeps = makeWriteDeps();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "does-not-exist" }),
    (err: unknown) => {
      assert.ok(err instanceof CustomCredentialNotFoundError);
      assert.equal((err as Error).message, "no custom credential labeled 'does-not-exist' in this workspace");
      return true;
    }
  );
});
