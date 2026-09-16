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
  resolveRequestTarget,
  verifyCustomCredential,
  type CredentialedRequestDeps,
} from "../credentialed-request.js";
import { EgressRefusedError, type HttpClientPort, type HttpRequest, type HttpResponse } from "../../../platform/http/index.js";

/**
 * @file `credentialed-request.ts` — the two capabilities that let the agent actually USE a saved
 * custom credential (`custom_credential_verify`/`custom_credential_make_request`).
 *
 * Rewritten (not patched) against commit a77467b8's API, which this file's previous revision
 * predates: `path` (resolved against the credential's own saved `baseUrl`) became a full absolute
 * `url` checked against a per-credential SET of allowed origins (`baseUrl` + `additionalHosts`);
 * GET-only became all five methods, with the module itself never gating any of them (DELETE's
 * confirmation lives one layer up, in `tool-registrations.ts` — see
 * `make-request-delete-confirmation.test.ts` for that layer); and the audit shape gained
 * `bodyBytes`. Per the task's own priority, the per-credential host-binding/SSRF-shaped tests are
 * written first, ahead of the happy path — this is the one control that stops "send provider A's
 * token to provider B's host" or to a host of the caller's own choosing.
 */

const WORKSPACE = "ws-1";
const FIXED_NOW = "2026-08-31T00:00:00.000Z";

/** Scripted `HttpClientPort` double — records every request it was asked to send (so a test can
 *  assert on the REAL resolved URL/headers/body a security boundary let through) and returns
 *  queued responses in order. Never touches the network — this file's whole point is testing
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

/** Seeds both `name.com` and `fly.io` custom credentials, single-host — the owner's own real
 *  motivating case. `fly.io` here has no `additionalHosts`; see {@link seedFlyIoMultiHost} for the
 *  multi-host shape. Returns the write deps so a test can build `CredentialedRequestDeps` from the
 *  SAME repo/sealer. */
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

/** Seeds a `fly.io` credential with a SECOND real host (`api.machines.dev`, fly.io's actual
 *  Machines REST API alongside its GraphQL `api.fly.io`) via `additionalHosts` — the real
 *  functional gap 2026-08-31's multi-host widening closes (see `types.ts`'s `allowedOriginsFor`
 *  doc). Also seeds `name.com` (single-host) in the SAME workspace so a test can prove one
 *  credential's widened host set still never leaks into another credential's own allowlist. */
async function seedFlyIoMultiHostAndNameCom(): Promise<CustomCredentialWriteDeps> {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    additionalHosts: ["https://api.machines.dev"],
    connection: { token: "flyio-secret-token" },
  });
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token", username: "namecom-user" },
  });
  return writeDeps;
}

// ---------------------------------------------------------------------------------------------
// Per-credential host binding / SSRF-shaped rejections — single host, written and proven first.
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: provider A's token cannot reach provider B's host — a url naming fly.io is refused while calling with the name.com credential, before any request is sent", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.fly.io/v1/apps" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal(
        (err as Error).message,
        "url 'https://api.fly.io/v1/apps' resolves to origin 'https://api.fly.io', which is not one of this credential's saved hosts (https://api.name.com) — add it to this credential in the Access Tokens form first"
      );
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0, "the guarded client must never be reached once the url is rejected");
});

test("makeCredentialedRequest: a url embedding credentials (user:pass@) is refused", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://sneaky:hunter2@api.name.com/v4/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal(
        (err as Error).message,
        "url must not embed credentials (user:pass@) — the server injects the real Authorization header itself"
      );
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a non-http(s) url scheme is refused", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "ftp://api.name.com/v4/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal((err as Error).message, "url must use http or https");
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a url that is not a valid absolute URL is refused", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "v4/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal((err as Error).message, "url must be a valid absolute URL");
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: an empty url is refused", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal((err as Error).message, "url must be a non-empty string");
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a legitimate url against name.com never touches fly.io's host, and carries name.com's own Authorization, not fly.io's", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: '{"domains":[]}' }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.equal(httpClient.calls.length, 1);
  const sent = httpClient.calls[0]!;
  assert.equal(sent.url, "https://api.name.com/v4/domains");
  assert.ok(!sent.url.includes("fly.io"), "the request must never be addressed to fly.io's host");
  // name.com's saved connection carries a username -> HTTP Basic, base64("namecom-user:namecom-secret-token").
  assert.equal(sent.headers.Authorization, `Basic ${Buffer.from("namecom-user:namecom-secret-token").toString("base64")}`);
  assert.ok(!sent.headers.Authorization!.includes("flyio-secret-token"));
  assert.equal(result.executed, true);
  assert.equal(result.status, 200);
  assert.equal(result.bodyText, '{"domains":[]}');
});

test("makeCredentialedRequest: fly.io's own credential resolves to fly.io's own host and token — no cross-contamination in the other direction either", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" });

  const sent = httpClient.calls[0]!;
  assert.equal(sent.url, "https://api.fly.io/v1/apps/my-app");
  // fly.io's saved connection has no username -> Bearer.
  assert.equal(sent.headers.Authorization, "Bearer flyio-secret-token");
  assert.ok(!sent.headers.Authorization!.includes("namecom-secret-token"));
});

// ---------------------------------------------------------------------------------------------
// Self-describing token schemes (2026-09-03) — the Fly.io incident: fly.io's own token starts with
// its own literal scheme word (`FlyV1`), and `Authorization: Bearer <the same token unmodified>` is
// affirmatively rejected by Fly's own API while `Authorization: FlyV1 <rest>` is accepted — see
// `credentialed-request.ts`'s header, "Self-describing token schemes", for the live verification.
// Every fixture below uses a SYNTHETIC token (`FlyV1fake_test_token_value`), never a real credential.
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: a token starting with the FlyV1 self-describing scheme is sent as `FlyV1 <rest>`, not `Bearer FlyV1<rest>`", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "FlyV1fake_test_token_value" },
  });
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" });

  const sent = httpClient.calls[0]!;
  assert.equal(sent.headers.Authorization, "FlyV1 fake_test_token_value");
  assert.notEqual(sent.headers.Authorization, "Bearer FlyV1fake_test_token_value");
});

test("makeCredentialedRequest: an ordinary opaque token with no recognized scheme prefix is still sent as `Bearer <token>`, unchanged", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "generic",
    category: "general",
    baseUrl: "https://api.example.com",
    connection: { token: "opaque_token_with_an_underscore_in_it" },
  });
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "generic", method: "GET", url: "https://api.example.com/v1/ping" });

  assert.equal(httpClient.calls[0]!.headers.Authorization, "Bearer opaque_token_with_an_underscore_in_it");
});

test("makeCredentialedRequest: a saved username does not affect the Basic-auth path when the token has no recognized scheme prefix", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "generic",
    category: "general",
    baseUrl: "https://api.example.com",
    connection: { token: "opaque-secret-token", username: "generic-user" },
  });
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "generic", method: "GET", url: "https://api.example.com/v1/ping" });

  assert.equal(httpClient.calls[0]!.headers.Authorization, `Basic ${Buffer.from("generic-user:opaque-secret-token").toString("base64")}`);
});

test("makeCredentialedRequest: a self-describing-scheme token takes priority over a saved username — it is sent as FlyV1, never Basic", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "FlyV1fake_test_token_value", username: "leftover-username" },
  });
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" });

  const sent = httpClient.calls[0]!;
  assert.equal(sent.headers.Authorization, "FlyV1 fake_test_token_value");
  assert.ok(!sent.headers.Authorization!.startsWith("Basic "), "a self-describing scheme must never be displaced by a saved username");
});

test("makeCredentialedRequest: a reflecting response still redacts the full self-describing token, in both the header and the body", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "FlyV1fake_test_token_value" },
  });
  const httpClient = new FakeHttpClient([
    { status: 200, headers: { "X-Reflected-Auth": "FlyV1 fake_test_token_value" }, bodyText: '{"echo":"FlyV1fake_test_token_value"}' },
  ]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" });

  assert.equal(result.headers["X-Reflected-Auth"], undefined);
  assert.ok(!result.bodyText.includes("FlyV1fake_test_token_value"));
  assert.ok(!result.bodyText.includes("fake_test_token_value"));
});

// The leak shape the two tests above CANNOT catch: their fixtures echo the FULL "FlyV1 <value>"
// (or "FlyV1<value>") token back, so the existing `authorizationHeader`/`connection.token` secrets
// already redact it as a side effect. A real provider error body reflecting only the BARE macaroon
// value — no "FlyV1" scheme word at all, e.g. `{"error":"invalid macaroon <value>"}` — matches
// neither: `resolveAuthorizationScheme`'s `value` field (the bare token with its scheme word
// stripped) was never added to `buildResponseSecrets`'s self-describing branch. Every fixture below
// uses a SYNTHETIC token, never a real credential.

test("makeCredentialedRequest: a self-describing token's BARE value (no scheme prefix) reflected in the response body is redacted", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "FlyV1fake_test_token_value" },
  });
  const httpClient = new FakeHttpClient([{ status: 400, headers: {}, bodyText: '{"error":"invalid macaroon fake_test_token_value"}' }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" });

  assert.ok(!result.bodyText.includes("fake_test_token_value"), "the bare self-describing token value must be redacted even with no scheme prefix");
});

test("makeCredentialedRequest: a self-describing token's BARE value (no scheme prefix) reflected in a response header is redacted", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "FlyV1fake_test_token_value" },
  });
  const httpClient = new FakeHttpClient([{ status: 200, headers: { "X-Debug-Echo": "fake_test_token_value" }, bodyText: "{}" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" });

  assert.equal(result.headers["X-Debug-Echo"], undefined, "a header carrying the bare self-describing token value must be dropped");
});

// ---------------------------------------------------------------------------------------------
// Multi-host binding (`additionalHosts`, 2026-08-31) — the owner's explicit ask, previously
// uncovered.
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: a url on a credential's additionalHosts entry is accepted, with that same credential's own Authorization", async () => {
  const writeDeps = await seedFlyIoMultiHostAndNameCom();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: '{"machines":[]}' }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    method: "GET",
    url: "https://api.machines.dev/v1/apps/my-app/machines",
  });

  assert.equal(httpClient.calls.length, 1);
  const sent = httpClient.calls[0]!;
  assert.equal(sent.url, "https://api.machines.dev/v1/apps/my-app/machines");
  assert.equal(sent.headers.Authorization, "Bearer flyio-secret-token");
  assert.equal(result.status, 200);
  assert.equal(result.bodyText, '{"machines":[]}');
});

test("makeCredentialedRequest: a url on the credential's baseUrl still works unchanged once additionalHosts is set — the primary host is not displaced", async () => {
  const writeDeps = await seedFlyIoMultiHostAndNameCom();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.fly.io/v1/apps/my-app" });

  assert.equal(httpClient.calls[0]!.url, "https://api.fly.io/v1/apps/my-app");
});

test("makeCredentialedRequest: a url whose origin is NOT in the saved set (neither baseUrl nor additionalHosts) is refused before any network call, naming every allowed host", async () => {
  const writeDeps = await seedFlyIoMultiHostAndNameCom();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://evil.example.com/steal" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal(
        (err as Error).message,
        "url 'https://evil.example.com/steal' resolves to origin 'https://evil.example.com', which is not one of this credential's saved hosts (https://api.fly.io, https://api.machines.dev) — add it to this credential in the Access Tokens form first"
      );
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: provider A's credential still cannot reach provider B's host, even when provider A has additionalHosts of its own", async () => {
  const writeDeps = await seedFlyIoMultiHostAndNameCom();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  // fly.io (multi-host) reaching for name.com's host.
  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "fly.io", method: "GET", url: "https://api.name.com/v4/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.match((err as Error).message, /not one of this credential's saved hosts \(https:\/\/api\.fly\.io, https:\/\/api\.machines\.dev\)/);
      return true;
    }
  );

  // name.com (single-host) reaching for fly.io's SECONDARY host — proves the widened set is
  // per-credential, not global.
  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.machines.dev/v1/apps" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.match((err as Error).message, /not one of this credential's saved hosts \(https:\/\/api\.name\.com\)/);
      return true;
    }
  );

  assert.equal(httpClient.calls.length, 0, "neither cross-credential attempt may ever reach the guarded client");
});

// ---------------------------------------------------------------------------------------------
// Forbidden headers / method validation
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: a caller-supplied Authorization header is refused, case-insensitively", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () =>
      makeCredentialedRequest(deps, {
        workspaceId: WORKSPACE,
        label: "name.com",
        method: "GET",
        url: "https://api.name.com/v4/domains",
        headers: { AUTHORIZATION: "Bearer hacked" },
      }),
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
      () =>
        makeCredentialedRequest(deps, {
          workspaceId: WORKSPACE,
          label: "name.com",
          method: "GET",
          url: "https://api.name.com/v4/domains",
          headers: { [forbidden]: "x" },
        }),
      (err: unknown) => {
        assert.ok(err instanceof CredentialedRequestValidationError);
        assert.equal((err as Error).message, `header '${forbidden}' may not be set by the caller — the server injects the real credential's own Authorization header itself`);
        return true;
      }
    );
  }
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a forbidden header name with leading/trailing whitespace is still refused", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  for (const paddedForbidden of ["authorization ", " host", "\tcookie", "Proxy-Authorization "]) {
    await assert.rejects(
      () =>
        makeCredentialedRequest(deps, {
          workspaceId: WORKSPACE,
          label: "name.com",
          method: "GET",
          url: "https://api.name.com/v4/domains",
          headers: { [paddedForbidden]: "x" },
        }),
      (err: unknown) => {
        assert.ok(err instanceof CredentialedRequestValidationError);
        assert.equal((err as Error).message, `header '${paddedForbidden}' may not be set by the caller — the server injects the real credential's own Authorization header itself`);
        return true;
      }
    );
  }
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: an unsupported method value is refused with the exact reason", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "TRACE", url: "https://api.name.com/v4/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal((err as Error).message, "method must be one of GET, POST, PUT, PATCH, DELETE");
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// All five methods actually run — 2026-08-31 owner override widened this tool from GET-only.
// This module itself never gates DELETE; see `make-request-delete-confirmation.test.ts` for the
// wiring layer that does.
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: POST/PUT/PATCH each send the given body exactly to the guarded client, and the audit records only its byte size, never the body itself", async () => {
  for (const method of ["POST", "PUT", "PATCH"] as const) {
    const writeDeps = await seedNameComAndFlyIo();
    const httpClient = new FakeHttpClient([{ status: 201, headers: {}, bodyText: '{"ok":true}' }]);
    const audit = new InMemoryCredentialedRequestAuditLog();
    const deps = makeDeps({ httpClient, audit }, writeDeps);
    const body = JSON.stringify({ domain: "example.com" });

    const result = await makeCredentialedRequest(deps, {
      workspaceId: WORKSPACE,
      label: "name.com",
      method,
      url: "https://api.name.com/v4/domains",
      body,
      headers: { "Content-Type": "application/json" },
    });

    assert.equal(httpClient.calls.length, 1, `${method}: exactly one request must be sent`);
    const sent = httpClient.calls[0]!;
    assert.equal(sent.method, method);
    assert.equal(sent.body, body, `${method}: the body must reach the guarded client unchanged`);
    assert.equal(sent.headers["Content-Type"], "application/json");
    assert.equal(result.status, 201);

    assert.equal(audit.entries.length, 1);
    assert.equal(audit.entries[0]!.bodyBytes, Buffer.byteLength(body, "utf8"), `${method}: bodyBytes must be the real byte size`);
    assert.deepEqual(Object.keys(audit.entries[0]!).sort(), ["at", "bodyBytes", "host", "label", "method", "status"]);
    assert.ok(!JSON.stringify(audit.entries).includes("namecom-secret-token"));
  }
});

test("makeCredentialedRequest: a caller-supplied User-Agent header is NOT forbidden — it reaches the guarded client unchanged (2026-09-03 decision: parity with what a human can already do via curl -A, no bearing on the host-binding security boundary)", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    method: "GET",
    url: "https://api.name.com/v4/domains",
    headers: { "User-Agent": "MyOwnAgent/3.1" },
  });

  assert.equal(result.status, 200);
  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0]!.headers["User-Agent"], "MyOwnAgent/3.1");
});

test("makeCredentialedRequest: DELETE itself runs immediately with no confirmation — this module has no gating logic; that lives one layer up", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 204, headers: {}, bodyText: "" }]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "DELETE", url: "https://api.name.com/v4/domains/example.com" });

  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0]!.method, "DELETE");
  assert.equal(result.executed, true);
  assert.equal(result.status, 204);
});

test("makeCredentialedRequest: an omitted body degrades to no body sent and bodyBytes:0 audited", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "[]" }]);
  const audit = new InMemoryCredentialedRequestAuditLog();
  const deps = makeDeps({ httpClient, audit }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.equal("body" in httpClient.calls[0]!, false, "no body key should be sent to the guarded client at all");
  assert.equal(audit.entries[0]!.bodyBytes, 0);
});

test("makeCredentialedRequest: a request body over the 1MB cap is refused before any network call", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);
  const oversized = "a".repeat(1_000_001);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "POST", url: "https://api.name.com/v4/domains", body: oversized }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal((err as Error).message, "body is 1000001 bytes, which exceeds the 1000000-byte limit for this tool");
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: a request body at exactly the 1MB cap is accepted (the cap rejects only what EXCEEDS it)", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "ok" }]);
  const audit = new InMemoryCredentialedRequestAuditLog();
  const deps = makeDeps({ httpClient, audit }, writeDeps);
  const exactly1Mb = "a".repeat(1_000_000);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "POST", url: "https://api.name.com/v4/domains", body: exactly1Mb });

  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0]!.body!.length, 1_000_000);
  assert.equal(audit.entries[0]!.bodyBytes, 1_000_000);
});

test("makeCredentialedRequest: a non-string body is refused", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "POST", url: "https://api.name.com/v4/domains", body: { not: "a string" } }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal((err as Error).message, "body must be a string when provided");
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// Unknown label — and the real validation ORDER this exercises
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: an unknown label throws CustomCredentialNotFoundError, and method/header/body shape validation runs before the credential lookup", async () => {
  const writeDeps = makeWriteDeps(); // no credentials seeded at all
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  // Method/header/body shape errors are still raised even though the label doesn't exist either —
  // this validation never leaks "does this label exist" via a different error for a malformed call.
  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "does-not-exist", method: "TRACE", url: "https://example.com/x" }),
    CredentialedRequestValidationError
  );
  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "does-not-exist", method: "GET", url: "https://example.com/x", headers: { Cookie: "x" } }),
    CredentialedRequestValidationError
  );

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "does-not-exist", method: "GET", url: "https://example.com/x" }),
    (err: unknown) => {
      assert.ok(err instanceof CustomCredentialNotFoundError);
      assert.equal((err as Error).message, "no custom credential labeled 'does-not-exist' in this workspace");
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

test("makeCredentialedRequest: for an unknown label, an off-allowlist/malformed url does NOT surface as a url validation error — the credential lookup runs first and reports not-found (url is checked only once a credential is actually found)", async () => {
  const writeDeps = makeWriteDeps();
  const httpClient = new FakeHttpClient();
  const deps = makeDeps({ httpClient }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "does-not-exist", method: "GET", url: "not-a-valid-url" }),
    (err: unknown) => {
      assert.ok(err instanceof CustomCredentialNotFoundError, `expected CustomCredentialNotFoundError, got ${(err as Error).constructor.name}`);
      return true;
    }
  );
  assert.equal(httpClient.calls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// Token never leaks — audit trail and error messages
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: audits exactly {label, host, method, status, bodyBytes, at} and never the token", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "ok" }]);
  const audit = new InMemoryCredentialedRequestAuditLog();
  const deps = makeDeps({ httpClient, audit }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" });

  assert.equal(audit.entries.length, 1);
  assert.deepEqual(audit.entries[0], { label: "name.com", host: "api.name.com", method: "GET", status: 200, bodyBytes: 0, at: FIXED_NOW });
  const serialized = JSON.stringify(audit.entries);
  assert.ok(!serialized.includes("namecom-secret-token"), "the audit trail must never carry the token");
});

test("makeCredentialedRequest: a transport failure throws CredentialedRequestTransportError, audits status:0, and the error message never carries the token", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([new Error("getaddrinfo ENOTFOUND api.name.com")]);
  const audit = new InMemoryCredentialedRequestAuditLog();
  const deps = makeDeps({ httpClient, audit }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestTransportError);
      assert.equal((err as Error).message, "request to 'name.com' failed: getaddrinfo ENOTFOUND api.name.com");
      assert.ok(!(err as Error).message.includes("namecom-secret-token"));
      return true;
    }
  );
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]!.status, 0);
  assert.equal(audit.entries[0]!.bodyBytes, 0);
});

// 2026-09-10: before this fix, `makeCredentialedRequest`'s catch block re-wrapped EVERY thrown
// error — an `EgressRefusedError` included — into the identical `CredentialedRequestTransportError`
// the test above asserts on, erasing the `instanceof` `tool-registrations.ts`'s
// `isCredentialedRequestShapeRejection` depends on to tell a caller-fixable egress refusal (a
// different URL would work) apart from an unclassified internal failure. This pins the fix: an
// `EgressRefusedError` from the injected `HttpClientPort` (e.g. `platform/http/client.ts`'s
// `assertNoPrivateAddress`, refusing a redirect to a private/loopback address) must reach the
// caller with its OWN type intact, not folded into `CredentialedRequestTransportError`.
test("makeCredentialedRequest: an EgressRefusedError from the http client passes through with its own type, not wrapped into CredentialedRequestTransportError", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([new EgressRefusedError("egress to 'api.name.com' (169.254.169.254) rejected: resolved address is link-local")]);
  const audit = new InMemoryCredentialedRequestAuditLog();
  const deps = makeDeps({ httpClient, audit }, writeDeps);

  await assert.rejects(
    () => makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "GET", url: "https://api.name.com/v4/domains" }),
    (err: unknown) => {
      assert.ok(err instanceof EgressRefusedError, `expected EgressRefusedError, got ${(err as Error).constructor.name}`);
      assert.ok(!(err instanceof CredentialedRequestTransportError), "must not also be re-wrapped");
      assert.match((err as Error).message, /link-local/);
      return true;
    }
  );
  // The audit contract is unchanged by this fix: status:0 still means "never got a response",
  // regardless of whether the cause was a refusal, a timeout, or a DNS failure.
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]!.status, 0);
});

test("ConsoleCredentialedRequestAuditLog: an egress refusal's full detail, resolved address included, is kept in the server-side line", () => {
  const lines: string[] = [];
  new ConsoleCredentialedRequestAuditLog((line) => lines.push(line)).record({
    label: "internal",
    host: "internal-db.corp",
    method: "GET",
    status: 0,
    bodyBytes: 0,
    at: "2026-09-16T00:00:00.000Z",
    egressRefusal: "egress to 'internal-db.corp' (10.0.4.7) rejected: resolved address is private",
  });

  assert.deepEqual(lines, [
    "[custom-credentials] request label=internal host=internal-db.corp method=GET status=0 bodyBytes=0 at=2026-09-16T00:00:00.000Z " +
      "egressRefusal=\"egress to 'internal-db.corp' (10.0.4.7) rejected: resolved address is private\"",
  ]);
});

test("makeCredentialedRequest: ConsoleCredentialedRequestAuditLog logs a structured line (including bodyBytes) and never the token", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "ok" }]);
  const lines: string[] = [];
  const deps = makeDeps({ httpClient, audit: new ConsoleCredentialedRequestAuditLog((line) => lines.push(line)) }, writeDeps);

  await makeCredentialedRequest(deps, { workspaceId: WORKSPACE, label: "name.com", method: "POST", url: "https://api.name.com/v4/domains", body: "hello" });

  assert.equal(lines.length, 1);
  assert.equal(lines[0], "[custom-credentials] request label=name.com host=api.name.com method=POST status=200 bodyBytes=5 at=2026-08-31T00:00:00.000Z");
  assert.ok(!lines[0]!.includes("namecom-secret-token"));
});

// ---------------------------------------------------------------------------------------------
// resolveRequestTarget — the non-decrypting sibling `tool-registrations.ts`'s DELETE gate uses to
// validate BEFORE ever raising a dialog or decrypting. Its own contract (`Pick<..., "repo">`, no
// `sealer` in its deps type) makes "cannot decrypt" a structural property, not just documentation.
// ---------------------------------------------------------------------------------------------

test("resolveRequestTarget: resolves label + url without needing (or being able to use) a sealer", async () => {
  const writeDeps = await seedNameComAndFlyIo();

  const target = await resolveRequestTarget({ repo: writeDeps.repo }, { workspaceId: WORKSPACE, label: "name.com", url: "https://api.name.com/v4/domains" });

  assert.equal(target.label, "name.com");
  assert.equal(target.url.toString(), "https://api.name.com/v4/domains");
});

test("resolveRequestTarget: accepts a url on additionalHosts, exactly like makeCredentialedRequest does", async () => {
  const writeDeps = await seedFlyIoMultiHostAndNameCom();

  const target = await resolveRequestTarget({ repo: writeDeps.repo }, { workspaceId: WORKSPACE, label: "fly.io", url: "https://api.machines.dev/v1/apps" });

  assert.equal(target.url.origin, "https://api.machines.dev");
});

test("resolveRequestTarget: an unknown label throws CustomCredentialNotFoundError", async () => {
  const writeDeps = makeWriteDeps();

  await assert.rejects(
    () => resolveRequestTarget({ repo: writeDeps.repo }, { workspaceId: WORKSPACE, label: "does-not-exist", url: "https://example.com/x" }),
    (err: unknown) => {
      assert.ok(err instanceof CustomCredentialNotFoundError);
      assert.equal((err as Error).message, "no custom credential labeled 'does-not-exist' in this workspace");
      return true;
    }
  );
});

test("resolveRequestTarget: an off-allowlist url throws CredentialedRequestValidationError with the exact same message makeCredentialedRequest would give", async () => {
  const writeDeps = await seedNameComAndFlyIo();

  await assert.rejects(
    () => resolveRequestTarget({ repo: writeDeps.repo }, { workspaceId: WORKSPACE, label: "name.com", url: "https://api.fly.io/v1/apps" }),
    (err: unknown) => {
      assert.ok(err instanceof CredentialedRequestValidationError);
      assert.equal(
        (err as Error).message,
        "url 'https://api.fly.io/v1/apps' resolves to origin 'https://api.fly.io', which is not one of this credential's saved hosts (https://api.name.com) — add it to this credential in the Access Tokens form first"
      );
      return true;
    }
  );
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
  assert.equal(httpClient.calls[0]!.url, "https://api.name.com/");
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

test("verifyCustomCredential: audits with bodyBytes:0 (a verify never sends a body) and never the token", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "ok" }]);
  const audit = new InMemoryCredentialedRequestAuditLog();
  const deps = makeDeps({ httpClient, audit }, writeDeps);

  await verifyCustomCredential(deps, { workspaceId: WORKSPACE, label: "name.com" });

  assert.equal(audit.entries.length, 1);
  assert.deepEqual(audit.entries[0], { label: "name.com", host: "api.name.com", method: "GET", status: 200, bodyBytes: 0, at: FIXED_NOW });
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

// ---------------------------------------------------------------------------------------------
// Response header redaction — Authorization, Set-Cookie, and reflected tokens never reach caller
// ---------------------------------------------------------------------------------------------

test("makeCredentialedRequest: strips sensitive response headers (Authorization, Set-Cookie, Cookie) before returning to the caller", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer namecom-secret-token",
        "Set-Cookie": "session_id=secret_cookie_123; Secure; HttpOnly",
        cookie: "tracking=abc",
        "X-Request-Id": "req-1",
      },
      bodyText: '{"ok":true}',
    },
  ]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    method: "GET",
    url: "https://api.name.com/v4/domains",
  });

  assert.equal(result.headers["Content-Type"], "application/json");
  assert.equal(result.headers["X-Request-Id"], "req-1");
  assert.equal(result.headers.Authorization, undefined);
  assert.equal(result.headers.authorization, undefined);
  assert.equal(result.headers["Set-Cookie"], undefined);
  assert.equal(result.headers["set-cookie"], undefined);
  assert.equal(result.headers.cookie, undefined);
  assert.ok(!JSON.stringify(result.headers).includes("namecom-secret-token"));
  assert.ok(!JSON.stringify(result.headers).includes("secret_cookie_123"));
});

test("makeCredentialedRequest: strips response headers that reflect the credential's token or injected Authorization value", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Echoed-Token": "flyio-secret-token",
        "X-Reflected-Auth": "Bearer flyio-secret-token",
        "X-Safe-Header": "safe-value",
      },
      bodyText: "ok",
    },
  ]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    method: "GET",
    url: "https://api.fly.io/v1/apps",
  });

  assert.equal(result.headers["Content-Type"], "application/json");
  assert.equal(result.headers["X-Safe-Header"], "safe-value");
  assert.equal(result.headers["X-Echoed-Token"], undefined);
  assert.equal(result.headers["X-Reflected-Auth"], undefined);
  assert.ok(!JSON.stringify(result.headers).includes("flyio-secret-token"));
});

test("makeCredentialedRequest: strips response headers reflecting basic-auth credentials or tokens for username-authenticated credentials", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const basicAuthPayload = Buffer.from("namecom-user:namecom-secret-token").toString("base64");
  const httpClient = new FakeHttpClient([
    {
      status: 200,
      headers: {
        "X-Echoed-Basic": `Basic ${basicAuthPayload}`,
        "X-Echoed-Secret": "namecom-secret-token",
        "X-Safe-Header": "safe",
      },
      bodyText: "ok",
    },
  ]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    method: "GET",
    url: "https://api.name.com/v4/domains",
  });

  assert.equal(result.headers["X-Safe-Header"], "safe");
  assert.equal(result.headers["X-Echoed-Basic"], undefined);
  assert.equal(result.headers["X-Echoed-Secret"], undefined);
  assert.ok(!JSON.stringify(result.headers).includes("namecom-secret-token"));
  assert.ok(!JSON.stringify(result.headers).includes(basicAuthPayload));
});

test("makeCredentialedRequest: strips a response header that echoes ONLY the bare base64 Basic-auth payload, with no 'Basic ' scheme prefix at all", async () => {
  // Regression test for the redaction hole 922f2ef6 left open: the previous test above proves the
  // FULL "Basic <payload>" header value and the raw token alone are both caught, but the bare
  // base64 payload — neither wrapped in "Basic " nor equal to the raw token — was not itself listed
  // as a secret, so an endpoint reflecting just that payload leaked it straight through.
  const writeDeps = await seedNameComAndFlyIo();
  const basicAuthPayload = Buffer.from("namecom-user:namecom-secret-token").toString("base64");
  const httpClient = new FakeHttpClient([
    {
      status: 200,
      headers: {
        "X-Echoed-Payload-Only": basicAuthPayload,
        "X-Safe-Header": "safe",
      },
      bodyText: "ok",
    },
  ]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, {
    workspaceId: WORKSPACE,
    label: "name.com",
    method: "GET",
    url: "https://api.name.com/v4/domains",
  });

  assert.equal(result.headers["X-Safe-Header"], "safe");
  assert.equal(result.headers["X-Echoed-Payload-Only"], undefined);
  assert.ok(!JSON.stringify(result.headers).includes(basicAuthPayload));
});

test("makeCredentialedRequest: a response header is redacted when it merely EMBEDS a secret inside a larger value — substring match, not exact equality", async () => {
  // Pins the match semantics `redactResponseHeaders` actually implements (`value.includes(secret)`).
  // "X-Debug-Echo" below is not EQUAL to either responseSecrets entry — it embeds the full injected
  // Authorization value inside a larger diagnostic string. Under exact-equality matching this header
  // would pass through unredacted (leaking the token); this test would then fail because
  // `X-Debug-Echo` would be defined instead of undefined.
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Echo": "request-id=r1; sent-auth=Bearer flyio-secret-token; region=us-east",
      },
      bodyText: "ok",
    },
  ]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    method: "GET",
    url: "https://api.fly.io/v1/apps",
  });

  assert.equal(result.headers["Content-Type"], "application/json");
  assert.equal(result.headers["X-Debug-Echo"], undefined);
});

test("makeCredentialedRequest: strips the injected token from the response BODY too, while leaving the rest of the body intact", async () => {
  const writeDeps = await seedNameComAndFlyIo();
  const httpClient = new FakeHttpClient([
    {
      status: 200,
      headers: {},
      bodyText: '{"echo":{"authorization":"Bearer flyio-secret-token"},"machines":["m-1","m-2"]}',
    },
  ]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, {
    workspaceId: WORKSPACE,
    label: "fly.io",
    method: "GET",
    url: "https://api.fly.io/v1/apps",
  });

  assert.ok(!result.bodyText.includes("flyio-secret-token"));
  assert.equal(result.bodyText, '{"echo":{"authorization":"[REDACTED]"},"machines":["m-1","m-2"]}');
});

test("makeCredentialedRequest: a pathologically short credential token withholds the response body instead of substring-scrubbing it", async () => {
  const writeDeps = makeWriteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "shorttoken",
    category: "general",
    baseUrl: "https://api.short.example",
    connection: { token: "ab" },
  });
  const httpClient = new FakeHttpClient([
    {
      status: 200,
      // "banana" genuinely overlaps the secret alphabet — it contains both an 'a' and a 'b', the two
      // characters that make up the 2-character token "ab" — but never contains "ab" as a substring
      // (b-a-n-a-n-a has no adjacent "a" then "b"). This is deliberately NOT the previous
      // "safe-value", which shares no characters with "ab" at all: that made the assertion below
      // vacuous, since it would pass identically whether `redactResponseHeaders` matched substrings
      // correctly or was broken in a way that never redacted anything. "banana" would be WRONGLY
      // stripped by an over-matching implementation (e.g. one that redacts on the secret's individual
      // characters rather than the "ab" substring), so this assertion actually exercises the match
      // logic instead of merely restating a value nothing here could ever touch.
      headers: { "X-Safe-Header": "banana" },
      bodyText: '{"count":12,"items":["abacus","table"]}',
    },
  ]);
  const deps = makeDeps({ httpClient }, writeDeps);

  const result = await makeCredentialedRequest(deps, {
    workspaceId: WORKSPACE,
    label: "shorttoken",
    method: "GET",
    url: "https://api.short.example/v1/items",
  });

  // A 2-character token would match "ab" inside "abacus" and both digits of "12" if substring-scrubbed
  // in place — too ambiguous to redact safely, so the whole body is withheld instead of mangled.
  assert.equal(result.bodyText, "[body withheld: credential too short to redact safely]");
  assert.ok(!result.bodyText.includes('"count"'), "the raw body must not leak through unredacted either");
  // Headers are unaffected by the short-token BODY policy (no length floor applies to header
  // redaction — see credentialed-request.ts's file header, "The token never reaches the model") —
  // they redact by SUBSTRING match against `responseSecrets`, same as every other header test in this
  // file; "banana" contains no secret substring, so it is expected to survive untouched.
  assert.equal(result.headers["X-Safe-Header"], "banana");
});

